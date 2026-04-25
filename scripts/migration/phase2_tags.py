# -*- coding: utf-8 -*-
"""
Phase 2 — Padroniza tags em 3 eixos: parte: | condição: | técnica:
Aplica nos JSONs dos volumes principais (não toca estudo_aprofundado).
"""
import json, os, re, glob
from collections import Counter

DATA = r'C:\Mioshie_Sites\guia_johrei\data'

# ── Mapeamento: tag_antiga → [nova_tag, ...]  (lista vazia = remover) ──
TAG_MAP = {
    # ── PARTE DO CORPO ──
    'cabeça':             ['parte:cabeça'],
    'pescoço':            ['parte:pescoço'],
    'ombros':             ['parte:ombros'],
    'bulbo_raquidiano':   ['parte:bulbo_raquidiano'],
    'região_occipital':   ['parte:região_occipital'],
    'rins':               ['parte:rins'],
    'mãos':               ['parte:mãos'],
    'estômago':           ['parte:estômago'],
    'olhos':              ['parte:olhos'],
    'ouvidos':            ['parte:ouvidos'],
    'nariz':              ['parte:nariz'],
    'garganta':           ['parte:garganta'],
    'pulmões':            ['parte:pulmões'],
    'coração':            ['parte:coração'],
    'intestinos':         ['parte:intestinos'],
    'fígado':             ['parte:fígado'],
    'costas':             ['parte:costas'],
    'cintura':            ['parte:lombar'],
    'pernas':             ['parte:pernas'],
    'pés':                ['parte:pés'],
    'boca':               ['parte:boca'],
    'dentes':             ['parte:dentes'],
    'língua':             ['parte:língua'],
    'amígdalas':          ['parte:amígdalas'],
    'glândulas_linfáticas': ['parte:glândulas_linfáticas'],
    'parótida':           ['parte:parótida'],
    'sistema_circulatório': ['parte:sistema_circulatório'],
    'sistema_digestivo':  ['parte:sistema_digestivo'],
    'sistema_nervoso':    ['parte:sistema_nervoso'],
    'sistema_respiratório': ['parte:sistema_respiratório'],
    'órgãos_internos':    ['parte:órgãos_internos'],
    'região_inferior':    ['parte:região_inferior'],
    'região_superior':    ['parte:região_superior'],

    # ── CONDIÇÃO ──
    'dor':                     ['condição:dor'],
    'febre':                   ['condição:febre'],
    'catarro':                 ['condição:catarro'],
    'rigidez':                 ['condição:rigidez'],
    'induração':               ['condição:induração'],
    'inchaço':                 ['condição:inchaço'],
    'peso':                    ['condição:peso'],
    'sangramento':             ['condição:sangramento'],
    'toxinas':                 ['condição:toxinas'],
    'toxinas_medicamentosas':  ['condição:toxinas_medicamentosas'],
    'tuberculose':             ['condição:tuberculose'],
    'asma':                    ['condição:asma'],
    'câncer':                  ['condição:câncer'],
    'pneumonia':               ['condição:pneumonia'],
    'meningite':               ['condição:meningite'],
    'apendicite':              ['condição:apendicite'],
    'anemia':                  ['condição:anemia'],
    'diabetes':                ['condição:diabetes'],
    'diarreia':                ['condição:diarreia'],
    'disenteria':              ['condição:disenteria'],
    'paralisia':               ['condição:paralisia'],
    'hipertensão':             ['condição:hipertensão'],
    'tontura':                 ['condição:tontura'],
    'insônia':                 ['condição:insônia'],
    'neurastenia':             ['condição:neurastenia'],
    'beribéri':                ['condição:beribéri'],
    'inapetência':             ['condição:inapetência'],
    'fadiga':                  ['condição:fadiga'],
    'falta_de_ar':             ['condição:falta_de_ar'],
    'náusea':                  ['condição:náusea'],
    'vômito':                  ['condição:vômito'],
    'tosse':                   ['condição:tosse'],
    'resfriado':               ['condição:resfriado'],
    'coceira':                 ['condição:coceira'],
    'otite':                   ['condição:otite'],
    'amigdalite':              ['condição:amigdalite'],
    'sinusite':                ['condição:sinusite'],
    'miopia':                  ['condição:miopia'],
    'catarata':                ['condição:catarata'],
    'glaucoma':                ['condição:glaucoma'],
    'amaurose':                ['condição:amaurose'],
    'encefalite':              ['condição:encefalite'],
    'epilepsia':               ['condição:epilepsia'],
    'peritonite':              ['condição:peritonite'],
    'pleurisia':               ['condição:pleurisia'],
    'tifo':                    ['condição:tifo'],
    'sarampo':                 ['condição:sarampo'],
    'coqueluche':              ['condição:coqueluche'],
    'reumatismo':              ['condição:reumatismo'],
    'arteriosclerose':         ['condição:arteriosclerose'],
    'doença_de_basedow':       ['condição:bócio'],
    'dissolução':              ['condição:dissolução'],

    # ── TÉCNICA / MÉTODO ──
    'purificação':     ['técnica:purificação'],
    'pontos_vitais':   ['técnica:pontos_vitais'],
    'autodiagnóstico': ['técnica:autodiagnóstico'],

    # ── REMOVER (muito amplos ou ruído) ──
    'johrei':        [],   # 382 ocorrências — tudo é sobre johrei, não diferencia nada
    'contradição':   [],   # 1 ocorrência — ruído
    'médicos':       [],   # 1 ocorrência — ruído
    'remédios':      ['condição:toxinas_medicamentosas'],  # 1 ocorrência — mescla em toxinas
    'bactérias':     ['condição:toxinas'],                 # 1 — relacionado a toxinas
    'antibióticos':  ['condição:toxinas_medicamentosas'],  # 1 — mescla
    'bronquite':     ['condição:bronquite'],
    'resistência':   [],   # 1 — vago
    'mácula_espiritual': [],  # 1 — vago/espiritual
}

# ── Inferência de tags por título (para artigos sem tags) ──
BODY_INFER = [
    (r'\bcabeça\b',                'parte:cabeça'),
    (r'\b(pescoço|nuca|cervical)\b', 'parte:pescoço'),
    (r'\bombros?\b',               'parte:ombros'),
    (r'\bbulbo\b',                 'parte:bulbo_raquidiano'),
    (r'\brins?\b|renal',           'parte:rins'),
    (r'\bestômago|gástric',        'parte:estômago'),
    (r'\bolhos?\b|ocular',         'parte:olhos'),
    (r'\bouvidos?\b',              'parte:ouvidos'),
    (r'\bnariz\b|nasal|rinite',    'parte:nariz'),
    (r'\bgarganta\b|faríng|laríng','parte:garganta'),
    (r'\bpulmões?\b|pulmonar',     'parte:pulmões'),
    (r'\bcoração\b|cardí',         'parte:coração'),
    (r'\bintestinos?\b|intestinal','parte:intestinos'),
    (r'\bfígado\b|hepático',       'parte:fígado'),
    (r'\blombar\b|cintura\b|costas\b','parte:costas'),
    (r'\bpernas?\b',               'parte:pernas'),
    (r'\bdentes?\b|dental|dentár', 'parte:dentes'),
    (r'\bgânglios?\b|linfátic',    'parte:glândulas_linfáticas'),
]
COND_INFER = [
    (r'\btoxinas? med',    'condição:toxinas_medicamentosas'),
    (r'\btoxinas?\b',      'condição:toxinas'),
    (r'\btuberculose\b',   'condição:tuberculose'),
    (r'\bcâncer\b',        'condição:câncer'),
    (r'\basma\b',          'condição:asma'),
    (r'\bpneumonia\b',     'condição:pneumonia'),
    (r'\bdiabetes\b',      'condição:diabetes'),
    (r'\bparalisia\b',     'condição:paralisia'),
    (r'\bpurificação\b',   'técnica:purificação'),
    (r'\bpontos? vitais?\b','técnica:pontos_vitais'),
    (r'\bautodiagnós',     'técnica:autodiagnóstico'),
    (r'\bdissolução\b',    'condição:dissolução'),
    (r'\binduraç',         'condição:induração'),
    (r'\brigidez\b',       'condição:rigidez'),
]

def infer_tags(title):
    t = title.lower()
    tags = set()
    for pattern, tag in BODY_INFER + COND_INFER:
        if re.search(pattern, t):
            tags.add(tag)
    return sorted(tags)

VALID_AXES = ('parte:', 'condição:', 'técnica:')

def migrate_tags(old_tags):
    new = set()
    for tag in (old_tags or []):
        # Already migrated — keep as-is
        if any(tag.startswith(ax) for ax in VALID_AXES):
            new.add(tag)
            continue
        # Remove leftover ?:-prefix from partial previous runs
        clean = tag.lstrip('?:') if tag.startswith('?:') else tag
        mapped = TAG_MAP.get(clean)
        if mapped is None:
            new.add('?:' + clean)
        else:
            new.update(mapped)
    return sorted(new)

# ── Processar arquivos ──
files = [f for f in os.listdir(DATA)
         if f.endswith('_bilingual.json') and not f.startswith('estudo_')]

total_migrated = 0
total_inferred = 0
unknown_tags = Counter()

for fname in files:
    path = os.path.join(DATA, fname)
    with open(path, encoding='utf-8') as f:
        articles = json.load(f)

    changed = 0
    for a in articles:
        old_tags = a.get('tags') or []

        # track unknown
        for t in old_tags:
            if t not in TAG_MAP:
                unknown_tags[t] += 1

        new_tags = migrate_tags(old_tags)

        # infer for articles with no tags
        if not old_tags and not new_tags:
            inferred = infer_tags(a.get('title_pt', ''))
            if inferred:
                new_tags = inferred
                total_inferred += 1

        if new_tags != old_tags:
            a['tags'] = new_tags
            changed += 1

    if changed:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(articles, f, ensure_ascii=False, indent=2)
        total_migrated += changed
        print(fname + ': ' + str(changed) + ' artigos atualizados')

print('\nTotal migrados: ' + str(total_migrated))
print('Tags inferidas (sem tag -> nova): ' + str(total_inferred))

if unknown_tags:
    print('\nTags NAO mapeadas (prefixadas com ?:) :')
    for t, n in unknown_tags.most_common():
        print('  ' + t + ': ' + str(n))
else:
    print('\nTodas as tags foram mapeadas!')

# Verify new tag structure
print('\n=== Verificacao — novas tags por eixo ===')
parte, cond, tec, unknown = Counter(), Counter(), Counter(), Counter()
for fname in files:
    with open(os.path.join(DATA, fname), encoding='utf-8') as f:
        for a in json.load(f):
            for t in (a.get('tags') or []):
                if t.startswith('parte:'): parte[t] += 1
                elif t.startswith('condição:'): cond[t] += 1
                elif t.startswith('técnica:'): tec[t] += 1
                else: unknown[t] += 1

print('Eixo parte: (' + str(len(parte)) + ' tags) — top 10:')
for t, n in parte.most_common(10): print('  ' + t + ': ' + str(n))
print('Eixo condição: (' + str(len(cond)) + ' tags) — top 10:')
for t, n in cond.most_common(10): print('  ' + t + ': ' + str(n))
print('Eixo técnica: (' + str(len(tec)) + ' tags):')
for t, n in tec.most_common(): print('  ' + t + ': ' + str(n))
if unknown:
    print('Sem eixo (' + str(len(unknown)) + '):')
    for t, n in unknown.most_common(10): print('  ' + t + ': ' + str(n))
