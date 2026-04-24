#!/usr/bin/env python3
"""
Add Tab Field to Bilingual JSONs
Categorizes items into Fundamentos, Perguntas e Orientações, or Pontos Focais tabs.
"""

import json
from pathlib import Path

# Tab mapping based on book series and volume
TAB_MAPPING = {
    'johrei_vol01': 'fundamentos',
    'johrei_vol02': 'fundamentos',
    'johrei_vol03': 'cases_qa',
    'johrei_vol04': 'cases_qa',
    'johrei_vol05': 'cases_qa',
    'johrei_vol06': 'cases_qa',
    'johrei_vol07': 'cases_qa',
    'johrei_vol08': 'cases_qa',
    'johrei_vol09': 'cases_qa',
    'johrei_vol10': 'cases_qa',
    'pontos_focais_vol01': 'pontos_focais',
    'pontos_focais_vol02': 'pontos_focais',
}

# Tab display names
TAB_NAMES = {
    'fundamentos': 'Fundamentos',
    'cases_qa': 'Casos e Perguntas e Orientações',
    'pontos_focais': 'Pontos Focais'
}

def get_tab_from_filename(filename):
    """Extract tab from filename."""
    base = filename.stem.replace('_bilingual', '')
    return TAB_MAPPING.get(base, 'unknown')

def process_json_file(filepath):
    """Add tab field to all items in a JSON file."""
    print(f"\nProcessing: {filepath.name}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        items = json.load(f)
    
    # Get tab for this file
    tab = get_tab_from_filename(filepath)
    tab_display = TAB_NAMES.get(tab, 'Unknown')
    
    # Add tab to each item
    for item in items:
        item['tab'] = tab
        item['tab_name'] = tab_display
    
    # Write back
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    
    print(f"  ✓ Updated {len(items)} items with tab: {tab_display}")
    
    return tab, len(items)

def main():
    base_dir = Path(__file__).parent.parent / "data"
    json_files = sorted(base_dir.glob("*_bilingual.json"))
    
    print("=" * 60)
    print("Adding Tab Field to Bilingual JSONs")
    print("=" * 60)
    
    # Process files and collect stats
    tab_counts = {}
    for json_file in json_files:
        tab, count = process_json_file(json_file)
        tab_counts[tab] = tab_counts.get(tab, 0) + count
    
    print("\n" + "=" * 60)
    print("Summary:")
    for tab, count in sorted(tab_counts.items()):
        tab_name = TAB_NAMES.get(tab, tab)
        print(f"  {tab_name}: {count} items")
    print(f"  Total: {sum(tab_counts.values())} items")
    print("=" * 60)

if __name__ == "__main__":
    main()
