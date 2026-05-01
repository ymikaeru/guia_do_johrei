"""
fix_vol07_jp_alignment.py v2 — Usa section (H1) + article number para matching.
O JP vol 07 tem 2 seções com numeração que reinicia:
  Seção I (婦人科): artigos 1-19
  Seção II (産科): artigos 1-17
"""
import json
import re
from pathlib import Path

JP_MD = Path('Markdown/MD_Original/浄霊法講座7.md')
JSON_PATH = Path('data/johrei_vol07_bilingual.json')

def parse_jp(text):
    text = text.replace('\r\n', '\n')
    lines = text.split('\n')
    articles = []
    current_h1 = ''
    current_h2 = ''
    current_lines = []
    h1_index = 0

    def flush():
        nonlocal current_lines
        content = '\n'.join(current_lines).strip()
        if content:
            articles.append({
                'h1': current_h1,
                'h1_idx': h1_index,
                'h2': current_h2,
                'content': content,
            })
        current_lines = []

    for line in lines:
        s = line.strip()
        if re.match(r'^# [^#]', s):
            flush()
            current_h1 = re.sub(r'^# +', '', s).replace('**','').replace('　',' ').strip()
            current_h2 = ''
            h1_index += 1
            continue
        if re.match(r'^## [^#]', s):
            flush()
            current_h2 = re.sub(r'^## +', '', s).replace('**','').replace('　',' ').strip()
            continue
        m_src = re.match(r'^\*(.+)\*$', s)
        if m_src and not current_lines:
            continue
        if s:
            current_lines.append(line)
        elif current_lines:
            current_lines.append('')
    flush()
    return articles

jp_text = JP_MD.read_text(encoding='utf-8')
jp_arts = parse_jp(jp_text)
current = json.loads(JSON_PATH.read_text(encoding='utf-8'))

print(f"JP articles: {len(jp_arts)}")
print(f"PT entries: {len(current)}")

# Build sequential mapping: JP article i -> PT entry i
# But account for PT sub-entries by assigning JP article to the main entry
# and leaving sub-entries with the JP of its parent

# The PT entries are:
# 1 (art=1): JP art 0 (h1_idx=1)
# 2 (art=2, no sub): JP art 1 (title of group)  
# 3 (art=2, sub=a): JP art 2
# 4 (art=2, sub=b): JP art 3
# 5 (art=2, sub=c): JP art 4
# etc.

# Simplest approach: direct sequential match between JP and PT
# JP has 36 articles, PT has 39 entries
# The mismatch is because PT art=2 has title + 3 sub-letters = 4 entries for 1 JP article
# Or: PT art=2 has no content (just title header) + 3 sub entries

# Let me just do sequential matching but skip PT entries with no content (they are group headers)
pt_with_content = []
for i, pt in enumerate(current):
    if pt.get('content_pt', '').strip():
        pt_with_content.append(i)

print(f"PT entries with content: {len(pt_with_content)}")
print(f"JP articles: {len(jp_arts)}")

# Match sequentially
fixed = 0
for seq_idx, pt_idx in enumerate(pt_with_content):
    if seq_idx < len(jp_arts):
        jp = jp_arts[seq_idx]
        pt = current[pt_idx]
        
        old_jp = pt.get('content_jp', '')
        new_jp = jp['content']
        
        # Extract JP title
        h2 = jp['h2']
        clean_title = re.sub(r'^[１-９０-９\d]+[、．.\s]*', '', h2).strip() if h2 else jp['h1']
        
        if old_jp != new_jp:
            current[pt_idx]['content_jp'] = new_jp
            current[pt_idx]['title_jp'] = clean_title
            fixed += 1
        
        if seq_idx < 5 or seq_idx > len(pt_with_content) - 4:
            print(f"  #{seq_idx+1}: PT[{pt['title_pt'][:40]}] <-> JP[{h2[:40]}]")

print(f"\nFixed: {fixed}")

# Entries without content get empty JP
for i, pt in enumerate(current):
    if i not in pt_with_content:
        if not pt.get('content_pt', '').strip():
            current[i]['content_jp'] = ''

with open(JSON_PATH, 'w', encoding='utf-8') as f:
    json.dump(current, f, ensure_ascii=False, indent=2)
print(f"Salvo: {JSON_PATH}")
