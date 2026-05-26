import json
import re
import os

DATA_DIR = "data/_source"
FILES_TO_PROCESS = [
    "pontos_focais_vol01_bilingual.json",
    "pontos_focais_vol02_bilingual.json"
]

def clean_point(text):
    # Remove bullets, punctuation at ends, parens if mostly instruction
    text = text.strip()
    text = text.rstrip(".").rstrip(";")
    text = re.sub(r'^\*\s*', '', text) # remove starting bullet
    return text.strip()

def extract_keywords(context_text):
    # Split by common separators
    # We want to keep compound words but split on list separators
    # Separators: , | e (as conjunction) | \n | : | ;
    
    # First, simple split by comma and newline and colon
    chunks = re.split(r'[,:\n;]', context_text)
    
    keywords = []
    
    for chunk in chunks:
        chunk = chunk.strip()
        # handle " e " split
        subchunks = re.split(r'\s+e\s+', chunk)
        for sub in subchunks:
            cleaned = clean_point(sub)
            if not cleaned:
                continue
            
            # Filter out instructional phrases? 
            # e.g. "Caso o braço não se mova" -> This is hard to distinguish from "Região frontal" without NLP
            # But usually "Pontos" section lists nouns.
            # "Seguir os mesmos da doença mental" -> Instruction.
            
            # Simple heuristic: Keep it. The highlighting logic needs exact matches usually, 
            # but having instructions in an array might be okay if we display them as chips.
            # However, for highlighting, we want specific body parts.
            
            # Let's clean parenthesis: "Bulbo raquidiano (lado direito)" -> Keep as is? 
            # Yes, "Bulbo raquidiano (lado direito)" is a specific location.
            
            keywords.append(cleaned)
            
    return keywords

def process_file(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return

    print(f"Processing {filename}...")
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    updated_count = 0
    
    for item in data:
        # 1. Portuguese Extraction
        content_pt = item.get("content_pt", "")
        # Check for various markers:
        # 1. **[Pontos de Johrei]**
        # 2. **Pontos Vitais do Johrei** (no brackets, bold)
        # Regex matches any combination of * and [ around the phrase
        pt_match = re.search(r'(?:[\*\[]+)\s*Pontos (?:de|Vitais do) Johrei\s*(?:[\*\]]+)\s*((?:.|\n)*)', content_pt, re.IGNORECASE)
        
        if pt_match:
            raw_text = pt_match.group(1).strip()
            # Clean up trailing content if any (heuristic: look for double newline or "Nota:")
            
            item['focus_context'] = raw_text
            points_list = extract_keywords(raw_text)
            # Filter noise
            points_list = [p for p in points_list if len(p) > 2 and "Nota:" not in p]
            
            if points_list:
                item['focusPoints'] = points_list
                updated_count += 1
                
    print(f"Updated {updated_count} items in {filename}")
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def main():
    for f in FILES_TO_PROCESS:
        process_file(f)

if __name__ == "__main__":
    main()
