#!/usr/bin/env python3
"""
Remove Tab Fields from Individual JSON Items
Keeps tab information only in index.json
"""

import json
from pathlib import Path

def remove_tab_fields(filepath):
    """Remove tab and tab_name fields from all items in a JSON file."""
    print(f"\nProcessing: {filepath.name}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        items = json.load(f)
    
    # Remove tab fields
    removed_count = 0
    for item in items:
        if 'tab' in item:
            del item['tab']
            removed_count += 1
        if 'tab_name' in item:
            del item['tab_name']
    
    # Write back
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    
    print(f"  ✓ Removed tab fields from {removed_count} items")
    
    return removed_count

def main():
    base_dir = Path(__file__).parent.parent / "data"
    json_files = sorted((base_dir / "_source").glob("*_bilingual.json"))
    
    print("=" * 60)
    print("Removing Tab Fields from Individual Items")
    print("=" * 60)
    
    total_removed = 0
    for json_file in json_files:
        count = remove_tab_fields(json_file)
        total_removed += count
    
    print("\n" + "=" * 60)
    print(f"Summary:")
    print(f"  Files processed: {len(json_files)}")
    print(f"  Total items cleaned: {total_removed}")
    print(f"  Tab info now only in index.json")
    print("=" * 60)

if __name__ == "__main__":
    main()
