#!/usr/bin/env python3
"""
normalize_jp_hierarchy.py — Normaliza a hierarquia dos MD originais (JP)
para que espelhe a estrutura v2 dos MD PT (## / ### / #### / #####).

Mapeamento canônico:
  ## (H2)   = Título do volume          (vol_h1: `# 浄霊法講座(N)`)
  ### (H3)  = Seção (numeral romano)    (kanji 一二三… → I, II, III…)
  #### (H4) = Artigo (numeral arábico)  (digit 1-N ou iroha continuando)
  ##### (H5) = Sub-item                  (raríssimo no JP)

Patterns reconhecidos (com tolerância a fullwidth-space `　` em qualquer posição):
  Volume:
    - `# 浄霊法講座(...)` → `## ...`
  Seções:
    - `# **kanji、X**`         (vols 1,2,4,7)
    - `## **kanji、X**`        (eventual)
    - `## kanji、X`            (vols 3, 8, 9)
    - `**kanji、X**`           (vol 5)
  Artigos:
    - `**digit、X**(...source)` (vols 3, 4)
    - `## digit. X` ou `## digit、X` (vols 5, 6, 7, 8)
    - `### digit、X`           (vol 3 — demote para H4)
    - `## （digit）X`          (vols 9, 10)
    - `**iroha、X**(...source)` (vol 5 — iroha katakana → digit)

Uso:
    python scripts/normalize_jp_hierarchy.py --vol 4
    python scripts/normalize_jp_hierarchy.py --all
"""

import re
import sys
import argparse
from pathlib import Path

JP_DIR = Path('Markdown/MD_Original')
DEFAULT_OUT = Path('Markdown/MD_Original_normalized')

VOL_FILES = {v: f'浄霊法講座{v}.md' for v in range(1, 11)}

KANJI_TO_ROMAN = {
    '一': 'I',  '二': 'II', '三': 'III', '四': 'IV', '五': 'V',
    '六': 'VI', '七': 'VII','八': 'VIII','九': 'IX', '十': 'X',
}
KANJI_NUMS = ''.join(KANJI_TO_ROMAN.keys())

# Iroha katakana — ordem tradicional
IROHA_TO_DIGIT = {
    ch: i + 1 for i, ch in enumerate(
        'イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス'
    )
}
IROHA_CHARS = ''.join(IROHA_TO_DIGIT.keys())

FW_TO_ASCII = str.maketrans('０１２３４５６７８９', '0123456789')

# WS = whitespace (incluindo fullwidth space　 = U+3000)
WS = r'[\s　]*'

# ─── Volume ───────────────────────────────────────
RE_VOL_H1 = re.compile(r'^#\s+(浄霊法講座.*)$')

# ─── Seções (kanji-roman) ─────────────────────────
RE_SEC_H1_BOLD   = re.compile(rf'^#\s+\*\*\s*([{KANJI_NUMS}]){WS}[、，]{WS}(.+?)\*\*\s*$')
RE_SEC_H2_BOLD   = re.compile(rf'^##\s+\*\*\s*([{KANJI_NUMS}]){WS}[、，]{WS}(.+?)\*\*\s*$')
RE_SEC_H2_PLAIN  = re.compile(rf'^##\s+([{KANJI_NUMS}]){WS}[、，]{WS}(.+?)\s*$')
RE_SEC_BOLD_BARE = re.compile(rf'^\*\*\s*([{KANJI_NUMS}]){WS}[、，]{WS}(.+?)\*\*\s*$')

# ─── Artigos (digit) ──────────────────────────────
RE_ART_BOLD_DIGIT = re.compile(
    rf'^\*\*\s*([０-９0-9]+){WS}[、，．\.]{WS}(.+?)\*\*\s*(.*)$'
)
RE_ART_H2_DIGIT = re.compile(
    rf'^##\s+([０-９0-9]+){WS}[、，．\.]{WS}(.+?)\s*$'
)
RE_ART_H2_BOLD_DIGIT = re.compile(
    rf'^##\s+\*\*\s*([０-９0-9]+){WS}[、，．\.]{WS}(.+?)\*\*\s*$'
)
RE_ART_H3_DIGIT = re.compile(
    rf'^###\s+([０-９0-9]+){WS}[、，．\.]{WS}(.+?)\s*$'
)
RE_ART_H2_PAREN = re.compile(
    rf'^##\s+[（(]([０-９0-9]+)[）)]{WS}(.+?)\s*$'
)

# ─── Artigos (iroha) ──────────────────────────────
RE_ART_BOLD_IROHA = re.compile(
    rf'^\*\*\s*([{IROHA_CHARS}]){WS}[、，]{WS}(.+?)\*\*\s*(.*)$'
)


def collapse_internal_ws(s: str) -> str:
    """Colapsa　fullwidth-spaces internos múltiplos a um espaço simples."""
    return re.sub(r'　{2,}', '　', s).strip()


def normalize(text: str) -> tuple[str, dict]:
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    out = []
    stats = {
        'vol_h1': 0,
        'sec_h1_bold': 0, 'sec_h2_bold': 0, 'sec_h2_plain': 0, 'sec_bold_bare': 0,
        'art_bold_digit': 0, 'art_h2_digit': 0, 'art_h2_bold_digit': 0,
        'art_h3_digit': 0, 'art_h2_paren': 0, 'art_bold_iroha': 0,
    }

    def to_int(s: str) -> int:
        return int(s.translate(FW_TO_ASCII))

    for line in text.split('\n'):
        # ─── Volume ─────────────────────────────────
        m = RE_VOL_H1.match(line)
        if m:
            out.append(f'## {m.group(1).strip()}')
            stats['vol_h1'] += 1
            continue

        # ─── Seções (ordem: H1 bold → H2 bold → H2 plain → bare bold) ──
        for key, regex in [
            ('sec_h1_bold',  RE_SEC_H1_BOLD),
            ('sec_h2_bold',  RE_SEC_H2_BOLD),
            ('sec_h2_plain', RE_SEC_H2_PLAIN),
            ('sec_bold_bare', RE_SEC_BOLD_BARE),
        ]:
            m = regex.match(line)
            if m:
                kanji, title = m.group(1), collapse_internal_ws(m.group(2))
                roman = KANJI_TO_ROMAN.get(kanji, kanji)
                out.append(f'### {roman}. {title}')
                stats[key] += 1
                break
        else:
            # ─── Artigos (digit) ───────────────────
            for key, regex, has_tail in [
                ('art_h2_bold_digit', RE_ART_H2_BOLD_DIGIT, False),
                ('art_h2_paren',      RE_ART_H2_PAREN,      False),
                ('art_h3_digit',      RE_ART_H3_DIGIT,      False),
                ('art_h2_digit',      RE_ART_H2_DIGIT,      False),
                ('art_bold_digit',    RE_ART_BOLD_DIGIT,    True),
            ]:
                m = regex.match(line)
                if m:
                    n = to_int(m.group(1))
                    title = collapse_internal_ws(m.group(2))
                    out.append(f'#### {n}. {title}')
                    stats[key] += 1
                    if has_tail:
                        tail = m.group(3).strip()
                        if tail:
                            out.append('')
                            out.append(tail)
                    break
            else:
                # ─── Artigos (iroha) ──────────────
                m = RE_ART_BOLD_IROHA.match(line)
                if m:
                    n = IROHA_TO_DIGIT.get(m.group(1))
                    title = collapse_internal_ws(m.group(2))
                    tail = m.group(3).strip()
                    out.append(f'#### {n}. {title}')
                    if tail:
                        out.append('')
                        out.append(tail)
                    stats['art_bold_iroha'] += 1
                else:
                    out.append(line)

    return '\n'.join(out), stats


def count_headers(text: str) -> int:
    return sum(1 for ln in text.split('\n')
               if re.match(r'^#{1,6}\s+', ln.strip()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--vol', nargs='+', type=int, default=None)
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--out-dir', default=str(DEFAULT_OUT))
    ap.add_argument('--verbose', action='store_true')
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.all:
        vols = sorted(VOL_FILES.keys())
    elif args.vol:
        vols = sorted(args.vol)
    else:
        ap.print_help()
        sys.exit(0)

    print(f'{"Vol":<5}{"H_in":>6}{"H_out":>7}  vol  sec(h1b/h2b/h2p/bb)  art(bd/h2d/h2bd/h3d/h2p/iro)')

    for v in vols:
        src = JP_DIR / VOL_FILES[v]
        if not src.exists():
            print(f'  ❌ Vol {v}: {src} não existe')
            continue

        text = src.read_text(encoding='utf-8')
        h_in = count_headers(text)
        normalized, st = normalize(text)
        h_out = count_headers(normalized)

        out = out_dir / VOL_FILES[v]
        out.write_text(normalized, encoding='utf-8')

        sec_str = f'{st["sec_h1_bold"]:>2}/{st["sec_h2_bold"]:>2}/{st["sec_h2_plain"]:>2}/{st["sec_bold_bare"]:>2}'
        art_str = f'{st["art_bold_digit"]:>2}/{st["art_h2_digit"]:>2}/{st["art_h2_bold_digit"]:>2}/{st["art_h3_digit"]:>2}/{st["art_h2_paren"]:>2}/{st["art_bold_iroha"]:>2}'
        print(f'{v:<5}{h_in:>6}{h_out:>7}  {st["vol_h1"]:>3}  {sec_str:<19}  {art_str}')


if __name__ == '__main__':
    main()
