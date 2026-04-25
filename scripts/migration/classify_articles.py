# -*- coding: utf-8 -*-
"""
Classify all 632 articles from the 3 problematic tabs into the new
4-tab structure: Fundamentos | Como Aplicar | Por Condição | Por Região do Corpo

Output:
  - classification_proposal.json (full per-article decision + confidence)
  - classification_report.txt (human-readable summary + low-confidence items)
"""
import json, os, re
from collections import Counter, defaultdict

DATA = r'C:\Mioshie_Sites\guia_johrei\data'
OUT_JSON   = os.path.join(os.path.dirname(__file__), 'classification_proposal.json')
OUT_REPORT = os.path.join(os.path.dirname(__file__), 'classification_report.txt')

SOURCE_FILES = [
    ('johrei_vol01_bilingual.json', 'Fundamentos'),
    ('johrei_vol02_bilingual.json', 'Fundamentos'),
    ('johrei_vol03_bilingual.json', 'Q&A'),
    ('johrei_vol04_bilingual.json', 'Q&A'),
    ('johrei_vol05_bilingual.json', 'Q&A'),
    ('johrei_vol06_bilingual.json', 'Q&A'),
    ('johrei_vol07_bilingual.json', 'Q&A'),
    ('johrei_vol08_bilingual.json', 'Q&A'),
    ('johrei_vol09_bilingual.json', 'Q&A'),
    ('johrei_vol10_bilingual.json', 'Q&A'),
    ('pontos_focais_vol01_bilingual.json', 'Pontos Focais'),
    ('pontos_focais_vol02_bilingual.json', 'Pontos Focais'),
]

# ───────────────── classification dictionaries ─────────────────

# Disease/condition keywords (title or content) → Por Condição
DISEASES = [
    # respiratory
    'tuberculose', 'pneumonia', 'asma', 'bronquite', 'gripe', 'resfriado',
    'tosse', 'pleurisia', 'amigdalite', 'sinusite', 'rinite', 'pólipo',
    'difteria', 'coqueluche',
    # cardiovascular
    'hipertensão', 'angina', 'arteriosclerose', 'apoplexia', 'derrame',
    'valvulopatia', 'taquicardia', 'arritmia',
    # cancer / tumors
    'câncer', 'tumor', 'sarcoma', 'leucemia', 'mioma', 'cisto',
    # digestive
    'úlcera', 'gastrite', 'gastroptose', 'apendicite', 'peritonite',
    'icterícia', 'hepatite', 'fígado', 'diabetes', 'obesidade', 'enjoo',
    'vômito', 'diarreia', 'disenteria', 'tifoide', 'tifo', 'hemorroida',
    'fístula', 'prolapso',
    # urinary / renal
    'cálculo', 'nefrite', 'cistite', 'uretrite',
    # gynecology
    'menstruação', 'menstrual', 'esterilidade', 'gravidez', 'aborto',
    'parto', 'lactação', 'puerperal', 'metrite', 'endometrite',
    'amenorreia', 'leucorreia', 'frigidez', 'corrimento',
    # children
    'sarampo', 'escarlatina', 'poliomielite', 'paralisia infantil',
    'meningite', 'encefalite', 'beribéri',
    # neurological / mental
    'epilepsia', 'paralisia', 'hemiplegia', 'doença mental', 'neurastenia',
    'insônia', 'enxaqueca', 'cefaleia', 'tontura', 'vertigem',
    'neuralgia', 'nervo facial',
    # eye / ear
    'miopia', 'catarata', 'glaucoma', 'tracoma', 'conjuntivite',
    'otite', 'zumbido', 'surdez',
    # skin / venereal
    'sífilis', 'gonorreia', 'cancro', 'herpes', 'sarna', 'escabiose',
    'eczema', 'psoríase',
    # other
    'reumatismo', 'beribéri', 'gota', 'anemia', 'hemorragia',
    'enurese', 'ronco', 'queimadura', 'corte',
    'inflamação', 'infecção', 'absceso', 'gangrena',
    # toxinas
    'toxinas medicamentosas', 'intoxicação', 'envenenamento',
]

# Drug names → Por Condição (specifically toxinas medicamentosas)
DRUGS = ['salvarsan', 'albasil', 'jintan', 'adorm', 'metil', 'analgésico',
         'colírio', 'pomada', 'emplastro', 'laxante', 'vacina', 'desinfetante',
         'pasta de dente', 'gargarejo']

# Body region keywords → Por Região do Corpo
BODY_PARTS = [
    'cabeça', 'crânio', 'frontal', 'occipital', 'têmporas', 'vértice',
    'pescoço', 'nuca', 'bulbo raquidiano',
    'ombros', 'ombro',
    'braços', 'braço', 'antebraço', 'cotovelo', 'pulso',
    'mãos', 'mão', 'dedos',
    'costas', 'lombar', 'cintura', 'cóccix', 'coluna',
    'tórax', 'peito', 'mama', 'seios',
    'estômago', 'abdome', 'abdominal', 'umbigo',
    'rins', 'fígado', 'baço', 'pâncreas', 'vesícula',
    'intestinos', 'intestino', 'reto', 'ânus', 'colón',
    'pulmões', 'pulmão',
    'coração',
    'olhos', 'olho', 'pálpebra', 'globo ocular',
    'ouvidos', 'ouvido', 'tímpano',
    'nariz',
    'boca', 'língua', 'dentes', 'dente', 'gengiva',
    'garganta', 'laringe', 'faringe',
    'rosto', 'face', 'maxilar', 'queixo',
    'gânglios linfáticos', 'parótida', 'glândulas',
    'pernas', 'perna', 'joelho', 'panturrilha', 'tornozelo',
    'pés', 'pé', 'planta',
    'útero', 'ovários', 'genital', 'púbis',
    'quadril', 'pélvis',
    'sistema nervoso', 'sistema digestivo', 'sistema circulatório', 'sistema respiratório',
]

# Theory / Fundamentos indicators (title patterns)
FUNDAMENTOS_PATTERNS = [
    r'^(O que é|O que são)\b',
    r'\bnatureza da doença\b',
    r'\bverdade sobre\b',
    r'\bimportância do conhecimento\b',
    r'\bgênese\b',
    r'\bpor que\b',
    r'\bracionalidade do johrei\b',
    r'\bprincípio do johrei\b',
    r'\bmedicina espiritual\b',
    r'\bsalvação\b',
    r'\bessência\b',
    r'\bsignificado\b',
    r'\bteoria\b',
    r'\bfundament',
    r'\bpecad',
    r'\bantepassad',
    r'\bespírit(?!o santo)',
    r'\boração\b',
    r'\btemplo\b',
    r'\bofício relig',
    r'\bboas ações\b',
    r'\bsofrimento\b',
    r'\bdoutrin',
    r'\balma\b',
    r'\bgratidão\b',
]

# Como Aplicar indicators (technique / how-to)
COMO_APLICAR_PATTERNS = [
    r'\b(como ministrar|como aplicar|método de johrei)\b',
    r'\bordem (do|de|correta)\b',
    r'\bfrequência\b',
    r'\bduração\b',
    r'\bquanto tempo\b',
    r'\bcompetência\b',
    r'\bministrante\b',
    r'\bministrar\b',
    r'\bpalma\b',
    r'\bdistância\b',
    r'\bpostura\b',
    r'\btécnica\b',
    r'\bse(quê|quen)cia\b',
    r'\bposição\b',
    r'\bautojohrei\b',
    r'\bauto-?johrei\b',
    r'\bjohrei (à|a) distância\b',
    r'\bjohrei em\b',
    r'\bcuidados\b.*\bjohrei\b',
    r'\brelaxar (a )?força\b',
    r'\bforça de vontade\b',
    r'\bafastar a palma\b',
    r'\bser gentil\b',
    r'\bimparcial\b',
    r'\bformas e métodos\b',
    r'\bcuidados\b',
    r'\bgestante\b',
    r'\bcrianças\b.*\bjohrei\b',
    r'\bjohrei\b.*\b(animais|crianças|gestante)\b',
    r'\bcalma\b.*\bministrar\b',
    r'\bquanto mais.*menos\b',
    r'\bdesesperad',
    r'\bisshoken',
    r'\b(no|na|para|sobre)\s+momento\b',
]

# Patient case patterns ("Homem com…", "Mulher de … anos…") → Por Condição
PATIENT_CASE = re.compile(
    r'^(Homem|Mulher|Menino|Menina|Bebê|Criança|Jovem|Senhor|Senhora|Idoso|Idosa|Pessoa)'
    r'\b.*\b(com|de|que|sofren|aprese)',
    re.IGNORECASE
)

DISEASE_RE       = re.compile(r'\b(' + '|'.join(map(re.escape, DISEASES)) + r')\b', re.IGNORECASE)
DRUG_RE          = re.compile(r'\b(' + '|'.join(map(re.escape, DRUGS)) + r')\b', re.IGNORECASE)
BODY_RE          = re.compile(r'\b(' + '|'.join(map(re.escape, BODY_PARTS)) + r')\b', re.IGNORECASE)
FUND_RES         = [re.compile(p, re.IGNORECASE) for p in FUNDAMENTOS_PATTERNS]
COMO_RES         = [re.compile(p, re.IGNORECASE) for p in COMO_APLICAR_PATTERNS]

# ───────────────── classifier ─────────────────

def classify(art, source_file):
    title = (art.get('title_pt') or '').strip()
    content = (art.get('content_pt') or '')[:600]
    full_text = title + ' ' + content
    tags = [t.lower() for t in (art.get('tags') or [])]

    score = {'fundamentos': 0, 'como_aplicar': 0, 'por_condicao': 0, 'por_regiao': 0}

    # ── Fundamentos signals (title weight x4, content x1) ──
    for r in FUND_RES:
        if r.search(title):
            score['fundamentos'] += 4
        elif r.search(content):
            score['fundamentos'] += 1

    # ── Como Aplicar signals ──
    for r in COMO_RES:
        if r.search(title):
            score['como_aplicar'] += 4
        elif r.search(content):
            score['como_aplicar'] += 1

    # ── Por Condição: diseases/drugs in title ──
    title_diseases = DISEASE_RE.findall(title)
    title_drugs    = DRUG_RE.findall(title)
    if title_diseases:
        score['por_condicao'] += 5 * len(title_diseases)
    if title_drugs:
        score['por_condicao'] += 5 * len(title_drugs)
    # Patient case in title
    if PATIENT_CASE.match(title):
        score['por_condicao'] += 6
    # toxinas tag
    if 'toxinas_medicamentosas' in tags or 'toxinas' in tags:
        score['por_condicao'] += 2

    # ── Por Região: body parts in title ──
    title_parts = BODY_RE.findall(title)
    if title_parts:
        score['por_regiao'] += 4 * len(title_parts)
    # If MULTIPLE diverse parts mentioned in title → strong region signal (e.g. "Cabeça, Pescoço e Ombros")
    if len(set(p.lower() for p in title_parts)) >= 2:
        score['por_regiao'] += 3

    # body-part tags
    body_tag_count = sum(1 for t in tags if t in {p.lower().replace(' ','_') for p in BODY_PARTS})
    if body_tag_count > 0:
        score['por_regiao'] += body_tag_count

    # ── Tie-breakers / refinements ──

    # Source file hints (weak signals)
    if 'pontos_focais_vol02' in source_file:
        # vol 2 is very anatomy-heavy in items 1-16 then disease-heavy after
        # tag with body without disease in title → region; with disease → condition
        if title_parts and not title_diseases and not title_drugs:
            score['por_regiao'] += 2

    # Volume 5 is mostly about ombros + heart diseases → split correctly
    # Volume 8-10 are anatomy-organized (gastric/head/eyes-ears-nose)
    if 'johrei_vol0' in source_file:
        vol = int(source_file[len('johrei_vol0'):len('johrei_vol0')+1])
        if vol in (8, 9, 10):
            # default lean toward Por Região (volume's organizing axis)
            if title_parts:
                score['por_regiao'] += 1

    # Disease + body part both present → Por Condição wins (specific case)
    if title_diseases and title_parts:
        score['por_condicao'] += 2

    # No signals → mark for manual review (don't default to Por Condição)
    if max(score.values()) == 0:
        if 'vol01' in source_file or 'vol02' in source_file:
            score['fundamentos'] = 1
        elif 'pontos_focais' in source_file:
            score['por_regiao'] = 1
        else:
            # Q&A volumes — too varied to default; check tags
            if any(t in tags for t in ['johrei', 'pontos_vitais', 'purificação', 'dissolução', 'técnicas_johrei']):
                score['como_aplicar'] = 1
            else:
                score['por_condicao'] = 1

    # decide
    best = max(score.items(), key=lambda x: x[1])
    target = best[0]
    top = best[1]
    second = sorted(score.values(), reverse=True)[1] if len(score) > 1 else 0
    margin = top - second
    confidence = 'high' if margin >= 4 else ('medium' if margin >= 2 else 'low')

    return {
        'target': target,
        'confidence': confidence,
        'scores': score,
        'margin': margin,
    }


# ───────────────── main ─────────────────

results = []
distribution = Counter()
confidence_dist = Counter()
low_conf_items = []

for fname, original_section in SOURCE_FILES:
    path = os.path.join(DATA, fname)
    with open(path, encoding='utf-8') as f:
        articles = json.load(f)
    for idx, a in enumerate(articles):
        res = classify(a, fname)
        results.append({
            'source_file': fname,
            'index': idx,
            'id': a.get('id', ''),
            'title_pt': a.get('title_pt', ''),
            'original_section': original_section,
            'target_tab': res['target'],
            'confidence': res['confidence'],
            'scores': res['scores'],
            'margin': res['margin'],
        })
        distribution[res['target']] += 1
        confidence_dist[res['confidence']] += 1
        if res['confidence'] == 'low':
            low_conf_items.append(results[-1])

# Save full proposal
with open(OUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

# Build report
TAB_LABELS = {
    'fundamentos':   'Fundamentos',
    'como_aplicar':  'Como Aplicar',
    'por_condicao':  'Por Condição',
    'por_regiao':    'Por Região do Corpo',
}

lines = []
lines.append('=== CLASSIFICATION REPORT ===\n')
lines.append('Total artigos analisados: ' + str(len(results)))
lines.append('')
lines.append('--- Distribuicao proposta por aba ---')
for tab in ['fundamentos', 'como_aplicar', 'por_condicao', 'por_regiao']:
    lines.append('  ' + TAB_LABELS[tab] + ': ' + str(distribution[tab]))
lines.append('')
lines.append('--- Confianca da classificacao ---')
for c in ['high', 'medium', 'low']:
    lines.append('  ' + c + ': ' + str(confidence_dist[c]))
lines.append('')
lines.append('--- Mudancas em relacao a estrutura atual ---')
moved = sum(1 for r in results if r['target_tab'] != {
    'Fundamentos': 'fundamentos',
    'Q&A': 'por_condicao',     # default mapping; will show changes
    'Pontos Focais': 'por_regiao',
}.get(r['original_section'], ''))
lines.append('  (estimativa, baseada em mapeamento direto das abas atuais)')
lines.append('')

# Cross-tab: source -> target
cross = defaultdict(Counter)
for r in results:
    cross[r['source_file']][r['target_tab']] += 1
lines.append('--- Origem -> Destino ---')
for src in sorted(cross.keys()):
    lines.append('\n  ' + src + ':')
    for tab, n in sorted(cross[src].items(), key=lambda x: -x[1]):
        lines.append('    -> ' + TAB_LABELS[tab] + ': ' + str(n))

lines.append('')
lines.append('=== ITENS LOW-CONFIDENCE PARA REVISAO MANUAL (' + str(len(low_conf_items)) + ' itens) ===')
for item in low_conf_items[:60]:
    lines.append('  [' + item['source_file'] + ' #' + str(item['index']+1) + '] '
                 + '-> ' + TAB_LABELS[item['target_tab']]
                 + ' (margin=' + str(item['margin']) + ')')
    lines.append('    "' + item['title_pt'][:100] + '"')
if len(low_conf_items) > 60:
    lines.append('  ... (mais ' + str(len(low_conf_items) - 60) + ' itens no JSON completo)')

with open(OUT_REPORT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print('\n'.join(lines))
print('\nArquivo completo: ' + OUT_JSON)
print('Relatorio:        ' + OUT_REPORT)
