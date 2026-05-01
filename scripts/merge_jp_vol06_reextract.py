#!/usr/bin/env python3
"""
merge_jp_vol06_reextract.py — Estratégia C para vol 06.

O JP atual no JSON agrupa toda a entry em 1 parágrafo (blob).
O MD fonte tem quebras de parágrafo reais entre: pergunta, falas, resposta.
Este script re-extrai o JP do MD com as quebras corretas e faz merge no JSON.

Fluxo:
1. Parse do MD 浄霊法講座6.md → dict {entry_slug: content_jp_with_breaks}
2. Match por entry ID (johreivol06_01..36) usando título/número
3. Substituir content_jp no JSON preservando content_pt intacto
4. Verificar bijeção PT↔JP após o merge
5. Backup + save

Uso: python scripts/merge_jp_vol06_reextract.py [--dry-run]
"""
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

MD_PATH = 'Markdown/MD_Original/浄霊法講座6.md'
JSON_PATH = 'data/johrei_vol06_bilingual.json'

# ─────────────────────────────────────────────
# 1. Parse do MD: extrai cada seção como bloco JP
# ─────────────────────────────────────────────
def parse_md_sections(md_path: str) -> list[dict]:
    """
    Retorna lista de:
      { 'num': int, 'heading': str, 'content': str, 'para_count': int }
    Seção 0 = prefácio (texto antes do primeiro ## heading).
    Seções 1..N = cada ## N.
    """
    with open(md_path, encoding='utf-8') as f:
        text = f.read()
    text = text.replace('\r\n', '\n')

    entry_pattern = re.compile(r'^## (\d+)、(.+?)$', re.MULTILINE)
    entry_matches = list(entry_pattern.finditer(text))

    sections = []

    # Seção 0: prefácio (antes do primeiro ##)
    if entry_matches:
        preface_raw = text[:entry_matches[0].start()].strip()
        # Remove heading principal #
        preface_raw = re.sub(r'^#[^#].+$', '', preface_raw, flags=re.MULTILINE).strip()
        paras = _split_to_paras(preface_raw)
        sections.append({
            'num': 0,
            'heading': '（前書き）',
            'content': '\n\n'.join(paras),
            'para_count': len(paras),
        })

    for i, m in enumerate(entry_matches):
        num = int(m.group(1))
        heading = m.group(2).strip()
        start = m.end()
        end = entry_matches[i + 1].start() if i + 1 < len(entry_matches) else len(text)
        raw = text[start:end].strip()
        # Remover headings de seção principal no meio do conteúdo
        raw = re.sub(r'^#\s+\**[一二三四五六七八九十].+?\**\s*$', '', raw, flags=re.MULTILINE)
        paras = _split_to_paras(raw)
        sections.append({
            'num': num,
            'heading': heading,
            'content': '\n\n'.join(paras),
            'para_count': len(paras),
        })

    return sections


def _split_to_paras(text: str) -> list[str]:
    """Divide texto em parágrafos por linhas em branco."""
    lines = text.split('\n')
    paras = []
    current = []
    for line in lines:
        if line.strip() == '':
            if current:
                paras.append('\n'.join(current).strip())
                current = []
        else:
            current.append(line)
    if current:
        paras.append('\n'.join(current).strip())
    return [p for p in paras if p.strip()]


# ─────────────────────────────────────────────
# 2. Match sections → JSON entries
# ─────────────────────────────────────────────
def match_sections_to_entries(sections: list[dict], data: list[dict]) -> dict:
    """
    Retorna {entry_id: content_jp_novo} para as entries que conseguimos mapear.
    Estratégia: vol06 tem IDs johreivol06_01..36, numeração sequencial por seção.
    Seções do MD são numeradas 1..N dentro de cada capítulo.
    
    Vamos mapear pelo número sequencial global das ## entries.
    """
    # Construir mapa de IDs ordenados do JSON (só entries com content)
    ordered_ids = [e['id'] for e in data if e.get('content_jp') or e.get('content_pt')]
    
    mapping = {}
    for i, section in enumerate(sections):
        if i < len(ordered_ids):
            eid = ordered_ids[i]
            mapping[eid] = {
                'content_jp': section['content'],
                'para_count': section['para_count'],
                'heading': section['heading'],
                'section_num': section['num'],
            }
    
    return mapping


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    print('\n' + '─' * 60)
    print(f'Merge JP vol06 — re-extração do MD  |  {"DRY RUN" if args.dry_run else "APPLY"}')
    print('─' * 60 + '\n')

    # Parse MD
    sections = parse_md_sections(MD_PATH)
    print(f'MD parseado: {len(sections)} seções ## encontradas')
    for s in sections[:5]:
        print(f'  [{s["num"]}] {s["heading"][:50]} — {s["para_count"]} parágrafos JP')
    print(f'  ...')
    print()

    # Load JSON
    with open(JSON_PATH, encoding='utf-8') as f:
        data = json.load(f)

    entries_with_content = [e for e in data if e.get('content_jp') or e.get('content_pt')]
    print(f'JSON: {len(data)} entries total, {len(entries_with_content)} com conteúdo')
    print()

    # Match
    mapping = match_sections_to_entries(sections, data)
    print(f'Mapeadas: {len(mapping)} entries')
    print()

    # Mostrar comparativo: PT paras vs JP paras antes e depois
    print(f'{"ID":<25} {"PT":>4} {"JP_antes":>8} {"JP_depois":>9} {"Match?":>7}')
    print('─' * 60)
    
    good = 0
    bad = 0
    
    for entry in data:
        eid = entry.get('id', '')
        if eid not in mapping:
            continue
        
        pt_n = len([p for p in (entry.get('content_pt') or '').split('\n\n') if p.strip()])
        jp_old_n = len([p for p in (entry.get('content_jp') or '').split('\n\n') if p.strip()])
        jp_new_n = mapping[eid]['para_count']
        match = '✅' if pt_n == jp_new_n else '⚠️ '
        if pt_n == jp_new_n:
            good += 1
        else:
            bad += 1
        
        print(f'{eid:<25} {pt_n:>4} {jp_old_n:>8} {jp_new_n:>9} {match:>7}')
    
    print()
    print(f'Alinhadas após re-extração: {good}')
    print(f'Ainda desalinhadas:         {bad}')
    print()

    if args.dry_run:
        print('(DRY RUN — nenhum arquivo modificado)')
        return

    # Aplicar
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    bak = JSON_PATH + f'.bak.reextract_jp.{ts}'
    shutil.copy2(JSON_PATH, bak)
    print(f'Backup: {Path(bak).name}')

    for entry in data:
        eid = entry.get('id', '')
        if eid in mapping:
            entry['content_jp'] = mapping[eid]['content_jp']

    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print('✅ Salvo: data/johrei_vol06_bilingual.json')


if __name__ == '__main__':
    main()
