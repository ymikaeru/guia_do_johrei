"""
build_tab_estudo_aprofundado.py
Generates data/tab_estudo_aprofundado.json with sub_abas from the
individual estudo_aprofundado_*.json bilingual files.

Sub-aba structure:
  teoria          — JK1, JK2 (Pontos Vitais — Teoria)
  ombros          — kata1, kata2
  cabeca_cerebro  — zunou, enzui
  pescoco         — kubi
  rins            — zinzou
  coracao         — sinzou
  coluna_lombar   — kosi
  tecnicas        — heikin, JdokusoIDOU, JKzyunzyo
  casos_clinicos  — JK3-JK26 articles matching clinical case pattern
  gerais          — JK3-JK26 articles not matching pattern

Run from project root:
  python scripts/build_tab_estudo_aprofundado.py [--dry-run]
"""

import json, glob, os, re, argparse

# ── Sub-aba definitions ────────────────────────────────────────────────────
# Files assigned to fixed sub-abas (full file key → sub-aba id)
FILE_TO_SUBABA = {
    # Fundamentos: teoria + técnicas especiais juntos
    'JK1':         'fundamentos',
    'JK2':         'fundamentos',
    'heikin':      'fundamentos',
    'JdokusoIDOU': 'fundamentos',
    'JKzyunzyo':   'fundamentos',
    # Regiões corporais
    'kata1':       'ombros',
    'kata2':       'ombros',
    'zunou':       'cabeca_cerebro',
    'enzui':       'cabeca_cerebro',
    'kubi':        'pescoco',
    'zinzou':      'rins',
    'sinzou':      'coracao',
    'kosi':        'coluna_lombar',
}

SUBABA_META = [
    {'id': 'fundamentos',      'titulo': 'Pontos Vitais — Fundamentos'},
    {'id': 'ombros',           'titulo': 'Ombros'},
    {'id': 'cabeca_cerebro',   'titulo': 'Cabeça e Cérebro'},
    {'id': 'pescoco',          'titulo': 'Pescoço'},
    {'id': 'rins',             'titulo': 'Rins'},
    {'id': 'coracao',          'titulo': 'Coração'},
    {'id': 'coluna_lombar',    'titulo': 'Coluna / Lombar'},
    {'id': 'por_purificacoes', 'titulo': 'Pontos Vitais por Purificações Específicas'},
]

# Pattern that identifies a clinical case article title
CASO_PATTERN = re.compile(
    r'^ponto\s+vital\s+do\s+johrei\s+(?:para|de|em|no|na|dos|das|do|da)\b',
    re.IGNORECASE
)


def file_key(path):
    base = os.path.basename(path)
    m = re.match(r'estudo_aprofundado_(.+)_bilingual\.json$', base)
    return m.group(1) if m else None


def classify_jk_article(title_pt):
    """All JK3-26 articles go to por_purificacoes (single merged bucket)."""
    return 'por_purificacoes'


def load_all_articles():
    buckets = {meta['id']: [] for meta in SUBABA_META}

    paths = sorted(glob.glob('data/estudo_aprofundado_*.json'))
    for path in paths:
        key = file_key(path)
        if not key:
            continue

        with open(path, encoding='utf-8') as f:
            items = json.load(f)

        if key in FILE_TO_SUBABA:
            subaba_id = FILE_TO_SUBABA[key]
            for item in items:
                buckets[subaba_id].append(item)
        else:
            # JK3-JK26: classify by title pattern
            for item in items:
                title = item.get('title_pt') or item.get('title', '')
                subaba_id = classify_jk_article(title)
                buckets[subaba_id].append(item)

    return buckets


def build_tab(buckets):
    sub_abas = []
    for meta in SUBABA_META:
        sid = meta['id']
        articles = buckets[sid]
        sub_abas.append({
            'id':    sid,
            'titulo': meta['titulo'],
            'hero':  None,
            'categorias': [
                {'titulo': None, 'artigos': articles}
            ]
        })

    return {
        'id':       'estudo_aprofundado',
        'aba':      'Estudo Aprofundado',
        'hero':     None,
        'sub_abas': sub_abas,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    buckets = load_all_articles()

    print('Sub-aba distribution:')
    total = 0
    for meta in SUBABA_META:
        n = len(buckets[meta['id']])
        total += n
        print(f'  {meta["titulo"]:30s}  {n:4d} artigos')
    print(f'  {"TOTAL":30s}  {total:4d} artigos')

    if args.dry_run:
        print('\n(dry-run — nenhum arquivo gerado)')
        return

    tab = build_tab(buckets)
    out = 'data/tab_estudo_aprofundado.json'
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(tab, f, ensure_ascii=False, indent=2)

    size_kb = os.path.getsize(out) // 1024
    print(f'\nGerado: {out} ({size_kb} KB)')


if __name__ == '__main__':
    main()
