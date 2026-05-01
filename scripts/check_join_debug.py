import json

with open('data/johrei_vol03_bilingual.json.bak.bijection_a.20260429_174148', encoding='utf-8') as f:
    bak = json.load(f)

with open('data/johrei_vol03_bilingual.json', encoding='utf-8') as f:
    cur = json.load(f)

bak_map = {e['id']: e for e in bak}
cur_map = {e['id']: e for e in cur}

for eid in ('johreivol03_02', 'johreivol03_03', 'johreivol03_04'):
    b_pt = bak_map[eid].get('content_pt', '')
    c_pt = cur_map[eid].get('content_pt', '')
    changed = b_pt != c_pt
    print(f"[{eid}] changed={changed}")
    print(f"  BAK para count: {len([p for p in b_pt.split(chr(10)+chr(10)) if p.strip()])}")
    print(f"  CUR para count: {len([p for p in c_pt.split(chr(10)+chr(10)) if p.strip()])}")
    print(f"  CUR preview: {c_pt[:150]!r}")
    print()
