"""Merge v2 patch translation into data/johrei_vol02_bilingual.json.

Vol 02 structure (verified):
- 9 entries in existing JSON: 1 preamble + 8 numbered sections (I-VIII)
- Patch MD has matching 9 sections: preamble + I-VIII
- No subitens, no chapters

Strategy:
- 1:1 mapping by position (existing[N] <-> patch[N])
- Preserve JP-side (content_jp, title_jp), tags, categories, related_items, focusPoints, master_title
- Replace PT-side (title_pt, content_pt) with patch
- Add schema v2 fields (section_num, article_num, position, parent_id, source_ref, etc.)
- IDs stay johreivol02_01..09 (no renumbering)
- Backup before writing
"""
from __future__ import annotations
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

VOLUME_NAME = 'Johrei Hô Kohza'
VOLUME_NUM = 2

# Section titles (used as both section_title and article_title for the article)
SECTION_INFO = [
    # (existing_id,    section_num, article_num, section_title,                                            article_title)
    ('johreivol02_01', None,  None, None,                                                                    'A Importância do Conhecimento sobre a Doença'),
    ('johreivol02_02', 'I',   1,    'A Racionalidade do Johrei',                                              'A Racionalidade do Johrei'),
    ('johreivol02_03', 'II',  2,    'Sobre a Força Espiritual no Johrei',                                     'Sobre a Força Espiritual no Johrei'),
    ('johreivol02_04', 'III', 3,    'A Ordem do Johrei e os Pontos Vitais',                                   'A Ordem do Johrei e os Pontos Vitais'),
    ('johreivol02_05', 'IV',  4,    'O Processo de Acúmulo de Toxinas e a Ordem de Eliminação',               'O Processo de Acúmulo de Toxinas e a Ordem de Eliminação'),
    ('johreivol02_06', 'V',   5,    'Sobre o Funcionamento da Cabeça e as Toxinas Medicamentosas',             'Sobre o Funcionamento da Cabeça e as Toxinas Medicamentosas'),
    ('johreivol02_07', 'VI',  6,    'As Mulheres e a Febre no Lobo Frontal',                                   'As Mulheres e a Febre no Lobo Frontal'),
    ('johreivol02_08', 'VII', 7,    'Intoxicação por Cosméticos',                                              'Intoxicação por Cosméticos'),
    ('johreivol02_09', 'VIII',8,    'A Beleza Natural do Rosto e Três Benefícios numa Só Ação',                'A Beleza Natural do Rosto e Três Benefícios numa Só Ação'),
]


def parse_patch_md(md_path: Path) -> list[str]:
    """Extract the 9 content blocks (preamble + 8 sections) from the patch MD.

    Each block is everything between the `####` heading and the next `###` or `####`.
    Returns 9 strings of PT content (paragraphs) in order.
    """
    text = md_path.read_text(encoding='utf-8')
    # Split by H4 headings (#### ...)
    parts = re.split(r'\n#### .+?\n', text)
    # parts[0] is the prelude; parts[1..9] are the content blocks
    contents = []
    for p in parts[1:]:
        # Stop at next H3 (### ...)
        block = re.split(r'\n### ', p, maxsplit=1)[0].strip()
        contents.append(block)
    return contents


def main():
    src = Path('data/johrei_vol02_bilingual.json')
    patch_md = Path('Markdown/MD_PT_v2/Johrei_Ho_Kohza_2_v2_PATCH.md')

    # Backup
    backup = src.with_suffix(f'.json.bak.merge_v2.{datetime.now():%Y%m%d_%H%M%S}')
    shutil.copy2(src, backup)
    print(f'Backup: {backup}')

    # Load existing
    legacy = json.loads(src.read_text(encoding='utf-8'))
    print(f'Legacy: {len(legacy)} entries')
    assert len(legacy) == 9, f'Expected 9 entries in vol 02, got {len(legacy)}'

    # Parse patch
    contents = parse_patch_md(patch_md)
    print(f'Patch: {len(contents)} content blocks')
    assert len(contents) == 9, f'Expected 9 blocks in patch MD, got {len(contents)}'

    # Build legacy lookup by id
    legacy_by_id = {e['id']: e for e in legacy}

    # Merge: 1:1 by position
    new_entries = []
    for i, ((legacy_id, section_num, article_num, section_title, article_title), pt_content) in enumerate(
            zip(SECTION_INFO, contents), start=1):
        legacy_e = legacy_by_id[legacy_id]

        v2 = dict(legacy_e)  # preserve all legacy fields (tags, categories, related_items, focusPoints, JP-side)

        # Replace PT-side
        v2['title_pt'] = article_title
        v2['content_pt'] = pt_content

        # Add v2 fields
        v2['volume'] = VOLUME_NAME
        v2['volume_num'] = VOLUME_NUM
        v2['chapter_num'] = None
        v2['chapter_title'] = None
        v2['section_num'] = section_num
        v2['section_title'] = section_title
        v2['article_num'] = article_num
        v2['article_title'] = article_title
        v2['sub_letter'] = None
        v2['position'] = i
        v2['parent_id'] = None
        v2['source_ref'] = None  # vol 02 is continuous lecture; no per-article source citation

        # Normalize legacy variants of master_title casing
        if 'Master_Title' in v2 and 'master_title' not in v2:
            v2['master_title'] = v2.pop('Master_Title')
        elif 'Master_Title' in v2:
            v2.pop('Master_Title')  # dedupe to lowercase only

        new_entries.append(v2)

    # Write
    src.write_text(json.dumps(new_entries, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {len(new_entries)} entries -> {src}')

    # Summary
    print('\nSummary:')
    for e in new_entries:
        print(f'  [{e["id"]}] §{e.get("section_num") or "—"}.{e.get("article_num") or "—"} {e["title_pt"][:60]}')


if __name__ == '__main__':
    main()
