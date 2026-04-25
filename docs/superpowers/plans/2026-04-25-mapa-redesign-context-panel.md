# Plano: Redesign da aba Mapa com painel de contexto

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limpar o mapa por padrão, mover a citação de Meishu-Sama pra um painel abaixo do corpo, adicionar painel de top regiões, e refatorar o estado visual dos pontos pra single source of truth.

**Architecture:** Mudanças em 4 arquivos JS (`body-map-helpers.js`, `guide.js`, `ui-renderer.js`) + cache bumps em `index.html`. Refactor introduz três funções puras no body-map-helpers (`getPointVisualState`, `pointStyleFor`, `applyPointState`) que viram única fonte de verdade pro estado visual dos pontos. Sem mudança em dados.

**Tech Stack:** Vanilla JS (sem build step, sem framework de testes). Validação manual no browser via Claude Preview tools.

**Spec:** `docs/superpowers/specs/2026-04-25-mapa-redesign-context-panel-design.md`

**Nota TDD:** Codebase sem testes automatizados. Validação é manual no browser. Cada task termina com sanity check via `preview_eval` ou inspeção; verificação completa do checklist do spec acontece na Task 8.

---

## File Structure

| Arquivo | Responsabilidade nas mudanças |
|---------|-------------------------------|
| `js/ui-renderer.js` | Adicionar markup `#contextPanel` (com filhos `#guideCitationPanel` e `#topRegionsPanel`) abaixo do mapa |
| `js/guide.js` | Reviver `renderCitationPanel`; refatorar `selectConditionGuide` e `clearConditionGuide`; simplificar `filterGuiaSidebar`; adicionar `computeTopRegions` e `renderTopRegionsPanel`; hook em `showConditionSelector`/`hideConditionSelector` para mostrar/esconder o painel |
| `js/body-map-helpers.js` | Extrair `getPointVisualState`, `pointStyleFor`, `applyPointState`; migrar `renderBodyPoints`, `updatePointsVisual`, `blinkBodyPoint`, `highlightBodyPoint`, `unhighlightBodyPoint` para usá-las; ativar comportamento "esconder pontos inativos" |
| `index.html` | Bumpar `?v=N` em `body-map-helpers.js`, `guide.js`, `ui-renderer.js` |

Ordem das tasks: B (citação) → A (refactor + hide) → C (top regiões). Justificativa do spec: B simplifica `filterGuiaSidebar` antes de mexer em pontos; A é o refactor mais delicado e fica isolado no meio; C é pure-add, fácil de iterar.

---

### Task 1: Markup do `#contextPanel` e show/hide ao trocar de aba

**Files:**
- Modify: `js/ui-renderer.js` (adicionar markup após o flex container do mapa)
- Modify: `js/guide.js` (`showConditionSelector` e `hideConditionSelector`)

- [ ] **Step 1: Localizar o ponto de inserção em `js/ui-renderer.js`**

Abrir `js/ui-renderer.js`. Encontrar o final do flex container do mapa (procurar pela última div que fecha o flex `flex-col-reverse min-[768px]:flex-col lg:flex-row`, próximo da linha 185 — seguida pelos "Mobile Tabs" na linha 187).

A estrutura atual:
```
        </div>  ← fecha mobile filter pill
    </div>      ← fecha o outer flex (sidebar + maps)

    <!-- Mobile Tabs (Below map for easy access) -->
    <div class="flex min-[768px]:hidden ...">
```

- [ ] **Step 2: Inserir markup do contextPanel**

Imediatamente APÓS o `</div>` que fecha o outer flex (e ANTES do comentário `<!-- Mobile Tabs ...`), inserir:

```html

    <!-- Context Panel: citation + top regions, below body maps -->
    <div id="contextPanel" class="w-full max-w-full px-4 lg:px-8 mx-auto mt-6 mb-8 hidden">
        <div id="guideCitationPanel" style="display:none"></div>
        <div id="topRegionsPanel"></div>
    </div>
```

(Espaçamento Tailwind: `mt-6 mb-8` separa visualmente do mapa acima e do contentList abaixo. `px-4 lg:px-8` espelha o padding do flex container acima.)

- [ ] **Step 3: Atualizar `showConditionSelector` em `js/guide.js`**

Localizar `function showConditionSelector()` (próximo da linha 278, depois do refactor anterior). Substituir o corpo inteiro por:

```javascript
function showConditionSelector() {
    loadGuia(); // pre-fetch
    const ctx = document.getElementById('contextPanel');
    if (ctx) ctx.classList.remove('hidden');
    // Auto-focus the search on desktop only — mobile would open the virtual keyboard.
    if (window.matchMedia && window.matchMedia('(min-width: 1024px)').matches) {
        setTimeout(() => {
            const inp = document.getElementById('guiaSidebarSearch');
            if (inp && document.activeElement !== inp) inp.focus({ preventScroll: true });
        }, 200);
    }
}
```

- [ ] **Step 4: Atualizar `hideConditionSelector` em `js/guide.js`**

Localizar `function hideConditionSelector()` (próximo da linha 287). Substituir o corpo:

```javascript
function hideConditionSelector() {
    const ctx = document.getElementById('contextPanel');
    if (ctx) ctx.classList.add('hidden');
}
```

- [ ] **Step 5: Sanity check no browser**

Recarregar a página (após bump na Task 8 — por enquanto pode usar hard reload), abrir DevTools console, executar:

```javascript
setTab('mapa');
document.getElementById('contextPanel') !== null
// Esperado: true
document.getElementById('contextPanel').classList.contains('hidden')
// Esperado: false
setTab('fundamentos');
document.getElementById('contextPanel').classList.contains('hidden')
// Esperado: true
```

(Por enquanto o painel está vazio — só estamos validando que o container é montado e mostrado/escondido corretamente.)

- [ ] **Step 6: Commit**

```bash
git -c core.autocrlf=false add js/ui-renderer.js js/guide.js
git -c core.autocrlf=false commit -m "feat(mapa): add context panel container below body maps

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Reviver `renderCitationPanel`, refatorar `selectConditionGuide` e `clearConditionGuide`

**Files:**
- Modify: `js/guide.js`

- [ ] **Step 1: Substituir `renderCitationPanel`**

Localizar `function renderCitationPanel(cond)` (próximo da linha 227). Substituir a função inteira por:

```javascript
// ── Citation panel below the maps ──────────────────────────────────────────
function renderCitationPanel(cond) {
    const panel = document.getElementById('guideCitationPanel');
    if (!panel) return;

    const pts = cond.focal_points.map((fp, i) =>
        `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;
             border-radius:14px;font-size:12px;font-weight:600;margin:3px;
             background:${i === 0 ? 'rgba(0,0,0,.85)' : 'rgba(0,0,0,.06)'};
             color:${i === 0 ? '#fff' : 'inherit'};
             border:1px solid ${i === 0 ? 'transparent' : 'rgba(0,0,0,.12)'}">
            <span style="width:6px;height:6px;border-radius:50%;
                background:${i === 0 ? '#fff' : 'rgba(0,0,0,.3)'}"></span>
            ${escHtml(fp.label)}
        </span>`
    ).join('');

    const trecho = (cond.trecho_meishu || '')
        .replace(/\*\*/g, '').replace(/\[|\]/g, '').trim();

    panel.style.cssText = 'padding:20px 24px;border-radius:10px;' +
        'background:#fafaf8;border:1px solid #e8e4da;display:block;';
    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
            <div>
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:#888;margin-bottom:4px">
                    Pontos Vitais do Johrei — ${escHtml(cond.label)}
                </div>
                <div style="font-size:11px;color:#666">Ensinamento verificado · ${cond.focal_points.length} pontos</div>
            </div>
            <button onclick="clearConditionGuide()"
                style="background:none;border:none;cursor:pointer;font-size:20px;color:#aaa;line-height:1">×</button>
        </div>
        <div style="margin-bottom:${trecho ? '14px' : '0'}">${pts}</div>
        ${trecho ? `<div style="border-top:1px solid #e8e4da;padding-top:12px;margin-top:4px;
            font-size:13px;color:#666;line-height:1.65;font-style:italic">
            <span style="font-style:normal;font-size:10px;text-transform:uppercase;
                letter-spacing:.07em;font-weight:700;color:#aaa;display:block;margin-bottom:5px">
                Meishu-Sama</span>
            "${escHtml(trecho)}"
        </div>` : ''}`;
}

function hideCitationPanel() {
    const panel = document.getElementById('guideCitationPanel');
    if (panel) {
        panel.style.display = 'none';
        panel.innerHTML = '';
    }
}
```

Mudanças vs. versão antiga:
- Não cria nem insere o container (já existe no markup da Task 1)
- Removido `margin:0 32px 24px` do cssText (o pai `#contextPanel` já tem `mx-auto px-*`)
- Adicionado `display:block` ao cssText para forçar exibição
- Nova `hideCitationPanel()` helper para uso em `clearConditionGuide`

- [ ] **Step 2: Refatorar `selectConditionGuide`**

Localizar `window.selectConditionGuide = function(key)` (próximo da linha 73). Substituir a função INTEIRA por:

```javascript
// ── Select a condition ─────────────────────────────────────────────────────
window.selectConditionGuide = function(key) {
    if (!GUIA || !GUIA[key]) return;
    const cond = GUIA[key];
    activeConditionKey = key;

    // 1. Refresh sidebar — show conditions list normally; the active item
    //    will be visually highlighted by generateConditionOptions (isActive).
    const sidebar = document.getElementById('bodyPointSidebarList');
    if (sidebar) {
        sidebar.innerHTML = `
            <div class="px-5 py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 transition-all text-gray-400 hover:bg-gray-50 hover:text-black" onclick="clearConditionGuide()">— Todas as condições —</div>
            ${window.generateConditionOptions()}`;
    }

    // 2. Render citation in the context panel below the map
    renderCitationPanel(cond);

    // 3. Visual: highlight points on map
    if (cond.map_points && cond.map_points.length > 0) {
        STATE.selectedBodyPoint = cond.map_points.join(',');
        if (typeof updatePointsVisual === 'function') updatePointsVisual();
    }

    // 4. Filter articles by title match (custom logic, bypasses applyFilters)
    STATE.bodyFilter = '';
    const searchTerm = cond.label.replace(/\s*\(.*?\)\s*/g, '').replace(/[–-].*$/, '').trim().toLowerCase();
    const labelLower = cond.label.toLowerCase();

    const filtered = [];
    Object.entries(STATE.data).forEach(([cat, items]) => {
        items.forEach(item => {
            const title = (item.title_pt || item.title || '').toLowerCase();
            if (!title) return;
            if (title.includes(labelLower) || (searchTerm && title.includes(searchTerm))) {
                filtered.push({ ...item, _cat: cat });
            }
        });
    });

    STATE.list = filtered;

    const list = document.getElementById('contentList');
    if (list) list.classList.remove('hidden');
    if (typeof renderList === 'function') {
        renderList(filtered, [], STATE.mode, 'mapa');
    }

    document.querySelectorAll('.search-count').forEach(el => {
        el.textContent = filtered.length + ' Itens';
    });

    if (typeof closeBodyFilterModal === 'function') closeBodyFilterModal();
};
```

Mudanças vs. versão antiga:
- Removido todo o bloco que inline-renderiza a citação na sidebar (~25 linhas)
- Removido o `oldPanel.remove()` (painel agora é persistente, controlado por show/hide)
- Sidebar volta ao estado simples (lista + prefix)
- Nova chamada `renderCitationPanel(cond)`

- [ ] **Step 3: Refatorar `clearConditionGuide`**

Localizar `window.clearConditionGuide = function()` (próximo da linha 199). Substituir por:

```javascript
window.clearConditionGuide = function() {
    activeConditionKey = null;

    // Clear search
    if (typeof STATE !== 'undefined') {
        STATE.searchQuery = '';
        const searchInputs = document.querySelectorAll('#searchInput, #mobileSearchInput, #desktopSearchInput');
        searchInputs.forEach(el => { if (el) el.value = ''; });
        if (typeof applyFilters === 'function') applyFilters();
    }

    // Clear map selection
    if (typeof clearBodyFilter === 'function') clearBodyFilter();

    // Hide citation panel (don't destroy — kept persistent in DOM)
    hideCitationPanel();

    // Reset sidebar
    const sidebar = document.getElementById('bodyPointSidebarList');
    if (sidebar) {
        sidebar.innerHTML = `
            <div class="px-5 py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 transition-all text-gray-400 hover:bg-gray-50 hover:text-black" onclick="clearConditionGuide()">— Todas as condições —</div>
            ${window.generateConditionOptions()}`;
    }
};
```

Mudança: `panel.remove()` → `hideCitationPanel()`.

- [ ] **Step 4: Sanity check no browser**

Hard reload, ir pra aba mapa, no console:

```javascript
const tubKey = Object.keys(GUIA).find(k => GUIA[k].label.toLowerCase().includes('tuberculose'));
selectConditionGuide(tubKey);
// Verificar:
document.getElementById('guideCitationPanel').style.display
// Esperado: "block"
document.getElementById('guideCitationPanel').textContent.includes('Pontos Vitais do Johrei')
// Esperado: true
document.getElementById('bodyPointSidebarList').textContent.includes('Pontos Vitais ·')
// Esperado: false (citação SAIU da sidebar)

clearConditionGuide();
document.getElementById('guideCitationPanel').style.display
// Esperado: "none"
```

- [ ] **Step 5: Commit**

```bash
git -c core.autocrlf=false add js/guide.js
git -c core.autocrlf=false commit -m "feat(mapa): move Meishu-Sama citation to context panel below map

Revives renderCitationPanel from dead code and refactors selectConditionGuide
and clearConditionGuide to render citations into the persistent #contextPanel
container instead of inlining them in the sidebar.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Simplificar `filterGuiaSidebar` (remover Branch A)

**Files:**
- Modify: `js/guide.js`

A função tem hoje duas branches por causa da citação que vivia na sidebar. Como agora a citação está fora dela, Branch A não é mais necessária.

- [ ] **Step 1: Substituir `window.filterGuiaSidebar`**

Localizar `window.filterGuiaSidebar = function(q)` (próximo da linha 64 após o refactor anterior; tem ~50 linhas). Substituir a função INTEIRA por:

```javascript
// ── Live search filter in sidebar ──────────────────────────────────────────
window.filterGuiaSidebar = function(q) {
    const list = document.getElementById('bodyPointSidebarList');
    const mlist = document.getElementById('filterModalList');
    const html = window.generateConditionOptions(q);
    const prefix = `<div class="px-5 py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 transition-all text-gray-400 hover:bg-gray-50 hover:text-black" onclick="clearConditionGuide()">— Todas as condições —</div>`;
    if (list) list.innerHTML = prefix + html;
    if (mlist) mlist.innerHTML = prefix + html;
};
```

Reduz de ~50 linhas pra ~8.

- [ ] **Step 2: Sanity check**

```javascript
selectConditionGuide(Object.keys(GUIA).find(k => GUIA[k].label.toLowerCase().includes('tuberculose')));
filterGuiaSidebar('estomago');
// Verificar:
document.getElementById('guideCitationPanel').style.display
// Esperado: "block" (citação ainda visível no painel abaixo do mapa)
document.getElementById('bodyPointSidebarList').textContent.includes('Estômago')
// Esperado: true
document.getElementById('bodyPointSidebarList').textContent.includes('Pontos Vitais ·')
// Esperado: false (sidebar limpa, sem citação inline)
```

- [ ] **Step 3: Commit**

```bash
git -c core.autocrlf=false add js/guide.js
git -c core.autocrlf=false commit -m "refactor(guide): simplify filterGuiaSidebar after citation moved out

Citation no longer lives in the sidebar (moved to #guideCitationPanel below
the map in the previous commit). filterGuiaSidebar's two-branch logic
collapses back to the single original behavior.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Refactor — extrair `getPointVisualState`, `pointStyleFor`, `applyPointState`; migrar `updatePointsVisual`

**Files:**
- Modify: `js/body-map-helpers.js`

Esta task introduz os 3 helpers SEM mudar comportamento ainda. `pointStyleFor` calcula `visible = isSelected || isPreviewed` mas `applyPointState` ainda mantém o ponto visível no default (Task 6 vai flipar).

- [ ] **Step 1: Adicionar os 3 helpers no topo de `js/body-map-helpers.js`**

Abrir `js/body-map-helpers.js`. Logo após o comentário `// --- INTERACTIVE BODY MAP HELPERS ---` (linha 1), antes da função `renderBodyPoints`, inserir:

```javascript
// ── Visual state for a single point — single source of truth ───────────────
// Pure: derives all visual state for a single point ID from current STATE.
function getPointVisualState(pointId) {
    const selectedIds = STATE.selectedBodyPoint ? STATE.selectedBodyPoint.split(',') : [];
    const previewIds = (typeof previewState !== 'undefined' && previewState) ? previewState.split(',') : [];
    const isSelected = selectedIds.includes(pointId);
    const isPreviewed = !isSelected && previewIds.includes(pointId);
    return { isSelected, isPreviewed };
}

// Computes concrete style values from a state object.
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
    return {
        fill, fillOpacity, stroke, strokeWidth,
        rx: baseRadius * 1.5, ry: baseRadius, glow,
        visible: state.isSelected || state.isPreviewed
    };
}

// Applies state to an existing DOM ellipse + its ripple sibling. Single
// place that mutates point visuals at runtime.
function applyPointState(ellipse) {
    if (!ellipse) return;
    const pointId = ellipse.getAttribute('data-point-id');
    const state = getPointVisualState(pointId);
    const style = pointStyleFor(state);
    const blinking = ellipse.classList.contains('blinking-highlight');

    ellipse.setAttribute('rx', style.rx);
    ellipse.setAttribute('ry', style.ry);
    ellipse.setAttribute('fill', style.fill);
    ellipse.setAttribute('fill-opacity', style.fillOpacity);
    ellipse.setAttribute('stroke', style.stroke);
    ellipse.setAttribute('stroke-width', style.strokeWidth);
    ellipse.style.filter = style.glow;
    // Visibility is wired up in Task 6 (after refactor proves stable).
    // Until then, points stay visible whenever they exist (current behavior).

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

- [ ] **Step 2: Migrar `updatePointsVisual` para usar `applyPointState`**

Localizar `function updatePointsVisual()` (próximo da linha 314, ~70 linhas). Substituir a função INTEIRA por:

```javascript
function updatePointsVisual() {
    document.querySelectorAll('.body-map-point').forEach(applyPointState);
}
```

A complexidade toda passa pra `applyPointState`. Comportamento idêntico ao anterior.

- [ ] **Step 3: Sanity check no browser**

```javascript
setTab('mapa');
selectBodyPoint('cabeca-frente'); // ou outro ID válido
// Verificar: ponto fica roxo, ripple aparece (mesmo comportamento de antes)
selectBodyPoint('');
// Ponto volta a slate-cinza
```

Se algum visual quebrou, reverter este commit e investigar — não avançar.

- [ ] **Step 4: Commit**

```bash
git -c core.autocrlf=false add js/body-map-helpers.js
git -c core.autocrlf=false commit -m "refactor(body-map): extract visual state helpers as single source of truth

Adds getPointVisualState, pointStyleFor, applyPointState. Migrates
updatePointsVisual to delegate to applyPointState (~60 lines collapsed
to 1). No behavior change yet — visibility flip happens in a later commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Migrar `renderBodyPoints` initial render para usar os helpers

**Files:**
- Modify: `js/body-map-helpers.js`

- [ ] **Step 1: Substituir `renderBodyPoints`**

Localizar `function renderBodyPoints(points, viewId)` (linha 3, ~100 linhas). Substituir a função INTEIRA por:

```javascript
function renderBodyPoints(points, viewId) {
    if (!points || points.length === 0) return '';

    // For mapa tab use por_regiao (closest to former pontos_focais)
    const dataKey = STATE.activeTab === 'mapa' ? 'por_regiao' : STATE.activeTab;
    const currentData = STATE.data[dataKey] || STATE.data['por_regiao'] || [];

    return points.map(point => {
        // Count items matching this point — skip rendering if zero
        const count = currentData.filter(item => matchBodyPoint(item, point.id)).length;
        if (count === 0) return '';

        const state = getPointVisualState(point.id);
        const style = pointStyleFor(state);
        const showRipple = state.isSelected || state.isPreviewed;
        const rippleColor = state.isSelected ? '#7c3aed' : (state.isPreviewed ? '#9333ea' : 'none');

        const rippleElement = `
            <ellipse
                cx="${point.x}"
                cy="${point.y}"
                rx="${style.rx}"
                ry="${style.ry}"
                fill="${rippleColor}"
                fill-opacity="${showRipple ? '0.5' : '0'}"
                stroke="none"
                class="animate-pulse-ring pointer-events-none"
                style="transform-origin: center; transform-box: fill-box; display: ${showRipple ? 'block' : 'none'};"
            ></ellipse>
        `;

        return `
            ${rippleElement}
            <ellipse
                cx="${point.x}"
                cy="${point.y}"
                rx="${style.rx}"
                ry="${style.ry}"
                fill="${style.fill}"
                fill-opacity="${style.fillOpacity}"
                stroke="${style.stroke}"
                stroke-width="${style.strokeWidth}"
                class="body-map-point pointer-events-auto cursor-pointer transition-all duration-200"
                style="filter: ${style.glow}; transform-origin: center;"
                data-point-id="${point.id}"
                data-point-name="${point.name}"
                onclick="selectBodyPoint('${point.id}')"
                onmouseover="highlightBodyPoint(this, '${point.name}', event)"
                onmouseout="unhighlightBodyPoint(this)"
            >
                <title>${point.name}</title>
            </ellipse>
        `;
    }).join('');
}
```

Reduz de ~100 linhas pra ~50. Toda a lógica de cor/raio/glow agora vem de `pointStyleFor`. Comportamento default ainda é "ponto visível com cor slate" — sem mudança comportamental.

- [ ] **Step 2: Sanity check**

```javascript
window.location.reload();
// Após reload, ir para aba mapa, ver pontos slate-cinza distribuídos pelo corpo (mesmo de sempre)
selectConditionGuide(Object.keys(GUIA).find(k => GUIA[k].label.toLowerCase().includes('tuberculose')));
// Pontos da condição pulsam roxo
clearConditionGuide();
// Voltam a slate
```

- [ ] **Step 3: Commit**

```bash
git -c core.autocrlf=false add js/body-map-helpers.js
git -c core.autocrlf=false commit -m "refactor(body-map): migrate renderBodyPoints to use visual state helpers

Initial render now uses getPointVisualState + pointStyleFor instead of
inlining the styling logic. ~50 lines of duplicated style code removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Esconder pontos inativos por padrão; atualizar `blinkBodyPoint`, `highlightBodyPoint`, `unhighlightBodyPoint`

**Files:**
- Modify: `js/body-map-helpers.js`

Agora flipamos o comportamento. Pontos só aparecem em selected/previewed/blinking.

- [ ] **Step 1: Atualizar `applyPointState` para aplicar visibilidade**

Em `js/body-map-helpers.js`, localizar `function applyPointState(ellipse)`. Substituir o comentário `// Visibility is wired up in Task 6...` por:

```javascript
    // Hide inactive points: visible only when selected, previewed, or blinking.
    const display = (style.visible || blinking) ? '' : 'none';
    ellipse.style.display = display;
```

(A variável `blinking` já está computada acima na função. A linha de display vai ANTES dos `setAttribute` de cor.)

A função fica:

```javascript
function applyPointState(ellipse) {
    if (!ellipse) return;
    const pointId = ellipse.getAttribute('data-point-id');
    const state = getPointVisualState(pointId);
    const style = pointStyleFor(state);
    const blinking = ellipse.classList.contains('blinking-highlight');

    // Hide inactive points: visible only when selected, previewed, or blinking.
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

- [ ] **Step 2: Atualizar `renderBodyPoints` initial render para esconder não-visíveis**

Em `renderBodyPoints` (Task 5), o segundo `<ellipse>` (o body-map-point) tem o atributo `style="filter: ${style.glow}; transform-origin: center;"`. Adicionar `display: ${style.visible ? '' : 'none'};`:

```html
                style="filter: ${style.glow}; transform-origin: center; display: ${style.visible ? '' : 'none'};"
```

(Localizar a linha exata e fazer essa edição precisa.)

- [ ] **Step 3: Atualizar `blinkBodyPoint`**

Localizar `function blinkBodyPoint(pointIds)` (próximo da linha 522). A versão atual adiciona a classe `.blinking-highlight` e seta `style.fill`/`style.fillOpacity` inline. Substituir a função INTEIRA por:

```javascript
function blinkBodyPoint(pointIds) {
    if (!pointIds) return;
    const ids = pointIds.split(',');

    const elements = [];
    ids.forEach(id => {
        const el = document.querySelector(`.body-map-point[data-point-id="${id}"]`);
        if (el) elements.push(el);
    });

    if (elements.length === 0) return;

    // Auto-switch to correct view on mobile (< 768px)
    if (window.innerWidth < 768 && elements.length > 0) {
        const firstEl = elements[0];
        const svg = firstEl.closest('svg');
        if (svg) {
            const viewId = svg.id.replace('_svg', '');
            if (typeof switchMobileView === 'function') {
                switchMobileView(viewId);
            }
        }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    elements.forEach(el => {
        el.classList.add('blinking-highlight');
        applyPointState(el); // makes invisible point visible because of class check
    });

    setTimeout(() => {
        elements.forEach(el => {
            el.classList.remove('blinking-highlight');
            applyPointState(el); // restores correct state (back to hidden if not selected)
        });
    }, 3000);
}
```

Mudança chave: depois de toggling a classe `.blinking-highlight`, chamamos `applyPointState(el)` pra refletir no DOM. Sem isso, o ponto ficaria com a classe mas `display:none` (invisível).

- [ ] **Step 4: Atualizar `highlightBodyPoint`**

Localizar `function highlightBodyPoint(element, name, event)` (próximo da linha 188). Adicionar early-return para pontos invisíveis no início. Substituir a função INTEIRA por:

```javascript
function highlightBodyPoint(element, name, event) {
    // Skip if this point is invisible (default state of inactive points)
    if (element.style.display === 'none') return;

    // Skip if this point is already selected
    const pointId = element.getAttribute('data-point-id');
    const selectedIds = STATE.selectedBodyPoint ? STATE.selectedBodyPoint.split(',') : [];
    if (selectedIds.includes(pointId)) return;

    // Apply hover effect: larger size, purple color, glow
    const hoverRadius = 2.2;
    element.setAttribute('rx', hoverRadius * 1.5);
    element.setAttribute('ry', hoverRadius);
    element.setAttribute('fill', '#7c3aed');
    element.setAttribute('fill-opacity', '1');
    element.setAttribute('stroke', '#7c3aed');
    element.setAttribute('stroke-width', '0.5');
    element.style.filter = 'drop-shadow(0 0 4px rgba(124, 58, 237, 0.8))';

    // Calculate item count
    const keywords = BODY_DATA.keywords[pointId] || [];
    let count = 0;

    if (keywords.length > 0 && STATE.data) {
        let allItems = [];
        Object.keys(STATE.data).forEach(tabId => {
            if (STATE.data[tabId]) {
                allItems.push(...STATE.data[tabId]);
            }
        });

        const existingTooltip = document.getElementById('body-tooltip');
        if (existingTooltip) existingTooltip.remove();

        const tooltip = document.createElement('div');
        tooltip.id = 'body-tooltip';
        count = allItems.filter(item => matchBodyPoint(item, pointId)).length;

        tooltip.innerHTML = `${name.toUpperCase()} <span style="opacity: 0.7; font-size: 0.9em; margin-left: 2px;">(${count})</span>`;
        tooltip.className = 'body-point-tooltip absolute z-[1000] bg-white dark:bg-[#111] text-black dark:text-white text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 whitespace-nowrap';

        document.body.appendChild(tooltip);

        const rect = element.getBoundingClientRect();
        const topY = rect.top + window.scrollY;
        const leftX = rect.left + window.scrollX + (rect.width / 2);

        tooltip.style.top = `${topY - 16}px`;
        tooltip.style.left = `${leftX}px`;

        const hideOnScroll = () => {
            unhighlightBodyPoint();
            window.removeEventListener('scroll', hideOnScroll);
        };
        window.addEventListener('scroll', hideOnScroll, { passive: true });
        element.dataset.scrollListener = 'active';
    }
}
```

Mudança única: linha 2-3 do corpo da função (early return se `display === 'none'`).

- [ ] **Step 5: Atualizar `unhighlightBodyPoint`**

Localizar `function unhighlightBodyPoint(element)` (próximo da linha 256). Substituir a função INTEIRA por:

```javascript
function unhighlightBodyPoint(element) {
    // 1. Always remove tooltip first
    const tooltip = document.getElementById('body-tooltip');
    if (tooltip) tooltip.remove();

    // If element is not provided, find the currently highlighted one
    if (!element) {
        const highlighted = document.querySelector('.body-map-point[data-scroll-listener="active"]');
        if (highlighted) {
            element = highlighted;
        } else {
            return;
        }
    }

    // Skip if this point is selected (selection takes precedence over hover)
    const pointId = element.getAttribute('data-point-id');
    const selectedIds = STATE.selectedBodyPoint ? STATE.selectedBodyPoint.split(',') : [];
    if (selectedIds.includes(pointId)) return;

    // Restore correct state via single source of truth
    if (element.dataset.scrollListener) delete element.dataset.scrollListener;
    applyPointState(element);
}
```

Mudança: linhas que hardcoded `setAttribute('fill', '#94a3b8')` etc. são substituídas por `applyPointState(element)`. Isso restaura ao estado correto (hidden se não-selected/previewed, ou cor adequada se for).

- [ ] **Step 6: Sanity check no browser**

```javascript
window.location.reload();
// Após reload, ir para aba mapa
// VISUAL: corpo deve aparecer LIMPO, sem nenhum ponto visível
document.querySelectorAll('.body-map-point').length
// Esperado: dezenas (ainda existem no DOM)
[...document.querySelectorAll('.body-map-point')].filter(el => el.style.display !== 'none').length
// Esperado: 0 (todos invisíveis no estado default)

// Selecionar uma condição
selectConditionGuide(Object.keys(GUIA).find(k => GUIA[k].label.toLowerCase().includes('tuberculose')));
// VISUAL: pontos da condição aparecem em roxo, pulsando
[...document.querySelectorAll('.body-map-point')].filter(el => el.style.display !== 'none').length
// Esperado: ≥1 (os pontos da condição visíveis)

// Limpar
clearConditionGuide();
// VISUAL: corpo volta a limpo
[...document.querySelectorAll('.body-map-point')].filter(el => el.style.display !== 'none').length
// Esperado: 0

// Testar blink
generateGlossaryGrid; // confirmar que existe (deve existir desde antes)
// blinkBodyPoint('estomago'); // ID válido
// VISUAL: ponto pisca por 3s e depois some
```

- [ ] **Step 7: Commit**

```bash
git -c core.autocrlf=false add js/body-map-helpers.js
git -c core.autocrlf=false commit -m "feat(mapa): hide inactive body map points by default

Points are now invisible unless selected, previewed (sidebar hover), or
blinking (glossary). Discovery shifts to the conditions sidebar and the
upcoming top-regions panel; the map becomes a focused 'reveal' surface.

applyPointState gates visibility through a single check, so blink/highlight/
unhighlight can stay simple and delegate state restoration here.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Painel de top regiões (Componente C)

**Files:**
- Modify: `js/guide.js`

- [ ] **Step 1: Adicionar `computeTopRegions` e `renderTopRegionsPanel`**

Em `js/guide.js`, **após** a função `hideCitationPanel` (criada na Task 2) e ANTES de `function showConditionSelector()`, inserir:

```javascript
// ── Top regions panel — discovery by teaching density ─────────────────────
let _topRegionsCache = null;

function computeTopRegions(n) {
    if (_topRegionsCache) return _topRegionsCache;
    if (!STATE || !STATE.data || !STATE.data.por_regiao || !window.BODY_DATA) return [];

    const allPoints = [
        ...BODY_DATA.points.front,
        ...BODY_DATA.points.back,
        ...BODY_DATA.points.detail
    ];
    const byName = {};
    allPoints.forEach(p => {
        if (!byName[p.name]) byName[p.name] = [];
        byName[p.name].push(p.id);
    });

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
    if (top.length === 0) {
        panel.innerHTML = '';
        panel.style.display = 'none';
        return;
    }

    const items = top.map(r => `
        <button
            type="button"
            onclick="selectBodyPoint('${escapeAttr(r.ids.join(','))}')"
            onmouseenter="previewBodyPoints('${escapeAttr(r.ids.join(','))}')"
            onmouseleave="clearBodyPointPreview()"
            class="text-left px-3 py-2 rounded-lg bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 hover:border-purple-500 dark:hover:border-purple-400 transition-all">
            <span class="block text-xs font-bold text-gray-800 dark:text-gray-100">${escHtml(r.name)}</span>
            <span class="block text-[9px] text-gray-400 mt-0.5">${r.count} ensinamento${r.count === 1 ? '' : 's'}</span>
        </button>
    `).join('');

    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="bg-gray-50 dark:bg-[#161616] rounded-lg p-5 mt-4">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-3">
                Regiões com mais ensinamentos
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
                ${items}
            </div>
        </div>`;
}
```

- [ ] **Step 2: Chamar `renderTopRegionsPanel` em `showConditionSelector`**

Localizar `function showConditionSelector()` (atualizada na Task 1). Adicionar a chamada `renderTopRegionsPanel()` no fim do corpo:

```javascript
function showConditionSelector() {
    loadGuia(); // pre-fetch
    const ctx = document.getElementById('contextPanel');
    if (ctx) ctx.classList.remove('hidden');
    renderTopRegionsPanel();
    if (window.matchMedia && window.matchMedia('(min-width: 1024px)').matches) {
        setTimeout(() => {
            const inp = document.getElementById('guiaSidebarSearch');
            if (inp && document.activeElement !== inp) inp.focus({ preventScroll: true });
        }, 200);
    }
}
```

- [ ] **Step 3: Sanity check**

```javascript
window.location.reload();
// Após reload, ir pra aba mapa
document.querySelectorAll('#topRegionsPanel button').length
// Esperado: 10 (top 10 regiões com count > 0)

// Verificar conteúdo da primeira
const first = document.querySelector('#topRegionsPanel button');
first.textContent.trim()
// Esperado: "Estômago" (ou outro nome de região com mais ensinamentos) + "N ensinamentos"

// Click numa região
first.click();
// VISUAL: pontos correspondentes pulsam no mapa, contentList filtra
// Citação NÃO aparece (não há condição selecionada — só região)
document.getElementById('guideCitationPanel').style.display
// Esperado: "none"
```

- [ ] **Step 4: Commit**

```bash
git -c core.autocrlf=false add js/guide.js
git -c core.autocrlf=false commit -m "feat(mapa): add top regions panel below citation

Lists the 10 body regions with most teachings as a discovery affordance.
Click selects the region (pulses points + filters articles); hover previews.
Cached on first compute since data is static at boot.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Cache bump + verificação completa + atualizar HANDOFF

**Files:**
- Modify: `index.html` (linhas 1007, 1018, 1022)
- Modify: `HANDOFF.md`

- [ ] **Step 1: Bumpar versões em `index.html`**

| Linha | De | Para |
|-------|----|----|
| 1007  | `js/body-map-helpers.js?v=101` | `js/body-map-helpers.js?v=102` |
| 1018  | `js/ui-renderer.js?v=119` | `js/ui-renderer.js?v=120` |
| 1022  | `js/guide.js?v=7` | `js/guide.js?v=8` |

- [ ] **Step 2: Iniciar preview server**

```
preview_start (root: C:\Mioshie_Sites\guia_johrei)
```

Ajustar viewport para 1280×800 (`preview_resize width=1280 height=800`).

- [ ] **Step 3: Validação completa (checklist do spec)**

Para cada item, usar `preview_eval`/`preview_fill`/`preview_click`/`preview_snapshot`. Capturar resultado.

1. **Mapa default limpo:**
   - `preview_eval: setTab('mapa')`
   - `preview_eval: [...document.querySelectorAll('.body-map-point')].filter(el => el.style.display !== 'none').length`
   - Esperado: 0

2. **Hover em condição na sidebar mostra preview:**
   - Aguardar `loadGuia()` terminar (`STATE.data.por_regiao` populado)
   - Disparar mouseenter num item da sidebar via `preview_eval` que chame `previewBodyPoints` com IDs válidos
   - Confirmar que `display !== 'none'` em pelo menos 1 ponto
   - Disparar mouseleave (ou `clearBodyPointPreview()`)
   - Confirmar que pontos voltam a `display === 'none'`

3. **Selecionar condição mostra citação no painel:**
   - `preview_eval: const k = Object.keys(GUIA).find(x => GUIA[x].label.toLowerCase().includes('tuberculose')); selectConditionGuide(k)`
   - Confirmar `document.getElementById('guideCitationPanel').style.display === 'block'`
   - Confirmar texto contém "Pontos Vitais do Johrei"
   - Confirmar sidebar contém "Pontos Vitais ·" → **falso** (citação saiu da sidebar)

4. **Citação persiste durante busca na sidebar:**
   - `preview_fill #guiaSidebarSearch "estomago"`
   - Confirmar painel ainda mostra "Pontos Vitais do Johrei" (não foi destruído)

5. **Top regiões aparece e é clicável:**
   - `preview_eval: document.querySelectorAll('#topRegionsPanel button').length`
   - Esperado: 10
   - Click no primeiro: `preview_click '#topRegionsPanel button:first-child'`
   - Confirmar que `selectedBodyPoint` foi setado e ao menos 1 ponto está visível

6. **Mobile (resize 800×900):**
   - `preview_resize 800 900`, recarregar
   - Confirmar painel `#contextPanel` ainda existe
   - Layout empilha verticalmente sem overflow horizontal

7. **Console limpo:**
   - `preview_console_logs level=error`
   - Esperado: nenhum erro novo (warnings preexistentes do Tailwind CDN OK)

- [ ] **Step 4: Screenshot final (se possível)**

`preview_screenshot` da aba mapa com condição selecionada — para evidência visual. Se timeout (como aconteceu no plano anterior), pular sem bloquear.

- [ ] **Step 5: Commit do bump**

```bash
git -c core.autocrlf=false add index.html
git -c core.autocrlf=false commit -m "chore: bump cache for mapa redesign

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Atualizar `HANDOFF.md`**

Adicionar nova subseção em "O que foi feito":

```markdown
### 6. Redesign da aba Mapa (2026-04-25)
- Pontos do corpo escondidos por padrão; aparecem só quando: condição
  selecionada, hover em sidebar, ou blink do glossário
- Citação de Meishu-Sama movida da sidebar pra painel `#contextPanel`
  abaixo do mapa (full width); citação não some mais ao buscar/rolar
- Novo painel "Regiões com mais ensinamentos" — top 10 por densidade,
  clicáveis (filtram artigos + pulsam pontos no mapa)
- Refactor interno: `getPointVisualState`, `pointStyleFor`, `applyPointState`
  como única fonte de verdade pro estado visual dos pontos. ~100 linhas
  duplicadas removidas. Dead code `renderCitationPanel` ressuscitado.
- Spec: `docs/superpowers/specs/2026-04-25-mapa-redesign-context-panel-design.md`
- Plano: `docs/superpowers/plans/2026-04-25-mapa-redesign-context-panel.md`
```

Em "Próximos passos sugeridos > Refinamentos do guia", marcar ambos os itens completados:

```markdown
### Refinamentos do guia
- ✅ ~~Busca dentro da sidebar de condições~~ (concluído 2026-04-25)
- ✅ ~~Contadores/discovery por região~~ (concluído 2026-04-25 — feito como
  painel "Regiões com mais ensinamentos" no contextPanel)
- Cross-link: card de condição → "Ver ensinamentos originais em
  Estudo Aprofundado"
```

- [ ] **Step 7: Commit do HANDOFF**

```bash
git -c core.autocrlf=false add HANDOFF.md
git -c core.autocrlf=false commit -m "docs: log mapa redesign as completed

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Componente A (esconder pontos inativos) → Tasks 4, 5, 6
- ✅ Componente B (citação abaixo do mapa) → Tasks 1, 2, 3
- ✅ Componente C (top regiões) → Task 7
- ✅ Refactor centralizado (helpers) → Tasks 4, 5, 6
- ✅ Cache bumps → Task 8
- ✅ Validação manual completa → Task 8 step 3
- ✅ Mobile considerations → testado em Task 8 step 3.6

**2. Placeholder scan:** Nenhum TBD/TODO. Todos os passos têm código completo ou comando exato.

**3. Type consistency:**
- `getPointVisualState`, `pointStyleFor`, `applyPointState` definidos na Task 4 e usados consistentemente nas Tasks 5 e 6 (mesmas assinaturas, mesmas propriedades retornadas)
- `renderCitationPanel`/`hideCitationPanel` definidos na Task 2, usados em `selectConditionGuide`/`clearConditionGuide` na mesma task
- `computeTopRegions(n)` aceita `n` parameter; chamado com `10` em `renderTopRegionsPanel` (Task 7)
- `showConditionSelector` editado em duas tasks (1 e 7) — versão final na Task 7 incorpora corretamente: hideClass remove + autofocus + renderTopRegionsPanel
