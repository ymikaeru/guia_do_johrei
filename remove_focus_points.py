import json
import glob
import os

def remove_focus_points(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        modified = False
        for item in data:
            if 'focusPoints' in item:
                del item['focusPoints']
                modified = True
                
            if 'tags' in item:
                original_len = len(item['tags'])
                item['tags'] = [t for t in item['tags'] if not t.startswith('ponto:')]
                if len(item['tags']) != original_len:
                    modified = True

        if modified:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"Updated {file_path}")
        else:
            print(f"No changes for {file_path}")
            
    except Exception as e:
        print(f"Error processing {file_path}: {e}")

if __name__ == '__main__':
    files = glob.glob('data/johrei_vol*_bilingual.json')
    for file in files:
        remove_focus_points(file)
