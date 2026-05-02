"""
tag_estudo_aprofundado.py
Assigns parte:* tags to estudo_aprofundado articles using:
  1. File-name-based tags for specialty files (100% accurate)
  2. Keyword matching on title_pt for JK volumes (~70-80% coverage)

Tags use the existing vocabulary from pontos_focais (underscores, accents).
Run from project root: python scripts/tag_estudo_aprofundado.py [--dry-run]
"""

import json, glob, os, re, shutil, argparse
from datetime import datetime

# ── File-level tags (specialty files have one clear theme) ────────────────
FILE_TAGS = {
    'kata1':        ['parte:ombros'],
    'kata2':        ['parte:ombros'],
    'kubi':         ['parte:pescoço'],
    'kosi':         ['parte:lombar', 'parte:costas'],
    'zunou':        ['parte:cabeça'],
    'enzui':        ['parte:bulbo_raquidiano'],
    'sinzou':       ['parte:coração'],
    'zinzou':       ['parte:rins'],
    'heikin':       ['técnica:nivelamento'],
    'JdokusoIDOU':  ['técnica:movimento_de_toxinas'],
    'JKzyunzyo':    ['técnica:ordem_do_johrei'],
    # JK1 e JK2 são sobre teoria dos Pontos Vitais (Kyūsho) — metodologia geral
    'JK1':          ['técnica:ponto_vital'],
    'JK2':          ['técnica:ponto_vital'],
}

# ── Keyword → tag(s) mapping (applied to title_pt) ───────────────────────
# Order matters: more specific patterns first
KEYWORD_TAGS = [
    # Cabeça / cérebro
    (r'\bcerebr\w*\b',              ['parte:cabeça']),
    (r'\bcérebro\b',                ['parte:cabeça']),
    (r'\bcabeça\b',                 ['parte:cabeça']),
    (r'\bcranio\b|\bcrânio\b',      ['parte:cabeça']),
    (r'\bfronte\b|\bfrontal\b',     ['parte:cabeça']),
    (r'\boccipital\b',              ['parte:região_occipital', 'parte:cabeça']),
    (r'\bbulbo\b',                  ['parte:bulbo_raquidiano']),
    (r'\bcerebelo\b',               ['parte:cabeça']),
    (r'\bmedul\w*\b',               ['parte:bulbo_raquidiano']),

    # Pescoço / nuca
    (r'\bpescoço\b',                ['parte:pescoço']),
    (r'\bnuca\b|\bnucal\b',         ['parte:pescoço']),
    (r'\bcervical\b',               ['parte:pescoço']),

    # Ombros
    (r'\bombro\w*\b',               ['parte:ombros']),

    # Coluna / lombar / costas
    (r'\blombar\b|\blombare\b',     ['parte:lombar']),
    (r'\bcoluna\b',                 ['parte:lombar', 'parte:costas']),
    (r'\bcostas\b',                 ['parte:costas']),
    (r'\bcóccix\b|\bcoccix\b',      ['parte:lombar']),
    (r'\bvértebr\w*\b',             ['parte:lombar']),

    # Rins
    (r'\brin\w*\b',                 ['parte:rins']),
    (r'\brenal\b|\brenais\b',       ['parte:rins']),

    # Coração
    (r'\bcorações\b|\bcoração\b',   ['parte:coração']),
    (r'\bcardía\w*\b|\bcardio\w*\b', ['parte:coração']),

    # Pulmões
    (r'\bpulmão\b|\bpulmões\b',     ['parte:pulmões']),
    (r'\bpulmonar\b',               ['parte:pulmões']),
    (r'\btuberculos\w*\b',          ['parte:pulmões']),

    # Estômago / digestão
    (r'\bestômago\b',               ['parte:estômago']),
    (r'\bgástri\w*\b',              ['parte:estômago']),
    (r'\bintestin\w*\b',            ['parte:intestinos']),
    (r'\bdiarr\w*\b',               ['parte:intestinos']),
    (r'\bfígado\b',                 ['parte:fígado']),
    (r'\bbílis\b|\bbiliar\b',       ['parte:fígado']),
    (r'\bbaço\b',                   ['parte:sistema_digestivo']),
    (r'\bpâncrea\w*\b',             ['parte:sistema_digestivo']),
    (r'\bapêndic\w*\b',             ['parte:intestinos']),

    # Olhos
    (r'\bolho\w*\b|\bocular\b',     ['parte:olhos']),
    (r'\bvisão\b|\bvisual\b',       ['parte:olhos']),
    (r'\bmiopl\w*\b|\bmiopia\b',    ['parte:olhos']),
    (r'\bglauco\w*\b|\bcatarat\w*\b', ['parte:olhos']),
    (r'\bconjuntiv\w*\b',           ['parte:olhos']),

    # Nariz / seios da face
    (r'\bnariz\b|\bnasal\b',        ['parte:nariz']),
    (r'\bsinusite\b|\bsinusal\b',   ['parte:nariz']),
    (r'\brinite\b',                 ['parte:nariz']),

    # Ouvidos
    (r'\bouvido\w*\b|\bauditiv\w*\b', ['parte:ouvidos']),
    (r'\botite\b|\bzumbido\b',      ['parte:ouvidos']),
    (r'\bsurdez\b',                 ['parte:ouvidos']),

    # Garganta / amígdalas
    (r'\bgarganta\b',               ['parte:garganta']),
    (r'\bamígdal\w*\b',             ['parte:amígdalas']),
    (r'\bfaringe\b|\bfaríngeo\b',   ['parte:garganta']),

    # Dentes
    (r'\bdente\w*\b|\bdentár\w*\b', ['parte:dentes']),

    # Pele
    (r'\bpele\b|\bdermat\w*\b',     ['parte:pele']),
    (r'\becze\w*\b|\bsaramp\w*\b',  ['parte:pele']),

    # Glândulas linfáticas
    (r'\blinfátic\w*\b|\blinfonod\w*\b', ['parte:glândulas_linfáticas']),
    (r'\bparótid\w*\b',             ['parte:parótida', 'parte:glândulas_linfáticas']),

    # Membros
    (r'\bperna\w*\b|\bpés\b|\bpé\b', ['parte:pernas', 'parte:pés']),
    (r'\bjoelho\w*\b',              ['parte:pernas']),
    (r'\bbraço\w*\b',               ['parte:mãos']),
    (r'\bmão\b|\bmãos\b|\bpalma\b', ['parte:mãos']),

    # Sistema nervoso
    (r'\bneurast\w*\b|\bneurol\w*\b', ['parte:sistema_nervoso']),
    (r'\bparalisi\w*\b|\bparalisia\b', ['parte:sistema_nervoso']),
    (r'\bepileps\w*\b',             ['parte:sistema_nervoso']),
    (r'\breumatism\w*\b|\bartrit\w*\b', ['parte:sistema_nervoso']),

    # Abdômen / ventre / baixo ventre
    (r'\babdôm\w*\b|\babdom\w*\b',  ['parte:sistema_digestivo']),
    (r'\bventre\b',                 ['parte:sistema_digestivo']),
    (r'\bnódulo\b',                 ['parte:sistema_digestivo']),

    # Cabeça — condições específicas
    (r'\bhidrocefalia\b',           ['parte:cabeça']),
    (r'\benxaquec\w*\b',            ['parte:cabeça']),
    (r'\bmeningit\w*\b',            ['parte:cabeça']),

    # Pulmões — condições específicas
    (r'\btosse\b',                  ['parte:pulmões']),
    (r'\basma\b|\basmátic\w*\b',    ['parte:pulmões', 'parte:sistema_respiratório']),
    (r'\bbronquit\w*\b',            ['parte:pulmões', 'parte:sistema_respiratório']),
    (r'\bpleurit\w*\b',             ['parte:pulmões']),

    # Pele — condições específicas
    (r'\becze\w*\b|\burticária\b',  ['parte:pele']),
    (r'\bsaramp\w*\b|\bvaricel\w*\b', ['parte:pele']),

    # Olhos — condições específicas
    (r'\bcegueira\b|\bcego\b',      ['parte:olhos']),
    (r'\bmetanol\b',                ['parte:olhos']),

    # Útero / ginecologia
    (r'\bútero\b|\buterina\w*\b',   ['parte:órgãos_internos']),
    (r'\bmenstrua\w*\b|\bginecol\w*\b', ['parte:órgãos_internos']),
    (r'\bgravidez\b|\bgestação\b',  ['parte:órgãos_internos']),

    # Diabetes / metabolismo
    (r'\bdiabetes\b|\bdiabétic\w*\b', ['parte:sistema_digestivo']),
]


def normalize(text):
    """Lowercase + remove accents for keyword matching."""
    import unicodedata
    nfkd = unicodedata.normalize('NFKD', text.lower())
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


def tags_from_title(title_pt):
    """Return list of tags inferred from article title."""
    if not title_pt:
        return []
    norm = normalize(title_pt)
    found = set()
    for pattern, tags in KEYWORD_TAGS:
        norm_pattern = normalize(pattern)
        if re.search(norm_pattern, norm):
            for t in tags:
                found.add(t)
    return sorted(found)


def file_key(path):
    """Extract the specialty key from file path, e.g. 'kata1' from 'estudo_aprofundado_kata1_bilingual.json'."""
    base = os.path.basename(path)
    # estudo_aprofundado_XXXXXX_bilingual.json
    m = re.match(r'estudo_aprofundado_(.+)_bilingual\.json', base)
    return m.group(1) if m else None


def process_file(path, dry_run=False):
    with open(path, encoding='utf-8') as f:
        items = json.load(f)

    key = file_key(path)
    file_level_tags = FILE_TAGS.get(key, [])

    changed = 0
    for item in items:
        existing = set(item.get('tags') or [])
        new_tags = set(file_level_tags)
        new_tags |= set(tags_from_title(item.get('title_pt') or item.get('title', '')))

        # Merge: add new tags, keep any already present
        merged = sorted(existing | new_tags)
        if merged != sorted(existing):
            item['tags'] = merged
            changed += 1

    if not dry_run and changed:
        bak = path + f'.bak.pre_tags.{datetime.now().strftime("%Y%m%d_%H%M%S")}'
        shutil.copy2(path, bak)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(items, f, ensure_ascii=False, indent=2)

    return len(items), changed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    paths = sorted(glob.glob('data/estudo_aprofundado_*.json'))
    total_items = total_changed = 0

    for path in paths:
        n, c = process_file(path, dry_run=args.dry_run)
        total_items += n
        total_changed += c
        pct = round(100 * c / n) if n else 0
        print(f'  {os.path.basename(path):55s} {c:3d}/{n:3d} ({pct}%) tagged')

    print(f'\nTotal: {total_changed}/{total_items} artigos tagueados')
    if args.dry_run:
        print('(dry-run — nenhum arquivo foi modificado)')


if __name__ == '__main__':
    main()
