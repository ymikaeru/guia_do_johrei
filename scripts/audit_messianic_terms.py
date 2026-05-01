#!/usr/bin/env python3
"""Audita as traduções retraduzidas contra o glossário messiânico do Prompt_Traduca_v2."""

import re
from pathlib import Path

DIR = Path('Markdown/MD_PT_retranslated')

# (regex, correção esperada, categoria)
CHECKS = [
    # PT-PT proibido
    (r'\bfacto\b', 'fato', 'PT-PT'),
    (r'\bfactos\b', 'fatos', 'PT-PT'),
    (r'\bcontrolo\b', 'controle', 'PT-PT'),
    (r'\bcontacto\b', 'contato', 'PT-PT'),
    (r'\bregisto\b', 'registro', 'PT-PT'),
    (r'\bobjectiv', 'objetivo', 'PT-PT'),
    (r'\bdirecto\b|\bdirecta\b', 'direto/direta', 'PT-PT'),
    (r'está a \w+r\b', 'gerúndio BR', 'PT-PT sintaxe'),
    # Glossário messiânico - termos errados
    (r'\bveneno\b', 'toxinas medicinais', 'GLOSSARIO'),
    (r'\bsintomas?\b', 'purificação (checar contexto)', 'GLOSSARIO'),
    (r'relaxar a for', 'retirar a força', 'GLOSSARIO'),
    (r'\binstrutores?\b(?! [MG])', 'orientadores', 'GLOSSARIO'),
    (r'\bprofessores?\b', 'orientadores', 'GLOSSARIO'),
    (r'pontos[ -]?focais|pontos[ -]?chave', 'ponto vital', 'GLOSSARIO'),
    (r'\bseguidores\b|\bdevotos\b', 'fiéis', 'GLOSSARIO'),
    (r'arte m.dica do Johrei', 'arte do Johrei', 'GLOSSARIO'),
    (r'\bpacientes?\b', 'checar se OK no contexto (prefer doente/pessoa)', 'GLOSSARIO-soft'),
    # Arcaísmos proibidos
    (r'\bmister\b', 'imprescindível', 'ARCAISMO'),
    (r'\bcabal\b', 'de forma definitiva', 'ARCAISMO'),
    (r'\boutrora\b', 'anteriormente', 'ARCAISMO'),
    (r'\bcumpre-me\b', 'é necessário', 'ARCAISMO'),
    (r'\bposto que\b', 'embora', 'ARCAISMO'),
    (r'\bforçoso\b', 'necessário', 'ARCAISMO'),
    (r'\bacumuleis\b|\btendes\b|\bdeveis\b|\bministrai\b|\bvossos\b', '', 'ARCAISMO-voseu'),
    # Fontes - grafias erradas
    (r'Goshu(?!i)', 'Mioshie-shu', 'FONTE'),
    (r'Gosuijiroku', 'Gosui-ji Roku', 'FONTE'),
    (r'Chijou Tengoku', 'Chijo Tengoku', 'FONTE'),
    # Termos que devem estar presentes (positivos)
    (r'\bdoença\b', '(checar: contexto doutrinário deveria ser purificação?)', 'CONTEXTO'),
]

total_issues = 0
summary = {}

for f in sorted(DIR.glob('*.md')):
    text = f.read_text(encoding='utf-8')
    lines = text.split('\n')
    file_issues = []

    for pattern, note, cat in CHECKS:
        matches = list(re.finditer(pattern, text, re.IGNORECASE))
        if cat == 'CONTEXTO':
            # Apenas contar, não listar individualmente
            if matches:
                file_issues.append((cat, f'{len(matches)}x "{matches[0].group()}" encontrado - verificar contexto doutrinario', 0, ''))
            continue
        for m in matches:
            line_num = text[:m.start()].count('\n') + 1
            start = max(0, m.start() - 40)
            end = min(len(text), m.end() + 40)
            ctx = text[start:end].replace('\n', ' ').strip()
            file_issues.append((cat, f'"{m.group()}" -> {note}', line_num, ctx))

    # Contagens positivas
    johrei_count = len(re.findall(r'\bJohrei\b', text))
    purif_count = len(re.findall(r'\bpurifica', text, re.IGNORECASE))
    toxinas_count = len(re.findall(r'toxinas medicinais', text, re.IGNORECASE))
    ponto_vital = len(re.findall(r'ponto vital|pontos vitais', text, re.IGNORECASE))
    induracoes = len(re.findall(r'indura|solidifica', text, re.IGNORECASE))
    ministrantes = len(re.findall(r'\bministrantes?\b', text, re.IGNORECASE))
    orientadores = len(re.findall(r'\borientadores?\b', text, re.IGNORECASE))
    fieis = len(re.findall(r'\bfi[eé]is\b', text, re.IGNORECASE))
    retirar_forca = len(re.findall(r'retirar a for', text, re.IGNORECASE))

    # Filtrar issues soft (GLOSSARIO-soft e CONTEXTO) para não poluir
    hard_issues = [i for i in file_issues if 'soft' not in i[0] and i[0] != 'CONTEXTO']
    soft_issues = [i for i in file_issues if 'soft' in i[0] or i[0] == 'CONTEXTO']

    vol_name = f.stem
    summary[vol_name] = {
        'hard': len(hard_issues),
        'soft': len(soft_issues),
        'johrei': johrei_count,
        'purificacao': purif_count,
        'toxinas': toxinas_count,
        'ponto_vital': ponto_vital,
        'induracoes': induracoes,
        'ministrantes': ministrantes,
        'orientadores': orientadores,
        'fieis': fieis,
        'retirar_forca': retirar_forca,
    }

    if hard_issues:
        print(f'\n{"="*60}')
        print(f'{f.name} - {len(hard_issues)} problemas criticos')
        print(f'{"="*60}')
        for cat, msg, ln, ctx in hard_issues[:15]:
            print(f'  L{ln:>4} [{cat}] {msg}')
            if ctx:
                print(f'         ...{ctx}...')
        if len(hard_issues) > 15:
            print(f'  ... e mais {len(hard_issues) - 15} problemas')
        total_issues += len(hard_issues)

print(f'\n\n{"="*60}')
print(f'RESUMO GERAL - Vocabulario Messianico')
print(f'{"="*60}')
print(f'{"Volume":<45} {"Johrei":>6} {"Purif":>6} {"Toxin":>6} {"PVital":>6} {"Indur":>6} {"Minist":>7} {"Orient":>7} {"Fieis":>6} {"RetFor":>6} {"Erros":>6}')
print('-' * 120)
for vol, data in sorted(summary.items()):
    print(f'{vol:<45} {data["johrei"]:>6} {data["purificacao"]:>6} {data["toxinas"]:>6} {data["ponto_vital"]:>6} {data["induracoes"]:>6} {data["ministrantes"]:>7} {data["orientadores"]:>7} {data["fieis"]:>6} {data["retirar_forca"]:>6} {data["hard"]:>6}')

print(f'\nTOTAL PROBLEMAS CRITICOS: {total_issues}')
