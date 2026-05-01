#!/usr/bin/env python3
"""
fix_messianic_terms.py — Corrige termos messiânicos nas traduções retraduzidas.

Etapa 1: Correções regex automáticas (sem API)
Etapa 2: Revisão contextual de 'sintomas' via Gemini API (opcional)

Uso:
    python scripts/fix_messianic_terms.py                    # só regex
    python scripts/fix_messianic_terms.py --review-sintomas  # + revisão com API
    python scripts/fix_messianic_terms.py --dry-run          # mostra sem salvar
"""

import re
import os
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime

DIR = Path('Markdown/MD_PT_retranslated')

# ──────────────────────────────────────────────
# Etapa 1: Substituições regex determinísticas
# ──────────────────────────────────────────────
REPLACEMENTS = [
    # veneno → toxinas medicinais (quando isolado, não "envenenar" etc.)
    (r'\bveneno\b', 'toxinas medicinais', 'veneno -> toxinas medicinais'),
    (r'\bvenenos\b', 'toxinas medicinais', 'venenos -> toxinas medicinais'),

    # professores → orientadores (vocab IMM atual)
    (r'\bprofessores\b', 'orientadores', 'professores -> orientadores'),
    (r'\bprofessor\b', 'orientador', 'professor -> orientador'),

    # Sintaxe PT-PT: "está a + infinitivo" → gerúndio BR
    # Cuidado: só quando é realmente essa construção
    (r'\bestá a fazer\b', 'está fazendo', 'PT-PT gerúndio'),
    (r'\bestá a formar\b', 'está formando', 'PT-PT gerúndio'),
    (r'\bestá a aumentar\b', 'está aumentando', 'PT-PT gerúndio'),
    (r'\bestá a diminuir\b', 'está diminuindo', 'PT-PT gerúndio'),
    (r'\bestá a dissolver\b', 'está dissolvendo', 'PT-PT gerúndio'),
    (r'\bestá a sair\b', 'está saindo', 'PT-PT gerúndio'),
    (r'\bestá a curar\b', 'está curando', 'PT-PT gerúndio'),
    (r'\bestá a melhorar\b', 'está melhorando', 'PT-PT gerúndio'),
    (r'\bestá a piorar\b', 'está piorando', 'PT-PT gerúndio'),
    (r'\bestá a tratar\b', 'está tratando', 'PT-PT gerúndio'),
    (r'\bestão a \b', 'estão ', 'PT-PT gerúndio (genérico)'),

    # Arcaísmos proibidos
    (r'\bmister\b', 'imprescindível', 'arcaísmo mister'),
    (r'\bcumpre-me\b', 'é necessário', 'arcaísmo cumpre-me'),
    (r'\bforçoso é\b', 'é necessário', 'arcaísmo forçoso'),

    # Termos messiânicos menores
    (r'relaxar a força', 'retirar a força', 'relaxar -> retirar a força'),
    (r'pontos focais', 'pontos vitais', 'pontos focais -> vitais'),
    (r'pontos-chave', 'pontos vitais', 'pontos-chave -> vitais'),
    (r'arte médica do Johrei', 'arte do Johrei', 'arte médica do Johrei -> arte do Johrei'),

    # Seguidores/devotos → fiéis
    (r'\bseguidores\b', 'fiéis', 'seguidores -> fiéis'),
    (r'\bdevotos\b', 'fiéis', 'devotos -> fiéis'),
]


def apply_regex_fixes(text, dry_run=False):
    """Aplica substituições regex e retorna (novo_texto, lista_de_mudanças)."""
    changes = []
    new_text = text

    for pattern, replacement, label in REPLACEMENTS:
        matches = list(re.finditer(pattern, new_text, re.IGNORECASE))
        if matches:
            for m in matches:
                line_num = new_text[:m.start()].count('\n') + 1
                changes.append(f'  L{line_num:>4} [{label}] "{m.group()}" -> "{replacement}"')

            if not dry_run:
                # Preservar capitalização original onde possível
                def smart_replace(match):
                    original = match.group()
                    if original[0].isupper() and replacement[0].islower():
                        return replacement[0].upper() + replacement[1:]
                    return replacement

                new_text = re.sub(pattern, smart_replace, new_text, flags=re.IGNORECASE)

    return new_text, changes


# ──────────────────────────────────────────────
# Etapa 2: Revisão contextual de 'sintomas'
# ──────────────────────────────────────────────
SINTOMAS_PROMPT = """Você é um revisor especialista em traduções da Sekaikyūseikyō (Igreja Messiânica).

REGRA DOUTRINÁRIA: Na perspectiva de Meishu-sama, o que o mundo chama de "doença" é na verdade "purificação se manifestando". A palavra "sintomas" é aceitável SOMENTE quando:
1. Descreve o fenômeno externo/clínico que o PACIENTE ou MÉDICO relata (ex: "apresentou sintomas de febre")
2. Está em contexto de citação médica ou diagnóstico convencional

A palavra "sintomas" deve ser SUBSTITUÍDA por "manifestações" ou "sinais de purificação" quando:
1. Meishu-sama está explicando o PROCESSO ESPIRITUAL subjacente
2. O contexto é doutrinário (explicação de como funciona a purificação)
3. A frase descreve o resultado da ação Divina, não um diagnóstico médico

Para cada ocorrência abaixo, responda APENAS em JSON:
{"decisoes": [{"linha": N, "acao": "MANTER" ou "SUBSTITUIR", "sugestao": "texto sugerido se SUBSTITUIR"}, ...]}

OCORRÊNCIAS:
"""


def review_sintomas_with_api(text, model_name, client):
    """Usa a API Gemini para revisar ocorrências de 'sintomas' no contexto."""
    matches = list(re.finditer(r'\bsintomas?\b', text, re.IGNORECASE))
    if not matches:
        return text, []

    # Montar contexto para cada ocorrência
    occurrences = []
    for i, m in enumerate(matches):
        line_num = text[:m.start()].count('\n') + 1
        start = max(0, m.start() - 150)
        end = min(len(text), m.end() + 150)
        ctx = text[start:end].replace('\n', ' ').strip()
        occurrences.append(f'{i+1}. Linha {line_num}: "...{ctx}..."')

    if len(occurrences) > 30:
        # Limitar para não estourar contexto
        occurrences = occurrences[:30]
        print(f'     (limitado a 30 de {len(matches)} ocorrências)')

    prompt = SINTOMAS_PROMPT + '\n'.join(occurrences)

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config={'temperature': 0.1, 'max_output_tokens': 4096}
        )
        raw = response.text.strip()
        # Extrair JSON
        raw = re.sub(r'^```(?:json)?\s*\n?', '', raw)
        raw = re.sub(r'\n?```\s*$', '', raw)
        result = json.loads(raw)
        return result.get('decisoes', [])
    except Exception as e:
        print(f'     ERRO na revisão: {e}')
        return []


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Mostra mudanças sem salvar')
    parser.add_argument('--review-sintomas', action='store_true', help='Revisar "sintomas" via API')
    parser.add_argument('--model', default='gemini-3.1-pro-preview', help='Modelo para revisão')
    args = parser.parse_args()

    print(f'{"="*60}')
    print(f'Correção de Termos Messiânicos')
    print(f'Modo: {"DRY RUN" if args.dry_run else "LIVE"}')
    print(f'{"="*60}\n')

    total_changes = 0

    for f in sorted(DIR.glob('*.md')):
        text = f.read_text(encoding='utf-8')
        new_text, changes = apply_regex_fixes(text, args.dry_run)

        if changes:
            print(f'\n▶ {f.name} — {len(changes)} correções regex')
            for c in changes[:20]:
                print(c)
            if len(changes) > 20:
                print(f'  ... e mais {len(changes) - 20}')

            if not args.dry_run:
                # Backup
                backup = f.with_suffix('.md.bak')
                if not backup.exists():
                    f.rename(backup)
                    backup.rename(f)  # restore original name
                    import shutil
                    shutil.copy2(f, backup)

                f.write_text(new_text, encoding='utf-8')
                print(f'  💾 Salvo.')

            total_changes += len(changes)
        else:
            print(f'  ✓ {f.name} — sem correções regex necessárias')

    print(f'\n{"="*60}')
    print(f'Total de correções regex: {total_changes}')
    print(f'{"="*60}\n')

    # Etapa 2: revisão de sintomas
    if args.review_sintomas:
        api_key = os.environ.get('GEMINI_API_KEY', '').strip()
        if not api_key:
            print('❌ GEMINI_API_KEY necessária para --review-sintomas')
            return

        from google import genai
        client = genai.Client(api_key=api_key)

        print(f'\n{"="*60}')
        print(f'Revisão contextual de "sintomas" via {args.model}')
        print(f'{"="*60}\n')

        for f in sorted(DIR.glob('*.md')):
            text = f.read_text(encoding='utf-8')
            matches = list(re.finditer(r'\bsintomas?\b', text, re.IGNORECASE))
            if not matches:
                print(f'  ✓ {f.name} — sem "sintomas"')
                continue

            print(f'\n▶ {f.name} — {len(matches)} ocorrências de "sintomas"')
            print(f'     ⏳ Consultando API...')

            decisoes = review_sintomas_with_api(text, args.model, client)
            substituir = [d for d in decisoes if d.get('acao') == 'SUBSTITUIR']
            manter = [d for d in decisoes if d.get('acao') == 'MANTER']

            print(f'     Resultado: {len(manter)} MANTER, {len(substituir)} SUBSTITUIR')
            for d in substituir:
                print(f'       L{d.get("linha", "?")} → {d.get("sugestao", "?")}')


if __name__ == '__main__':
    main()
