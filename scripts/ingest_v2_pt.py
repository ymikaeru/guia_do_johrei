"""Ingest a v2 Portuguese Markdown file into bilingual JSON (schema v2).

Usage:
    python scripts/ingest_v2_pt.py path/to/file.md --volume-num 3
    python scripts/ingest_v2_pt.py path/to/file.md --volume-num 3 --volume-name "Johrei Hô Kohza" --output data/johrei_vol03_bilingual.json

The MD must follow the v2 hierarchy:
    ## {Volume title}
    ### {Roman}. {Section title}
    #### {N}. {Article title}
    *{Source in Romaji}*
    {content...}
    ##### ({letter})
    *{Source}*
    {content...}

JP fields are filled with "Translation pending" — populate later with a separate JP merger.
"""
from __future__ import annotations
import argparse
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

H_RE = re.compile(r'^(#{2,5})\s+(.+?)\s*$')
SECTION_RE = re.compile(r'^([IVX]+)\.\s+(.+)$')
ARTICLE_RE = re.compile(r'^(\d+)\.\s+(.+)$')
SUB_RE = re.compile(r'^\(([a-z])\)\s*$')
ITALIC_SRC_RE = re.compile(r'^\*([^*].*[^*])\*\s*$')
SOURCE_PARSE_RE = re.compile(
    r'^(?P<name>.+?)\s+n\.?º?\s*(?P<issue>\d+)(?:,\s*p[áa]g\.?\s*(?P<page>\d+))?\s*$'
)


def parse_source(text: str) -> dict:
    """'Mioshie-shū n.º 11, pág. 5' → {'name','issue','page'}."""
    m = SOURCE_PARSE_RE.match(text.strip())
    if m:
        return {
            'name': m.group('name').strip(),
            'issue': int(m.group('issue')),
            'page': int(m.group('page')) if m.group('page') else None,
        }
    return {'name': text.strip(), 'issue': None, 'page': None}


def format_source(src: dict | None) -> str:
    if not src or not src.get('name'):
        return ''
    if src.get('page'):
        return f"{src['name']} n.º {src['issue']}, pág. {src['page']}"
    if src.get('issue'):
        return f"{src['name']} n.º {src['issue']}"
    return src['name']


@dataclass
class State:
    volume: str
    volume_num: int
    section_num: str | None = None
    section_title: str | None = None
    article_num: int | None = None
    article_title: str | None = None
    article_source: dict | None = None
    sub_letter: str | None = None
    sub_source: dict | None = None
    buf: list[str] = field(default_factory=list)
    expecting_source: str | None = None  # 'article' | 'sub' | None
    last_article_id: str | None = None
    seq: int = 0
    items: list[dict] = field(default_factory=list)

    def buf_text(self) -> str:
        # Collapse trailing blank lines, preserve internal paragraph breaks.
        text = '\n'.join(self.buf).strip()
        # Normalize 3+ newlines to 2.
        return re.sub(r'\n{3,}', '\n\n', text)


def build_title(s: State, sub_letter: str | None) -> str:
    title = s.article_title or s.section_title or s.volume
    if sub_letter:
        return f"{title} ({sub_letter.upper()})"
    return title


def emit(s: State, kind: str) -> None:
    """kind ∈ {'article', 'sub', 'section_intro'}"""
    s.seq += 1
    eid = f"johreivol{s.volume_num:02d}_{s.seq:02d}"

    if kind == 'sub':
        src = s.sub_source
        sub_letter = s.sub_letter
        parent_id = s.last_article_id
    elif kind == 'article':
        src = s.article_source
        sub_letter = None
        parent_id = None
        s.last_article_id = eid
    else:  # section_intro
        src = s.article_source
        sub_letter = None
        parent_id = None

    entry = {
        'id': eid,
        'volume': s.volume,
        'volume_num': s.volume_num,
        'section_num': s.section_num,
        'section_title': s.section_title,
        'article_num': s.article_num,
        'article_title': s.article_title,
        'sub_letter': sub_letter,
        'position': s.seq,
        'parent_id': parent_id,
        'source_ref': src,
        'title_pt': build_title(s, sub_letter),
        'content_pt': s.buf_text(),
        'title_jp': 'Translation pending',
        'content_jp': 'Translation pending',
        'tags': [],
        'categories': ['johrei'],
        'related_items': [],
        'info_pt': format_source(src),
        'source': format_source(src),
        'Master_Title': s.volume,
    }
    s.items.append(entry)
    s.buf = []


def flush_pending(s: State) -> None:
    """Emit whatever is currently open before transitioning to a new heading."""
    if s.sub_letter is not None:
        emit(s, 'sub')
        s.sub_letter = None
        s.sub_source = None
    elif s.article_num is not None:
        emit(s, 'article')
        s.article_num = None
        s.article_title = None
        s.article_source = None
    elif s.section_num is not None and s.buf and any(line.strip() for line in s.buf):
        emit(s, 'section_intro')


def parse_md(md_path: Path, volume_name: str, volume_num: int) -> list[dict]:
    lines = md_path.read_text(encoding='utf-8').splitlines()
    s = State(volume=volume_name, volume_num=volume_num)

    for raw in lines:
        line = raw.rstrip()
        h_match = H_RE.match(line)

        if h_match:
            level = len(h_match.group(1))
            text = h_match.group(2).strip()

            if level == 2:
                # ## volume title — informational, doesn't emit
                continue

            if level == 3:
                flush_pending(s)
                s.buf = []  # discard any pre-section content (e.g. blockquotes)
                # reset article state
                s.article_num = None
                s.article_title = None
                s.article_source = None
                # set new section
                sm = SECTION_RE.match(text)
                if sm:
                    s.section_num = sm.group(1)
                    s.section_title = sm.group(2).strip()
                else:
                    s.section_num = None
                    s.section_title = text
                s.expecting_source = None

            elif level == 4:
                # transitioning to a new article: flush current sub or article
                if s.sub_letter is not None:
                    emit(s, 'sub')
                    s.sub_letter = None
                    s.sub_source = None
                elif s.article_num is not None:
                    emit(s, 'article')
                elif s.buf and any(l.strip() for l in s.buf) and s.section_num is not None:
                    emit(s, 'section_intro')
                s.buf = []
                am = ARTICLE_RE.match(text)
                if am:
                    s.article_num = int(am.group(1))
                    s.article_title = am.group(2).strip()
                else:
                    s.article_num = None
                    s.article_title = text
                s.article_source = None
                s.expecting_source = 'article'

            elif level == 5:
                # subitem: if first sub of this article, emit parent first
                if s.sub_letter is None and s.article_num is not None:
                    emit(s, 'article')  # parent (may have empty content)
                elif s.sub_letter is not None:
                    emit(s, 'sub')
                s.buf = []
                sm = SUB_RE.match(text)
                if sm:
                    s.sub_letter = sm.group(1)
                else:
                    s.sub_letter = text  # fallback (e.g. "(a) extra text")
                s.sub_source = None
                s.expecting_source = 'sub'
            continue

        # Italic-only line, possibly a source declaration
        stripped = line.strip()
        if stripped and s.expecting_source:
            im = ITALIC_SRC_RE.match(stripped)
            if im:
                src = parse_source(im.group(1))
                if s.expecting_source == 'article':
                    s.article_source = src
                else:
                    s.sub_source = src
                s.expecting_source = None
                continue

        # Content line (or blank). Once we see content, source-expectation is over.
        if stripped:
            s.expecting_source = None
            s.buf.append(line)
        else:
            # blank line — keep paragraph separation if we already have content
            if s.buf:
                s.buf.append('')

    # flush trailing
    flush_pending(s)
    return s.items


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('md_file', type=Path, help='Path to v2 Portuguese MD file')
    ap.add_argument('--volume-num', type=int, required=True, help='Volume number (1..N)')
    ap.add_argument('--volume-name', default='Johrei Hô Kohza',
                    help="Volume display name (default: 'Johrei Hô Kohza')")
    ap.add_argument('--output', type=Path, default=None,
                    help='Output JSON path (default: data/johrei_volNN_bilingual.json)')
    ap.add_argument('--dry-run', action='store_true',
                    help='Print summary without writing')
    args = ap.parse_args()

    if not args.md_file.exists():
        ap.error(f'MD file not found: {args.md_file}')

    out_path = args.output or Path(f'data/johrei_vol{args.volume_num:02d}_bilingual.json')

    items = parse_md(args.md_file, args.volume_name, args.volume_num)

    print(f'Parsed {len(items)} entries from {args.md_file}')
    n_articles = sum(1 for e in items if e['sub_letter'] is None and e['article_num'] is not None)
    n_subs = sum(1 for e in items if e['sub_letter'] is not None)
    n_intros = sum(1 for e in items if e['article_num'] is None)
    print(f'  articles: {n_articles}, subitems: {n_subs}, section intros: {n_intros}')

    if args.dry_run:
        for e in items[:5]:
            print(f"  [{e['id']}] §{e['section_num']}.{e['article_num']}{('.'+e['sub_letter']) if e['sub_letter'] else ''} — {e['title_pt']}")
        return 0

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote → {out_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
