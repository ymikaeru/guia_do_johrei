"""Merge primary entries from data/johrei_vol03_bilingual.json with the v2 patch.

- Keeps the 24 existing primary translations verbatim (content_pt, title_pt, tags, related_items, info_pt, etc.)
- Adds schema v2 fields to each primary via a hand-coded mapping
- Drops all `_imported_*` entries (duplicates/headers/redundancies)
- Adds the 18 patch entries (3 new I.1 + 1 empty II.8 parent + 2 II.8 subs + 10 stand-alone + 1 IV.1 + 1 I.1 parent... etc.)
- Sorts by (section_int, article_num, sub_letter)
- Renumbers IDs sequentially as johreivol03_NN
- Re-points parent_id references since IDs change
- Backs up the original JSON before writing
"""
from __future__ import annotations
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

ROMAN_INT = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10}
SOURCE_PARSE_RE = re.compile(
    r'^(?P<name>.+?)\s+n\.?º?\s*(?P<issue>\d+)(?:,\s*p[áa]g\.?\s*(?P<page>\d+))?\s*$'
)
SOURCE_NAME_NORMALIZE = {
    'Mioshie-shu': 'Mioshie-shū',
    'Mioshie-Shu': 'Mioshie-shū',
    'Goshū': 'Mioshie-shū',  # legacy mis-romanization
    'Goshu': 'Mioshie-shū',
}

# Hand-coded mapping of legacy primary IDs to v2 hierarchical position
# (section_num, article_num, sub_letter)
PRIMARY_MAP = {
    'johreivol03_01': ('I',  2, None),   # A quebra da superstição medicinal
    'johreivol03_02': ('I',  3, None),   # A importância do conhecimento da Medicina Espiritual
    'johreivol03_03': ('I',  4, None),   # Medicina Espiritual e a Salvação Paradisíaca
    'johreivol03_04': ('II', 1, None),   # II.1 parent — O maior aprimoramento... relaxar a força
    'johreivol03_05': ('II', 1, 'a'),    # Sobre relaxar a força (A)
    'johreivol03_06': ('II', 1, 'b'),    # Sobre relaxar a força (B)
    'johreivol03_07': ('II', 1, 'c'),    # Sobre relaxar a força (C)
    'johreivol03_08': ('II', 1, 'd'),    # Sobre relaxar a força (D)
    'johreivol03_09': ('II', 1, 'e'),    # Sobre relaxar a força (E)
    'johreivol03_10': ('II', 2, None),   # Quanto mais se deseja curar rápido
    'johreivol03_11': ('II', 3, None),   # Como relaxar a força da mão
    'johreivol03_12': ('II', 4, None),   # Sobre a forma de dobrar o braço
    'johreivol03_13': ('II', 5, None),   # Sobre a distância do Johrei
    'johreivol03_14': ('II', 6, None),   # Sobre a distância entre a palma da mão
    'johreivol03_15': ('II', 7, None),   # Em qualquer caso, o melhor é afastar a palma
    'johreivol03_16': ('II', 9, None),   # Johrei em pequenas solidificações
    'johreivol03_17': ('III', 1, None),  # Sobre a racionalidade do Johrei
    'johreivol03_18': ('III', 2, None),  # Ao ministrar Johrei, deve-se respeitar a ordem correta
    'johreivol03_19': ('III', 3, None),  # O dever de ser gentil e imparcial
    'johreivol03_20': ('IV', None, None),# IV intro — "Outros"
    'johreivol03_21': ('IV', 2, None),   # Sobre o aquecimento da palma da mão
    'johreivol03_22': ('IV', 3, None),   # A constituição humana e o Johrei
    'johreivol03_23': ('IV', 4, None),   # O encosto espiritual também se resolve
    'johreivol03_24': ('IV', 5, None),   # Sobre o Johrei em animais
}

# Section titles (for primaries that don't have section_title in info_pt)
SECTION_TITLES = {
    'I':   'O Objetivo da Educação em Medicina Espiritual',
    'II':  'Formas e Métodos de Johrei',
    'III': 'Sobre Seguir a Ordem Correta no Johrei',
    'IV':  'Outros',
}

# Article titles for parent-only entries (when article has subitens whose parent is the article-level node)
# Used when primary doesn't fully expose the parent's article_title.
# For primaries already mapped, we trust their title_pt as both card title and article_title.

VOLUME_NAME = 'Johrei Hô Kohza'
VOLUME_NUM = 3


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


def section_int(section_num: str | None) -> int:
    return ROMAN_INT.get(section_num or '', 99)


def sort_key(e: dict) -> tuple:
    return (
        section_int(e.get('section_num')),
        e.get('article_num') if e.get('article_num') is not None else 0,
        e.get('sub_letter') or '',
    )


def article_title_from_primary(e: dict) -> str:
    """Strip '(A)/(B)/...' suffix from primary title_pt to get the canonical article title."""
    title = e.get('title_pt', '')
    return re.sub(r'\s*\([A-Z]\)\s*$', '', title).strip()


def main():
    src = Path('data/johrei_vol03_bilingual.json')
    patch_md = Path('Markdown/MD_PT_v2/Johrei_Ho_Kohza_3_v2_PATCH.md')

    # Backup
    backup = src.with_suffix(f'.json.bak.{datetime.now():%Y%m%d_%H%M%S}')
    shutil.copy2(src, backup)
    print(f'Backup: {backup}')

    # Load existing
    legacy = json.loads(src.read_text(encoding='utf-8'))
    print(f'Legacy: {len(legacy)} entries')

    # Filter primaries, enrich with v2 fields
    primaries = []
    for e in legacy:
        if '_imported_' in e['id']:
            continue
        if e['id'] not in PRIMARY_MAP:
            print(f"  ! WARNING: unmapped primary {e['id']}: {e.get('title_pt','')[:60]}")
            continue
        section_num, article_num, sub_letter = PRIMARY_MAP[e['id']]

        # Build v2 entry preserving legacy content
        v2 = dict(e)  # shallow copy
        v2['volume'] = VOLUME_NAME
        v2['volume_num'] = VOLUME_NUM
        v2['section_num'] = section_num
        v2['section_title'] = SECTION_TITLES[section_num]
        v2['article_num'] = article_num
        v2['article_title'] = article_title_from_primary(e) if article_num is not None else None
        v2['sub_letter'] = sub_letter
        v2['source_ref'] = parse_source(e.get('info_pt', ''))
        # parent_id will be filled after sort/renumber
        v2['parent_id'] = None  # placeholder
        primaries.append(v2)

    print(f'Primaries kept: {len(primaries)}')

    # Load patch via ingester output
    # Re-run ingester to be fresh
    import subprocess
    tmp = Path('/tmp/vol03_patch_merge.json')
    subprocess.run(
        ['python', 'scripts/ingest_v2_pt.py', str(patch_md),
         '--volume-num', str(VOLUME_NUM), '--output', str(tmp)],
        check=True, capture_output=True,
    )
    patch_entries = json.loads(tmp.read_text(encoding='utf-8'))
    print(f'Patch entries: {len(patch_entries)}')

    # Combine
    all_entries = primaries + patch_entries
    # Sort hierarchically
    all_entries.sort(key=sort_key)

    # Renumber IDs and rebuild parent_id pointers
    # First pass: assign new IDs and remember original ID → new ID mapping
    id_map = {}
    for i, e in enumerate(all_entries, start=1):
        new_id = f'johreivol03_{i:02d}'
        id_map[e['id']] = new_id

    # Second pass: rewrite IDs and parent_id, position
    # parent_id semantics: subitens point to their article-level parent (sub_letter=None, same section_num & article_num)
    # Build a lookup: (section_num, article_num, None) -> new_id
    parent_lookup = {}
    for i, e in enumerate(all_entries, start=1):
        if e.get('sub_letter') is None and e.get('article_num') is not None:
            parent_lookup[(e['section_num'], e['article_num'])] = f'johreivol03_{i:02d}'

    for i, e in enumerate(all_entries, start=1):
        e['id'] = f'johreivol03_{i:02d}'
        e['position'] = i
        if e.get('sub_letter') is not None:
            e['parent_id'] = parent_lookup.get((e['section_num'], e['article_num']))
        else:
            e['parent_id'] = None
        # Update related_items to use new IDs (best-effort)
        if e.get('related_items'):
            e['related_items'] = [id_map.get(rid, rid) for rid in e['related_items'] if rid in id_map]

    # Write
    src.write_text(json.dumps(all_entries, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {len(all_entries)} entries → {src}')

    # Summary
    n_articles = sum(1 for e in all_entries if e.get('sub_letter') is None and e.get('article_num') is not None)
    n_subs = sum(1 for e in all_entries if e.get('sub_letter') is not None)
    n_intros = sum(1 for e in all_entries if e.get('article_num') is None)
    print(f'  articles: {n_articles}, subitems: {n_subs}, section intros: {n_intros}')


if __name__ == '__main__':
    main()
