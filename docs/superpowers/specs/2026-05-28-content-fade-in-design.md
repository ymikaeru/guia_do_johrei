# Design: Fade-in suave do conteúdo ao terminar o loading

**Data:** 2026-05-28
**Status:** Aprovado

## Problema

Hoje, durante o carregamento inicial:

1. Header, busca, abas, etc. são renderizados imediatamente (HTML estático).
2. Uma barra roxa fina no topo (`#loadingBar`) anima do 0 ao 86 % em 3 s.
3. Quando os dados de `fundamentos` chegam, a barra pula pra 100 %, esmaece, e os cards de conteúdo **aparecem do nada** no `#contentList` (e o hero no `#heroContainer`).

O salto "vazio → conteúdo cheio" sem transição parece abrupto. Usuário pediu que ficasse "mais bonito".

Variantes consideradas: skeleton placeholders (rejeitado — poderia parecer "defeito" pro público idoso, e a barra de loading do topo já sinaliza carregamento) e fade puro (escolhido).

## Solução: Fade simples (~400 ms)

Os 3 containers de conteúdo principal começam com `opacity: 0` e ganham `opacity: 1` via classe `.content-ready` adicionada ao `<body>` (ou ao `<main>`) na primeira vez que os dados de fase 1 chegam e o primeiro render acontece.

Transição: `opacity 400ms ease`.

### Containers afetados

- `#contentList` — grid dos cards
- `#heroContainer` — quote/hero da aba
- `#subAbaChipsContainer` — chips de sub-aba

Header, busca, abas e o mobile filter já são UI estática e não devem piscar.

### Quando disparar

No final da Fase 1 do `loadData()` em `js/core.js`, logo depois do primeiro `applyFilters()` síncrono que popula o DOM. Adicionar `document.body.classList.add('content-ready')` antes (ou junto) do bump do `loadingBar` pra 100 %.

### Cache rápido / repeat visit

Não há proteção especial. Fade 400 ms é sutil o bastante pra não atrapalhar mesmo com cache quente. Se o user voltar com tudo cacheado, vai ver um fade de 400 ms — o que é OK e consistente.

### Deep link (`?item=...`)

O modal abre por cima dos containers. O fade-in dos containers de fundo continua acontecendo mas é irrelevante (escondido pelo backdrop do modal). Sem conflito.

## Arquivos a tocar

| Arquivo | Mudança |
|---|---|
| `style.css` | + 3 regras CSS (selectors `#contentList`, `#heroContainer`, `#subAbaChipsContainer` com opacity 0 / transition / fallback) e regra `body.content-ready` que sobe opacity. |
| `js/core.js` | Linha ~76, depois de `renderTabs(); renderAlphabet(); applyFilters();`, adicionar `document.body.classList.add('content-ready')`. |
| `index.html` | Bumpar versão de `style.css` e `core.js` (CLAUDE.md item 1 — cache busting agressivo). |

## Anti-flash protection

Pra evitar FOUC (flash of unstyled content), as regras de opacity-0 devem estar em `style.css` **antes** de qualquer regra que mostre os containers. Não precisa de inline style — o link do CSS no `<head>` é síncrono.

## Fora de escopo

- Trocas de aba (já são instantâneas com dados em memória — não dispara fade).
- Re-renders por filtro (mesmo motivo).
- Loading bar do topo (mantém comportamento atual).
- Skeleton placeholders (rejeitado).
- Animações em modais (escopo separado).

## Testes manuais (per CLAUDE.md, UI no browser)

1. Hard refresh (`Ctrl+Shift+R`) na home → ver fade de ~400 ms quando conteúdo entra.
2. Refresh com cache quente → mesmo fade (consistente).
3. Abrir deep link `?item=...&mode=ensinamentos` → modal abre normal por cima.
4. Trocar abas depois de carregado → instantâneo, sem fade.
5. Dark mode → fade funciona igual (não afeta cores).
6. Mobile (DevTools responsive) → containers fazem fade, não viewport todo.

## Rollback

Remover linha em `core.js` e as regras CSS. Zero side effects.
