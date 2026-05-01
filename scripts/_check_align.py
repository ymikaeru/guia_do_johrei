import json
import re

def get_nodes_and_gaps(text):
    """
    Splits text into a list of content nodes and a list of gaps (whitespace/newlines).
    Returns (nodes, gaps). 
    len(gaps) will be len(nodes) - 1.
    """
    # Find all contiguous whitespace that includes at least one newline
    # Or just split by \n+
    # Actually, let's split by any sequence of \n and spaces
    parts = re.split(r'(\n[\s\n]*)', text.strip())
    nodes = []
    gaps = []
    for i, p in enumerate(parts):
        if i % 2 == 0:
            nodes.append(p.strip())
        else:
            gaps.append(p)
    return nodes, gaps

def check_alignment(vol):
    path = f'data/johrei_vol{vol:02d}_bilingual.json'
    try:
        d = json.load(open(path, 'r', encoding='utf-8'))
    except:
        return
    
    perfect = 0
    mismatch = 0
    total = 0
    for e in d:
        pt = e.get('content_pt', '').strip()
        jp = e.get('content_jp', '').strip()
        if not pt or not jp: continue
        
        total += 1
        jp_nodes, jp_gaps = get_nodes_and_gaps(jp)
        pt_nodes, pt_gaps = get_nodes_and_gaps(pt)
        
        jp_nodes = [n for n in jp_nodes if n]
        pt_nodes = [n for n in pt_nodes if n]
        
        if len(jp_nodes) == len(pt_nodes):
            perfect += 1
        else:
            mismatch += 1
            if mismatch <= 1:
                print(f"Vol {vol:02d} ID {e['id']}: JP nodes={len(jp_nodes)} PT nodes={len(pt_nodes)}")
                print(f"  JP nodes: {[n[:20] for n in jp_nodes[:3]]} ...")
                print(f"  PT nodes: {[n[:20] for n in pt_nodes[:3]]} ...")
                
    print(f"Vol {vol:02d}: {perfect}/{total} perfect alignments ({mismatch} mismatches)")

for v in range(1, 11):
    check_alignment(v)
