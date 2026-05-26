# Design: Carregamento em 2 Fases (Lazy Loading)

**Data:** 2026-05-26
**Status:** Aprovado

## Problema

O site faz 8 fetches (~6,5 MB) antes de renderizar qualquer conteúdo:
- 6 tabs JSON em paralelo (2,7 MB + 1,7 MB + 869 KB + 653 KB + ...)
- `related_v2.json` (1,7 MB)
- `synonyms_pt.json` (1,4 KB)

O usuário abre no modo `fundamentos` (tab padrão, 169 KB) mas espera tudo carregar.

## Solução: Background Eager Loading

### Fase 1 — Bloqueante (~200 ms)

`loadData()` carrega apenas o necessário para o primeiro render:

```
Promise.all([
  index.json        (metadados)
  tab_fundamentos.json  (tab padrão, 169 KB)
  synonyms_pt.json  (busca, 1,4 KB)
])
→ renderTabs() + applyFilters()  ← usuário vê conteúdo aqui
```

Monta `STATE.data`, `STATE.tabStructure`, `STATE.globalData` com só `fundamentos`.

### Fase 2 — Background (não bloqueante)

Imediatamente após o render, dispara `_loadBackgroundTabs()` sem await:

```
Promise individual por tab:
  pratica, critica_farmacologica, por_regiao,
  estudo_detalhado, estudo_aprofundado
+ related_v2.json
+ Supabase essência
```

Cada tab, quando carregada, faz merge silencioso em `STATE.data` e
`STATE.globalData`. As promises ficam guardadas em `STATE._tabLoading[tabId]`
para que `setTab()` possa awaitar uma tab específica se necessário.

### Proteção em `setTab()`

Se o usuário clicar numa aba antes da fase 2 terminar:

```
if (STATE._tabLoading?.[id]) {
  mostrar spinner no #contentList
  await STATE._tabLoading[id]
}
→ renderizar normalmente
```

Na prática isso é improvável (fase 2 começa imediatamente e o usuário
demora para clicar), mas o código deve ser robusto.

### `related_v2.json` — Lazy via fase 2

Incluído na fase 2 background. `modal.js` já tem fallback se
`STATE.relatedIndex` for nulo (usa heurística por sobreposição de tags).
Não é necessária nenhuma mudança em `modal.js`.

## Arquivos Afetados

| Arquivo | Mudança |
|---|---|
| `js/core.js` | Refatorar `loadData()` em fase 1 + `_loadBackgroundTabs()` |
| `js/core.js` | Adicionar proteção com spinner em `setTab()` |
| `index.html` | Adicionar markup do spinner de tab (reutilizar estilo existente) |

**Não muda:** `modal.js`, `filters.js`, `guide.js`, `data.js`, CSS, HTML estrutural.

## Detalhes de Implementação

### `STATE._tabLoading`

Novo campo em STATE: `_tabLoading: {}` — mapa de `tabId → Promise`.
- Inicializado como `{}` no início de `loadData()`
- Cada tab remove sua chave quando termina: `delete STATE._tabLoading[tid]`
- Resetado no início de cada `loadData()` (para suportar `setMode()`)

### Alias `pontos_focais`

`STATE.data['pontos_focais'] = STATE.data['estudo_detalhado']` deve ser
aplicado dentro do callback de carregamento de `estudo_detalhado` na fase 2.

### Deep links

`checkUrlForDeepLink()` continua sendo chamado após a fase 1. Se o item
estiver em outra tab (ainda carregando), `STATE.globalData` não o terá ainda.
Solução: aguardar `Promise.all(Object.values(STATE._tabLoading))` antes de
tentar o deep link quando `?id=` ou `?item=` estiver na URL.

## Resultado Esperado

| Métrica | Antes | Depois |
|---|---|---|
| Dados no primeiro render | 6,5 MB | ~170 KB |
| Tempo até primeiro conteúdo | ~2–4 s | ~200–400 ms |
| Experiência após ~1 s | igual | igual |
| Risco de regressão | — | baixo (fase 2 = mesmo código) |

## Fora do Escopo

- Splitting de arquivos JSON em pedaços menores
- Cache local (localStorage / IndexedDB)
- Service Worker
- Indicador de progresso por tab (barra de progresso)
