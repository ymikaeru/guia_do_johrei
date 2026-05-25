"""
build_tab_estudo_aprofundado.py

⚠ LEGADO — NÃO RODAR sem coordenação. ⚠
A partir da migração pra Supabase Storage (guia-data bucket), o site lê
tab_estudo_aprofundado.json direto do Storage, onde admin faz edições
pelo painel. Rodar este script REGENERA o JSON a partir dos
estudo_aprofundado_*_bilingual.json individuais — sobrescrevendo
qualquer correção feita pelo admin nesse meio tempo.

Caso precise mesmo rodar (ex.: novo volume adicionado):
  1. Faça backup do tab_estudo_aprofundado.json do Storage primeiro.
  2. Reaplique as correções de admin manualmente após o rebuild.
  3. Suba o JSON regenerado de volta via scripts/upload_to_storage.mjs.

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

# ── Categories within por_purificacoes ────────────────────────────────────
# Priority order: first matching rule wins (an article goes into exactly one category)
CATEGORY_RULES = [
    ('Cabeça e Sistema Nervoso',   ['parte:cabeça', 'parte:sistema_nervoso', 'parte:bulbo_raquidiano']),
    ('Pulmões e Respiração',        ['parte:pulmões', 'parte:sistema_respiratório']),
    ('Olhos e Visão',               ['parte:olhos']),
    ('Ouvidos',                     ['parte:ouvidos']),
    ('Sistema Digestivo',           ['parte:estômago', 'parte:intestinos', 'parte:sistema_digestivo', 'parte:fígado']),
    ('Coração',                     ['parte:coração', 'parte:sistema_circulatório']),
    ('Membros',                     ['parte:pernas', 'parte:pés', 'parte:mãos']),
    ('Órgãos Internos',             ['parte:órgãos_internos']),
    ('Pescoço, Ombros e Coluna',    ['parte:pescoço', 'parte:ombros', 'parte:lombar', 'parte:costas']),
    ('Outros Tópicos',              []),   # catch-all
]

CATEGORY_NAMES = [r[0] for r in CATEGORY_RULES]


def file_key(path):
    base = os.path.basename(path)
    m = re.match(r'estudo_aprofundado_(.+)_bilingual\.json$', base)
    return m.group(1) if m else None


def assign_category(item):
    """Return category name for a JK3-26 article based on its tags."""
    tags = set(item.get('tags') or [])
    for name, tag_list in CATEGORY_RULES:
        if not tag_list:          # catch-all
            return name
        if tags & set(tag_list):  # any tag matches
            return name
    return 'Outros Tópicos'


def load_all_articles():
    # Regular buckets for specialty sub-abas
    buckets = {meta['id']: [] for meta in SUBABA_META}
    # Category buckets for por_purificacoes
    cat_buckets = {name: [] for name in CATEGORY_NAMES}

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
            # JK3-JK26: assign to a category within por_purificacoes
            for item in items:
                cat = assign_category(item)
                cat_buckets[cat].append(item)

    buckets['por_purificacoes_cats'] = cat_buckets
    return buckets

    return buckets


def build_tab(buckets):
    cat_buckets = buckets.pop('por_purificacoes_cats')
    sub_abas = []

    for meta in SUBABA_META:
        sid = meta['id']

        if sid == 'por_purificacoes':
            # Build multiple categorias, skip empty ones
            categorias = []
            for name in CATEGORY_NAMES:
                arts = cat_buckets[name]
                if arts:
                    categorias.append({'titulo': name, 'artigos': arts})
            if not categorias:
                categorias = [{'titulo': None, 'artigos': []}]
        else:
            categorias = [{'titulo': None, 'artigos': buckets[sid]}]

        sub_abas.append({
            'id':       sid,
            'titulo':   meta['titulo'],
            'hero':     None,
            'categorias': categorias,
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

    cat_buckets = buckets.get('por_purificacoes_cats', {})
    print('Sub-aba distribution:')
    total = 0
    for meta in SUBABA_META:
        sid = meta['id']
        if sid == 'por_purificacoes':
            n = sum(len(v) for v in cat_buckets.values())
            print(f'  {meta["titulo"]:40s}  {n:4d} artigos')
            for name in CATEGORY_NAMES:
                nc = len(cat_buckets.get(name, []))
                if nc:
                    print(f'    · {name:36s}  {nc:4d}')
        else:
            n = len(buckets[sid])
            print(f'  {meta["titulo"]:40s}  {n:4d} artigos')
        total += sum(len(v) for v in cat_buckets.values()) if sid == 'por_purificacoes' else len(buckets[sid])
    print(f'  {"TOTAL":40s}  {total:4d} artigos')

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
