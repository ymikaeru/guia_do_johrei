import json

# Check vol 07 for Contracepcao
d = json.load(open('data/johrei_vol07_bilingual.json', 'r', encoding='utf-8'))
for e in d:
    tp = e.get('title_pt', '')
    if 'contracep' in tp.lower() or 'pecado' in tp.lower():
        print(f"ID: {e['id']}")
        print(f"title_pt: {tp}")
        print(f"title_jp: {e['title_jp']}")
        print(f"content_pt: {len(e['content_pt'])}c")
        print(f"content_jp: {len(e['content_jp'])}c")
        print(f"JP preview: {e['content_jp'][:120]}")
        print()

# Check vol 03 for paragraph breaks in Urgencia
print("=== VOL 03: Urgencia ===")
d3 = json.load(open('data/johrei_vol03_bilingual.json', 'r', encoding='utf-8'))
for e in d3:
    tp = e.get('title_pt', '')
    if 'urg' in tp.lower() or 'supersti' in tp.lower():
        print(f"ID: {e['id']}")
        print(f"title_pt: {tp}")
        content = e['content_pt']
        para_count = content.count('\n\n') + 1
        print(f"content_pt: {len(content)}c, {para_count} paragrafos")
        print(f"Preview: {content[:200]}")
        print()

# Also check how many entries have empty content_jp
print("=== Vol 07: JP coverage ===")
d7 = json.load(open('data/johrei_vol07_bilingual.json', 'r', encoding='utf-8'))
empty = [e['id'] for e in d7 if not e.get('content_jp','')]
print(f"Entries sem JP: {len(empty)} de {len(d7)}")
for eid in empty[:10]:
    e = [x for x in d7 if x['id']==eid][0]
    print(f"  {eid}: {e['title_pt'][:60]}")
