# Redesign da aba Mapa: contexto unificado abaixo do corpo

**Data:** 2026-04-25
**Branch:** `feat/guia-atendimento-mapa` (continuação)
**Escopo:** Aba `mapa` — limpar mapa por padrão, mover citação pra baixo do corpo, adicionar painel de top regiões

## Contexto

Estado atual:
- Os 3 SVGs do corpo renderizam ~50 pontos slate-grey por padrão (mesmo quando nada está selecionado), criando ruído visual
- Quando o usuário seleciona uma condição na sidebar, o card de citação de Meishu-Sama aparece dentro da própria sidebar (~280px de largura, espremido), e some quando o usuário rola pra ver "Outras condições"
- A área entre os mapas e a lista de ensinamentos (#contentList) está vazia
- Existe `renderCitationPanel` em `js/guide.js:227` (~50 linhas) escrito originalmente pra colocar a citação abaixo do mapa, mas nunca foi chamado — dead code flagado pelo code reviewer

Foi decidido três features que reorganizam a aba:

1. **Esconder pontos inativos** — corpo fica como ilustração anatômica limpa; pontos só aparecem quando uma condição/região está selecionada, em preview, ou em blink
2. **Mover citação pra baixo do mapa** — full width, prominência adequada ao texto sagrado
3. **Adicionar painel de top regiões** — discovery secundária por densidade de ensinamentos

## Goals

- Reduzir ruído visual no mapa em estado default
- Dar prominência à citação de Meishu-Sama (largura total + posição abaixo do contexto que ela explica)
- Oferecer entrada secundária por densidade de ensinamentos (top regiões)
- Aproveitar o espaço vazio entre mapa e lista de ensinamentos
- Limpar dead code (`renderCitationPanel`)

## Non-goals

- Mudar a sidebar de condições (já refinada na fase anterior)
- Mudar o `#contentList` que mostra os ensinamentos
- Mudar o glossário ou outras abas (`fundamentos`, `como_aplicar`, etc.)
- Refatorar `selectBodyPoint`, `previewBodyPoints`, `blinkBodyPoint` (apenas mudar como o estado visual deles é renderizado)
- Mobile-first redesign (mantém o modal de filtro existente)

## Layout final

### Desktop (≥1024px)

```
┌─ Sidebar (~280px) ─┐  ┌─ Body Maps (3 SVGs flex row) ──┐
│ Filtrar por        │  │ Frente | Detalhe | Costas       │
│ Purificação        │  │ (clean — pontos inativos        │
│ ─────────────      │  │  invisíveis)                    │
│ [Buscar condição]  │  └─────────────────────────────────┘
│ — Todas —          │  ┌─ #contextPanel (full width) ───┐
│ Condição A         │  │ #guideCitationPanel             │
│ Condição B         │  │ (visible quando condição ativa) │
│ Condição C…        │  │   - Título "PONTOS VITAIS · X"  │
│                    │  │   - Pílulas de pontos focais    │
│                    │  │   - Citação Meishu-Sama         │
│                    │  │   - "← Todas as condições"      │
│                    │  ├─────────────────────────────────┤
│                    │  │ #topRegionsPanel                │
│                    │  │ (sempre visible)                │
│                    │  │   "Top 10 regiões"              │
│                    │  │   • Estômago     12             │
│                    │  │   • Cabeça       11             │
│                    │  │   …                             │
│                    │  └─────────────────────────────────┘
└────────────────────┘  ┌─ #contentList ─────────────────┐
                        │ (ensinamentos)                  │
                        └─────────────────────────────────┘
```

### Mobile (<1024px)

Stack vertical único: sidebar (modal de filtro como hoje) → body maps (1 SVG por vez com swiper) → contextPanel (citação + top regiões empilhados) → contentList. Largura total disponível.

## Componente A — Esconder pontos inativos

### Comportamento

- **Default state** (sem `selectedBodyPoint`, sem `previewState`, sem `.blinking-highlight`): pontos com `display: none`
- **Selected**: ponto visível em roxo + ripple animado (mesmo de hoje)
- **Previewed** (hover em sidebar/glossário): ponto visível em roxo claro
- **Blinking** (clicou no glossário): ponto visível em roxo + animação de blink

### Refactor: estado visual centralizado

O risco mencionado nos "Riscos" (4 funções tocando estado visual e podendo dessincronizar) é mitigado por um pequeno refactor que extrai duas funções puras como única fonte de verdade. Este refactor é **parte do Componente A** — não está fora de escopo.

```javascript
// Pure: derives all visual state for a single point ID from current STATE.
function getPointVisualState(pointId) {
    const selectedIds = STATE.selectedBodyPoint ? STATE.selectedBodyPoint.split(',') : [];
    const previewIds = previewState ? previewState.split(',') : [];
    const isSelected = selectedIds.includes(pointId);
    const isPreviewed = !isSelected && previewIds.includes(pointId);
    const isBlinking = false; // set by blinkBodyPoint via class; checked separately when applying
    return { isSelected, isPreviewed, isBlinking };
}

// Computes the concrete style values for a state. Used by both initial render
// (returning attribute strings) and runtime updates (applying to DOM nodes).
function pointStyleFor(state) {
    let fill, fillOpacity, stroke, strokeWidth, baseRadius, glow;
    if (state.isSelected) {
        fill = '#7c3aed'; fillOpacity = '1';
        stroke = '#ffffff'; strokeWidth = '0.5';
        baseRadius = 1.8;
        glow = 'drop-shadow(0 0 4px rgba(124, 58, 237, 0.7))';
    } else if (state.isPreviewed) {
        fill = '#9333ea'; fillOpacity = '1';
        stroke = '#ffffff'; strokeWidth = '0.5';
        baseRadius = 1.8;
        glow = 'drop-shadow(0 0 5px rgba(147, 51, 234, 0.6))';
    } else {
        fill = '#94a3b8'; fillOpacity = '0.6';
        stroke = '#ffffff'; strokeWidth = '0.25';
        baseRadius = 1.2;
        glow = 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))';
    }
    const visible = state.isSelected || state.isPreviewed; // class .blinking-highlight is checked separately by applyPointState
    return { fill, fillOpacity, stroke, strokeWidth, rx: baseRadius * 1.5, ry: baseRadius, glow, visible };
}

// Applies state to an existing DOM ellipse + its ripple sibling. The single
// place that mutates point visuals at runtime — called by updatePointsVisual,
// blinkBodyPoint (after class toggle), highlightBodyPoint (on unhighlight).
function applyPointState(ellipse) {
    if (!ellipse) return;
    const pointId = ellipse.getAttribute('data-point-id');
    const state = getPointVisualState(pointId);
    const style = pointStyleFor(state);
    const blinking = ellipse.classList.contains('blinking-highlight');
    const display = (style.visible || blinking) ? '' : 'none';

    ellipse.style.display = display;
    ellipse.setAttribute('rx', style.rx);
    ellipse.setAttribute('ry', style.ry);
    ellipse.setAttribute('fill', style.fill);
    ellipse.setAttribute('fill-opacity', style.fillOpacity);
    ellipse.setAttribute('stroke', style.stroke);
    ellipse.setAttribute('stroke-width', style.strokeWidth);
    ellipse.style.filter = style.glow;

    const ripple = ellipse.previousElementSibling;
    if (ripple && ripple.tagName.toLowerCase() === 'ellipse') {
        if (state.isSelected || state.isPreviewed) {
            const rippleColor = state.isSelected ? '#7c3aed' : '#9333ea';
            ripple.setAttribute('fill', rippleColor);
            ripple.setAttribute('fill-opacity', '0.5');
            ripple.setAttribute('rx', style.rx);
            ripple.setAttribute('ry', style.ry);
            ripple.style.display = 'block';
        } else {
            ripple.style.display = 'none';
        }
    }
}
```

### Mudanças em `js/body-map-helpers.js`

`renderBodyPoints(points, viewId)`:
- Hoje: pontos com `count === 0` retornam string vazia; pontos com `count > 0` renderizam com cor padrão (slate). Estado calculado inline com bloco grande de if/else.
- Mudar: continuar pulando count===0. Para count>0, calcular `state = getPointVisualState(point.id)` e `style = pointStyleFor(state)`, gerar HTML usando `style`, e adicionar `style="display:${style.visible ? '' : 'none'}"` no markup inicial. O bloco grande de if/else (~40 linhas) some.

`updatePointsVisual()`:
- Hoje: ~60 linhas iterando sobre `.body-map-point` com toda a lógica inline
- Mudar: vira **2 linhas** — `document.querySelectorAll('.body-map-point').forEach(applyPointState)`. Toda a complexidade está em `applyPointState`.

`blinkBodyPoint(pointIds)`:
- Hoje: adiciona classe `.blinking-highlight` aos elementos
- Mudar: continua adicionando a classe, mas chama `applyPointState(el)` em cada elemento depois de adicionar (pra garantir visibilidade) e em cada elemento depois de remover (no setTimeout final). `applyPointState` faz a coisa certa porque checa `classList.contains('blinking-highlight')`.

`highlightBodyPoint(element, name, event)` (hover sobre ponto no mapa):
- Hoje: muda cor/raio inline; tem branch baseado em selectedIds
- Mudar: simplifica — se o ponto está visível (isto é, `style.display !== 'none'`), aplica os atributos de hover (mantém o código atual). Se invisível, retorna sem fazer nada (não há por que mostrar tooltip pra ponto que o usuário não pode estar hoverando — a function ainda é chamada via `onmouseover` do markup).
- `unhighlightBodyPoint`: chamar `applyPointState(element)` no final em vez de hardcodear a cor padrão. Remove duplicação.

### Edge case: clique direto no SVG

Hoje, o usuário pode clicar em qualquer ponto visível do mapa diretamente. Após mudança, isso só funciona pra pontos visíveis (selecionados/previewed/blinking). Discovery passa a ser via:
- Sidebar de 88 condições
- Painel de top regiões (novo)
- Glossário

Isso é intencional — o caso de uso real do ministrante é "tenho condição X, onde aplicar?", não "vou explorar o corpo aleatoriamente".

### Benefícios do refactor

- **~100 linhas removidas** (lógica de cores/tamanhos hoje duplicada entre `renderBodyPoints` e `updatePointsVisual`)
- **Único ponto de mutação visual** (`applyPointState`) — fácil de testar, fácil de auditar
- **Adicionar novos estados** (ex: erro, destacado por filtro) vira só estender `getPointVisualState` + `pointStyleFor`
- **Reduz risco do Componente A de médio para baixo**

### Edge case: clique direto no SVG

Hoje, o usuário pode clicar em qualquer ponto visível do mapa diretamente. Após mudança, isso só funciona pra pontos visíveis (selecionados/previewed/blinking). Discovery passa a ser via:
- Sidebar de 88 condições
- Painel de top regiões (novo)
- Glossário

Isso é intencional — o caso de uso real do ministrante é "tenho condição X, onde aplicar?", não "vou explorar o corpo aleatoriamente".

## Componente B — Painel de citação abaixo do mapa

### Estrutura

Container persistente no DOM, inserido entre `#bodyMapContainer` e `#contentList`:

```html
<div id="contextPanel" class="...">
  <div id="guideCitationPanel" style="display:none">
    <!-- Conteúdo idêntico ao card atual -->
  </div>
  <div id="topRegionsPanel">
    <!-- Componente C -->
  </div>
</div>
```

### Mudanças em `js/guide.js`

`renderCitationPanel(cond)` (já existente em `guide.js:227`, dead code):
- Manter a estrutura HTML que já está escrita
- Mudar inserção: usar `getElementById('guideCitationPanel')` em vez de criar/inserir dinamicamente. Apenas setar innerHTML e `style.display = 'block'`
- Mudar localização do container — não inserir após `bodyMapContainer`; em vez disso, depender de `#guideCitationPanel` existir no markup (criado em `ui-renderer.js`)

`selectConditionGuide(key)`:
- Hoje: renderiza citação inline na sidebar (`bodyPointSidebarList` innerHTML)
- Mudar: chamar `renderCitationPanel(cond)` e DEIXAR a sidebar em modo "lista normal" (apenas atualizar o `isActive` styling do item da lista). Sidebar não tem mais conteúdo especial.

`clearConditionGuide()`:
- Hoje: limpa STATE, limpa input de busca, restaura sidebar pra lista normal, remove `#guideCitationPanel` do DOM
- Mudar: mesma coisa, mas `#guideCitationPanel` permanece no DOM — só `style.display = 'none'`

`filterGuiaSidebar(q)`:
- Hoje: tem 2 branches (com/sem condição ativa) por causa da citação na sidebar
- Mudar: remover Branch A (preservar citação). Volta a ser uma versão simples: prefix + html, em ambos `list` e `mlist`. **Simplifica ~40 linhas.** A citação fica no `#contextPanel` independentemente do que a sidebar mostra.

### Markup novo em `js/ui-renderer.js`

Adicionar dentro do bloco do mapa, entre `#bodyMapContainer` (final) e onde o `#contentList` é criado:

```html
<div id="contextPanel" class="w-full max-w-full px-4 lg:px-8 mx-auto mt-6 mb-8 hidden">
  <div id="guideCitationPanel" style="display:none">
    <!-- preenchido por renderCitationPanel() -->
  </div>
  <div id="topRegionsPanel">
    <!-- preenchido por renderTopRegionsPanel() -->
  </div>
</div>
```

A classe Tailwind `hidden` inicial é removida quando `STATE.activeTab === 'mapa'` (controlada via `showConditionSelector` que faz `panel.classList.remove('hidden')` e `hideConditionSelector` que faz `panel.classList.add('hidden')`).

## Componente C — Painel de top regiões

### Comportamento

- Sempre visível na aba mapa (independente de condição estar selecionada)
- Lista as **top 10 regiões** ordenadas decrescentemente pelo número de itens em `STATE.data.por_regiao` que correspondem àquela região (via `matchBodyPoint`)
- Cada item:
  - Nome da região (capitalizado)
  - Contador (ex: "12 ensinamentos")
  - Onclick → `selectBodyPoint(ids)` (mesma função do dropdown atual; ids = comma-separated dos pontos com aquele nome)
  - Onmouseenter → `previewBodyPoints(ids)`; onmouseleave → `clearBodyPointPreview()`
- Computado **uma vez** ao carregar (não a cada render); cacheado em variável local

### Estrutura HTML

```html
<div id="topRegionsPanel" class="bg-gray-50 dark:bg-[#161616] rounded-lg p-5 mt-4">
  <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-3">
    Regiões com mais ensinamentos
  </h3>
  <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
    <button class="text-left ..." onclick="selectBodyPoint('id1,id2')" onmouseenter="..." onmouseleave="...">
      <span class="text-xs font-bold">Estômago</span>
      <span class="text-[9px] text-gray-400 block">12 ensinamentos</span>
    </button>
    <!-- ... 9 more -->
  </div>
</div>
```

### Implementação em `js/guide.js` (ou novo `js/top-regions.js`)

Decisão: colocar em `js/guide.js` por enquanto (o arquivo já é o "controlador da aba mapa para o guia"). Se crescer, extrair depois.

```javascript
let _topRegionsCache = null;

function computeTopRegions(n = 10) {
  if (_topRegionsCache) return _topRegionsCache;
  if (!STATE.data || !STATE.data.por_regiao || !window.BODY_DATA) return [];

  const allPoints = [
    ...BODY_DATA.points.front,
    ...BODY_DATA.points.back,
    ...BODY_DATA.points.detail,
  ];
  // Group point IDs by name
  const byName = {};
  allPoints.forEach(p => {
    if (!byName[p.name]) byName[p.name] = [];
    byName[p.name].push(p.id);
  });

  // Count items matching ANY of the IDs for each name
  const data = STATE.data.por_regiao;
  const counts = Object.entries(byName).map(([name, ids]) => {
    const count = data.filter(item => ids.some(id => matchBodyPoint(item, id))).length;
    return { name, ids, count };
  });

  _topRegionsCache = counts.filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
  return _topRegionsCache;
}

function renderTopRegionsPanel() {
  const panel = document.getElementById('topRegionsPanel');
  if (!panel) return;
  const top = computeTopRegions(10);
  if (top.length === 0) { panel.style.display = 'none'; return; }
  // ... build HTML, set innerHTML
}
```

Chamar `renderTopRegionsPanel()` em:
- `showConditionSelector()` (quando aba mapa abre)
- `loadGuia()` (depois de `STATE.data` estar preenchido) — mas o panel não depende de GUIA, só de `STATE.data.por_regiao`. Na verdade, melhor chamar quando `STATE.data` carregar, independente do guia.

Decisão: chamar em `showConditionSelector` é suficiente; quando o usuário entra na aba mapa, `STATE.data` já está carregado (ou ele renderiza vazio, e a próxima entrada renderiza preenchido).

## Mobile / responsivo

- Layout do `#contextPanel` é fluido: classes Tailwind `w-full max-w-full px-4 lg:px-8` garantem padding adequado em ambos
- `#topRegionsPanel` usa `grid-cols-2 md:grid-cols-5` — 2 colunas em mobile, 5 em desktop
- `#guideCitationPanel` mantém a estrutura atual (já é responsiva via flex/inline-block)
- Nenhuma media query nova necessária além do que Tailwind já fornece

## Files affected

| Arquivo | Mudança |
|---------|---------|
| `js/body-map-helpers.js` | `renderBodyPoints`, `updatePointsVisual`, `blinkBodyPoint`: adicionar `display:none` lógica para pontos não-selecionados/previewed/blinking |
| `js/guide.js` | Reviver `renderCitationPanel`; refatorar `selectConditionGuide` (citação não vive mais na sidebar); refatorar `clearConditionGuide`; simplificar `filterGuiaSidebar` (remover branch A); adicionar `computeTopRegions`, `renderTopRegionsPanel`; chamar render no `showConditionSelector` |
| `js/ui-renderer.js` | Adicionar `<div id="contextPanel">` com filhos `#guideCitationPanel` e `#topRegionsPanel` no markup do mapa |
| `style.css` | Possíveis ajustes de responsivo se Tailwind classes não forem suficientes |
| `index.html` | Bumpar `?v=N` para `js/body-map-helpers.js`, `js/guide.js`, `js/ui-renderer.js`, `style.css` |

## Edge cases

1. **Aba mapa abre antes dos dados carregarem:** `STATE.data.por_regiao` pode estar vazio. `renderTopRegionsPanel` retorna sem renderizar (display:none). Quando dados chegam, próxima entrada na aba renderiza.
2. **Cache de top regiões + dados mudam:** `_topRegionsCache` é populado uma vez. Se algum dia os dados forem recarregados em runtime, precisa invalidar. Por enquanto, dados são estáticos no boot — não é problema.
3. **Condição selecionada cujos pontos não estão no top 10:** Pontos pulsam normalmente no mapa (tornam-se visíveis); citação aparece no painel; top regiões mostra as 10 mais densas (que podem incluir ou não os pontos da condição). Isso é OK — top regiões é "browse by density", não "current selection".
4. **Glossário (`generateGlossaryGrid`) e blink:** O glossário existe na aba `por_regiao`, não `mapa`. Mas `blinkBodyPoint` é chamado a partir do glossário e atua sobre os SVGs. Após mudança, blink precisa setar `display:''` nos pontos antes da animação (ver Componente A).
5. **Pontos com count===0:** Hoje são pulados em `renderBodyPoints`. Continuam sendo pulados (não viram nem invisíveis — simplesmente não existem no DOM). Isso é mantido.

## Validação manual (browser preview)

Desktop (≥1024px) e mobile (<1024px):

- [ ] Aba mapa carrega → corpo limpo, sem pontos visíveis (apenas a ilustração anatômica)
- [ ] Hover em uma condição na sidebar → pontos aparecem em roxo claro (preview); ao tirar o mouse, pontos somem
- [ ] Clicar uma condição → pontos da condição pulsam em roxo; citação aparece no `#guideCitationPanel`; sidebar volta a mostrar a lista normal (não a citação espremida)
- [ ] Rolar lista de "Outras condições" na sidebar → citação no painel **não some** (está fora da sidebar agora)
- [ ] Top regiões aparecem com contadores (não-zero); cada item é clicável
- [ ] Clicar em um item de top regiões → pontos correspondentes pulsam; lista de ensinamentos filtra; citação **não muda** (não há condição selecionada)
- [ ] Trocar para outra aba (ex: fundamentos) e voltar → estado preserva-se ou reseta consistentemente
- [ ] Mobile: layout empilha verticalmente sem overflow; modal de filtro continua funcionando

## Riscos

- **Baixo (após refactor):** Componente A consolida 4 funções de estado visual numa única `applyPointState`. Risco de dessync entre as funções é eliminado por construção.
- **Baixo:** Componente B é mais reorganização de markup do que mudança de comportamento. O dead code `renderCitationPanel` já estava escrito.
- **Baixo:** Componente C é pure-add — nova função, novo container. Se quebrar, fica isolada.

## Ordem de implementação

Sugerida: B → A → C
- B primeiro porque elimina o dead code e simplifica `filterGuiaSidebar` antes de mexer com pontos
- A em segundo lugar — quando A quebrar, é fácil voltar atrás (mudança visual contida)
- C por último — pure-add, fácil de iterar
