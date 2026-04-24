import json
import os
import re

DATA_DIR = "/Users/michael/Documents/Ensinamentos/guia_johrei/data"

FILES = [
    "fundamentos.json",
    "curas.json",
]

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

def main():
    cleaned_count = 0
    
    for fname in FILES:
        path = os.path.join(DATA_DIR, fname)
        data = load_json(path)
        modified = False
        
        for item in data:
            t_ja = item.get('title_ja', '')
            # Check if title_ja is just "浄霊法講座（X）" or similar generic header
            # Regex to match "浄霊法講座" followed by optional brackets/text that looks like a main title
            if re.match(r"^浄霊法講座.*", t_ja) and len(t_ja) < 30: 
                # Heuristic: Real chapters usually have specific titles. 
                # If it matches the volume generic name, it's likely a bad match.
                # Exception: unless the user explicitly wants the volume title? Unlikely for specific Perguntas e Orientações.
                
                # Check if specific keywords exist in JP content that might validate it
                # For now, remove to be safe.
                print(f"Removing generic match: {t_ja} for {item.get('title')}")
                del item['title_ja']
                if 'content_ja' in item:
                    del item['content_ja']
                modified = True
                cleaned_count += 1
            
            # Also remove matches where content is empty or generic if title is generic
                
        if modified:
            save_json(path, data)

    print(f"Cleaned {cleaned_count} generic matches.")

if __name__ == "__main__":
    main()
