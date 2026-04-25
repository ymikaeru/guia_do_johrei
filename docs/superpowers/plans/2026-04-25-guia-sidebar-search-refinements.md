# Plano: Refinamentos da busca na sidebar do Guia de Atendimento

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver 5 lacunas de UX da busca de condições na aba `mapa`: acentos, empty state, botão limpar, preservação de citação, autofocus.

**Architecture:** Modificações localizadas em `js/guide.js` (lógica) e `style.css` (botão X). Cache busting em `index.html`. Sem dependências novas, sem mudança estrutural — apenas refinamento da feature já existente.

**Tech Stack:** Vanilla JS (sem build step, sem framework de testes). Validação é manual no browser via Claude Preview tools.

**Spec:** `docs/superpowers/specs/2026-04-25-guia-sidebar-search-refinements-design.md`

**Nota sobre TDD:** Este codebase não tem suite de testes automatizados (CLAUDE.md confirma: "vanilla JS ou Tailwind CDN. Não introduzir bundler"). Validação é manual no browser. As steps incluem comandos `preview_*` em vez de `pytest`.

---

## File Structure

| Arquivo | Mudança | Responsabilidade |
|---------|---------|------------------|
| `js/guide.js` | Modificar | Helper `normalize()`; filtro acento-insensitive; empty state; preservar citação durante busca; autofocus desktop |
| `style.css` | Modificar (anexar) | Estilo do `::-webkit-search-cancel-button` para o input `#guiaSidebarSearch` |
| `index.html` | Modificar (linhas 54 e 1022) | Bumpar `?v=5` → `?v=6` para `js/guide.js` e `style.css` |

---

### Task 1: Helper `normalize()` + busca acento-insensitive

**Files:**
- Modify: `js/guide.js:44-46` (lógica do filtro em `generateConditionOptions`)
- Modify: `js/guide.js:269-273` (adicionar helper junto aos outros)

- [ ] **Step 1: Adicionar helper `normalize()` ao bloco de Helpers**

Em `js/guide.js`, localizar a seção `// ── Helpers ──...` (linha ~268) e adicionar **antes** de `escHtml`:

```javascript
function normalize(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
```

- [ ] **Step 2: Aplicar `normalize` no filtro de `generateConditionOptions`**

Em `js/guide.js`, substituir o bloco atual nas linhas 44-47:

```javascript
    const q = (filter || '').toLowerCase();
    const list = q
        ? guiaConditions.filter(c => c.label.toLowerCase().includes(q))
        : guiaConditions;
```

por:

```javascript
    const q = normalize(filter);
    const list = q
        ? guiaConditions.filter(c => normalize(c.label).includes(q))
        : guiaConditions;
```

- [ ] **Step 3: Verificação manual rápida no console**

Cole no DevTools console (depois de carregar a aba mapa):

```javascript
filterGuiaSidebar('estomago');
// Inspecionar #bodyPointSidebarList — deve listar "Estômago", "Câncer no Estômago", etc.
```

Esperado: condições com "Estômago" aparecem mesmo digitando sem acento.

- [ ] **Step 4: Commit**

```bash
git -c core.autocrlf=false add js/guide.js
git -c core.autocrlf=false commit -m "feat(guide): make condition search accent-insensitive

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Empty state quando filtro zera resultados

**Files:**
- Modify: `js/guide.js:44-60` (final de `generateConditionOptions`)

- [ ] **Step 1: Adicionar branch de empty state**

Em `js/guide.js`, após calcular `list` e antes do `return list.map(...)` na linha 49, adicionar:

```javascript
    if (q && list.length === 0) {
        const safeQ = escHtml(filter || '');
        return `<div class="px-5 py-8 text-center text-[11px] text-gray-400">
            Nenhuma condição para «${safeQ}»
            <button onclick="document.getElementById('guiaSidebarSearch').value='';filterGuiaSidebar('')"
                class="block mx-auto mt-2 text-[10px] underline cursor-pointer">
                limpar busca
            </button>
        </div>`;
    }
```

(O `filter` original — não normalizado — preserva acentos digitados pelo usuário; o `escHtml` evita XSS.)

- [ ] **Step 2: Verificação manual no console**

```javascript
filterGuiaSidebar('xyzabcnaoexiste');
// #bodyPointSidebarList deve mostrar "Nenhuma condição para «xyzabcnaoexiste»" + botão "limpar busca"
```

Clicar no botão "limpar busca" → input zera → lista completa retorna.

- [ ] **Step 3: Commit**

```bash
git -c core.autocrlf=false add js/guide.js
git -c core.autocrlf=false commit -m "feat(guide): show empty state when search has no matches

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: CSS para botão limpar (X) consistente

**Files:**
- Modify: `style.css` (anexar ao final)

- [ ] **Step 1: Anexar regra CSS para o cancel button**

Adicionar ao final de `style.css`:

```css
/* Sidebar search clear button (X) — consistent across browsers */
#guiaSidebarSearch::-webkit-search-cancel-button,
#guiaModalSearch::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
    height: 14px;
    width: 14px;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'><path d='M4 4l6 6M10 4l-6 6' stroke='%23999' stroke-width='1.5' stroke-linecap='round' fill='none'/></svg>");
    background-repeat: no-repeat;
    background-position: center;
    cursor: pointer;
    opacity: .55;
    margin-left: 4px;
}
#guiaSidebarSearch::-webkit-search-cancel-button:hover,
#guiaModalSearch::-webkit-search-cancel-button:hover {
    opacity: 1;
}
```

(Cobrimos também `#guiaModalSearch` — o input mobile injetado em `js/guide.js:256`.)

- [ ] **Step 2: Verificação manual no preview**

Após bumpar o cache (Task 6), digitar texto no input → verificar que o X aparece visível à direita do texto, e clicá-lo limpa o input + dispara `oninput` (lista volta ao estado completo).

- [ ] **Step 3: Commit**

```bash
git -c core.autocrlf=false add style.css
git -c core.autocrlf=false commit -m "style(guide): consistent clear (X) button on sidebar search

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Preservar citação durante busca

**Files:**
- Modify: `js/guide.js:62-70` (função `filterGuiaSidebar`)

**Contexto:** Quando uma condição está selecionada (`activeConditionKey` truthy), `selectConditionGuide` renderiza no `#bodyPointSidebarList` um card de citação no topo seguido de "Outras condições" + lista. Se o usuário digita na busca, `filterGuiaSidebar` atualmente substitui tudo pelo prefix "— Todas as condições —" + lista filtrada, **destruindo o card**. A correção mantém o card sticky e filtra apenas a seção abaixo.

- [ ] **Step 1: Refatorar `filterGuiaSidebar`**

Substituir a função inteira em `js/guide.js:62-70`:

```javascript
// ── Live search filter in sidebar ──────────────────────────────────────────
window.filterGuiaSidebar = function(q) {
    const list = document.getElementById('bodyPointSidebarList');
    const mlist = document.getElementById('filterModalList');
    const html = window.generateConditionOptions(q);

    // If a condition is currently selected, preserve the citation card on top
    // and filter only the "Outras condições" section beneath it.
    if (activeConditionKey && GUIA && GUIA[activeConditionKey]) {
        const cond = GUIA[activeConditionKey];
        const trecho = (cond.trecho_meishu || '')
            .replace(/\*\*/g, '').replace(/\[|\]/g, '').trim();
        const ptsHtml = cond.focal_points.map((fp, i) =>
            `<span style="display:inline-block;padding:3px 9px;margin:2px;border-radius:10px;font-size:10px;
                font-weight:600;background:${i===0?'#000':'#f0f0f0'};color:${i===0?'#fff':'#444'}">${escHtml(fp.label)}</span>`
        ).join('');
        const citationHtml = `
            <div style="padding:12px;background:#fafaf8;border-bottom:2px solid #e8e4da">
                <div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:#999;margin-bottom:6px">
                    Pontos Vitais · ${escHtml(cond.label)}
                </div>
                <div style="margin-bottom:${trecho?'8px':'0'}">${ptsHtml}</div>
                ${trecho ? `<div style="font-size:11px;color:#888;line-height:1.5;font-style:italic;border-top:1px solid #e8e4da;padding-top:8px;margin-top:4px">
                    "${escHtml(trecho.substring(0, 200))}${trecho.length>200?'…':''}"
                </div>` : ''}
                <button onclick="clearConditionGuide()" style="margin-top:8px;font-size:10px;color:#aaa;background:none;border:none;cursor:pointer;padding:0">
                    ← Todas as condições
                </button>
            </div>
            <div class="px-5 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-400 bg-gray-50 border-b border-gray-100">
                Outras condições
            </div>
            ${html}`;
        if (list) list.innerHTML = citationHtml;
        if (mlist) mlist.innerHTML = citationHtml;
        return;
    }

    // No active condition — show "todas as condições" prefix + filtered list
    const prefix = `<div class="px-5 py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 transition-all text-gray-400 hover:bg-gray-50 hover:text-black" onclick="clearConditionGuide()">— Todas as condições —</div>`;
    if (list) list.innerHTML = prefix + html;
    if (mlist) mlist.innerHTML = prefix + html;
};
```

**Nota:** o card de citação é o mesmo HTML produzido em `selectConditionGuide` (linhas 87-103). Ambos os locais constroem o card; uma futura refatoração poderia extrair para função compartilhada, mas está fora de escopo deste plano (YAGNI — só dois call sites).

- [ ] **Step 2: Verificação manual**

1. Selecionar uma condição (ex.: "Tuberculose") → card de citação aparece no topo
2. Digitar "estomago" no input
3. Esperado: card de **Tuberculose** continua no topo, "Outras condições" lista mostra apenas matches de "estomago"
4. Limpar input → card permanece, lista completa volta abaixo
5. Clicar "← Todas as condições" → card desaparece, comportamento sem condição ativa restaurado

- [ ] **Step 3: Commit**

```bash
git -c core.autocrlf=false add js/guide.js
git -c core.autocrlf=false commit -m "feat(guide): preserve citation card while searching

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Autofocus no input ao abrir aba mapa (desktop only)

**Files:**
- Modify: `js/guide.js:233-235` (função `showConditionSelector`)

- [ ] **Step 1: Adicionar autofocus condicional**

Substituir em `js/guide.js:233-235`:

```javascript
function showConditionSelector() {
    loadGuia(); // pre-fetch
}
```

por:

```javascript
function showConditionSelector() {
    loadGuia(); // pre-fetch
    // Auto-focus the search on desktop only — mobile would open the virtual keyboard.
    if (window.matchMedia && window.matchMedia('(min-width: 1024px)').matches) {
        setTimeout(() => {
            const inp = document.getElementById('guiaSidebarSearch');
            if (inp && document.activeElement !== inp) inp.focus({ preventScroll: true });
        }, 200);
    }
}
```

(`preventScroll: true` evita que o foco role a página; o `setTimeout(200)` dá tempo do DOM da aba mapa ser montado antes do `.focus()`.)

- [ ] **Step 2: Verificação manual**

**Desktop:** trocar para a aba `mapa` → cursor deve estar dentro do input de busca; digitar começa a filtrar imediatamente sem clicar.

**Mobile (resize ≤ 1023px ou DevTools mobile):** trocar para a aba `mapa` → input **NÃO** deve receber foco (teclado virtual não abre).

- [ ] **Step 3: Commit**

```bash
git -c core.autocrlf=false add js/guide.js
git -c core.autocrlf=false commit -m "feat(guide): autofocus sidebar search on desktop

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Cache bust + verificação completa no browser

**Files:**
- Modify: `index.html:54` e `index.html:1022`

- [ ] **Step 1: Bumpar versões de cache**

Em `index.html` linha 54:
```html
<link rel="stylesheet" href="style.css?v=5">
```
para:
```html
<link rel="stylesheet" href="style.css?v=6">
```

Em `index.html` linha 1022:
```html
<script src="js/guide.js?v=5"></script>
```
para:
```html
<script src="js/guide.js?v=6"></script>
```

- [ ] **Step 2: Iniciar preview server**

```
preview_start  (root: C:\Mioshie_Sites\guia_johrei)
```

- [ ] **Step 3: Validação completa (checklist do spec)**

Para cada item, usar `preview_click`, `preview_fill`, `preview_eval` e `preview_snapshot`. Após cada um, capturar evidência (snapshot ou screenshot).

Roteiro:

1. Navegar para aba `mapa` (`preview_click` na tab "Mapa Corporal" ou equivalente)
2. **Acentos:** `preview_fill` no `#guiaSidebarSearch` com `"estomago"` → `preview_snapshot` da sidebar — esperado: condições contendo "Estômago" aparecem
3. **Empty state:** `preview_fill` com `"xyzabcnaoexiste"` → snapshot — esperado: bloco "Nenhuma condição para «xyzabcnaoexiste»" + botão "limpar busca"
4. **Botão limpar:** clicar no botão "limpar busca" via `preview_click` → snapshot — esperado: input vazio, lista completa
5. **X nativo:** `preview_fill` com `"dor"`, depois `preview_eval` para clicar no `::-webkit-search-cancel-button` (workaround: `document.getElementById('guiaSidebarSearch').value=''; document.getElementById('guiaSidebarSearch').dispatchEvent(new Event('input'))`) → confirmar que limpa
6. **Citação preservada:** clicar em uma condição na sidebar (ex.: "Tuberculose") → snapshot do card de citação. Depois `preview_fill` com `"estomago"` → snapshot — esperado: card de Tuberculose **ainda visível** no topo, "Outras condições" lista filtrada abaixo
7. **Autofocus desktop:** `preview_resize` para 1280×800, recarregar (`preview_eval: window.location.reload()`), navegar para aba mapa → `preview_eval: document.activeElement && document.activeElement.id` — esperado: `"guiaSidebarSearch"`
8. **Autofocus desativado em mobile:** `preview_resize` para 800×900, recarregar, navegar para aba mapa → `preview_eval: document.activeElement && document.activeElement.id` — esperado: NÃO `"guiaSidebarSearch"` (deve ser `body` ou outro)
9. **Console limpo:** `preview_console_logs` — esperado: nenhum erro JS relacionado a `guide.js`

- [ ] **Step 4: Screenshot final**

`preview_screenshot` da aba mapa com sidebar visível para anexar ao commit final / PR.

- [ ] **Step 5: Commit**

```bash
git -c core.autocrlf=false add index.html
git -c core.autocrlf=false commit -m "chore: bump cache version for guide search refinements

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Atualizar HANDOFF.md**

Adicionar entrada na seção "O que foi feito" listando os 5 refinamentos. Marcar o item da seção "Próximos passos" como concluído.

```bash
git -c core.autocrlf=false add HANDOFF.md
git -c core.autocrlf=false commit -m "docs: log sidebar search UX refinements as completed

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Item 1 (acentos) → Task 1
- ✅ Item 2 (empty state) → Task 2
- ✅ Item 3 (botão X) → Task 3
- ✅ Item 4 (citação preservada) → Task 4
- ✅ Item 5 (autofocus desktop) → Task 5
- ✅ Cache bust → Task 6 step 1
- ✅ Validação manual (checklist do spec) → Task 6 step 3

**2. Placeholder scan:** Nenhum TBD/TODO/"adicionar handling apropriado". Todo código está completo e copiável.

**3. Type consistency:**
- `normalize()` definida em Task 1, usada em Task 1 (mesma assinatura).
- `activeConditionKey`, `GUIA`, `escHtml`, `loadGuia` — variáveis/funções existentes em `guide.js`, referenciadas com nomes corretos (verificadas contra o arquivo atual).
- `filterGuiaSidebar` reutiliza `generateConditionOptions(q)` que retorna o `<div>` de empty state em Task 2 quando `q` zera resultados — funciona transparentemente também em Task 4 (com condição ativa, "Outras condições" pode mostrar empty state).
