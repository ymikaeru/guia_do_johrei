import json, re, os, glob

DATA_DIR = r'C:\Mioshie_Sites\guia_johrei\data'

# Pattern: extract text inside the first pair of quotes (PT or JP styles)
PT_QUOTE = re.compile(r'["“”]([^"“”]{3,200})["“”]')
JP_QUOTE = re.compile(r'[「『]([^」』]{2,200})[」』]')

# Prefixes to strip if no quotes found
PT_PREFIX = re.compile(r'^(Ensinamento|Orientação|Palestra|Artigo|Sermão|Resposta|Pergunta)\s+de\s+Meishu-Sama\s*[:：-]\s*', re.IGNORECASE)
JP_PREFIX = re.compile(r'^明主様(御垂示|御教え|御講話|御文章|御垂示録)\s*[：:　]?\s*')

def clean_title_pt(title):
    if not title:
        return title
    m = PT_QUOTE.search(title)
    if m:
        return m.group(1).strip()
    return PT_PREFIX.sub('', title).strip()

def clean_title_jp(title):
    if not title:
        return title
    m = JP_QUOTE.search(title)
    if m:
        return m.group(1).strip()
    return JP_PREFIX.sub('', title).strip()

files = glob.glob(os.path.join(DATA_DIR, 'estudo_aprofundado_*_bilingual.json'))
total_updated = 0
for path in files:
    with open(path, encoding='utf-8') as f:
        articles = json.load(f)
    changed = 0
    for a in articles:
        old_pt = a.get('title_pt', '')
        old_jp = a.get('title_jp', '')
        new_pt = clean_title_pt(old_pt)
        new_jp = clean_title_jp(old_jp)
        if new_pt != old_pt:
            a['title_pt'] = new_pt
            changed += 1
        if new_jp != old_jp:
            a['title_jp'] = new_jp
    if changed:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(articles, f, ensure_ascii=False, indent=2)
        total_updated += changed
    print(os.path.basename(path) + ': ' + str(changed) + ' titulos limpos')

print('\nTotal: ' + str(total_updated) + ' titulos atualizados')
