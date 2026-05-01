#!/usr/bin/env python3
"""
retranslate_bijection.py — Re-traduz entradas com bijeção PT↔JP quebrada.

Para cada entry onde PT≠JP (contagem de parágrafos), usa a Gemini API
para traduzir o JP parágrafo a parágrafo, produzindo PT com bijeção exata 1:1.

O Prompt_Traduca_v2.md é usado integralmente como system instruction,
garantindo PT-BR sofisticado, glossário doutrinário e sem PT-PT.

Uso:
    # Variável de ambiente obrigatória:
    set GEMINI_API_KEY=sua_chave_aqui

    python scripts/retranslate_bijection.py --vol 06 --dry-run
    python scripts/retranslate_bijection.py --vol 06
    python scripts/retranslate_bijection.py --vol 06 08 09
    python scripts/retranslate_bijection.py --all
    python scripts/retranslate_bijection.py --entry johreivol06_02

Flags:
    --vol N [N ...]   Volume(s) a processar (ex: 06 08)
    --all             Todos os volumes com mismatch
    --entry ID        Processar só uma entry específica
    --dry-run         Mostra o que seria feito sem chamar a API
    --model NAME      Modelo Gemini (padrão: gemini-2.0-flash)
    --delay S         Segundos entre chamadas (padrão: 1.5)
    --max-retries N   Tentativas em caso de mismatch de parágrafos (padrão: 2)
"""

import json
import os
import re
import sys
import time
import shutil
import argparse
from pathlib import Path
from datetime import datetime

# ──────────────────────────────────────────────
# Configuração
# ──────────────────────────────────────────────
PROMPT_PATH  = 'Prompt_Traduca_v2.md'
DATA_DIR     = Path('data')
CHECKPOINT   = Path('data/_retranslate_checkpoint.json')
DEFAULT_MODEL = 'gemini-2.0-flash'


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────
def split_paras(text: str) -> list[str]:
    return [p.strip() for p in (text or '').split('\n\n') if p.strip()]


def load_system_prompt() -> str:
    with open(PROMPT_PATH, encoding='utf-8') as f:
        return f.read()


def load_checkpoint() -> dict:
    if CHECKPOINT.exists():
        with open(CHECKPOINT, encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_checkpoint(cp: dict):
    with open(CHECKPOINT, 'w', encoding='utf-8') as f:
        json.dump(cp, f, ensure_ascii=False, indent=2)


def find_mismatches(data: list[dict]) -> list[dict]:
    """Retorna entries onde pt_n != jp_n (ambos > 0)."""
    out = []
    for e in data:
        pt_n = len(split_paras(e.get('content_pt', '')))
        jp_n = len(split_paras(e.get('content_jp', '')))
        if pt_n > 0 and jp_n > 0 and pt_n != jp_n:
            out.append(e)
    return out


# ──────────────────────────────────────────────
# Gemini call
# ──────────────────────────────────────────────
def build_user_prompt(entry: dict, jp_paras: list[str]) -> str:
    n = len(jp_paras)
    title = (entry.get('title_pt') or entry.get('title_jp') or entry.get('id', ''))[:80]

    lines = [
        f'Traduza os {n} parágrafo(s) abaixo do japonês para PT-BR.',
        f'Produza EXATAMENTE {n} parágrafo(s) na mesma ordem.',
        f'Separe cada parágrafo traduzido com UMA linha em branco.',
        f'NÃO adicione numeração, prefixos, comentários ou texto extra.',
        f'',
        f'Contexto — entrada: "{title}"',
        f'',
    ]
    for i, p in enumerate(jp_paras, 1):
        lines.append(f'§{i}:')
        lines.append(p)
        lines.append('')

    return '\n'.join(lines)


def call_gemini(client, model_name: str, system_prompt: str,
                user_prompt: str) -> str:
    """Chama a Gemini API e retorna o texto gerado."""
    response = client.models.generate_content(
        model=model_name,
        contents=user_prompt,
        config={
            'system_instruction': system_prompt,
            'temperature': 0.3,
            'max_output_tokens': 8192,
        }
    )
    return response.text.strip()


def parse_response_paras(response_text: str) -> list[str]:
    """Divide a resposta da API em parágrafos (por linha em branco)."""
    return [p.strip() for p in response_text.split('\n\n') if p.strip()]


def translate_entry(client, model_name: str, system_prompt: str,
                    entry: dict, max_retries: int, dry_run: bool) -> dict:
    """
    Traduz uma entry, garantindo bijeção 1:1.
    Retorna dict com resultado.
    """
    jp_paras = split_paras(entry.get('content_jp', ''))
    pt_paras = split_paras(entry.get('content_pt', ''))
    jp_n = len(jp_paras)
    pt_n = len(pt_paras)

    result = {
        'id': entry['id'],
        'jp_n': jp_n,
        'pt_old_n': pt_n,
        'pt_new_n': None,
        'success': False,
        'skipped': False,
        'error': None,
    }

    if dry_run:
        result['skipped'] = True
        result['dry_run_preview'] = f'Traduzir {jp_n} parágrafos JP → PT'
        return result

    user_prompt = build_user_prompt(entry, jp_paras)

    for attempt in range(1, max_retries + 1):
        try:
            raw = call_gemini(client, model_name, system_prompt, user_prompt)
            out_paras = parse_response_paras(raw)

            if len(out_paras) == jp_n:
                result['content_pt_new'] = '\n\n'.join(out_paras)
                result['pt_new_n'] = jp_n
                result['success'] = True
                return result
            else:
                # Mismatch de parágrafos: tentar de novo com prompt reforçado
                if attempt < max_retries:
                    user_prompt = (
                        f'ATENÇÃO: na tentativa anterior você produziu {len(out_paras)} '
                        f'parágrafos, mas o japonês tem {jp_n}. '
                        f'Corrija e produza EXATAMENTE {jp_n} parágrafos.\n\n'
                    ) + user_prompt
                else:
                    result['error'] = (
                        f'Mismatch persistente após {max_retries} tentativas: '
                        f'API retornou {len(out_paras)} parágrafos, esperado {jp_n}'
                    )
                    result['raw_response'] = raw

        except Exception as exc:
            result['error'] = str(exc)
            if attempt == max_retries:
                return result
            time.sleep(3)

    return result


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='Re-traduz entradas com bijeção quebrada.')
    parser.add_argument('--vol', nargs='+', default=None,
                        help='Volume(s) a processar, ex: 06 08 09')
    parser.add_argument('--all', action='store_true',
                        help='Processar todos os volumes')
    parser.add_argument('--entry', default=None,
                        help='Processar só uma entry específica')
    parser.add_argument('--dry-run', action='store_true',
                        help='Mostra o que seria feito sem chamar a API')
    parser.add_argument('--model', default=DEFAULT_MODEL,
                        help=f'Modelo Gemini (padrão: {DEFAULT_MODEL})')
    parser.add_argument('--delay', type=float, default=1.5,
                        help='Segundos entre chamadas API (padrão: 1.5)')
    parser.add_argument('--max-retries', type=int, default=2,
                        help='Tentativas em caso de mismatch (padrão: 2)')
    parser.add_argument('--reset-checkpoint', action='store_true',
                        help='Apaga checkpoint e reprocessa tudo')
    args = parser.parse_args()

    # API key
    api_key = os.environ.get('GEMINI_API_KEY', '').strip()
    if not api_key and not args.dry_run:
        print('❌ GEMINI_API_KEY não definida. Exporte a variável de ambiente.')
        sys.exit(1)

    # Importar google-genai
    try:
        from google import genai
        client = genai.Client(api_key=api_key) if not args.dry_run else None
    except ImportError:
        print('❌ Pacote google-genai não encontrado. Execute: pip install google-genai')
        sys.exit(1)

    # System prompt
    system_prompt = load_system_prompt()
    print(f'✓ System prompt carregado: {len(system_prompt)} chars')

    # Checkpoint
    if args.reset_checkpoint and CHECKPOINT.exists():
        CHECKPOINT.unlink()
        print('✓ Checkpoint resetado.')
    checkpoint = load_checkpoint()

    # Selecionar arquivos
    if args.entry:
        # Encontrar qual arquivo contém esta entry
        files = sorted(f for f in DATA_DIR.glob('johrei_vol*_bilingual.json')
                       if '.bak.' not in f.name)
    elif args.all:
        files = sorted(f for f in DATA_DIR.glob('johrei_vol*_bilingual.json')
                       if '.bak.' not in f.name)
    elif args.vol:
        files = []
        for v in args.vol:
            p = DATA_DIR / f'johrei_vol{v.zfill(2)}_bilingual.json'
            if not p.exists():
                print(f'⚠️  Arquivo não encontrado: {p}')
            else:
                files.append(p)
    else:
        parser.print_help()
        sys.exit(0)

    print(f'\n{"─"*60}')
    print(f'Re-tradução Gemini  |  Modelo: {args.model}  |  {"DRY RUN" if args.dry_run else "LIVE"}')
    print(f'{"─"*60}\n')

    grand_ok = 0
    grand_fail = 0
    grand_skip = 0

    for filepath in files:
        with open(filepath, encoding='utf-8') as f:
            data = json.load(f)

        mismatches = find_mismatches(data)

        # Filtrar por --entry se especificado
        if args.entry:
            mismatches = [e for e in mismatches if e['id'] == args.entry]

        if not mismatches:
            print(f'✓ {filepath.name}  — sem mismatches')
            continue

        print(f'\n▶ {filepath.name}  ({len(mismatches)} mismatches)')

        changed = False
        file_ok = 0
        file_fail = 0

        for entry in mismatches:
            eid = entry['id']

            # Pular se já processado com sucesso
            if eid in checkpoint and checkpoint[eid].get('success'):
                print(f'  ↩ [{eid}] já processado (checkpoint) — pulando')
                grand_skip += 1
                continue

            jp_n = len(split_paras(entry.get('content_jp', '')))
            pt_n = len(split_paras(entry.get('content_pt', '')))
            title = (entry.get('title_pt') or '')[:55]

            print(f'  → [{eid}] JP={jp_n} PT={pt_n}  {title}')

            result = translate_entry(
                client=client,
                model_name=args.model,
                system_prompt=system_prompt,
                entry=entry,
                max_retries=args.max_retries,
                dry_run=args.dry_run,
            )

            checkpoint[eid] = result

            if args.dry_run:
                print(f'     (dry-run) {result.get("dry_run_preview", "")}')
                grand_skip += 1
                continue

            if result['success']:
                entry['content_pt'] = result['content_pt_new']
                changed = True
                file_ok += 1
                grand_ok += 1
                print(f'     ✅ {jp_n} parágrafos gerados')
            else:
                file_fail += 1
                grand_fail += 1
                print(f'     ❌ {result.get("error", "erro desconhecido")}')

            save_checkpoint(checkpoint)

            if args.delay > 0:
                time.sleep(args.delay)

        # Salvar arquivo se houve mudanças
        if changed and not args.dry_run:
            ts = datetime.now().strftime('%Y%m%d_%H%M%S')
            bak = str(filepath) + f'.bak.retranslate.{ts}'
            shutil.copy2(filepath, bak)
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f'  💾 Salvo. Backup: {Path(bak).name}')
            print(f'  ✅ {file_ok} ok  ❌ {file_fail} falhas')

    print(f'\n{"─"*60}')
    print(f'Total ✅: {grand_ok}  ❌: {grand_fail}  ↩ pulados: {grand_skip}')
    if args.dry_run:
        print('(DRY RUN — nenhuma API chamada, nenhum arquivo modificado)')
    print(f'{"─"*60}\n')


if __name__ == '__main__':
    main()
