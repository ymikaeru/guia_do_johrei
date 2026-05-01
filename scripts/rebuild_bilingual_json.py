#!/usr/bin/env python3
"""
rebuild_bilingual_json.py v3 — Usa o MESMO parser para JP e PT.

Como a tradução foi feita com bijeção 1:1, ambos os MDs têm a mesma
estrutura de headers. Basta split em qualquer boundary de header.
"""

import json
import re
import sys
import argparse
from pathlib import Path

JP_DIR = Path('Markdown/MD_Original')
JP_DIR_NORMALIZED = Path('Markdown/MD_Original_normalized')
DATA_DIR = Path('data')

VOL_CONFIG = {
    1:  {'jp': '浄霊法講座1.md',  'title': 'Johrei Hô Kohza'},
    2:  {'jp': '浄霊法講座2.md',  'title': 'Johrei Hô Kohza'},
    3:  {'jp': '浄霊法講座3.md',  'title': 'Johrei Hô Kohza'},
    4:  {'jp': '浄霊法講座4.md',  'title': 'Johrei Hô Kohza'},
    5:  {'jp': '浄霊法講座5.md',  'title': 'Johrei Hô Kohza'},
    6:  {'jp': '浄霊法講座6.md',  'title': 'Johrei Hô Kohza'},
    7:  {'jp': '浄霊法講座7.md',  'title': 'Johrei Hô Kohza'},
    8:  {'jp': '浄霊法講座8.md',  'title': 'Johrei Hô Kohza'},
    9:  {'jp': '浄霊法講座9.md',  'title': 'Johrei Hô Kohza'},
    10: {'jp': '浄霊法講座10.md', 'title': 'Johrei Hô Kohza'},
}


def get_pt_path(vol_num):
    d = Path(f'Markdown/MD_PT_v3/Johrei_Ho_Kohza_{vol_num}_definitivo.md')
    r = Path(f'Markdown/MD_PT_v3/Johrei_Ho_Kohza_{vol_num}_retranslated.md')
    return d if d.exists() else r


def clean_header(line):
    s = re.sub(r'^#+\s+', '', line.strip())
    s = re.sub(r'\*\*', '', s)
    s = re.sub(r'　+', ' ', s).strip()
    return s


def h_level(line):
    m = re.match(r'^(#{1,6})\s+', line.strip())
    return len(m.group(1)) if m else 0


def parse_md_universal(text):
    """
    Parser universal: split em QUALQUER header boundary.
    Retorna lista de {level, header, content, source}.
    """
    text = text.replace('\r\n', '\n')
    lines = text.split('\n')

    entries = []
    current_header = ''
    current_level = 0
    current_lines = []
    current_source = ''

    def flush():
        nonlocal current_lines, current_source
        content = '\n'.join(current_lines).strip()
        if content or current_header:
            entries.append({
                'header': current_header,
                'level': current_level,
                'content': content,
                'source': current_source,
            })
        current_lines = []
        current_source = ''

    for line in lines:
        lv = h_level(line)

        if lv > 0:
            flush()
            current_header = clean_header(line)
            current_level = lv
            continue

        stripped = line.strip()

        # Source line (italic at start of section)
        m_src = re.match(r'^\*(.+)\*$', stripped)
        if m_src and not current_lines:
            current_source = m_src.group(1)
            continue

        if stripped:
            current_lines.append(line)
        elif current_lines:
            current_lines.append('')  # preserve paragraph breaks

    flush()
    return entries


def build_json(jp_entries, pt_entries, vol_num, vol_title):
    n = max(len(jp_entries), len(pt_entries))
    result = []
    
    current_master_title = vol_title

    for i in range(n):
        jp = jp_entries[i] if i < len(jp_entries) else {}
        pt = pt_entries[i] if i < len(pt_entries) else {}

        entry_id = f'johreivol{vol_num:02d}_{i+1:02d}'

        # Extract structure from PT header
        pt_header = pt.get('header', '')
        section_num = None
        article_num = None
        sub_letter = None
        title_pt = pt_header

        m_sec = re.match(r'^([IVXLC]+)\.\s*(.*)', pt_header)
        if m_sec:
            section_num = m_sec.group(1)
            title_pt = m_sec.group(2).strip()
            current_master_title = pt_header.strip() # Update tracked chapter title

        m_art = re.match(r'^(\d+)\.\s*(.*)', pt_header)
        if m_art:
            article_num = int(m_art.group(1))
            title_pt = m_art.group(2).strip()

        m_sub = re.match(r'^\(([a-z])\)\s*(.*)', pt_header)
        if m_sub:
            sub_letter = m_sub.group(1)
            if m_sub.group(2):
                title_pt = m_sub.group(2).strip()

        # JP title
        jp_header = jp.get('header', '')
        title_jp = re.sub(r'^[１-９０-９\d　\s、．.]+', '', jp_header).strip()

        entry = {
            'id': entry_id,
            'volume': vol_title,
            'volume_num': vol_num,
            'section_num': section_num,
            'section_title': title_pt if section_num else '',
            'article_num': article_num,
            'article_title': title_pt,
            'sub_letter': sub_letter,
            'position': i + 1,
            'parent_id': None,
            'source_ref': pt.get('source', '') or jp.get('source', ''),
            'title_pt': title_pt,
            'content_pt': pt.get('content', ''),
            'title_jp': title_jp,
            'content_jp': jp.get('content', ''),
            'tags': [],
            'categories': ['johrei'],
            'related_items': [],
            'info_pt': '',
            'source': '',
            'Master_Title': current_master_title,
            'category_pt': current_master_title,
        }
        result.append(entry)

    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--vol', nargs='+', type=int, required=True)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--use-normalized-jp', action='store_true',
                        help=f'Lê JP de {JP_DIR_NORMALIZED} (hierarquia v2)')
    args = parser.parse_args()

    jp_root = JP_DIR_NORMALIZED if args.use_normalized_jp else JP_DIR

    print(f'{"="*60}')
    print(f'Rebuild v3 — Parser Universal (mesmo para JP e PT)')
    print(f'Modo: {"DRY RUN" if args.dry_run else "LIVE"}')
    print(f'{"="*60}')

    for vol in sorted(args.vol):
        cfg = VOL_CONFIG.get(vol)
        if not cfg:
            print(f'\n❌ Vol {vol:02d}: não configurado')
            continue

        jp_path = jp_root / cfg['jp']
        pt_path = get_pt_path(vol)
        json_path = DATA_DIR / f'johrei_vol{vol:02d}_bilingual.json'

        if not jp_path.exists() or not pt_path:
            print(f'\n❌ Vol {vol:02d}: arquivos não encontrados')
            continue

        print(f'\n▶ Vol {vol:02d}')

        jp_text = jp_path.read_text(encoding='utf-8')
        pt_text = pt_path.read_text(encoding='utf-8')

        jp_entries = parse_md_universal(jp_text)
        pt_entries = parse_md_universal(pt_text)

        match_status = '✅' if len(jp_entries) == len(pt_entries) else '⚠️'
        print(f'  JP={len(jp_entries)} PT={len(pt_entries)} {match_status}')

        if len(jp_entries) != len(pt_entries):
            for i in range(min(5, min(len(jp_entries), len(pt_entries)))):
                jh = jp_entries[i]['header'][:35]
                ph = pt_entries[i]['header'][:35]
                print(f'    #{i+1}: JP[{jh}] PT[{ph}]')

        bilingual = build_json(jp_entries, pt_entries, vol, cfg['title'])

        jp_ok = sum(1 for e in bilingual if e['content_jp'])
        pt_ok = sum(1 for e in bilingual if e['content_pt'])
        print(f'  Entries: {len(bilingual)} (JP={jp_ok} PT={pt_ok})')

        if not args.dry_run:
            import shutil
            backup = json_path.with_suffix('.json.bak3')
            if json_path.exists():
                shutil.copy2(json_path, backup)
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(bilingual, f, ensure_ascii=False, indent=2)
            print(f'  💾 Salvo: {json_path}')

    print(f'\n{"="*60}')
    print('Concluído.')
    print(f'{"="*60}')


if __name__ == '__main__':
    main()
