# -*- coding: utf-8 -*-
"""
Extrai pontos focais EXPLICITAMENTE ensinados por Meishu-Sama
dos artigos de Pontos Focais, buscando seções como:
  **[Pontos de Johrei]** corpo...
  **Pontos Vitais do Johrei** corpo...
  Método de Tratamento ... corpo...

Para cada condição (título do artigo), produz:
  - pontos_explicitos: lista de partes mencionadas na seção de instrução
  - trecho_original: o texto original para verificação
  - fonte: "explicito" ou "tags" (fallback)

Saida: extracted_focal_points.json para revisão/edição manual
"""
import json, re, os

FILES = [
    r'C:\Mioshie_Sites\guia_johrei\data\pontos_focais_vol01_bilingual.json',
    r'C:\Mioshie_Sites\guia_johrei\data\pontos_focais_vol02_bilingual.json',
]
OUT = os.path.join(os.path.dirname(__file__), 'extracted_focal_points.json')

# Body part names in PT → normalized tag
BODY_NAMES = {
    r'bulbo raquidiano|bulbo\b':       'parte:bulbo_raquidiano',
    r'região occipital|occipital':      'parte:região_occipital',
    r'vértice|alto da cabeça|cabeça':   'parte:cabeça',
    r'região frontal|frontal':          'parte:cabeça',
    r'pescoço|região cervical|cervical':'parte:pescoço',
    r'nuca':                            'parte:região_occipital',
    r'\bombros?\b':                     'parte:ombros',
    r'glândulas linfáticas|linfáticas|linfonodos': 'parte:glândulas_linfáticas',
    r'parótida':                        'parte:parótida',
    r'amígdalas|amigdalas':             'parte:amígdalas',
    r'\bolhos?\b|ocular':               'parte:olhos',
    r'\bouvidos?\b':                    'parte:ouvidos',
    r'\bnariz\b|nasal':                 'parte:nariz',
    r'\bboca\b':                        'parte:boca',
    r'garganta|faringe|laringe':        'parte:garganta',
    r'\brins?\b|região renal|renal':    'parte:rins',
    r'fígado|hepático':                 'parte:fígado',
    r'\bestômago\b|gástrico|gástrica':  'parte:estômago',
    r'\bcoração\b|cardíac':             'parte:coração',
    r'pulmões?|pulmonar':               'parte:pulmões',
    r'intestinos?|abdominal':           'parte:intestinos',
    r'lombar|sacro|região lombar':      'parte:lombar',
    r'\bcostas\b|coluna':               'parte:costas',
    r'\bmãos?\b|palma|punho':           'parte:mãos',
    r'\bpés?\b|tornozelo':              'parte:pés',
    r'\bpernas?\b|joelho|coxa':         'parte:pernas',
    r'baixo(?:\s+do)?\s+ventre|região inferior|abdômen inferior|região abdominal': 'parte:região_inferior',
    r'tórax|peito|região torácica':     'parte:região_superior',
}
BODY_RES = [(re.compile(k, re.IGNORECASE), v) for k, v in BODY_NAMES.items()]

# Patterns that mark a focal point instruction section
SECTION_MARKERS = [
    re.compile(r'\*\*\[?Pontos?\s+(?:de|Vitais?(?:\s+do)?)\s+Johrei\]?\*\*[:\s]*([^\n*]{10,})', re.IGNORECASE),
    re.compile(r'\*\*Pontos?\s+Vitais?[:\s]*\*\*\s*([^\n*]{10,})', re.IGNORECASE),
    re.compile(r'Ponto\s+Vital\s+do\s+Johrei[:\s]+([^\n.]{10,})', re.IGNORECASE),
    re.compile(r'deve[-\s]se\s+ministrar\s+(?:no?s?|na?s?|em)\s+([^.;]{10,80})', re.IGNORECASE),
    re.compile(r'Johrei\s+(?:no?s?|na?s?|em)\s+([^.,;]{5,60})(?:[,.])', re.IGNORECASE),
    re.compile(r'\*\*\[?Pontos? de Tratamento\]?\*\*[:\s]*([^\n*]{10,})', re.IGNORECASE),
]

def extract_parts_from_text(text):
    """Find body part tags mentioned in a text fragment."""
    found = []
    seen = set()
    for pattern, tag in BODY_RES:
        if pattern.search(text) and tag not in seen:
            seen.add(tag)
            found.append(tag)
    return found

def find_explicit_section(content):
    """Try to find an explicit focal point section and extract body parts."""
    for pat in SECTION_MARKERS:
        m = pat.search(content)
        if m:
            snippet = m.group(0)
            # Also grab 200 chars after the match for context
            start = m.start()
            full_snippet = content[start:start+400]
            parts = extract_parts_from_text(full_snippet)
            if parts:
                return parts, full_snippet.strip()[:300]
    return [], ''

results = []

for path in FILES:
    with open(path, encoding='utf-8') as f:
        arts = json.load(f)
    for a in arts:
        content = a.get('content_pt') or ''
        title = a.get('title_pt') or ''
        tags = a.get('tags') or []
        tag_parts = [t for t in tags if t.startswith('parte:')]

        explicit_parts, trecho = find_explicit_section(content)

        entry = {
            'title': title,
            'source_file': os.path.basename(path),
            'fonte': 'explicito' if explicit_parts else 'tags',
            'pontos_explicitos': explicit_parts,
            'pontos_tags': tag_parts,
            'trecho_original': trecho,
            'verificado': False,
            'pontos_finais': explicit_parts if explicit_parts else tag_parts,
        }
        results.append(entry)

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

# Report
explicit_count = sum(1 for r in results if r['fonte'] == 'explicito')
print(f'Total artigos processados: {len(results)}')
print(f'Com pontos explícitos: {explicit_count} ({explicit_count*100//len(results)}%)')
print(f'Apenas tags (fallback): {len(results)-explicit_count}')
print(f'\nArquivo: {OUT}')
print('\n=== Exemplos com pontos explícitos ===')
for r in results:
    if r['fonte'] == 'explicito' and r['pontos_explicitos']:
        pts = ', '.join(p.replace('parte:','') for p in r['pontos_explicitos'])
        print(f'  [{r["title"][:50]}]')
        print(f'    Pontos: {pts}')
        print(f'    Trecho: {r["trecho_original"][:120]}')
        print()
        if results.index(r) > 10:
            break
