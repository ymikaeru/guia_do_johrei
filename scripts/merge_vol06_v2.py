"""Merge/upgrade data/johrei_vol06_bilingual.json to schema v2.

Vol 6 is structured as: 1 volume intro + 8 body sections (頭/背/腰/手足/泌尿器/婦人科/全身/その他).
All 4 imported entries are duplicates of existing primaries with worse translations
(Western dates instead of Era Showa, lowercase Fé, etc.). They are dropped.

This script:
  - Drops 4 imported duplicates
  - Adds **(Pergunta)** marker at start of each Q&A primary
  - Replaces **(Ensinamento)** with **(Orientação de Meishu-sama)** (vol 3 standard)
  - Adds schema v2 fields per PRIMARY_MAP (8 sections)
  - Renumbers IDs sequentially, sets position
  - Backs up the original JSON before writing
"""
from __future__ import annotations
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

ROMAN_INT = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8}
SOURCE_PARSE_RE = re.compile(
    r'^(?P<name>.+?)\s+n\.?º?\s*(?P<issue>\d+)(?:,\s*p[áa]g\.?\s*(?P<page>\d+))?\s*$'
)
SOURCE_NAME_NORMALIZE = {
    'Mioshie-shu': 'Mioshie-shū',
    'Mioshie-Shu': 'Mioshie-shū',
    'Goshū': 'Mioshie-shū',
    'Goshu': 'Mioshie-shū',
    'Gosuishiroku': 'Gosui-ji Roku',
    'Chijo Tengoku': 'Chijō Tengoku',
}

# Vol 6 structure: 1 intro (no section) + 8 sections
# Maps legacy_id → (section_num, article_num)
# section_num=None means volume preamble (no body section)
PRIMARY_MAP = {
    'johreivol06_01': (None, None),  # Volume preamble (Mioshie-shū nº 18)
    # Section I — Cabeça (頭の部) — 7 articles
    'johreivol06_02': ('I', 1),
    'johreivol06_03': ('I', 2),
    'johreivol06_04': ('I', 3),
    'johreivol06_05': ('I', 4),
    'johreivol06_06': ('I', 5),
    'johreivol06_07': ('I', 6),
    'johreivol06_08': ('I', 7),
    # Section II — Costas (背の部) — 2 articles
    'johreivol06_09': ('II', 1),
    'johreivol06_10': ('II', 2),
    # Section III — Lombar (腰の部) — 2 articles
    'johreivol06_11': ('III', 1),
    'johreivol06_12': ('III', 2),
    # Section IV — Mãos e Pés (手足の部) — 5 articles
    'johreivol06_13': ('IV', 1),
    'johreivol06_14': ('IV', 2),
    'johreivol06_15': ('IV', 3),
    'johreivol06_16': ('IV', 4),
    'johreivol06_17': ('IV', 5),
    # Section V — Aparelho Urinário (泌尿器の部) — 2 articles
    'johreivol06_18': ('V', 1),
    'johreivol06_19': ('V', 2),
    # Section VI — Ginecologia (婦人科の部) — 3 articles
    'johreivol06_20': ('VI', 1),
    'johreivol06_21': ('VI', 2),
    'johreivol06_22': ('VI', 3),
    # Section VII — Corpo Todo (全身の部) — 10 articles
    'johreivol06_23': ('VII', 1),
    'johreivol06_24': ('VII', 2),
    'johreivol06_25': ('VII', 3),
    'johreivol06_26': ('VII', 4),
    'johreivol06_27': ('VII', 5),
    'johreivol06_28': ('VII', 6),
    'johreivol06_29': ('VII', 7),
    'johreivol06_30': ('VII', 8),
    'johreivol06_31': ('VII', 9),
    'johreivol06_32': ('VII', 10),
    # Section VIII — Outros (その他の部) — 4 articles
    'johreivol06_33': ('VIII', 1),
    'johreivol06_34': ('VIII', 2),
    'johreivol06_35': ('VIII', 3),
    'johreivol06_36': ('VIII', 4),
}

SECTION_TITLES = {
    'I':    'Cabeça',
    'II':   'Costas',
    'III':  'Lombar',
    'IV':   'Mãos e Pés',
    'V':    'Aparelho Urinário',
    'VI':   'Ginecologia',
    'VII':  'Corpo Todo',
    'VIII': 'Outros',
}

VOLUME_NAME = 'Johrei Hô Kohza'
VOLUME_NUM = 6


def parse_source(text: str) -> dict | None:
    text = (text or '').strip()
    if not text:
        return None
    m = SOURCE_PARSE_RE.match(text)
    if m:
        name = m.group('name').strip()
        name = SOURCE_NAME_NORMALIZE.get(name, name)
        return {
            'name': name,
            'issue': int(m.group('issue')),
            'page': int(m.group('page')) if m.group('page') else None,
        }
    name = SOURCE_NAME_NORMALIZE.get(text, text)
    return {'name': name, 'issue': None, 'page': None}


def add_qa_markers(content_pt: str) -> tuple[str, bool]:
    """Add **(Pergunta)** at start and replace **(Ensinamento)** → **(Orientação de Meishu-sama)**.

    Returns (new_content, modified_flag).
    """
    if '**(Ensinamento)**' not in content_pt:
        return content_pt, False  # not a Q&A article

    # Replace the answer marker
    new_content = content_pt.replace('**(Ensinamento)**', '**(Orientação de Meishu-sama)**')

    # Prepend question marker if not already there
    if not new_content.lstrip().startswith('**(Pergunta)**'):
        # Preserve leading whitespace pattern? Just prepend.
        new_content = '**(Pergunta)** ' + new_content.lstrip()

    return new_content, True


def section_int(section_num: str | None) -> int:
    return ROMAN_INT.get(section_num or '', 0)


def main():
    src = Path('data/johrei_vol06_bilingual.json')

    backup = src.with_suffix(f'.json.bak.{datetime.now():%Y%m%d_%H%M%S}')
    shutil.copy2(src, backup)
    print(f'Backup: {backup}')

    legacy = json.loads(src.read_text(encoding='utf-8'))
    print(f'Legacy: {len(legacy)} entries')

    entries = []
    n_dropped = 0
    n_qa_modified = 0
    for e in legacy:
        if '_imported_' in e['id']:
            n_dropped += 1
            print(f'  Drop imported: {e["id"]} — {e.get("title_pt","")[:60]}')
            continue
        if e['id'] not in PRIMARY_MAP:
            print(f'  ! WARNING: unmapped primary {e["id"]}: {e.get("title_pt","")[:60]}')
            continue

        section_num, article_num = PRIMARY_MAP[e['id']]
        v2 = dict(e)
        v2['volume'] = VOLUME_NAME
        v2['volume_num'] = VOLUME_NUM
        v2['chapter_num'] = None
        v2['chapter_title'] = None
        v2['section_num'] = section_num
        v2['section_title'] = SECTION_TITLES.get(section_num) if section_num else None
        v2['article_num'] = article_num
        v2['article_title'] = e.get('title_pt', '') if article_num is not None else None
        v2['sub_letter'] = None
        v2['parent_id'] = None
        v2['source_ref'] = parse_source(e.get('info_pt', ''))

        # Calibrate Q&A markers
        new_pt, qa_mod = add_qa_markers(v2.get('content_pt', '') or '')
        if qa_mod:
            v2['content_pt'] = new_pt
            n_qa_modified += 1

        entries.append(v2)

    print(f'Dropped imported: {n_dropped}')
    print(f'Q&A markers calibrated: {n_qa_modified}')

    # Sort by (section_int, article_num); intro (None, None) goes first
    def sort_key(e):
        s = section_int(e.get('section_num'))
        a = e.get('article_num') if e.get('article_num') is not None else 0
        return (s, a)

    entries.sort(key=sort_key)

    # Renumber IDs and set position
    for i, e in enumerate(entries, start=1):
        e['id'] = f'johreivol06_{i:02d}'
        e['position'] = i

    src.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {len(entries)} entries → {src}')

    # Summary by section
    from collections import Counter
    by_section = Counter(e.get('section_num') for e in entries)
    print('  By section:', dict(by_section))


if __name__ == '__main__':
    main()
