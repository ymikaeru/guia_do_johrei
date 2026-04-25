# -*- coding: utf-8 -*-
"""
Gera data/guia_atendimento.json usando APENAS pontos focais
extraídos de seções explícitas dos ensinamentos de Meishu-Sama.

Condições sem seção explícita são OMITIDAS do guia.
"""
import json, os, re

EXTRACTED = os.path.join(os.path.dirname(__file__), 'extracted_focal_points.json')
DATA_DIR  = r'C:\Mioshie_Sites\guia_johrei\data'
OUT       = os.path.join(DATA_DIR, 'guia_atendimento.json')

# Mapeamento parte_tag → body map point IDs
PARTE_TO_POINTS = {
    'parte:cabeça':              ['vertice', 'frontal', 'sobrancelhas'],
    'parte:região_occipital':    ['occipital', 'occipital-detail'],
    'parte:bulbo_raquidiano':    ['bulbo', 'bulbo-detail'],
    'parte:pescoço':             ['laterais-pescoco', 'arredores-garganta', 'nuca'],
    'parte:parótida':            ['parotida'],
    'parte:amígdalas':           ['garganta'],
    'parte:olhos':               ['olhos'],
    'parte:ouvidos':             ['ouvidos'],
    'parte:nariz':               ['nariz'],
    'parte:boca':                ['boca'],
    'parte:língua':              ['boca'],
    'parte:dentes':              ['boca', 'maxilar'],
    'parte:garganta':            ['garganta', 'esofago'],
    'parte:ombros':              ['ombros'],
    'parte:glândulas_linfáticas':['linfaticas'],
    'parte:pulmões':             ['pulmoes'],
    'parte:coração':             ['coracao', 'cardiaca-posterior'],
    'parte:estômago':            ['estomago', 'estomago-detail'],
    'parte:fígado':              ['figado', 'figado-detail'],
    'parte:rins':                ['rins'],
    'parte:intestinos':          ['intestino'],
    'parte:região_inferior':     ['baixo-ventre', 'bexiga'],
    'parte:região_superior':     ['torax', 'regiao_omoplatas'],
    'parte:lombar':              ['sacro', 'coluna'],
    'parte:costas':              ['coluna', 'regiao_omoplatas'],
    'parte:sistema_circulatório':['coracao', 'pulmoes'],
    'parte:sistema_digestivo':   ['estomago', 'intestino', 'figado'],
    'parte:sistema_nervoso':     ['bulbo', 'vertice'],
    'parte:sistema_respiratório':['pulmoes', 'garganta'],
    'parte:órgãos_internos':     ['orgaos-internos'],
    'parte:mãos':                ['membros'],
    'parte:pernas':              ['membros'],
    'parte:pés':                 ['membros'],
}

def label_part(p):
    labels = {
        'parte:cabeça': 'Cabeça',
        'parte:região_occipital': 'Região Occipital',
        'parte:bulbo_raquidiano': 'Bulbo Raquidiano',
        'parte:pescoço': 'Pescoço',
        'parte:parótida': 'Parótida',
        'parte:amígdalas': 'Amígdalas',
        'parte:olhos': 'Olhos',
        'parte:ouvidos': 'Ouvidos',
        'parte:nariz': 'Nariz',
        'parte:boca': 'Boca',
        'parte:garganta': 'Garganta',
        'parte:ombros': 'Ombros',
        'parte:glândulas_linfáticas': 'Glândulas Linfáticas',
        'parte:pulmões': 'Pulmões',
        'parte:coração': 'Coração',
        'parte:estômago': 'Estômago',
        'parte:fígado': 'Fígado',
        'parte:rins': 'Rins',
        'parte:intestinos': 'Intestinos',
        'parte:região_inferior': 'Região Inferior',
        'parte:região_superior': 'Tórax',
        'parte:lombar': 'Lombar',
        'parte:costas': 'Costas / Coluna',
        'parte:mãos': 'Mãos',
        'parte:pernas': 'Pernas',
        'parte:pés': 'Pés',
        'parte:língua': 'Língua',
        'parte:dentes': 'Dentes',
        'parte:sistema_circulatório': 'Sistema Circulatório',
        'parte:sistema_digestivo': 'Sistema Digestivo',
        'parte:sistema_nervoso': 'Sistema Nervoso',
        'parte:sistema_respiratório': 'Sistema Respiratório',
        'parte:órgãos_internos': 'Órgãos Internos',
    }
    return labels.get(p, p.replace('parte:','').replace('_',' ').title())

with open(EXTRACTED, encoding='utf-8') as f:
    extracted = json.load(f)

# Pre-load all article tags to find canonical condição: tag for each title
import glob as _glob
title_to_cond_tags = {}
for path in _glob.glob(os.path.join(DATA_DIR, '*_bilingual.json')):
    if 'estudo_aprofundado' in path: continue
    with open(path, encoding='utf-8') as f:
        for a in json.load(f):
            title = (a.get('title_pt') or '').strip()
            if not title: continue
            cond_tags = [t for t in (a.get('tags') or []) if t.startswith('condição:')]
            if cond_tags:
                title_to_cond_tags[title] = cond_tags

guide = {}
skipped = []

for entry in extracted:
    # Only use explicit sections — skip fallback
    if entry['fonte'] != 'explicito' or not entry['pontos_explicitos']:
        skipped.append(entry['title'])
        continue

    title = entry['title']
    parts = entry['pontos_explicitos']  # ordered as extracted from text
    trecho = entry['trecho_original']

    # Derive map points preserving order
    map_points = []
    seen = set()
    for p in parts:
        for pt in PARTE_TO_POINTS.get(p, []):
            if pt not in seen:
                seen.add(pt)
                map_points.append(pt)

    # Build focal_points with label
    focal_points = [{'part': p, 'label': label_part(p)} for p in parts]

    # Normalize condition key from title
    key = 'guia:' + re.sub(r'[^\w]', '_', title.lower())[:60]

    guide[key] = {
        'key': key,
        'label': title,
        'fonte': 'explicito',
        'trecho_meishu': trecho,
        'focal_points': focal_points,
        'map_points': map_points,
        'condition_tags': title_to_cond_tags.get(title, []),
        'source_file': entry['source_file'],
    }

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(guide, f, ensure_ascii=False, indent=2)

print(f'Guia gerado: {len(guide)} condições com pontos verificados')
print(f'Omitidas (sem seção explícita): {len(skipped)}')
print(f'\nArquivo: {OUT}')
print('\nCondições incluídas:')
for k, v in list(guide.items())[:20]:
    pts = ', '.join(fp['label'] for fp in v['focal_points'])
    print(f'  {v["label"]}: {pts}')
print('  ...' if len(guide) > 20 else '')
