# -*- coding: utf-8 -*-
"""
Limpa titulos de TODOS os JSONs do guia_johrei removendo:
- Referencias bibliograficas: (Goshū n.º X, pág. Y), (Gosui-ji Roku n.º X, pág. Y)
  (Mioshieshu-shū X, pág. Y), (Mikoto no Oshie-shū, vol. X, pág. Y...)
- Sobras de escape: \) \\ etc
- Marcadores markdown numericos: ### I., ### II.
- Espacos em excesso

Aplica em title_pt e title_jp dos artigos.
"""
import json, re, os, glob

DATA_DIR = r'C:\Mioshie_Sites\guia_johrei\data'

# Patterns to remove (in order)
REF_PATTERNS = [
    # (Goshū n.º 8, pág. 11\) or (Goshu n.o 8, pag. 11)
    r'\s*\((?:Goshū|Goshu|Gosuijiroku|Gosui-ji Roku|Gosui-Ji Roku|Mioshieshu-shū|'
    r'Mioshieshu|Mioshie Shu|Mikoto no Oshie-shū|Mikoto no Oshie|'
    r'Mikoto no Oshie-shu|Goshū-shū|Mikoto-shu|Goshū-Shū)[^)]*?\)\s*\\?\)?',
    # generic "(... pág. ...)" or "(... pag. ...)" or "(... página ...)"
    r'\s*\([^()]*\b(p[áa]g(?:ina)?\.?|vol\.|n\.?º?)\s*\d+[^()]*?\)\s*\\?\)?',
    # markdown heading prefix "### I.", "### II.", etc
    r'^\s*#{1,4}\s*(?:[IVXLCM]+\.|\d+\.)\s*',
    # leftover backslash followed by closing paren or end
    r'\\\)?$',
    # leftover unbalanced trailing backslash
    r'\\+\s*$',
]

def clean_title(title):
    if not title:
        return title
    s = title
    for pat in REF_PATTERNS:
        s = re.sub(pat, '', s, flags=re.IGNORECASE)
    # collapse internal whitespace
    s = re.sub(r'\s+', ' ', s).strip()
    # final tidy: lone trailing punctuation/backslashes
    s = re.sub(r'[\\\s]+$', '', s)
    s = re.sub(r'^[\\\s]+', '', s)
    return s

# Process all volume json files (keep estudo_aprofundado intact too — apply same cleaning)
files = glob.glob(os.path.join(DATA_DIR, '*_bilingual.json'))

total_changed_pt = 0
total_changed_jp = 0
sample = []

for path in files:
    with open(path, encoding='utf-8') as f:
        articles = json.load(f)
    changed_pt = 0
    changed_jp = 0
    for a in articles:
        old_pt = a.get('title_pt', '')
        new_pt = clean_title(old_pt)
        if new_pt != old_pt and new_pt:  # never set to empty
            a['title_pt'] = new_pt
            changed_pt += 1
            if len(sample) < 10:
                sample.append((os.path.basename(path), old_pt, new_pt))
        old_jp = a.get('title_jp', '')
        new_jp = clean_title(old_jp)
        if new_jp != old_jp and new_jp:
            a['title_jp'] = new_jp
            changed_jp += 1
    if changed_pt or changed_jp:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(articles, f, ensure_ascii=False, indent=2)
        print(os.path.basename(path) + ': ' + str(changed_pt) + ' PT, ' + str(changed_jp) + ' JP')
    total_changed_pt += changed_pt
    total_changed_jp += changed_jp

print('\nTotal: ' + str(total_changed_pt) + ' titulos PT, ' + str(total_changed_jp) + ' JP limpos')
print('\nAmostra de mudancas:')
for fname, old, new in sample:
    print('  [' + fname + ']')
    print('    ANTES: ' + old[:90])
    print('    DEPOIS: ' + new[:90])
