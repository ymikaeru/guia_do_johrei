import json

with open('data/johrei_vol03_bilingual.json', encoding='utf-8') as f:
    data = json.load(f)

for e in data:
    if e['id'] in ('johreivol03_02', 'johreivol03_03', 'johreivol03_04'):
        pt = e.get('content_pt', '')
        pt_n = len([p for p in pt.split('\n\n') if p.strip()])
        jp_n = len([p for p in (e.get('content_jp','') or '').split('\n\n') if p.strip()])
        print(f"[{e['id']}] PT paras={pt_n} JP paras={jp_n}")
        print(f"  PT preview: {pt[:200]!r}")
        print()
