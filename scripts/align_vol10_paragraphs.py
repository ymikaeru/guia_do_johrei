import json
import re

def clean_ja_lines(text):
    # Split by newline
    lines = text.split('\n')
    cleaned = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Remove specific headers usually found in Vol 10
        # Examples: （御教え） or （御教え集...） IF it's a standalone line and doesn't look like content
        # But be careful not to remove content that starts with parens.
        # Usually headers are short.
        
        # Strict removal of "（御教え）"
        if line == '（御教え）':
            continue
            
        # Maybe remove citation lines if PT doesn't have them as separate paragraphs?
        # But PT often puts citation in Title.
        
        cleaned.append(line)
        
    return cleaned

def align_vol10():
    file_path = 'data/johrei_vol10.json'
    with open(file_path, 'r', encoding='utf-8') as f:
        items = json.load(f)
        
    fixes = 0
    
    for item in items:
        pt_text = item.get('content_pt', '')
        ja_text = item.get('content_ja', '')
        
        pt_paras = [p for p in re.split(r'\n\s*\n', pt_text) if p.strip()]
        ja_paras_initial = [p for p in re.split(r'\n\s*\n', ja_text) if p.strip()]
        
        target_count = len(pt_paras)
        current_count = len(ja_paras_initial)
        
        if target_count == current_count:
            continue
            
        print(f"Aligning {item['id']}: PT={target_count} vs JA={current_count}")
        
        # Strategy:
        # 1. Get all JA raw non-empty lines, filtering out known junk headers
        raw_lines = clean_ja_lines(ja_text)
        
        new_ja_content = ""
        
        if target_count == 0:
            new_ja_content = ""
            
        elif target_count == 1:
            # Easy: merge all JA into one block
            new_ja_content = "".join(raw_lines)
            
        elif target_count >= 2:
            # Perguntas e Orientações Logic or Section Logic
            # Detect Q/A markers: （御　伺） and （御垂示）
            
            blocks = []
            current_block = []
            
            # Heuristic:
            # If we need exactly N blocks, we need N-1 split points.
            # Try to align with PT structure.
            
            # Special logic for Perguntas e Orientações pattern which is common in Vol 10
            # Common markers:
            # Q: （御　伺）
            # A: （御垂示）
            
            # Let's try to segment based on these markers first
            # But sometimes '（御　伺）' is just start of first line.
            
            # If we assume the order is Q -> A -> Q -> A ...
            # And PT paragraphs align with Q and A blocks.
            
            # Collect lines
            # If a line starts with marker, it *might* start a new block match IF we are behind on blocks.
            
            # Actually, simply merging lines until we hit a marker line might work.
            
            # Let's build a list of "logical paragraphs" based on markers
            logical_paras = []
            current_p = []
            
            for line in raw_lines:
                # Check for start markers
                is_marker = False
                if line.startswith('（御　伺）') or line.startswith('（御垂示）'):
                    is_marker = True
                    
                # In strict Perguntas e Orientações, each marker starts a new paragraph? 
                # PT:
                # (Pergunta) ...
                # (Orientação) ...
                
                if is_marker and current_p:
                     # Start new block
                     logical_paras.append("".join(current_p))
                     current_p = []
                
                current_p.append(line)
                
            if current_p:
                logical_paras.append("".join(current_p))
                
            # Now compare logical_paras count with target lines
            if len(logical_paras) == target_count:
                # Perfect match logic
                new_ja_content = "\n\n".join(logical_paras)
            else:
                # Fallback or Mismatch
                print(f"  -> markers found {len(logical_paras)} blocks, needed {target_count}.")
                
                # If we have mainly dialogues (quotations), they might have been split.
                # If target is 2 (Q+A) and we found > 2, try to force merge.
                # Usually: Q is first block, everything else is A?
                # Or Q is first, A is second...
                
                if target_count == 2 and len(logical_paras) >= 2:
                    # Likely P1 = Q, P2...Pn = A (Dialogue split)
                    p1 = logical_paras[0]
                    p2 = "".join(logical_paras[1:]) # Join rest
                    new_ja_content = p1 + "\n\n" + p2
                elif target_count == 2 and len(logical_paras) == 1:
                     # Maybe markers missing?
                     # Cannot fix automatically safely without risk. 
                     # But user said "cut" -> maybe split?
                     # Usually the problem is JA has TOO MANY. 
                     # Since we merged everything into logical_paras, if we have 1, it means we merged too much?
                     # No, logical_paras splits on markers.
                     pass 
                
                elif target_count > 2:
                     # Try to fit?
                     # If we have multiple Q/A pairs.
                     pass

        # If we successfully created new content that matches count, apply it
        if new_ja_content:
            check_count = len([p for p in re.split(r'\n\s*\n', new_ja_content) if p.strip()])
            if check_count == target_count:
                item['content_ja'] = new_ja_content
                fixes += 1
                print(f"  -> FIXED: Now {check_count} paras.")
            else:
                print(f"  -> FAILED to align: Generated {check_count} paras.")
                
    # Save
    with open('data/johrei_vol10_aligned.json', 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
        
    print(f"Saved aligned file to data/johrei_vol10_aligned.json. Fixed {fixes} items.")

align_vol10()
