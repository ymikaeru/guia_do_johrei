#!/usr/bin/env python3
"""
build_admin_index.py — gera data/admin_index.json com índice leve dos artigos.

Usado pelo admin no caminho_da_felicidade pra popular o autocomplete de
seleção do destaque "Essência". Inclui só id, título, aba final (após
tab_overrides) e fonte amigável.

Roda manualmente quando conteúdo do site muda. Saída ~150KB.
"""
import json
from pathlib import Path

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[2]
DATA = ROOT / 'data'

# Mesma lógica de fallback do core.js#loadData
SOURCE_TAB_TO_FALLBACK = {
    'fundamentos':   'fundamentos',
    'cases_qa':      'por_condicao',
    'pontos_focais': 'por_regiao',
}

def load_index():
    with open(DATA / 'index.json', encoding='utf-8') as f:
        return json.load(f)

def load_overrides():
    path = DATA / 'tab_overrides.json'
    if not path.exists():
        return {}
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    return d.get('overrides', {})

def vol_label(vol_key: str) -> str:
    """johrei_vol01 -> Johrei Hô Kohza Vol.01"""
    if vol_key.startswith('johrei_vol'):
        n = vol_key.replace('johrei_vol', '').lstrip('0') or '0'
        return f'Johrei Hô Kohza Vol.{int(n):02d}'
    if vol_key.startswith('pontos_focais_vol'):
        n = vol_key.replace('pontos_focais_vol', '').lstrip('0') or '0'
        return f'Pontos Focais Vol.{int(n):02d}'
    if vol_key.startswith('estudo_aprofundado'):
        return 'Estudo Aprofundado'
    return vol_key

def main():
    idx = load_index()
    overrides = load_overrides()
    out = []

    # idx['categories'] tem itens com {tab, volumes:[{file:...}]}
    # Estudo Aprofundado fica intacto; demais tabs passam por overrides.
    for category in idx.get('categories', []):
        src_tab = category.get('tab')
        for vol in category.get('volumes', []):
            file_name = vol['file']
            source_key = file_name.replace('_bilingual.json', '').replace('_site.json', '')
            file_path = DATA / file_name
            if not file_path.exists():
                continue
            with open(file_path, encoding='utf-8') as f:
                items = json.load(f)
            if not isinstance(items, list):
                continue
            for orig_idx, art in enumerate(items):
                article_id = art.get('id')
                title = art.get('title_pt') or art.get('title') or ''
                if not article_id or not title.strip():
                    continue
                # Resolver aba final
                if src_tab == 'estudo_aprofundado':
                    final_tab = 'estudo_aprofundado'
                else:
                    override_key = f'{source_key}:{orig_idx}'
                    final_tab = overrides.get(override_key) or SOURCE_TAB_TO_FALLBACK.get(src_tab, src_tab)
                out.append({
                    'id': article_id,
                    'title': title.strip(),
                    'tab': final_tab,
                    'source': vol_label(source_key),
                })

    out_path = DATA / 'admin_index.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    size_kb = out_path.stat().st_size / 1024
    print(f'  {len(out)} artigos -> {out_path}  ({size_kb:.1f} KB)')

if __name__ == '__main__':
    main()
