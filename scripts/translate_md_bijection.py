#!/usr/bin/env python3
"""
translate_md_bijection.py — Traduz os MD originais japoneses para PT-BR
mantendo bijeção 1:1 de parágrafos, usando a Gemini API.

Abordagem: em vez de corrigir bijeção entry por entry no JSON,
traduz o MD original inteiro, garantindo que o português espelhe
a estrutura do japonês.

Uso:
    set GEMINI_API_KEY=sua_chave_aqui

    python scripts/translate_md_bijection.py --vol 03 --dry-run
    python scripts/translate_md_bijection.py --vol 03
    python scripts/translate_md_bijection.py --all
    python scripts/translate_md_bijection.py --vol 03 --model gemini-2.5-flash

Flags:
    --vol N [N ...]     Volume(s) a processar (ex: 03 06 08)
    --all               Todos os volumes
    --dry-run           Mostra chunks sem chamar a API
    --model NAME        Modelo Gemini (padrão: gemini-2.5-pro)
    --delay S           Segundos entre chamadas (padrão: 4)
    --output-dir DIR    Diretório de saída
    --max-chunk-chars N Tamanho máximo de chunk em chars (padrão: 20000)
    --reset-checkpoint  Apaga checkpoint e reprocessa tudo
"""

import json
import os
import re
import sys
import time
import argparse
from pathlib import Path
from datetime import datetime

# ──────────────────────────────────────────────
# Configuração
# ──────────────────────────────────────────────
PROMPT_PATH        = Path('Prompt_Traduca_v2.md')
MD_ORIGINAL_DIR    = Path('Markdown/MD_Original_normalized')
DEFAULT_OUTPUT_DIR = Path('Markdown/MD_PT_v3')
CHECKPOINT_PATH    = Path('data/_translate_md_checkpoint.json')
DEFAULT_MODEL      = 'gemini-3.1-pro-preview'
MAX_CHUNK_CHARS    = 20_000

VOL_FILES = {
    '01': '浄霊法講座1.md',  '02': '浄霊法講座2.md',
    '03': '浄霊法講座3.md',  '04': '浄霊法講座4.md',
    '05': '浄霊法講座5.md',  '06': '浄霊法講座6.md',
    '07': '浄霊法講座7.md',  '08': '浄霊法講座8.md',
    '09': '浄霊法講座9.md',  '10': '浄霊法講座10.md',
}


# ──────────────────────────────────────────────
# Chunking inteligente
# ──────────────────────────────────────────────
def _is_h1(line: str) -> bool:
    """No JP normalizado, o "topo" é H2 (volume) ou H3 (seção).
    Tratamos H2 como nível 1 lógico para que o chunker reconheça o título."""
    s = line.strip()
    return bool(re.match(r'^##\s+[^#]', s))

def _is_h2(line: str) -> bool:
    """No JP normalizado, H3 é a fronteira primária de chunk (seções)."""
    s = line.strip()
    return bool(re.match(r'^###\s+[^#]', s))

def _is_h3(line: str) -> bool:
    """Fallback de chunking: H4 (artigos) quando seções ainda são grandes."""
    s = line.strip()
    return bool(re.match(r'^####\s+[^#]', s))

def _split_at_headers(text: str, header_test) -> list[dict]:
    """Split markdown text at lines matching header_test."""
    lines = text.split('\n')
    chunks = []
    current_lines = []
    current_header = None

    for line in lines:
        if header_test(line):
            if current_lines:
                content = '\n'.join(current_lines).strip()
                if content:
                    chunks.append({'header': current_header or '', 'content': content})
            current_lines = [line]
            current_header = line.strip()
        else:
            current_lines.append(line)

    if current_lines:
        content = '\n'.join(current_lines).strip()
        if content:
            chunks.append({'header': current_header or '', 'content': content})

    return chunks


def _group_small_chunks(chunks: list[dict], max_chars: int) -> list[dict]:
    """Group consecutive small chunks to stay under max_chars."""
    if not chunks:
        return []

    grouped = []
    current_parts = []
    current_size = 0

    for chunk in chunks:
        chunk_size = len(chunk['content'])

        # Se um único chunk já excede o limite, ele fica sozinho
        if chunk_size >= max_chars:
            if current_parts:
                grouped.append({
                    'header': current_parts[0]['header'],
                    'content': '\n\n'.join(p['content'] for p in current_parts),
                })
                current_parts = []
                current_size = 0
            grouped.append(chunk)
        elif current_size + chunk_size > max_chars and current_parts:
            grouped.append({
                'header': current_parts[0]['header'],
                'content': '\n\n'.join(p['content'] for p in current_parts),
            })
            current_parts = [chunk]
            current_size = chunk_size
        else:
            current_parts.append(chunk)
            current_size += chunk_size

    if current_parts:
        grouped.append({
            'header': current_parts[0]['header'],
            'content': '\n\n'.join(p['content'] for p in current_parts),
        })

    return grouped


def build_chunks(md_text: str, max_chars: int) -> tuple[str, list[dict]]:
    """
    Estratégia de chunking adaptativa:
    1. Tenta dividir por H1 (# )
    2. Se só tem 1 chunk ou chunks muito grandes, sub-divide por H2 (## )
    3. Agrupa chunks pequenos para ficar perto de max_chars
    """
    md_text = md_text.replace('\r\n', '\n').replace('\r', '\n')

    # Extrair título do volume — tenta 浄霊法講座, senão primeiro H1
    vol_title = ''
    first_h1 = ''
    for line in md_text.split('\n'):
        s = line.strip()
        if _is_h1(s):
            if not first_h1:
                first_h1 = s
            if '浄霊法講座' in s or '講座' in s:
                vol_title = s
                break
    if not vol_title:
        vol_title = first_h1

    # Passo 1: dividir por H1
    h1_chunks = _split_at_headers(md_text, _is_h1)

    # Filtrar chunk do título se for só ele (sem conteúdo real)
    if h1_chunks and h1_chunks[0]['content'].strip() == vol_title:
        h1_chunks = h1_chunks[1:] if len(h1_chunks) > 1 else h1_chunks

    # Passo 2: sub-dividir chunks grandes por H2 e, se ainda grandes, por H3
    def subdivide(chunk, header_test):
        subs = _split_at_headers(chunk['content'], header_test)
        if len(subs) <= 1:
            return [chunk]
        for sub in subs:
            if not sub['header']:
                sub['header'] = chunk['header']
        return subs

    refined = []
    for chunk in h1_chunks:
        if len(chunk['content']) <= max_chars:
            refined.append(chunk)
            continue
        # Tentar dividir por seção (H3)
        h2_subs = subdivide(chunk, _is_h2)
        # Para cada sub-chunk grande, descer mais um nível (H4)
        for sub in h2_subs:
            if len(sub['content']) <= max_chars:
                refined.append(sub)
            else:
                refined.extend(subdivide(sub, _is_h3))

    # Passo 3: agrupar chunks pequenos
    final = _group_small_chunks(refined, max_chars)

    # Se resultou em 0, fallback para H2
    if not final:
        h2_chunks = _split_at_headers(md_text, _is_h2)
        final = _group_small_chunks(h2_chunks, max_chars)

    # Último fallback: texto inteiro
    if not final:
        final = [{'header': vol_title, 'content': md_text.strip()}]

    return vol_title, final


# ──────────────────────────────────────────────
# System prompt
# ──────────────────────────────────────────────
def load_system_prompt() -> str:
    with open(PROMPT_PATH, encoding='utf-8') as f:
        text = f.read()
    text = re.sub(r'## 7\. ENTRADA.*$', '', text, flags=re.DOTALL).strip()
    return text


# ──────────────────────────────────────────────
# User prompt
# ──────────────────────────────────────────────
def build_user_prompt(vol_title: str, section_content: str,
                      chunk_idx: int, total_chunks: int) -> str:
    return f"""Traduza a seção abaixo do japonês para PT-BR, seguindo TODAS as regras do system prompt.

REGRAS CRÍTICAS — ZERO TOLERÂNCIA:

1. ESTRUTURA ESPELHADA: O JP de entrada já está pré-normalizado em hierarquia v2 (`##` volume, `###` seção, `####` artigo, `#####` sub-item). Sua saída em PT deve preservar a estrutura markdown LITERALMENTE:
   - MESMO número de cabeçalhos `#` em cada nível.
   - MESMA ordem.
   - MESMO nível em cada posição (H2→H2, H3→H3, H4→H4, H5→H5).
   - NUNCA inventar `##### (a)/(b)/(c)` se o JP não tem `#####` na mesma posição.
   - NUNCA criar headers extras agrupando artigos.
   - NUNCA omitir headers que o JP tem.

2. BIJEÇÃO 1:1 DE PARÁGRAFOS: Para cada parágrafo do JP, produza EXATAMENTE um parágrafo do PT, na mesma ordem. NÃO fundir, NÃO dividir.

3. MARCADORES INLINE: ①②③, (イ)(ロ)(ハ) dentro de um parágrafo do JP permanecem dentro do MESMO parágrafo no PT (preserve como `*(1)*`, `*(2)*` etc.). NÃO promover a `#####`.

4. FONTES: Converta para Romaji canônico (§3 do system prompt):
   御教え集 → Mioshie-shū | 御垂示録 → Gosui-ji Roku | 地上天国 → Chijō Tengoku
   信仰雑話 → Shinkō Zatsuwa | 栄光 → Eikō | 光新聞 → Hikari Shimbun
   Formato: *Fonte n.º X, pág. Y* em itálico, logo abaixo do cabeçalho — APENAS se o JP tem fonte naquela posição.

5. PT-BR ESTRITO: Registro brasileiro elevado, SEM PT-PT (controlo→controle, facto→fato, está a fazer→está fazendo, deveis→devem, etc.). Sem arcaísmos (mister, cabal, outrora, forçoso, cumpre-me). Siga §1.4.

6. VOCABULÁRIO MESSIÂNICO: glossário §2 rigorosamente (purificação, toxinas medicinais, ponto vital, indurações, ministrantes, orientadores, Johrei, Ohikari, Sonen, Kyūsho, Kaso, Yakudoku).

7. Q&A: (御伺/御　伺) → `**(Pergunta)**`, (御垂示) → `**(Meishu-sama)**` — cada turno é parágrafo separado.

8. NÃO inclua "Status da Tradução", blocos ``` cercados, nem [PAUSA]. Retorne APENAS o markdown traduzido limpo.

VALIDAÇÃO ANTES DE ENTREGAR — execute mentalmente:
  (i) conte cabeçalhos PT por nível, compare ao JP. Devem ser idênticos.
  (ii) conte parágrafos não-vazios PT, compare ao JP. Devem ser idênticos.
  Se divergir em qualquer um, reescreva.

Volume: {vol_title}
Parte {chunk_idx + 1} de {total_chunks}

{'─' * 40}
TEXTO JAPONÊS A TRADUZIR:
{'─' * 40}

{section_content}"""


# ──────────────────────────────────────────────
# Gemini API
# ──────────────────────────────────────────────
def call_gemini(client, model_name: str, system_prompt: str,
                user_prompt: str) -> str:
    response = client.models.generate_content(
        model=model_name,
        contents=user_prompt,
        config={
            'system_instruction': system_prompt,
            'temperature': 0.3,
            'max_output_tokens': 65536,
        }
    )
    return response.text.strip()


def clean_response(text: str) -> str:
    text = re.sub(r'^```(?:markdown)?\s*\n', '', text)
    text = re.sub(r'\n```\s*$', '', text)
    text = re.sub(r'>\s*\*\*Status da Tradução:.*?\n', '', text)
    text = re.sub(r'\[PAUSA\s*-.*?\]', '', text)
    return text.strip()


def count_content_paras(text: str) -> int:
    paras = [p.strip() for p in text.split('\n\n') if p.strip()]
    return sum(1 for p in paras
               if not p.startswith('#')
               and not (p.startswith('*') and p.endswith('*') and len(p) < 200))


# ──────────────────────────────────────────────
# Checkpoint
# ──────────────────────────────────────────────
def load_checkpoint() -> dict:
    if CHECKPOINT_PATH.exists():
        with open(CHECKPOINT_PATH, encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_checkpoint(cp: dict):
    with open(CHECKPOINT_PATH, 'w', encoding='utf-8') as f:
        json.dump(cp, f, ensure_ascii=False, indent=2)


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description='Traduz MD originais japoneses para PT-BR com bijeção 1:1.'
    )
    parser.add_argument('--vol', nargs='+', default=None,
                        help='Volume(s) a processar (ex: 03 06 08)')
    parser.add_argument('--all', action='store_true',
                        help='Processar todos os volumes')
    parser.add_argument('--dry-run', action='store_true',
                        help='Mostra chunks sem chamar a API')
    parser.add_argument('--model', default=DEFAULT_MODEL,
                        help=f'Modelo Gemini (padrão: {DEFAULT_MODEL})')
    parser.add_argument('--delay', type=float, default=4.0,
                        help='Segundos entre chamadas API (padrão: 4)')
    parser.add_argument('--output-dir', default=str(DEFAULT_OUTPUT_DIR),
                        help=f'Diretório de saída (padrão: {DEFAULT_OUTPUT_DIR})')
    parser.add_argument('--max-chunk-chars', type=int, default=MAX_CHUNK_CHARS,
                        help=f'Max chars por chunk (padrão: {MAX_CHUNK_CHARS})')
    parser.add_argument('--reset-checkpoint', action='store_true',
                        help='Apaga checkpoint e reprocessa tudo')
    args = parser.parse_args()

    # ── API key ──
    api_key = os.environ.get('GEMINI_API_KEY', '').strip()
    if not api_key and not args.dry_run:
        print('❌ GEMINI_API_KEY não definida.')
        print('   Windows:  set GEMINI_API_KEY=sua_chave_aqui')
        print('   Linux:    export GEMINI_API_KEY=sua_chave_aqui')
        sys.exit(1)

    # ── Importar google-genai ──
    client = None
    if not args.dry_run:
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
        except ImportError:
            print('❌ Pacote google-genai não encontrado.')
            print('   Execute: pip install google-genai')
            sys.exit(1)

    # ── System prompt ──
    system_prompt = load_system_prompt()
    print(f'✓ System prompt: {len(system_prompt):,} chars')

    # ── Output dir ──
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f'✓ Output: {output_dir}/')

    # ── Checkpoint ──
    if args.reset_checkpoint and CHECKPOINT_PATH.exists():
        CHECKPOINT_PATH.unlink()
        print('✓ Checkpoint resetado.')
    checkpoint = load_checkpoint()

    # ── Selecionar volumes ──
    if args.all:
        vols = sorted(VOL_FILES.keys())
    elif args.vol:
        vols = [v.zfill(2) for v in args.vol]
    else:
        parser.print_help()
        sys.exit(0)

    for v in vols:
        if v not in VOL_FILES:
            print(f'❌ Volume {v} desconhecido.'); sys.exit(1)
        if not (MD_ORIGINAL_DIR / VOL_FILES[v]).exists():
            print(f'❌ Arquivo não encontrado: {MD_ORIGINAL_DIR / VOL_FILES[v]}'); sys.exit(1)

    print(f'\n{"─"*60}')
    print(f'Tradução MD JP→PT-BR  |  Modelo: {args.model}')
    print(f'Modo: {"DRY RUN" if args.dry_run else "LIVE"}  |  Volumes: {", ".join(vols)}')
    print(f'Max chunk: {args.max_chunk_chars:,} chars')
    print(f'{"─"*60}')

    total_ok = total_fail = total_skip = 0

    for vol in vols:
        jp_path = MD_ORIGINAL_DIR / VOL_FILES[vol]
        out_path = output_dir / f'Johrei_Ho_Kohza_{int(vol)}_retranslated.md'
        cp_prefix = f'vol{vol}'

        print(f'\n▶ Volume {vol}: {jp_path.name}')

        with open(jp_path, encoding='utf-8') as f:
            jp_text = f.read()

        vol_title, chunks = build_chunks(jp_text, args.max_chunk_chars)
        print(f'  Título: {vol_title}')
        print(f'  Chunks: {len(chunks)}')
        for i, ch in enumerate(chunks):
            hdr = ch['header'][:50] if ch['header'] else '(sem header)'
            print(f'    {i+1}. [{hdr}] — {len(ch["content"]):,} chars')

        translated_parts = []
        vol_ok = vol_fail = 0

        for i, chunk in enumerate(chunks):
            sec_key = f'{cp_prefix}_c{i}'
            header = (chunk['header'] or '(sem header)')[:55]

            # Checkpoint
            if sec_key in checkpoint and checkpoint[sec_key].get('success'):
                print(f'  ↩ Parte {i+1}/{len(chunks)} [{header}] — checkpoint')
                translated_parts.append(checkpoint[sec_key]['translation'])
                total_skip += 1
                continue

            content = chunk['content']
            char_count = len(content)
            print(f'  → Parte {i+1}/{len(chunks)} [{header}] ({char_count:,} chars)')

            if args.dry_run:
                print(f'     (dry-run)')
                translated_parts.append(f'<!-- DRY-RUN: parte {i+1} -->')
                total_skip += 1
                continue

            user_prompt = build_user_prompt(vol_title, content, i, len(chunks))

            try:
                print(f'     ⏳ Chamando API...', end='', flush=True)
                t0 = time.time()
                raw = call_gemini(client, args.model, system_prompt, user_prompt)
                elapsed = time.time() - t0
                cleaned = clean_response(raw)

                jp_p = count_content_paras(content)
                pt_p = count_content_paras(cleaned)

                translated_parts.append(cleaned)
                checkpoint[sec_key] = {
                    'success': True,
                    'translation': cleaned,
                    'jp_chars': char_count,
                    'pt_chars': len(cleaned),
                    'jp_paras': jp_p,
                    'pt_paras': pt_p,
                    'elapsed_s': round(elapsed, 1),
                    'model': args.model,
                    'timestamp': datetime.now().isoformat(),
                }
                save_checkpoint(checkpoint)

                vol_ok += 1
                total_ok += 1
                match = '✅' if jp_p == pt_p else f'⚠️ JP≈{jp_p} PT≈{pt_p}'
                print(f' {elapsed:.1f}s | {len(cleaned):,} chars | ¶ {match}')

            except Exception as exc:
                vol_fail += 1
                total_fail += 1
                checkpoint[sec_key] = {
                    'success': False,
                    'error': str(exc),
                    'timestamp': datetime.now().isoformat(),
                }
                save_checkpoint(checkpoint)
                print(f' ❌ {exc}')

            if args.delay > 0 and i < len(chunks) - 1:
                time.sleep(args.delay)

        # ── Salvar ──
        if not args.dry_run and translated_parts and vol_ok > 0:
            full_md = '\n\n'.join(translated_parts)
            with open(out_path, 'w', encoding='utf-8') as f:
                f.write(full_md + '\n')
            print(f'\n  💾 Salvo: {out_path}')
            print(f'     ✅ {vol_ok} ok  ❌ {vol_fail} falhas')

    print(f'\n{"─"*60}')
    print(f'Resumo: ✅ {total_ok}  ❌ {total_fail}  ↩ checkpoint: {total_skip}')
    if args.dry_run:
        print('(DRY RUN — nenhuma API chamada)')
    else:
        print(f'Saída: {output_dir}/')
    print(f'{"─"*60}\n')


if __name__ == '__main__':
    main()
