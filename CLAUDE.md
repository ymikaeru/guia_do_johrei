# CLAUDE.md — Contexto do projeto

Este arquivo é carregado automaticamente toda vez que o Claude Code abre
este diretório. Ele contém o contexto, decisões arquiteturais e armadilhas
que você precisa saber para trabalhar neste projeto sem refazer erros.

> Para histórico de mudanças e próximos passos, ver `HANDOFF.md`.

## O que é este projeto

**Johrei: Guia para Ministrantes** — site SPA estático para auxiliar
ministrantes de Johrei (terapia espiritual da Igreja Messiânica Mundial)
durante o atendimento. O usuário típico:

- Pergunta a condição do paciente → vê os pontos vitais no corpo
- Lê os ensinamentos primários de Meishu-Sama relacionados
- Estuda a doutrina, técnica ou casos clínicos por aba

Conteúdo é fonte primária — citações diretas de Meishu-Sama do
Mioshie Zenshu, Johrei Hô Kohza e Pontos Focais. **Precisão é crítica.**
Não inventar, não inferir focal points por estatística.

## Stack e arquitetura

- **HTML/CSS/JS estático** (sem build step). Tailwind via CDN.
- Dados em JSON sob `data/`, carregados por `js/core.js#loadData()`.
- 5 abas (`fundamentos`, `como_aplicar`, `por_condicao`, `por_regiao`,
  `estudo_aprofundado`) + aba especial `mapa` (diagrama corporal interativo).
- `STATE` global (em `js/state.js`) com `data`, `list`, `activeTab`,
  `selectedBodyPoint`, `bodyFilter`, `activeTags`, etc.

### Fluxo de dados

```
data/index.json (categorias e volumes)
        │
        ▼
core.js#loadData()  ── lê data/tab_overrides.json (mapa article→tab)
        │
        ▼
STATE.data = { fundamentos: [...], como_aplicar: [...], ... }
        │
        ▼
applyFilters() ──► STATE.list ──► renderList() ──► #contentList
```

Para a aba `mapa`, `data/guia_atendimento.json` é carregado sob demanda
por `js/guide.js#loadGuia()` e popula a sidebar com 88 condições.

## Armadilhas (não cair de novo)

### 1. Cache busting é agressivo

Browsers cacheiam JS/CSS. **Sempre que alterar** um arquivo `js/*.js` ou
`style.css`, **bumpar a versão** em `index.html`:

```html
<script src="js/core.js?v=109"></script>  <!-- → v=110 -->
```

Service Worker já foi desregistrado (em `js/main.js`), mas instâncias
antigas ainda cacheiam até reload completo.

### 2. Regra CSS que quebra layout

Em `style.css` linha ~1073:

```css
#bodyMapContainer svg,
#bodyMapContainer div {
    overflow: visible !important;
}
```

Esta regra é necessária para a animação dos pontos vitais não ser
clipada. **Mas afeta TODO `<div>` dentro do mapa.** Se você precisa de
scroll/clip dentro do mapa, crie regra scoped:

```css
#bodyMapContainer #seuElemento {
    overflow-y: auto !important;
    max-height: 440px !important;
}
```

Já tem exemplo para `#bodyPointSidebarList`.

### 3. `applyFilters()` esconde tudo na aba mapa

Em `js/filters.js` linha 391:

```javascript
if (activeTab === 'mapa' && !bodyFilter && activeTags.length === 0)
    return false;
```

Isso significa que **na aba mapa, sem `bodyFilter` ou `activeTags`,
nada aparece**. Para listas customizadas (ex.: filtrar por condição
do guia), **bypassa** o `applyFilters`:

```javascript
STATE.list = filteredManually;
renderList(filteredManually, [], STATE.mode, 'mapa');
```

Veja `js/guide.js#selectConditionGuide()` como exemplo.

### 4. `body-map-helpers.js` usa data source específico

```javascript
const dataKey = STATE.activeTab === 'mapa' ? 'por_regiao' : STATE.activeTab;
```

A aba mapa usa dados de `por_regiao` para contar pontos. Se reorganizar
abas novamente, atualizar esta linha.

### 5. Pontos focais devem vir de fonte explícita

Para o guia (`data/guia_atendimento.json`), **NÃO** usar co-ocorrência
estatística de tags (`condição:X` + `parte:Y` em mesmo artigo).
Use APENAS o que Meishu-Sama ensinou explicitamente nas seções
`**[Pontos de Johrei]**` dos artigos de Pontos Focais.

Script: `scripts/migration/extract_focal_points.py` faz isso.
88 condições têm focal points verificados — outras foram omitidas
em vez de inferidas.

### 6. Tags em 3 eixos

Tags são prefixadas: `parte:`, `condição:`, `técnica:`. Não criar tags
sem prefixo. Se precisar de novo eixo, atualizar:
- `scripts/migration/phase2_tags.py` (mapeamento de migração)
- `js/filters.js` (lógica de filtro)
- UI dos filtros (chips, dropdowns)

## Coisas para testar antes de declarar pronto

UI no browser (não confiar só em compilação/lint):
- Aba `mapa` mostra mapas + sidebar + citação ao selecionar condição
- Pontos pulsam visualmente quando condição é selecionada
- Sidebar tem scroll interno (`max-height:440px`), não vaza
- Filtros entre abas funcionam (clicar em tag em uma aba filtra na outra)
- Mobile: modal de filtro abre, busca funciona

## Comandos úteis

```bash
# Servidor local
python -m http.server 8004
# ou
./fast_start.sh

# Re-rodar todas as migrações de dados
cd scripts/migration
python clean_all_titles.py
python phase2_tags.py
python fix_tags_prefix.py
python classify_articles.py
python apply_classification.py
python gen_estudo_aprofundado_v2.py
python fix_estudo_titles.py
python extract_focal_points.py
python build_guide_precise.py

# Verificar git status sem ruído de CRLF
git -c core.autocrlf=false status
```

## Convenções de código

- **Indentação**: 4 espaços JS, 2 para HTML inline
- **Idioma**: comentários e mensagens em português; nomes de função/variável em inglês
- **Sem dependências NPM**: tudo é vanilla JS ou Tailwind CDN. Não introduzir bundler.
- **Acentos preservados nos tags**: `condição:`, `técnica:` — não normalizar
- **Edição de dados**: preferir arquivo de override (`tab_overrides.json`)
  ao invés de mover artigos entre arquivos canônicos

## Fluxo de commits

Usar branches `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`.
Mensagens em inglês, descritivas, com co-author trailer:

```
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

Branch atual: ver `HANDOFF.md`.

## Modelo recomendado

- **Opus** para mudanças no `mapa`, integração de filtros, layout
  complexo, decisões arquiteturais
- **Sonnet** para tasks mecânicas: rename, find-and-replace, mapeamento
  de tags, ajustes pontuais de CSS, novos campos em JSON
- **Sonnet teve dificuldade** com a integração do guia no mapa por
  causa das múltiplas camadas (filtros existentes + body map SVG +
  sidebar dinâmica + citação). Use Opus para esse tipo de tarefa.
