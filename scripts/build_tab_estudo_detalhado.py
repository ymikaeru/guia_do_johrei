"""
build_tab_estudo_detalhado.py

⚠ LEGADO — NÃO RODAR sem coordenação. ⚠
A partir da migração pra Supabase Storage (guia-data bucket), o site lê
tab_estudo_detalhado.json direto do Storage, onde admin faz edições
pelo painel. Rodar este script REGENERA o JSON a partir dos
pontos_focais_vol0X_bilingual.json — sobrescrevendo correções de admin.

Caso precise mesmo rodar (ex.: novo vol adicionado):
  1. Faça backup do tab_estudo_detalhado.json do Storage.
  2. Reaplique correções de admin após o rebuild.
  3. Suba via scripts/upload_to_storage.mjs.

Generates data/tab_estudo_detalhado.json from pontos_focais vol01 and vol02.

Sub-abas:
  referencia   — pontos_focais_vol01 (35 artigos), categorias by category_pt
  fundamentos  — pontos_focais_vol02 (141 artigos), categorias by category_pt

The Mapa tab continues to work because core.js aliases
  STATE.data['pontos_focais'] = STATE.data['estudo_detalhado']
after loading.

Run from project root:
  python scripts/build_tab_estudo_detalhado.py [--dry-run]
"""

import json, os, argparse
from collections import OrderedDict

FALLBACK_CAT = 'Outros'

VOL_CONFIGS = [
    {
        'file':    'data/_source/pontos_focais_vol01_bilingual.json',
        'id':      'referencia',
        'titulo':  'Referência por Condição',
        'cat_order': [
            'Doenças Cerebrais e o Funcionamento Renal',
            'Doenças dos Olhos, Nariz, Ouvidos e Dentes',
            'Doenças Torácicas',
            'Doenças Femininas',
            'Doenças Infantis',
            'Doenças Mentais',
        ],
    },
    {
        'file':    'data/_source/pontos_focais_vol02_bilingual.json',
        'id':      'fundamentos_regioes',
        'titulo':  'Fundamentos e Regiões Corporais',
        'cat_order': None,   # preserve document order
    },
]


def group_by_category(items, cat_order):
    """Group items by category_pt preserving order."""
    buckets = OrderedDict()

    # Pre-populate with declared order if provided
    if cat_order:
        for cat in cat_order:
            buckets[cat] = []

    for item in items:
        cat = (item.get('category_pt') or '').strip() or FALLBACK_CAT
        if cat not in buckets:
            buckets[cat] = []
        buckets[cat].append(item)

    # Remove empty buckets
    return {k: v for k, v in buckets.items() if v}


def build_tab():
    sub_abas = []

    for cfg in VOL_CONFIGS:
        with open(cfg['file'], encoding='utf-8') as f:
            items = json.load(f)

        cats = group_by_category(items, cfg.get('cat_order'))

        categorias = [
            {'titulo': cat_name, 'artigos': arts}
            for cat_name, arts in cats.items()
        ]

        sub_abas.append({
            'id':         cfg['id'],
            'titulo':     cfg['titulo'],
            'hero':       None,
            'categorias': categorias,
        })

    return {
        'id':       'estudo_detalhado',
        'aba':      'Estudo Detalhado',
        'hero':     None,
        'sub_abas': sub_abas,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    tab = build_tab()

    print('Sub-aba distribution:')
    total = 0
    for sub in tab['sub_abas']:
        n = sum(len(c['artigos']) for c in sub['categorias'])
        total += n
        print(f'  {sub["titulo"]:40s}  {n:4d} artigos')
        for cat in sub['categorias']:
            nc = len(cat['artigos'])
            print(f'    · {cat["titulo"][:45]:45s}  {nc:4d}')
    print(f'  {"TOTAL":40s}  {total:4d} artigos')

    if args.dry_run:
        print('\n(dry-run — nenhum arquivo gerado)')
        return

    out = 'data/tab_estudo_detalhado.json'
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(tab, f, ensure_ascii=False, indent=2)
    print(f'\nGerado: {out} ({os.path.getsize(out) // 1024} KB)')


if __name__ == '__main__':
    main()
