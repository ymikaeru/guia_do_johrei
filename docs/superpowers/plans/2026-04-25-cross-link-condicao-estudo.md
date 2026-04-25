# Plano: Cross-link condição → Estudo Aprofundado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um CTA no card de citação que leva o ministrante para a aba Estudo Aprofundado pré-filtrada pela condição selecionada.

**Architecture:** Tudo em `js/guide.js` — duas funções puras (`countEstudoMatchesFor`, `goToEstudoForCondition`) usando `normalize()` que já existe, e modificação no markup gerado por `renderCitationPanel`. O badge "Estudo Aprofundado" nos cards do `#contentList` já é renderizado por `renderList` em `ui.js` — não precisa mudar.

**Tech Stack:** Vanilla JS (sem build step, sem framework de testes). Validação manual no preview.

**Spec:** `docs/superpowers/specs/2026-04-25-cross-link-condicao-estudo-design.md`

**Nota TDD:** Sem suite automatizada (CLAUDE.md). Validação é manual no browser via Claude Preview tools.

---

## File Structure

| Arquivo | Mudança |
|---------|---------|
| `js/guide.js` | Adicionar 2 funções (`countEstudoMatchesFor`, `goToEstudoForCondition`) + modificar HTML de `renderCitationPanel` para incluir CTA condicional |
| `index.html` | Bumpar `?v=N` em `js/guide.js` |

Total: ~30 linhas alteradas. 1 task lógica + 1 task de bump/verificação.

---

### Task 1: Adicionar `countEstudoMatchesFor`, `goToEstudoForCondition` e CTA em `renderCitationPanel`

**Files:**
- Modify: `js/guide.js`

- [ ] **Step 1: Localizar onde inserir as novas funções**

Em `js/guide.js`, localizar `function hideCitationPanel()` (logo abaixo de `renderCitationPanel`). As 2 funções novas vão **logo abaixo** de `hideCitationPanel`, antes de `function showConditionSelector()`.

- [ ] **Step 2: Adicionar `countEstudoMatchesFor` e `goToEstudoForCondition`**

Inserir o seguinte bloco em `js/guide.js`, depois de `hideCitationPanel` e antes de `function showConditionSelector()`:

```javascript
// ── Cross-link to Estudo Aprofundado ──────────────────────────────────────
// Returns the count of estudo_aprofundado items whose normalized title
// contains the normalized "search term" derived from a condition label.
// Same term-extraction rule used elsewhere in selectConditionGuide.
function countEstudoMatchesFor(condLabel) {
    const items = (STATE && STATE.data && STATE.data.estudo_aprofundado) || [];
    if (items.length === 0) return 0;
    const term = normalize(
        (condLabel || '').replace(/\s*\(.*?\)\s*/g, '').replace(/[–-].*$/, '').trim()
    );
    if (!term) return 0;
    return items.filter(it => normalize(it.title_pt || it.title || '').includes(term)).length;
}

// Switches to the estudo_aprofundado tab and pre-fills the search input
// with the condition's term so the user lands on a filtered view.
window.goToEstudoForCondition = function(condLabel) {
    const term = (condLabel || '').replace(/\s*\(.*?\)\s*/g, '').replace(/[–-].*$/, '').trim();
    if (typeof setTab !== 'function') return;
    setTab('estudo_aprofundado');
    setTimeout(() => {
        const inp = document.getElementById('searchInput')
            || document.getElementById('mobileSearchInput')
            || document.getElementById('desktopSearchInput');
        if (inp) {
            inp.value = term;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (typeof STATE !== 'undefined') STATE.searchQuery = term;
        if (typeof applyFilters === 'function') applyFilters();
    }, 50);
};
```

Notas:
- `normalize` já está definido em `guide.js` (NFD + strip combining marks + lowercase) — reutilizamos
- `setTab` é global (de `core.js`); guarda defensiva caso não exista ainda
- `setTimeout(50)` dá tempo do `setTab` re-renderizar o markup antes de aplicar filtro
- `STATE.searchQuery` + `applyFilters()` é fallback caso o input não exista no momento

- [ ] **Step 3: Modificar `renderCitationPanel` para inserir o CTA condicional**

Em `js/guide.js`, localizar `function renderCitationPanel(cond)`. O `panel.innerHTML` atual é:

```javascript
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
```

ANTES de definir `panel.innerHTML`, calcular o CTA e injetá-lo. Adicionar logo antes da linha `panel.innerHTML = ...`:

```javascript
    const estudoCount = countEstudoMatchesFor(cond.label);
    const labelAttr = String(cond.label || '').replace(/'/g, "\\'");
    const ctaHtml = estudoCount > 0
        ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e8e4da">
            <button onclick="goToEstudoForCondition('${labelAttr}')"
                style="background:none;border:1px solid #d4cfc1;cursor:pointer;
                       font-size:11px;color:#555;padding:8px 14px;border-radius:6px;
                       font-weight:600;letter-spacing:.04em;
                       transition:background .15s,color .15s"
                onmouseover="this.style.background='#1c1917';this.style.color='#fff'"
                onmouseout="this.style.background='none';this.style.color='#555'">
                Ver ${estudoCount} ensinamento${estudoCount === 1 ? '' : 's'} original${estudoCount === 1 ? '' : 'is'} de Meishu-Sama →
            </button>
        </div>`
        : '';
```

Em seguida, adicionar `${ctaHtml}` no FINAL do template literal de `panel.innerHTML`, depois do bloco do trecho:

```javascript
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
        </div>` : ''}
        ${ctaHtml}`;
```

**Importante:** o `${ctaHtml}` deve ser a **última** linha antes do `;` final.

- [ ] **Step 4: Sanity check no browser preview (sem cache bump ainda — usa fetch absoluto pra validar a função)**

Cole no DevTools console:

```javascript
// 1. Funções existem?
[typeof countEstudoMatchesFor, typeof goToEstudoForCondition]
// Esperado: ["function", "function"] após próxima carga (Step 6 vai bumpar)

// 2. Match: simular tuberculose
countEstudoMatchesFor('Tuberculose Faríngea')
// Esperado: 18 (ou número alto)

// 3. Match: simular amigdalite
countEstudoMatchesFor('Amigdalite – Inflamação das Amígdalas')
// Esperado: 0

// 4. Acento-insensitive: 'estomago' deve achar 'Estômago'
countEstudoMatchesFor('Estômago')
// Esperado: > 0
```

(Esses checks só funcionam APÓS o cache bump. A Step 4 aqui é nominal — verificação completa fica na Task 2.)

- [ ] **Step 5: Commit**

```bash
git -c core.autocrlf=false add js/guide.js
git -c core.autocrlf=false commit -m "feat(guide): add cross-link from condition citation to Estudo Aprofundado

Adds a CTA button to the citation panel showing the count of Estudo
Aprofundado items matching the selected condition. Click switches to
the estudo_aprofundado tab and pre-fills the search input with the
condition's normalized term, surfacing the original Meishu-Sama
teachings.

Hidden when count is zero. Uses the existing normalize() helper for
accent-insensitive matching.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Cache bump + verificação completa no browser

**Files:**
- Modify: `index.html` (linha do `js/guide.js`)

- [ ] **Step 1: Bumpar cache**

Em `index.html`, linha 1022 (aproximadamente):

```html
<script src="js/guide.js?v=9"></script>
```

para:

```html
<script src="js/guide.js?v=10"></script>
```

- [ ] **Step 2: Iniciar/reusar preview server**

Server já está rodando (preview_start é idempotente). Confirmar:
- Viewport 1280×800 (`preview_resize width=1280 height=800`)
- Hard reload (`window.location.reload()`)

- [ ] **Step 3: Validação completa**

Para cada item, usar `preview_eval`/`preview_click`/`preview_snapshot`. Capturar evidência.

1. **CTA aparece para condição com matches:**
   - `preview_eval: setTab('mapa'); setTimeout(() => { const k = Object.keys(GUIA).find(x => GUIA[x].label.toLowerCase().includes('tuberculose')); selectConditionGuide(k); }, 1500);`
   - Aguardar render
   - `preview_eval: { ctaText: document.querySelector('#guideCitationPanel button[onclick*="goToEstudo"]')?.textContent.trim().replace(/\s+/g, ' '), citationVisible: document.getElementById('guideCitationPanel').style.display === 'block' }`
   - Esperado: `ctaText` contém "Ver N ensinamentos originais de Meishu-Sama →" e `citationVisible: true`

2. **CTA NÃO aparece para condição sem matches:**
   - `preview_eval: const k = Object.keys(GUIA).find(x => GUIA[x].label.toLowerCase().includes('amigdalite')); selectConditionGuide(k);`
   - `preview_eval: !!document.querySelector('#guideCitationPanel button[onclick*="goToEstudo"]')`
   - Esperado: `false`

3. **Click do CTA navega + filtra:**
   - Selecionar Tuberculose novamente (`selectConditionGuide(...)`)
   - `preview_eval: document.querySelector('#guideCitationPanel button[onclick*="goToEstudo"]').click()`
   - Aguardar 200ms
   - `preview_eval: { activeTab: STATE.activeTab, searchQuery: STATE.searchQuery, contentItems: document.querySelectorAll('#contentList article').length }`
   - Esperado: `activeTab: 'estudo_aprofundado'`, `searchQuery` contendo "tuberculose", `contentItems > 0`

4. **Acento-insensitive:**
   - `preview_eval: countEstudoMatchesFor('estomago')` (sem acento)
   - Esperado: > 0 (mesmo número que com acento)

5. **Badge "Estudo Aprofundado" visível nos cards:**
   - Voltar pra aba mapa, selecionar uma condição cuja contentList inclua estudo articles (ex: "Câncer de Estômago")
   - `preview_eval: [...document.querySelectorAll('#contentList .ci-cat')].map(el => el.textContent).slice(0, 5)`
   - Esperado: pelo menos 1 com "Estudo Aprofundado"

6. **Console limpo:**
   - `preview_console_logs level=error`
   - Esperado: sem erros novos

- [ ] **Step 4: Screenshot final pra evidência**

`preview_screenshot` da aba mapa com Tuberculose selecionada (CTA visível) — anexar como prova.

- [ ] **Step 5: Commit do bump**

```bash
git -c core.autocrlf=false add index.html
git -c core.autocrlf=false commit -m "chore: bump cache for cross-link CTA

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Atualizar HANDOFF.md**

Em `HANDOFF.md`, adicionar nova subseção em "O que foi feito" (acima da seção 6 do redesign):

```markdown
### 7. Cross-link condição → Estudo Aprofundado (2026-04-25)
- CTA no card de citação: "Ver N ensinamentos originais de Meishu-Sama →"
  aparece quando há matches no Estudo Aprofundado
- Click navega para a aba Estudo Aprofundado já com a busca filtrada
- Match acento-insensitive via `normalize()`; CTA omitido quando count===0
- Badge "Estudo Aprofundado" nos cards do contentList já existia em
  `js/ui.js` (renderList) — sem mudança
- Spec: `docs/superpowers/specs/2026-04-25-cross-link-condicao-estudo-design.md`
- Plano: `docs/superpowers/plans/2026-04-25-cross-link-condicao-estudo.md`
```

E em "Próximos passos sugeridos > Refinamentos do guia", marcar o último item:

```markdown
### Refinamentos do guia
- ✅ ~~Busca dentro da sidebar de condições~~
- ✅ ~~Contadores/discovery por região~~
- ✅ ~~Cross-link: card de condição → "Ver ensinamentos originais em
  Estudo Aprofundado"~~ (concluído 2026-04-25)
```

- [ ] **Step 7: Commit do HANDOFF**

```bash
git -c core.autocrlf=false add HANDOFF.md
git -c core.autocrlf=false commit -m "docs: log cross-link CTA as completed

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Componente A (CTA no card) → Task 1 step 3
- ✅ Componente B (badge nos cards) → ZERO TASK (já existia em `js/ui.js:267`); apenas verificação na Task 2 step 3.5
- ✅ Componente C (match strategy normalize) → Task 1 step 2 (`countEstudoMatchesFor`)
- ✅ Componente D (navegação) → Task 1 step 2 (`goToEstudoForCondition`)
- ✅ Pluralização ("ensinamento"/"ensinamentos") → Task 1 step 3
- ✅ Edge case empty → coberto pelo guard em `countEstudoMatchesFor`
- ✅ Cache bump + validação → Task 2

**2. Placeholder scan:** Sem TBD/TODO. Todos os steps têm código completo ou comando exato.

**3. Type consistency:**
- `countEstudoMatchesFor(condLabel)` retorna `number`; usado em Task 1 step 3 com check `> 0` (compatível)
- `goToEstudoForCondition` aceita label string; chamado via `'${labelAttr}'` com escape de aspas simples (compatível com pattern de outros onclicks)
- `normalize()` reusada (já existe em `guide.js`, definida na fase anterior)
- `setTab` chamado defensivamente com `typeof === 'function'` check
