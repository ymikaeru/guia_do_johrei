import json
import re
from pathlib import Path

def get_nodes_and_gaps(text):
    # Split text into content blocks and whitespace gaps
    parts = re.split(r'([\s\n]+)', text.strip())
    # Wait, we only care about newlines. Spaces inside a line shouldn't be split.
    # Let's split strictly by newlines and spaces that INCLUDE at least one newline.
    parts = re.split(r'(\n[\s\n]*)', text.strip())
    nodes = []
    gaps = []
    for i, p in enumerate(parts):
        if i % 2 == 0:
            nodes.append(p.strip())
        else:
            gaps.append(p)
    return [n for n in nodes if n], gaps

def align_whitespace(vol):
    path = Path(f'data/johrei_vol{vol:02d}_bilingual.json')
    if not path.exists(): return
    d = json.loads(path.read_text(encoding='utf-8'))
    
    fixed = 0
    total = 0
    
    for e in d:
        pt = e.get('content_pt', '').strip()
        jp = e.get('content_jp', '').strip()
        if not pt or not jp: continue
        
        total += 1
        jp_nodes, jp_gaps = get_nodes_and_gaps(jp)
        pt_nodes, pt_gaps = get_nodes_and_gaps(pt)
        
        # If the number of text nodes is identical, we can map JP gaps directly to PT
        if len(jp_nodes) == len(pt_nodes) and len(jp_nodes) > 1:
            new_pt = ""
            for i in range(len(jp_nodes)):
                new_pt += pt_nodes[i]
                if i < len(jp_gaps):
                    new_pt += jp_gaps[i]
            
            if new_pt != e['content_pt']:
                e['content_pt'] = new_pt
                fixed += 1
                
    if fixed > 0:
        path.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f"Vol {vol:02d}: Aligned whitespace in {fixed}/{total} entries")

for v in range(1, 11):
    align_whitespace(v)
