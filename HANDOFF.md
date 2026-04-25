# Handoff — Guia de Atendimento Johrei

## Estado atual

Branch: `feat/guia-atendimento-mapa` (4 commits acima de `main`)

```
30fa612  chore: add migration scripts under scripts/migration/
a08b3ed  feat: add condition guide integrated with body map
32b65ff  refactor: reorganize tabs by user intent and 3-axis tag system
54383cc  feat: add Estudo Aprofundado tab with 37 publication files
```

## O que foi feito

### 1. Estudo Aprofundado (5ª aba)
- 688 ensinamentos individuais extraídos do Mioshie Zenshu Vol. 2
- 37 arquivos JSON, um por publicação (JK1–JK26, JKzyunzyo, partes do
  corpo, JdokusoIDOU)
- Cada card mostra a citação de Meishu-Sama com título extraído

### 2. Reorganização de abas (5 abas por intenção do usuário)
| Aba | Pergunta que responde | Artigos |
|-----|----------------------|---------|
| Fundamentos | "O que é Johrei?" | 30 |
| Como Aplicar | "Qual a técnica?" | 33 |
| Por Condição | "Tenho um caso de X" | 416 |
| Por Região do Corpo | "Onde aplicar / dói aqui" | 153 |
| Estudo Aprofundado | "Ensinamentos originais" | 688 |

Implementação via `data/tab_overrides.json` — fontes canônicas intocadas.

### 3. Sistema de tags em 3 eixos
- `parte:cabeça`, `parte:ombros`, ... (33 tags, 1856 ocorrências)
- `condição:tuberculose`, `condição:dor`, ... (53 tags, 1994)
- `técnica:purificação`, `técnica:pontos_vitais`, ... (3 tags, 372)

### 4. Guia de Atendimento na aba Mapa
- Sidebar com 88 condições verificadas (extraídas das seções
  `**[Pontos de Johrei]**` dos artigos de Pontos Focais — sem inferência)
- Selecionar uma condição:
  1. Pontos pulsam no diagrama do corpo
  2. Citação literal de Meishu-Sama na sidebar
  3. Ensinamentos relacionados listados abaixo do mapa

### 5. Refinamentos UX da busca de condições (2026-04-25)
- Busca acento-insensitive (`normalize()` com NFD + strip combining marks)
- Empty state com botão "limpar busca" quando query zera resultados
- Botão X (`::-webkit-search-cancel-button`) com SVG consistente cross-browser
- Card de citação preservado no topo enquanto usuário digita na busca
- Autofocus automático no input ao trocar pra aba `mapa` — apenas desktop
  (≥1024px); mobile fica de fora pra evitar abrir o teclado virtual
- Spec: `docs/superpowers/specs/2026-04-25-guia-sidebar-search-refinements-design.md`
- Plano: `docs/superpowers/plans/2026-04-25-guia-sidebar-search-refinements.md`

## Estrutura

```
guia_johrei/
├── data/
│   ├── index.json                    # tabs + categories
│   ├── tab_overrides.json            # article→tab routing
│   ├── guia_atendimento.json         # 88 conditions × focal points
│   ├── johrei_vol{01..10}_bilingual.json
│   ├── pontos_focais_vol{01..02}_bilingual.json
│   └── estudo_aprofundado_*_bilingual.json (37 files)
├── js/
│   ├── core.js              # loads data + applies tab_overrides
│   ├── data.js              # CONFIG.modes.ensinamentos.cats (5 tabs)
│   ├── ui-renderer.js       # renders body map sidebar with conditions
│   ├── body-map-helpers.js  # body map points (data: por_regiao)
│   ├── guide.js             # condition selector + citation logic
│   └── ...
├── scripts/migration/       # helpers used to build the data
└── HANDOFF.md               # this file
```

## Como rodar

Servidor estático qualquer:
```bash
python -m http.server 8004
# ou
./fast_start.sh
```

Acesso: http://localhost:8004

## Próximos passos sugeridos

### Fase 4 — Admin para curadoria manual
Permitir que administradores movam artigos entre abas sem editar JSON.
Como `tab_overrides.json` já existe como camada de override, basta uma UI
que edite esse arquivo (preferencialmente sincronizado com Supabase).

### Refinamentos do guia
- ✅ ~~Busca dentro da sidebar de condições~~ (concluído 2026-04-25 —
  ver "Refinamentos UX da busca de condições" acima)
- Mostrar contadores de ensinamentos por região no mapa
- Cross-link: card de condição → "Ver ensinamentos originais em
  Estudo Aprofundado"

### Validação manual
- Revisar as 157 classificações de baixa confiança (CSV em
  `scripts/migration/classify_articles.py` regenera o relatório)
- Verificar que cada condição em `guia_atendimento.json` tem citação
  correta de Meishu-Sama (88 condições)

## Re-rodar migrações

Se algum dado for atualizado, os scripts em `scripts/migration/` permitem
regenerar tudo:

```bash
cd scripts/migration

# 1. Limpar títulos (referências bibliográficas)
python clean_all_titles.py

# 2. Migrar tags para 3 eixos
python phase2_tags.py
python fix_tags_prefix.py

# 3. Reclassificar artigos
python classify_articles.py
python apply_classification.py

# 4. Reconstruir Estudo Aprofundado
python gen_estudo_aprofundado_v2.py
python fix_estudo_titles.py

# 5. Reconstruir Guia de Atendimento
python extract_focal_points.py
python build_guide_precise.py
```

## Notas técnicas

- Service Worker foi removido (`js/main.js` agora desregistra SWs ativos)
- Versões de cache nos scripts/CSS bumpadas (`?v=N`) — incrementar ao
  alterar arquivos
- O `bodyPointSidebarList` precisa de regra CSS específica para escapar
  o `overflow:visible !important` aplicado em `#bodyMapContainer div`
  (ver `style.css` linha ~1078)
