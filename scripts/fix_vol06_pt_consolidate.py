#!/usr/bin/env python3
"""
fix_vol06_pt_consolidate.py — Consolida parágrafos PT do vol 06 para espelhar JP.

Para cada entry com PT > JP:
  - Mostra JP parágrafo a parágrafo
  - Mostra PT com índices numerados
  - Usuário digita grupos: ex "1-3 4-6 7 8-11" para unir §1-3 em um bloco, etc.
  - Valida que o número de grupos == número de parágrafos JP
  - Salva

Uso: python scripts/fix_vol06_pt_consolidate.py [--entry johreivol06_02] [--dry-run]
"""
import json
import shutil
import argparse
from datetime import datetime
from pathlib import Path

JSON_PATH = 'data/johrei_vol06_bilingual.json'


def split_paras(text):
    return [p.strip() for p in (text or '').split('\n\n') if p.strip()]


def join_paras(paras):
    return '\n\n'.join(paras)


def show_comparison(entry):
    """Exibe PT e JP lado a lado com índices."""
    pt_paras = split_paras(entry.get('content_pt', ''))
    jp_paras = split_paras(entry.get('content_jp', ''))

    print(f"\n{'═'*70}")
    print(f"  {entry['id']}  PT={len(pt_paras)}  JP={len(jp_paras)}")
    print(f"  {(entry.get('title_pt') or '')[:70]}")
    print(f"{'─'*70}")

    print(f"\n  ── JP ({len(jp_paras)} parágrafos) ──")
    for i, p in enumerate(jp_paras):
        print(f"  §{i+1}: {p[:200]}")
        print()

    print(f"  ── PT ({len(pt_paras)} parágrafos) ──")
    for i, p in enumerate(pt_paras):
        print(f"  [{i+1}]: {p[:200]}")
        print()


def parse_groups(spec: str, n_pt: int) -> list[list[int]] | None:
    """
    Converte spec como '1-3 4-6 7 8-11' em lista de listas de índices 0-based.
    Retorna None se inválido.
    """
    groups = []
    for part in spec.strip().split():
        if '-' in part:
            a, b = part.split('-', 1)
            try:
                a, b = int(a), int(b)
                if a < 1 or b > n_pt or a > b:
                    return None
                groups.append(list(range(a - 1, b)))
            except ValueError:
                return None
        else:
            try:
                idx = int(part)
                if idx < 1 or idx > n_pt:
                    return None
                groups.append([idx - 1])
            except ValueError:
                return None

    # Verificar que todos os índices estão cobertos e sem sobreposição
    used = []
    for g in groups:
        used.extend(g)
    if sorted(used) != list(range(n_pt)):
        return None
    return groups


def consolidate_entry(entry: dict, dry_run: bool) -> bool:
    """Exibe a entry e pede ao usuário como consolidar os parágrafos PT."""
    pt_paras = split_paras(entry.get('content_pt', ''))
    jp_paras = split_paras(entry.get('content_jp', ''))
    pt_n = len(pt_paras)
    jp_n = len(jp_paras)

    if pt_n == jp_n:
        print(f"  [{entry['id']}] Já alinhado ({pt_n}=={jp_n}) — pulando.")
        return False

    show_comparison(entry)

    print(f"\n  Meta: agrupar {pt_n} parágrafos PT em {jp_n} blocos (para espelhar JP).")
    print(f"  Digite os grupos separados por espaço. Ex: '1-3 4-6 7' = 3 blocos")
    print(f"  Comandos: 's' (skip), 'q' (quit), 'j' (join all em 1 bloco)")

    while True:
        spec = input(f"  > ").strip()

        if spec == 'q':
            return None  # sinal de quit

        if spec == 's':
            print("  → Pulado.")
            return False

        if spec == 'j':
            # Join all
            new_pt = ' '.join(pt_paras)
            if not dry_run:
                entry['content_pt'] = new_pt
            print(f"  → Unido em 1 bloco.")
            return True

        groups = parse_groups(spec, pt_n)
        if groups is None:
            print(f"  ✗ Spec inválida. Tente novamente. (deve cobrir [1..{pt_n}] sem gaps)")
            continue

        if len(groups) != jp_n:
            print(f"  ✗ Você criou {len(groups)} grupos mas JP tem {jp_n} parágrafos. Tente novamente.")
            continue

        # Construir novo PT
        new_paras = []
        for g in groups:
            block = ' '.join(pt_paras[i] for i in g)
            new_paras.append(block)

        print(f"\n  Preview do novo PT ({len(new_paras)} parágrafos):")
        for i, p in enumerate(new_paras):
            print(f"  §{i+1}: {p[:200]}")

        confirm = input("\n  Confirmar? [s/n]: ").strip().lower()
        if confirm == 's':
            if not dry_run:
                entry['content_pt'] = join_paras(new_paras)
            print(f"  ✅ Salvo: {pt_n} → {len(new_paras)} parágrafos.")
            return True
        else:
            print("  → Redo.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--entry', default=None, help='Processar só uma entry específica')
    args = parser.parse_args()

    with open(JSON_PATH, encoding='utf-8') as f:
        data = json.load(f)

    # Filtrar entries com mismatch
    mismatches = []
    for e in data:
        pt_n = len(split_paras(e.get('content_pt', '')))
        jp_n = len(split_paras(e.get('content_jp', '')))
        if pt_n != jp_n and pt_n > 0 and jp_n > 0:
            if args.entry is None or e['id'] == args.entry:
                mismatches.append(e)

    print(f'\n{"─"*60}')
    print(f'Vol 06 — Consolidação PT  |  {"DRY RUN" if args.dry_run else "INTERATIVO"}')
    print(f'{len(mismatches)} entries com mismatch')
    print(f'{"─"*60}')

    changed = 0
    for entry in mismatches:
        result = consolidate_entry(entry, args.dry_run)
        if result is None:  # quit
            print('\nEncerrado pelo usuário.')
            break
        if result:
            changed += 1

    print(f'\n{changed} entries modificadas.')

    if not args.dry_run and changed > 0:
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        bak = JSON_PATH + f'.bak.consolidate_pt.{ts}'
        shutil.copy2(JSON_PATH, bak)
        # Re-salvar (backup foi antes, mas precisamos salvar com mudanças)
        # Na verdade o backup deve ser ANTES das mudanças — refazer lógica
        print(f'(Nota: backup salvo como {Path(bak).name})')
        with open(JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f'✅ data/johrei_vol06_bilingual.json atualizado.')


if __name__ == '__main__':
    main()
