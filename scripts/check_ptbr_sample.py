import json

with open('data/johrei_vol07_bilingual.json', encoding='utf-8') as f:
    data = json.load(f)

targets = ['johreivol07_02', 'johreivol07_08', 'johreivol07_09', 'johreivol07_05']
for e in data:
    if e.get('id') in targets:
        title = (e.get('title_pt') or '')[:70]
        content = (e.get('content_pt') or '')[:700]
        print(f"=== {e['id']} — {title} ===")
        print(content)
        print()
