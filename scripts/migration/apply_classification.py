# -*- coding: utf-8 -*-
"""
Aplica a classificacao gerada por classify_articles.py atraves de um
arquivo de override (tab_overrides.json) consumido pelo frontend do guia_johrei.

Vantagens:
- Nao move artigos entre arquivos (preserva fontes canonicas)
- Facil de reverter (basta apagar o override file)
- Base para o admin futuro: cada decisao manual sobrescreve o automatico

Saida:
  data/tab_overrides.json   <- mapa article_key -> target_tab
"""
import json, os

PROPOSAL = os.path.join(os.path.dirname(__file__), 'classification_proposal.json')
OUT      = r'C:\Mioshie_Sites\guia_johrei\data\tab_overrides.json'

# Map estimated original-section + source_file → tab_id used by core.js
ORIGINAL_TAB = {
    'Fundamentos':   'fundamentos',
    'Q&A':           'qa',
    'Pontos Focais': 'pontos_focais',
}

with open(PROPOSAL, encoding='utf-8') as f:
    items = json.load(f)

overrides = {}
stats = {'fundamentos': 0, 'como_aplicar': 0, 'por_condicao': 0, 'por_regiao': 0, 'kept': 0}

for it in items:
    src = it['source_file'].replace('_bilingual.json', '')
    idx = it['index']
    target = it['target_tab']
    original_tab = ORIGINAL_TAB.get(it['original_section'], '')

    # Only emit override when target differs from where the article naturally lives.
    # core.js will fall back to the volume's default tab if no override.
    natural_target = original_tab
    # special: vols 1-2 default fundamentos, vols 3-10 default qa, pontos_focais default pontos_focais
    if natural_target == 'qa':
        natural_target = 'qa'  # we'll need special handling - see below
    # We always emit the target since core.js will then unambiguously use it
    key = src + ':' + str(idx)
    overrides[key] = target
    stats[target] += 1

# Save
manifest = {
    'version': 1,
    'generated_by': 'apply_classification.py',
    'description': (
        'Mapa article_key -> target_tab. Sobrescreve a aba derivada do '
        'volume de origem. Chave: "<source_file_sem_bilingual_json>:<index>" '
        '(index zero-based)'
    ),
    'targets': ['fundamentos', 'como_aplicar', 'por_condicao', 'por_regiao'],
    'overrides': overrides,
    'stats': stats,
}

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print('Override gerado: ' + OUT)
print('Total entradas: ' + str(len(overrides)))
print('Distribuicao:')
for k, v in stats.items():
    print('  ' + k + ': ' + str(v))
