"""Merge/upgrade data/johrei_vol01_bilingual.json to schema v2.

Vol 1 is the simplest possible case: 6 stand-alone articles, no chapters,
no sections, no subitems. This script:
  - Drops the single _imported_ duplicate
  - Adds schema v2 fields to each primary via PRIMARY_MAP
  - Renumbers IDs sequentially, sets position
  - Backs up the original JSON before writing
"""
from __future__ import annotations
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

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

# Vol 1 has no chapters and no sections — pure flat list of 6 articles.
# Maps legacy_id → article_num
PRIMARY_MAP = {
    'johreivol01_01': 1,  # O que é a Doença
    'johreivol01_02': 2,  # A Gênese dos Bacilos
    'johreivol01_03': 3,  # A Verdade sobre a Saúde
    'johreivol01_04': 4,  # O Ser Humano é um Vaso de Saúde
    'johreivol01_05': 5,  # O Princípio do Johrei
    'johreivol01_06': 6,  # Os Remédios Pararam de Fazer Efeito
}

VOLUME_NAME = 'Johrei Hô Kohza'
VOLUME_NUM = 1


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


def main():
    src = Path('data/johrei_vol01_bilingual.json')

    backup = src.with_suffix(f'.json.bak.{datetime.now():%Y%m%d_%H%M%S}')
    shutil.copy2(src, backup)
    print(f'Backup: {backup}')

    legacy = json.loads(src.read_text(encoding='utf-8'))
    print(f'Legacy: {len(legacy)} entries')

    entries = []
    for e in legacy:
        if '_imported_' in e['id']:
            print(f'  Dropping imported: {e["id"]} — {e.get("title_pt","")[:60]}')
            continue
        if e['id'] not in PRIMARY_MAP:
            print(f'  ! WARNING: unmapped primary {e["id"]}: {e.get("title_pt","")[:60]}')
            continue

        article_num = PRIMARY_MAP[e['id']]
        v2 = dict(e)
        v2['volume'] = VOLUME_NAME
        v2['volume_num'] = VOLUME_NUM
        v2['chapter_num'] = None
        v2['chapter_title'] = None
        v2['section_num'] = None
        v2['section_title'] = None
        v2['article_num'] = article_num
        v2['article_title'] = e.get('title_pt', '')
        v2['sub_letter'] = None
        v2['parent_id'] = None
        v2['source_ref'] = parse_source(e.get('info_pt', ''))
        entries.append(v2)
        print(f'  OK: {e["id"]} → art {article_num}: {e.get("title_pt","")[:60]}')

    # Sort by article_num (should already be correct but be explicit)
    entries.sort(key=lambda e: e['article_num'])

    # Renumber IDs and set position
    for i, e in enumerate(entries, start=1):
        e['id'] = f'johreivol01_{i:02d}'
        e['position'] = i

    src.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {len(entries)} entries → {src}')


if __name__ == '__main__':
    main()
