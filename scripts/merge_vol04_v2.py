"""Merge primary entries from data/johrei_vol04_bilingual.json with the v2 patch.

Vol 4 has 2 chapters (vs vol 3's 1) and the section numbering RESTARTS in each
chapter. So the sort key needs (chapter_int, section_int, article_num, sub_letter).

- Keeps the 15 existing primary translations verbatim
- Drops all `_imported_*` entries
- Adds the 19 patch entries (1 parent + 18 articles)
- Sorts hierarchically with chapter awareness
- Renumbers IDs sequentially as johreivol04_NN
- Re-points parent_id; backs up the original JSON before writing
"""
from __future__ import annotations
import json
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

ROMAN_INT = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10}
SOURCE_PARSE_RE = re.compile(
    r'^(?P<name>.+?)\s+n\.?º?\s*(?P<issue>\d+)(?:,\s*p[áa]g\.?\s*(?P<page>\d+))?\s*$'
)
SOURCE_NAME_NORMALIZE = {
    'Mioshie-shu': 'Mioshie-shū',
    'Mioshie-Shu': 'Mioshie-shū',
    'Goshū': 'Mioshie-shū',
    'Goshu': 'Mioshie-shū',
    'Gosuishiroku': 'Gosui-ji Roku',
    'Gosuijiroku': 'Gosui-ji Roku',
    'Chijo Tengoku': 'Chijō Tengoku',
}

# Hand-coded mapping of legacy primary IDs to v2 hierarchical position
# (chapter_num, section_num, article_num, sub_letter)
PRIMARY_MAP = {
    'johreivol04_02':   ('I',  'I',   1, None),  # I.1 - "病気になって服薬する..." (wrapper has section title)
    'johreivol04_03':   ('I',  'I',   2, 'a'),   # I.2.① - narcóticos efeito rápido
    'johreivol04_04':   ('I',  'I',   2, 'b'),   # I.2.② - mudar de remédio
    'johreivol04_05':   ('I',  'I',   2, 'c'),   # I.2.③ - cérebro deteriorado
    'johreivol04_05_3': ('I',  'I',   3, None),  # I.3 - "saudável negativo"
    'johreivol04_05_4': ('I',  'I',   4, None),  # I.4 - sem poder bactericida
    'johreivol04_05_5': ('I',  'I',   5, None),  # I.5 - sem coerência médicos
    'johreivol04_06':   ('I',  'II',  1, None),  # I.II.1 - venda de remédios
    'johreivol04_07':   ('II', 'I',   1, None),  # II.I.1 - Gennoshōko/Dokudami
    'johreivol04_08':   ('II', 'II',  1, None),  # II.II.1 - intoxicação por 606
    'johreivol04_09':   ('II', 'III', 1, None),  # II.III.1 - antissépticos e dor
    'johreivol04_10':   ('II', 'IV',  1, None),  # II.IV.1 - Micina
    'johreivol04_11':   ('II', 'V',   1, None),  # II.V.1 - BCG suspensão
    'johreivol04_12':   ('II', 'VI',  1, None),  # II.VI.1 - pele e cosméticos
    'johreivol04_13':   ('II', 'VII', 1, None),  # II.VII.1 - Antipirina
}

CHAPTER_TITLES = {
    'I':  'Sobre a Superstição em Medicamentos',
    'II': 'Sobre as Toxinas Medicinais',
}

# Section titles per (chapter_num, section_num)
SECTION_TITLES = {
    ('I',  'I'):   'A Medicina Moderna carece de cientificidade',
    ('I',  'II'):  'A maior fraude é a venda de remédios',
    ('II', 'I'):   'Medicina Oriental (Kanpo)',
    ('II', 'II'):  'Salvarsan (606)',
    ('II', 'III'): 'Antissépticos',
    ('II', 'IV'):  'Remédios Modernos',
    ('II', 'V'):   'B.C.G.',
    ('II', 'VI'):  'Intoxicação por Cosméticos',
    ('II', 'VII'): 'Outros',
}

VOLUME_NAME = 'Johrei Hô Kohza'
VOLUME_NUM = 4


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
    return {'name': text, 'issue': None, 'page': None}


def chapter_int(c: str | None) -> int:
    return ROMAN_INT.get(c or '', 99)


def section_int(s: str | None) -> int:
    return ROMAN_INT.get(s or '', 99)


def sort_key(e: dict) -> tuple:
    return (
        chapter_int(e.get('chapter_num')),
        section_int(e.get('section_num')),
        e.get('article_num') if e.get('article_num') is not None else 0,
        e.get('sub_letter') or '',
    )


def article_title_from_primary(e: dict) -> str:
    """Strip '(A)/(B)/...' suffix from primary title_pt to get the canonical article title."""
    title = e.get('title_pt', '')
    return re.sub(r'\s*\([A-Z]\)\s*$', '', title).strip()


def main():
    src = Path('data/johrei_vol04_bilingual.json')
    patch_md = Path('Markdown/MD_PT_v2/Johrei_Ho_Kohza_4_v2_PATCH.md')

    backup = src.with_suffix(f'.json.bak.{datetime.now():%Y%m%d_%H%M%S}')
    shutil.copy2(src, backup)
    print(f'Backup: {backup}')

    legacy = json.loads(src.read_text(encoding='utf-8'))
    print(f'Legacy: {len(legacy)} entries')

    primaries = []
    for e in legacy:
        if '_imported_' in e['id']:
            continue
        if e['id'] not in PRIMARY_MAP:
            print(f"  ! WARNING: unmapped primary {e['id']}: {e.get('title_pt','')[:60]}")
            continue
        chapter_num, section_num, article_num, sub_letter = PRIMARY_MAP[e['id']]

        v2 = dict(e)
        v2['volume'] = VOLUME_NAME
        v2['volume_num'] = VOLUME_NUM
        v2['chapter_num'] = chapter_num
        v2['chapter_title'] = CHAPTER_TITLES[chapter_num]
        v2['section_num'] = section_num
        v2['section_title'] = SECTION_TITLES[(chapter_num, section_num)]
        v2['article_num'] = article_num
        v2['article_title'] = article_title_from_primary(e) if article_num is not None else None
        v2['sub_letter'] = sub_letter
        v2['source_ref'] = parse_source(e.get('info_pt', ''))
        v2['parent_id'] = None
        primaries.append(v2)

    print(f'Primaries kept: {len(primaries)}')

    tmp = Path('/tmp/vol04_patch_merge.json')
    subprocess.run(
        ['python', 'scripts/ingest_v2_pt.py', str(patch_md),
         '--volume-num', str(VOLUME_NUM), '--output', str(tmp)],
        check=True, capture_output=True,
    )
    patch_entries = json.loads(tmp.read_text(encoding='utf-8'))
    print(f'Patch entries: {len(patch_entries)}')

    all_entries = primaries + patch_entries
    all_entries.sort(key=sort_key)

    id_map = {}
    for i, e in enumerate(all_entries, start=1):
        id_map[e['id']] = f'johreivol04_{i:02d}'

    parent_lookup = {}
    for i, e in enumerate(all_entries, start=1):
        if e.get('sub_letter') is None and e.get('article_num') is not None:
            parent_lookup[(e.get('chapter_num'), e['section_num'], e['article_num'])] = f'johreivol04_{i:02d}'

    for i, e in enumerate(all_entries, start=1):
        e['id'] = f'johreivol04_{i:02d}'
        e['position'] = i
        if e.get('sub_letter') is not None:
            e['parent_id'] = parent_lookup.get((e.get('chapter_num'), e['section_num'], e['article_num']))
        else:
            e['parent_id'] = None
        if e.get('related_items'):
            e['related_items'] = [id_map.get(rid, rid) for rid in e['related_items'] if rid in id_map]

    src.write_text(json.dumps(all_entries, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {len(all_entries)} entries → {src}')

    n_articles = sum(1 for e in all_entries if e.get('sub_letter') is None and e.get('article_num') is not None)
    n_subs = sum(1 for e in all_entries if e.get('sub_letter') is not None)
    n_intros = sum(1 for e in all_entries if e.get('article_num') is None)
    print(f'  articles: {n_articles}, subitems: {n_subs}, section intros: {n_intros}')


if __name__ == '__main__':
    main()
