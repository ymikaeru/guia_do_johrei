#!/usr/bin/env python3
"""
ingest_md_to_json.py — Ingere os MDs traduzidos (PT-BR) nos JSONs bilíngues.

Lê o MD traduzido, parseia as entries por header hierarchy, e atualiza
o content_pt de cada entry no JSON bilíngue correspondente.

Uso:
    python scripts/ingest_md_to_json.py --vol 03 --dry-run
    python scripts/ingest_md_to_json.py --all
"""

import json
import re
import sys
import argparse
from pathlib import Path
from copy import deepcopy

DATA_DIR = Path('data')

# Fontes dos MDs finais: definitivo para 02/03, retranslated para os demais
def get_md_path(vol_num):
    vol_str = str(vol_num).zfill(2)
    definitivo = Path(f'Markdown/MD_PT_definitivo/Johrei_Ho_Kohza_{vol_num}_definitivo.md')
    retranslated = Path(f'Markdown/MD_PT_retranslated/Johrei_Ho_Kohza_{vol_num}_retranslated.md')
    if definitivo.exists():
        return definitivo
    elif retranslated.exists():
        return retranslated
    return None


def get_json_path(vol_num):
    return DATA_DIR / f'johrei_vol{str(vol_num).zfill(2)}_bilingual.json'


# ──────────────────────────────────────────────
# Parse MD into structured entries
# ──────────────────────────────────────────────
def parse_md_entries(md_text):
    """
    Parse the translated MD into entries matching the JSON structure.
    Returns list of dicts with keys: section_num, article_num, sub_letter, content, title, source
    """
    md_text = md_text.replace('\r\n', '\n')
    lines = md_text.split('\n')

    entries = []
    current_section = None
    current_article = None
    current_sub = None
    current_content_lines = []
    current_title = ''
    current_source = ''

    def flush():
        nonlocal current_content_lines, current_source
        if current_section is not None and current_article is not None:
            # Build content from accumulated lines, skip source line
            content = '\n'.join(current_content_lines).strip()
            entries.append({
                'section_num': current_section,
                'article_num': current_article,
                'sub_letter': current_sub,
                'title': current_title,
                'source': current_source,
                'content': content,
            })
        current_content_lines = []
        current_source = ''

    for line in lines:
        stripped = line.strip()

        # ## Volume title — skip
        if re.match(r'^##\s+[^#]', stripped) and not re.match(r'^###', stripped):
            continue

        # ### Section header (roman numeral)
        m_sec = re.match(r'^###\s+([IVXLC]+)\.\s*(.*)', stripped)
        if m_sec:
            flush()
            current_section = m_sec.group(1)
            current_article = None
            current_sub = None
            # Check if section has intro content (e.g., section IV in vol 03)
            current_content_lines = []
            continue

        # #### Article header (numbered)
        m_art = re.match(r'^####\s+(\d+)\.\s*(.*)', stripped)
        if m_art:
            flush()
            current_article = int(m_art.group(1))
            current_sub = None
            current_title = m_art.group(2).strip()
            current_content_lines = []
            current_source = ''
            continue

        # ##### Sub-letter header
        m_sub = re.match(r'^#####\s+(?:\(([a-z])\)|(\d+)\.?)\s*(.*)', stripped)
        if m_sub:
            flush()
            if m_sub.group(1):
                current_sub = m_sub.group(1)
            elif m_sub.group(2):
                current_sub = m_sub.group(2)
            sub_title = m_sub.group(3).strip() if m_sub.group(3) else ''
            if sub_title:
                current_title = sub_title
            current_content_lines = []
            current_source = ''
            continue

        # Source line (italic, e.g., *Mioshie-shū n.º 28, pág. 5*)
        m_src = re.match(r'^\*(.+)\*$', stripped)
        if m_src and current_article is not None and not current_content_lines:
            current_source = m_src.group(1)
            continue

        # Regular content — also capture section intro text
        if stripped:
            # If we have a section but no article yet, this is section intro
            if current_section and current_article is None:
                if not entries or entries[-1].get('section_num') != current_section:
                    current_article = None  # section intro — matches JSON convention
                    current_sub = None
                    current_title = ''
            current_content_lines.append(line)
        elif current_content_lines:
            # Empty line — could be paragraph break
            current_content_lines.append('')

    flush()
    return entries


# ──────────────────────────────────────────────
# Match and update JSON entries
# ──────────────────────────────────────────────
def make_key(section_num, article_num, sub_letter):
    """Create a matching key from section/article/sub."""
    sub = sub_letter or ''
    art = article_num if article_num is not None else 'None'
    return f"{section_num}_{art}_{sub}".strip('_')


def update_json_entries(json_entries, md_entries, dry_run=False):
    """Match MD entries to JSON entries and update content_pt."""
    updated = deepcopy(json_entries)
    stats = {'matched': 0, 'updated': 0, 'unmatched_md': [], 'unmatched_json': []}

    # Build lookup from JSON entries
    json_lookup = {}
    for i, je in enumerate(updated):
        sec = je.get('section_num', '')
        art = je.get('article_num', '')
        sub = je.get('sub_letter') or ''
        key = make_key(sec, art, sub)
        json_lookup[key] = i

    # Try to match each MD entry
    for me in md_entries:
        sec = me['section_num']
        art = me['article_num']
        sub = me['sub_letter'] or ''

        # Convert sub from number to letter if needed (1->a, 2->b, etc.)
        if sub and sub.isdigit():
            sub = chr(ord('a') + int(sub) - 1)

        key = make_key(sec, art, sub)

        if key in json_lookup:
            idx = json_lookup[key]
            old_pt = updated[idx].get('content_pt', '')
            new_pt = me['content'].strip()

            if new_pt and new_pt != old_pt:
                if not dry_run:
                    updated[idx]['content_pt'] = new_pt
                    if me['source']:
                        updated[idx]['source_ref'] = me['source']
                    if me['title']:
                        updated[idx]['title_pt'] = me['title']
                stats['updated'] += 1

            stats['matched'] += 1
        else:
            stats['unmatched_md'].append(f"sec={sec} art={art} sub={sub}")

    # Find JSON entries without MD match
    matched_keys = set()
    for me in md_entries:
        sec = me['section_num']
        art = me['article_num']
        sub = me['sub_letter'] or ''
        if sub and sub.isdigit():
            sub = chr(ord('a') + int(sub) - 1)
        matched_keys.add(make_key(sec, art, sub))

    for key, idx in json_lookup.items():
        if key not in matched_keys:
            je = updated[idx]
            stats['unmatched_json'].append(f"{je['id']} ({key})")

    return updated, stats


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='Ingere MDs traduzidos nos JSONs bilíngues')
    parser.add_argument('--vol', nargs='+', type=int, help='Volumes a processar (ex: 3 6 8)')
    parser.add_argument('--all', action='store_true', help='Todos os volumes')
    parser.add_argument('--dry-run', action='store_true', help='Mostra sem salvar')
    args = parser.parse_args()

    vols = list(range(1, 11)) if args.all else (args.vol or [])
    if not vols:
        parser.print_help()
        return

    print(f'{"="*60}')
    print(f'Ingestão MD → JSON Bilíngue')
    print(f'Modo: {"DRY RUN" if args.dry_run else "LIVE"}')
    print(f'{"="*60}')

    total_updated = 0

    for vol in sorted(vols):
        md_path = get_md_path(vol)
        json_path = get_json_path(vol)

        if not md_path:
            print(f'\n❌ Vol {vol:02d}: MD não encontrado')
            continue
        if not json_path.exists():
            print(f'\n❌ Vol {vol:02d}: JSON não encontrado')
            continue

        print(f'\n▶ Vol {vol:02d}: {md_path.name} → {json_path.name}')

        md_text = md_path.read_text(encoding='utf-8')
        json_data = json.loads(json_path.read_text(encoding='utf-8'))

        md_entries = parse_md_entries(md_text)
        print(f'  MD entries parseadas: {len(md_entries)}')
        print(f'  JSON entries existentes: {len(json_data)}')

        updated_json, stats = update_json_entries(json_data, md_entries, args.dry_run)

        print(f'  ✅ Matched: {stats["matched"]}')
        print(f'  📝 Updated: {stats["updated"]}')

        if stats['unmatched_md']:
            print(f'  ⚠️ MD sem match JSON ({len(stats["unmatched_md"])}):')
            for um in stats['unmatched_md'][:10]:
                print(f'     {um}')

        if stats['unmatched_json']:
            print(f'  ⚠️ JSON sem match MD ({len(stats["unmatched_json"])}):')
            for uj in stats['unmatched_json'][:10]:
                print(f'     {uj}')

        if not args.dry_run and stats['updated'] > 0:
            # Backup
            backup = json_path.with_suffix('.json.bak')
            if not backup.exists():
                import shutil
                shutil.copy2(json_path, backup)

            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(updated_json, f, ensure_ascii=False, indent=2)
            print(f'  💾 Salvo: {json_path}')

        total_updated += stats['updated']

    print(f'\n{"="*60}')
    print(f'Total entries atualizadas: {total_updated}')
    print(f'{"="*60}')


if __name__ == '__main__':
    main()
