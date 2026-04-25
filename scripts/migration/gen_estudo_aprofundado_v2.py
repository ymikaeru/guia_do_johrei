import json, re, os

CACHE   = r'C:\Mioshie_Sites\mioshie_college_offline\SiteModerno\site_data\mioshiec2'
OUT_DIR = r'C:\Mioshie_Sites\guia_johrei\data'

FILES = [
    ('JK1','浄霊の急所 1（総論）','Pontos Vitais do Johrei 1 (Teoria Geral)'),
    ('JK2','浄霊の急所 2（総論）','Pontos Vitais do Johrei 2 (Teoria Geral)'),
    ('JK3','浄霊の急所 3（各論）','Pontos Vitais do Johrei 3 (Tópicos Específicos)'),
    ('JK4','浄霊の急所 4（各論）','Pontos Vitais do Johrei 4 (Tópicos Específicos)'),
    ('JK5','浄霊の急所 5（各論）','Pontos Vitais do Johrei 5 (Tópicos Específicos)'),
    ('JK6','浄霊の急所 6（各論）','Pontos Vitais do Johrei 6 (Tópicos Específicos)'),
    ('JK7','浄霊の急所 7（各論）','Pontos Vitais do Johrei 7 (Tópicos Específicos)'),
    ('JK8','浄霊の急所 8（各論）','Pontos Vitais do Johrei 8 (Tópicos Específicos)'),
    ('JK9','浄霊の急所 9（各論）','Pontos Vitais do Johrei 9 (Tópicos Específicos)'),
    ('JK10','浄霊の急所 10（各論）','Pontos Vitais do Johrei 10 (Tópicos Específicos)'),
    ('JK11','浄霊の急所 11（各論）','Pontos Vitais do Johrei 11 (Tópicos Específicos)'),
    ('JK12','浄霊の急所 12（各論）','Pontos Vitais do Johrei 12 (Tópicos Específicos)'),
    ('JK13','浄霊の急所 13（各論）','Pontos Vitais do Johrei 13 (Tópicos Específicos)'),
    ('JK14','浄霊の急所 14（各論）','Pontos Vitais do Johrei 14 (Tópicos Específicos)'),
    ('JK15','浄霊の急所 15（各論）','Pontos Vitais do Johrei 15 (Tópicos Específicos)'),
    ('JK16','浄霊の急所 16（各論）','Pontos Vitais do Johrei 16 (Tópicos Específicos)'),
    ('JK17','浄霊の急所 17（各論）','Pontos Vitais do Johrei 17 (Tópicos Específicos)'),
    ('JK18','浄霊の急所 18（各論）','Pontos Vitais do Johrei 18 (Tópicos Específicos)'),
    ('JK19','浄霊の急所 19（各論）','Pontos Vitais do Johrei 19 (Tópicos Específicos)'),
    ('JK20','浄霊の急所 20（各論）','Pontos Vitais do Johrei 20 (Tópicos Específicos)'),
    ('JK21','浄霊の急所 21（各論）','Pontos Vitais do Johrei 21 (Tópicos Específicos)'),
    ('JK22','浄霊の急所 22（各論）','Pontos Vitais do Johrei 22 (Tópicos Específicos)'),
    ('JK23','浄霊の急所 23（各論）','Pontos Vitais do Johrei 23 (Tópicos Específicos)'),
    ('JK24','浄霊の急所 24（各論）','Pontos Vitais do Johrei 24 (Tópicos Específicos)'),
    ('JK25','浄霊の急所 25（各論）','Pontos Vitais do Johrei 25 (Detalhes)'),
    ('JK26','浄霊の急所 26（各論）','Pontos Vitais do Johrei 26 (Detalhes)'),
    ('JKzyunzyo','浄霊の急所の順序','Ordem dos Pontos Vitais do Johrei'),
    ('zinzou','腎臓医術','Arte da Cura dos Rins'),
    ('sinzou','心臓医術','Arte da Cura do Coração'),
    ('zunou','頭脳の重要性','A Importância do Cérebro'),
    ('enzui','延髄の重要性','A Importância do Bulbo Raquidiano'),
    ('kubi','首の重要性','A Importância do Pescoço'),
    ('kata1','肩の重要性 1','A Importância dos Ombros 1'),
    ('kata2','肩の重要性 2','A Importância dos Ombros 2'),
    ('kosi','腰の重要性','A Importância da Lombar'),
    ('heikin','平均浄化','Purificação Equilibrada'),
    ('JdokusoIDOU','浄霊と毒素の移動','Johrei e a Movimentação das Toxinas'),
]

BOLD_RE   = re.compile(r'<(?:b|strong)(?:\s[^>]*)?>(?:<font[^>]*)?>?([\s\S]+?)<\/(?:b|strong)>', re.IGNORECASE)
QUOTED_RE = re.compile(r'["“”「]([\s\S]{5,150}?)["“”」]')

def strip_html(html):
    if not html: return ''
    s = re.sub(r'<script[^>]*>.*?</script>', '', str(html), flags=re.DOTALL|re.IGNORECASE)
    s = re.sub(r'<style[^>]*>.*?</style>', '', s, flags=re.DOTALL|re.IGNORECASE)
    s = re.sub(r'<br\s*/?>', '\n', s, flags=re.IGNORECASE)
    s = re.sub(r'<hr[^>]*>', '\n---\n', s, flags=re.IGNORECASE)
    s = re.sub(r'<[^>]+>', '', s)
    for ent, ch in [('&nbsp;',' '),('&amp;','&'),('&lt;','<'),('&gt;','>'),('&quot;','"')]:
        s = s.replace(ent, ch)
    return re.sub(r'\n{3,}', '\n\n', s).strip()

def extract_title_pt(content_raw, fallback):
    # 1. bold text in first 400 chars
    snip = (content_raw or '')[:400]
    m = BOLD_RE.search(snip)
    if m:
        t = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        if 3 < len(t) < 200:
            return t
    # 2. quoted text
    m = QUOTED_RE.search(snip)
    if m:
        t = m.group(1).strip()
        if 3 < len(t) < 200:
            return t
    return fallback

def extract_title_jp(content_raw, fallback):
    snip = (content_raw or '')[:300]
    m = BOLD_RE.search(snip)
    if m:
        t = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        if 2 < len(t) < 100:
            return t
    return fallback

# Build index entries for index.json
index_volumes = []
grand_total = 0

for fname, pub_title_jp, pub_title_pt in FILES:
    path = os.path.join(CACHE, fname + '.html.json')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    articles = []
    seen = set()
    for theme in data.get('themes', []):
        for i, topic in enumerate(theme.get('topics', [])):
            c_jp  = topic.get('content') or ''
            c_pt  = topic.get('content_ptbr') or topic.get('content_pt') or ''

            # Dedup by content fingerprint
            key = (c_pt or c_jp).strip()
            if key in seen:
                continue
            seen.add(key)

            clean_pt = strip_html(c_pt)
            clean_jp = strip_html(c_jp)
            if not clean_pt and not clean_jp:
                continue

            t_pt = extract_title_pt(c_pt, pub_title_pt)
            t_jp = extract_title_jp(c_jp, pub_title_jp)

            articles.append({
                'id': fname + '_' + str(len(articles)),
                'title_jp': t_jp,
                'title_pt': t_pt,
                'content_jp': clean_jp,
                'content_pt': clean_pt,
                'Master_Title': pub_title_pt,
                'master_title': pub_title_pt,
                'tags': [],
                'categories': ['estudo_aprofundado'],
                'related_items': []
            })

    out_file = 'estudo_aprofundado_' + fname + '_bilingual.json'
    out_path = os.path.join(OUT_DIR, out_file)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(articles, f, ensure_ascii=False, indent=2)

    grand_total += len(articles)
    index_volumes.append({
        'volume': fname,
        'file': out_file,
        'count': len(articles),
        'title_pt': pub_title_pt,
        'title_jp': pub_title_jp,
        'tab': 'estudo_aprofundado'
    })
    print(fname + ': ' + str(len(articles)) + ' artigos -> ' + out_file)

print('\nTotal: ' + str(grand_total) + ' artigos em ' + str(len(FILES)) + ' arquivos')

# Update index.json
idx_path = os.path.join(OUT_DIR, 'index.json')
with open(idx_path, encoding='utf-8') as f:
    idx = json.load(f)

# Replace estudo_aprofundado category
for cat in idx['categories']:
    if cat['id'] == 'estudo_aprofundado':
        cat['volumes'] = index_volumes
        cat['total_count'] = grand_total
        break

# Update total_items
idx['total_items'] = sum(c['total_count'] for c in idx['categories'])

with open(idx_path, 'w', encoding='utf-8') as f:
    json.dump(idx, f, ensure_ascii=False, indent=2)

print('index.json atualizado — total_items=' + str(idx['total_items']))
