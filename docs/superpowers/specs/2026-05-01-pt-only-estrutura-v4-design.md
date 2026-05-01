# Design: PT-Only + Estrutura MD_PT_v4

**Data:** 2026-05-01  
**Branch:** `feat/pt-only-estrutura-v4`  
**Status:** Aprovado

---

## Contexto

O site `guia_johrei` exibia conteúdo bilíngue JP/PT com toggle de idioma. A organização anterior das tabs (`cases_qa`, `pontos_focais`) não funcionava bem. O usuário criou 4 arquivos Markdown em `Markdown/MD_PT_v4/` com a nova organização definitiva do conteúdo em PT-BR.

Este design:
1. Remove o display bilíngue JP/PT (UI only — dados JP permanecem nos JSON)
2. Substitui tabs `cases_qa` e `pontos_focais` por 4 novas tabs estruturadas
3. Mantém intocadas as tabs `estudo_aprofundado` e `mapa`

---

## Tabs resultantes

| ID | Nome exibido | Fonte MD |
|---|---|---|
| `fundamentos` | Fundamentos | `Aba Fundamentos.md` |
| `como_aplicar` | Como Aplicar | `Aba Pratica.md` |
| `critica_farmacologia` | Crítica à Farmacologia | `Aba Crítica Farmacologica.md` |
| `por_condicao` | Por Condição | `Aba Orientações por Purificação.md` |
| `estudo_aprofundado` | Estudo Aprofundado | *(inalterado)* |
| `mapa` | Mapa | *(inalterado)* |

---

## Schema JSON (novo)

Arquivo por tab: `data/tab_<id>.json`

```json
{
  "id": "por_condicao",
  "aba": "Por Condição",
  "hero": "texto intro do tab (opcional)",
  "sub_abas": [
    {
      "id": "tuberculose",
      "titulo": "Tuberculose",
      "hero": "texto intro desta sub-aba (opcional)",
      "categorias": [
        {
          "titulo": "I. Sobre o Johrei em Pacientes com Tuberculose",
          "artigos": [
            {
              "id": "por_condicao_tuberculose_01",
              "titulo": "O Ponto Vital do Johrei é o Ombro",
              "fonte": "Mioshie-shū n.º 23, pág. 47",
              "conteudo": "Certa vez, eu disse que o Johrei..."
            }
          ]
        }
      ]
    }
  ]
}
```

**Campos opcionais:** `hero` (tab e sub-aba), `titulo` de categoria. Tabs sem sub-abas usam um único sub-aba com `titulo: null`.

**Regras de parsing a partir do MD:**
- `# \[Aba\] Título` → `aba` + `id` (slug)
- `\[Hero\] texto` → `hero` do nível corrente (tab se antes de qualquer Sub-aba; sub-aba se dentro de uma)
- `# \[Sub-aba\] Título` → novo item em `sub_abas`
- `# \[Titulo Categoria\] Título` → novo item em `categorias`
- `## N. Título` → novo artigo; primeira linha em itálico (`*...*`) → `fonte`; resto até próximo `##` → `conteudo`
- Sub-pontos `### N.` dentro de um artigo → concatenados ao `conteudo` do artigo pai

---

## Arquivos gerados

```
scripts/parse_md_v4.py          ← novo script conversor
data/tab_fundamentos.json       ← gerado pelo script
data/tab_como_aplicar.json
data/tab_critica_farmacologia.json
data/tab_por_condicao.json
data/index.json                 ← atualizado (remove cases_qa/pontos_focais)
```

---

## Mudanças no HTML (`index.html`)

- Remover botões de toggle: `Português`, `Original (JP)`, `Comparar`
- Remover containers: `#contentJP`, `#contentCompare`, `#contentCompareGrid`
- Atualizar nomes das tabs na barra de navegação
- Remover tabs `cases_qa` e `Pontos Focais` do menu

---

## Mudanças no JS

### `js/core.js`
- Nova função `loadTabData(tabId)` que carrega `data/tab_<tabId>.json`
- Mantém `loadData()` existente apenas para `estudo_aprofundado` e `mapa`

### `js/ui.js`
- `renderHero(heroText)` → bloco citação com fundo destacado acima da lista
- `renderSubAbaChips(subAbas, activeId)` → chips horizontais clicáveis
- `renderCategoriaHeader(titulo)` → separador visual entre grupos
- `renderArtigoCard(artigo)` → card clicável (título + fonte resumida)

### `js/modal.js`
- Remover `switchLanguageView()`
- Modal sempre abre com `conteudo` (PT), sem toggle de idioma
- Exibir `fonte` em itálico abaixo do título

### `js/filters.js`
- Substituir filtro por tags por filtro por sub-aba
- Filtro por sub-aba: ao clicar no chip, mostrar só artigos dessa sub-aba

---

## Mudanças no CSS (`css/volume-modal.css`)

- Remover ou comentar regras de `.vm-parallel`, `.vm-parallel-row`, `.vm-parallel-pt`, `.vm-parallel-jp`
- Remover `.dm-cmp-pt`, `.dm-cmp-jp`, cabeçalho "Português / Original (Japonês)"

---

## O que NÃO muda

- `estudo_aprofundado`: dados, JS e UI inalterados
- `mapa`: dados, JS e UI inalterados  
- Busca global (search modal)
- Modal base (estrutura, animações, scroll)
- CSS geral (temas, tipografia, layout)
- Dados JP nos JSON bilingual existentes (apenas escondidos na UI)

---

## Ordem de implementação

1. `scripts/parse_md_v4.py` → gerar os 4 JSON de tab
2. `data/index.json` → atualizar tabs
3. `index.html` → remover bilíngue + atualizar nomes de tabs
4. `js/modal.js` → remover JP/Compare
5. `js/core.js` → nova função de carregamento
6. `js/ui.js` → renderização Hero + chips + categorias + cards
7. `js/filters.js` → filtro por sub-aba
8. `css/volume-modal.css` → limpar CSS bilíngue
