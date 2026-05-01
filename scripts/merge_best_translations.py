#!/usr/bin/env python3
"""
merge_best_translations.py — Confronta tradução antiga com a nova (retranslated)
e produz uma versão definitiva mesclando o melhor de cada uma.

Usa o Gemini API para avaliar seção por seção.

Uso:
    set GEMINI_API_KEY=...
    python scripts/merge_best_translations.py --vol 03 --dry-run
    python scripts/merge_best_translations.py --vol 02 03
"""

import os
import re
import sys
import time
import json
import argparse
from pathlib import Path
from datetime import datetime

OLD_DIR = Path('Markdown/MD_Portugues')
NEW_DIR = Path('Markdown/MD_PT_retranslated')
OUT_DIR = Path('Markdown/MD_PT_definitivo')
PROMPT_PATH = Path('Prompt_Traduca_v2.md')
JP_DIR  = Path('Markdown/MD_Original')

VOL_MAP = {
    '02': {
        'old': 'Johrei Ho Kohza (2).md',
        'new': 'Johrei_Ho_Kohza_2_retranslated.md',
        'jp':  '浄霊法講座2.md',
    },
    '03': {
        'old': 'Johrei Ho Kohza (3).md',
        'new': 'Johrei_Ho_Kohza_3_retranslated.md',
        'jp':  '浄霊法講座3.md',
    },
}

MERGE_SYSTEM = """Você é um revisor-chefe de traduções da Sekaikyūseikyō (Igreja Messiânica Mundial).

Sua tarefa é MESCLAR duas traduções JP→PT-BR do mesmo texto, produzindo a versão DEFINITIVA.

CRITÉRIOS DE SELEÇÃO (em ordem de prioridade):
1. FIDELIDADE ao japonês original (bijeção 1:1 de parágrafos)
2. VOCABULÁRIO MESSIÂNICO correto (purificação, toxinas medicinais, ponto vital, induração, ministrantes, orientadores, fiéis, retirar a força, Johrei, Ohikari)
3. PT-BR sofisticado SEM português de Portugal (gerúndio, não "estar a + infinitivo"; próclise natural)
4. FONTES em Romaji canônico (Mioshie-shū, NÃO Goshū)
5. TOM profético de Meishu-sama (autoridade, certeza absoluta)
6. FLUIDEZ e naturalidade da leitura

REGRAS:
- Se a Versão A tem uma frase melhor, use-a
- Se a Versão B tem uma frase melhor, use-a
- Se ambas são boas, prefira a que tem vocabulário messiânico mais correto
- NÃO invente texto novo — use apenas trechos das duas versões
- MANTENHA a estrutura de headers da Versão B (## → ### → #### → #####)
- MANTENHA as fontes em formato Romaji canônico da Versão B (*Mioshie-shū n.º X, pág. Y*)
- Retorne APENAS o markdown final, sem comentários
"""


def load_system_prompt():
    with open(PROMPT_PATH, encoding='utf-8') as f:
        text = f.read()
    text = re.sub(r'## 7\. ENTRADA.*$', '', text, flags=re.DOTALL).strip()
    return text


def split_by_h3(text):
    """Divide por ### (seções principais) para comparar seção a seção."""
    lines = text.split('\n')
    sections = []
    current = []
    current_header = None

    for line in lines:
        if re.match(r'^###\s+[^#]', line.strip()):
            if current:
                sections.append({
                    'header': current_header or '',
                    'content': '\n'.join(current).strip()
                })
            current = [line]
            current_header = line.strip()
        else:
            current.append(line)

    if current:
        sections.append({
            'header': current_header or '',
            'content': '\n'.join(current).strip()
        })

    return sections


def build_merge_prompt(jp_section, old_section, new_section, sec_idx, total):
    return f"""Mescle as duas traduções abaixo, produzindo a versão DEFINITIVA.

Seção {sec_idx + 1} de {total}

═══ TEXTO JAPONÊS ORIGINAL ═══
{jp_section}

═══ VERSÃO A (tradução antiga) ═══
{old_section}

═══ VERSÃO B (retradução nova - Gemini 3.1 Pro) ═══
{new_section}

═══ INSTRUÇÕES ═══
- Produza a versão DEFINITIVA mesclando o melhor de A e B
- Priorize B para estrutura de headers e fontes (Romaji canônico)
- Priorize A se ela tiver expressões mais naturais ou fiéis ao JP
- Se B já é claramente superior, pode usar B integralmente
- Mantenha bijeção 1:1 com o japonês
- Retorne APENAS o markdown, sem comentários nem blocos de código"""


def call_gemini(client, model, system, user):
    response = client.models.generate_content(
        model=model,
        contents=user,
        config={
            'system_instruction': system,
            'temperature': 0.2,
            'max_output_tokens': 65536,
        }
    )
    text = response.text.strip()
    text = re.sub(r'^```(?:markdown)?\s*\n', '', text)
    text = re.sub(r'\n```\s*$', '', text)
    return text


def main():
    parser = argparse.ArgumentParser(description='Mescla traduções antiga + nova')
    parser.add_argument('--vol', nargs='+', required=True, help='Volumes (02, 03)')
    parser.add_argument('--model', default='gemini-3.1-pro-preview')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--delay', type=float, default=4.0)
    args = parser.parse_args()

    api_key = os.environ.get('GEMINI_API_KEY', '').strip()
    if not api_key and not args.dry_run:
        print('❌ GEMINI_API_KEY não definida.')
        sys.exit(1)

    client = None
    if not args.dry_run:
        from google import genai
        client = genai.Client(api_key=api_key)

    system_prompt = MERGE_SYSTEM
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for vol in args.vol:
        vol = vol.zfill(2)
        if vol not in VOL_MAP:
            print(f'❌ Volume {vol} não tem tradução antiga para confrontar.')
            continue

        info = VOL_MAP[vol]
        old_path = OLD_DIR / info['old']
        new_path = NEW_DIR / info['new']
        jp_path  = JP_DIR / info['jp']
        out_path = OUT_DIR / f'Johrei_Ho_Kohza_{int(vol)}_definitivo.md'

        print(f'\n{"═"*60}')
        print(f'Volume {vol}: Confronto A (antiga) vs B (nova)')
        print(f'{"═"*60}')

        old_text = old_path.read_text(encoding='utf-8').replace('\r\n', '\n')
        new_text = new_path.read_text(encoding='utf-8').replace('\r\n', '\n')
        jp_text  = jp_path.read_text(encoding='utf-8').replace('\r\n', '\n')

        # Para o merge, enviar o volume inteiro (são pequenos: 12-19K chars JP)
        # Isso dá melhor contexto ao modelo para consistência
        print(f'  JP:    {len(jp_text):>6,} chars')
        print(f'  Antiga:{len(old_text):>6,} chars')
        print(f'  Nova:  {len(new_text):>6,} chars')

        if args.dry_run:
            print(f'  (dry-run) Seria enviado ao {args.model}')
            continue

        prompt = build_merge_prompt(jp_text, old_text, new_text, 0, 1)

        print(f'  ⏳ Chamando {args.model}...', end='', flush=True)
        t0 = time.time()
        merged = call_gemini(client, args.model, system_prompt, prompt)
        elapsed = time.time() - t0
        print(f' {elapsed:.1f}s | {len(merged):,} chars')

        out_path.write_text(merged + '\n', encoding='utf-8')
        print(f'  💾 Salvo: {out_path}')

        if args.delay > 0 and vol != args.vol[-1]:
            time.sleep(args.delay)

    print(f'\n{"═"*60}')
    print(f'Concluído. Arquivos em: {OUT_DIR}/')
    print(f'{"═"*60}')


if __name__ == '__main__':
    main()
