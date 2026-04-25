# Plano: Formatação P&R no leitor de Estudo Aprofundado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renderizar artigos de Estudo Aprofundado (formato Q&A) com 3 seções visualmente distintas no modal de leitura: header, pergunta do fiel, resposta de Meishu-Sama.

**Architecture:** Detecção content-driven via regex no `content_pt`. Se conteúdo tem markers, função `formatEstudoBody` divide em seções e gera HTML com classes CSS. Senão, fallback para `formatBodyText`. Reusa `formatBodyText` dentro de cada seção pra preservar busca/highlight.

**Tech Stack:** Vanilla JS (sem build step, sem framework de testes). CSS escopado em `style.css`. Validação manual no preview.

**Spec:** `docs/superpowers/specs/2026-04-25-estudo-qa-formatting-design.md`

**Nota TDD:** Sem suite automatizada. Validação é manual no browser via Claude Preview tools.

---

## File Structure

| Arquivo | Mudança |
|---------|---------|
| `js/ui.js` | + `parseEstudoSections(content)` (pura) e `formatEstudoBody(text, q, fp)` (wrapper) |
| `js/modal.js` | 2 chamadas `formatBodyText(pt, ...)` → `formatEstudoBody(pt, ...)` para `contentPT` e `contentComparePT` |
| `style.css` | + 25 linhas de classes `.estudo-*` (light + dark) |
| `index.html` | bump cache de `js/ui.js`, `js/modal.js`, `style.css` |

Total: ~80 LOC. 2 tasks (1 implementação + 1 cache bump/verificação).

---

### Task 1: Adicionar `parseEstudoSections`, `formatEstudoBody`, integrar no modal e estilizar

**Files:**
- Modify: `js/ui.js` (adicionar 2 funções)
- Modify: `js/modal.js` (2 chamadas)
- Modify: `style.css` (adicionar bloco CSS)

- [ ] **Step 1: Adicionar `parseEstudoSections` em `js/ui.js`**

Localizar `function formatBodyText(text, searchQuery, focusPoints)` em `js/ui.js` (linha ~105). **Antes** dela, inserir:

```javascript
// ── Estudo Aprofundado Q&A formatting ─────────────────────────────────────
// Pure: splits an article's content into header / question / answer sections
// using the markers "Pergunta do Fiel" and "Resposta de Meishu-Sama".
// Returns { isQA, header, question, answer } — isQA=false means no markers.
function parseEstudoSections(content) {
    if (!content) return { isQA: false, header: '', question: '', answer: '' };
    const PERGUNTA = /Pergunta\s+do\s+Fiel/i;
    const RESPOSTA = /Resposta\s+de\s+Meishu-Sama/i;

    const pMatch = content.match(PERGUNTA);
    const rMatch = content.match(RESPOSTA);

    if (!pMatch && !rMatch) {
        return { isQA: false, header: content, question: '', answer: '' };
    }

    let header = '';
    let question = '';
    let answer = '';

    if (pMatch && rMatch && rMatch.index > pMatch.index) {
        header = content.slice(0, pMatch.index).trim();
        question = content.slice(pMatch.index + pMatch[0].length, rMatch.index).trim();
        answer = content.slice(rMatch.index + rMatch[0].length).trim();
    } else if (pMatch && !rMatch) {
        header = content.slice(0, pMatch.index).trim();
        question = content.slice(pMatch.index + pMatch[0].length).trim();
    } else if (rMatch && !pMatch) {
        header = content.slice(0, rMatch.index).trim();
        answer = content.slice(rMatch.index + rMatch[0].length).trim();
    } else {
        // Both matched but in unexpected order — fall back
        return { isQA: false, header: content, question: '', answer: '' };
    }

    return { isQA: true, header, question, answer };
}
```

- [ ] **Step 2: Adicionar `formatEstudoBody` em `js/ui.js`**

Logo abaixo de `parseEstudoSections` (e ainda antes de `formatBodyText`), inserir:

```javascript
// Wrapper: detects Q&A markers and renders sections, otherwise delegates
// to formatBodyText. Reuses formatBodyText inside each section so search
// highlight, focus points, markdown bold/italic, and headers all work.
function formatEstudoBody(text, searchQuery, focusPoints) {
    const sections = parseEstudoSections(text);
    if (!sections.isQA) {
        return formatBodyText(text, searchQuery, focusPoints);
    }

    const headerHtml = sections.header
        ? `<div class="estudo-header">${formatBodyText(sections.header, searchQuery, focusPoints)}</div>`
        : '';
    const questionHtml = sections.question
        ? `<div class="estudo-section estudo-pergunta">
                <span class="estudo-section-label">Pergunta do Fiel</span>
                ${formatBodyText(sections.question, searchQuery, focusPoints)}
           </div>`
        : '';
    const answerHtml = sections.answer
        ? `<div class="estudo-section estudo-resposta">
                <span class="estudo-section-label">Meishu-Sama</span>
                ${formatBodyText(sections.answer, searchQuery, focusPoints)}
           </div>`
        : '';

    return headerHtml + questionHtml + answerHtml;
}
```

- [ ] **Step 3: Integrar `formatEstudoBody` no `js/modal.js`**

Em `js/modal.js`, localizar as linhas 218 e 220 (linhas que setam `contentPT` e `contentComparePT`):

```javascript
    document.getElementById('contentPT').innerHTML = formatBodyText(pt, effectiveQuery, item.focusPoints) + infoHtml;
    document.getElementById('contentJP').innerHTML = formatBodyText(jp, effectiveQuery, item.focusPoints);
    document.getElementById('contentComparePT').innerHTML = formatBodyText(pt, effectiveQuery, item.focusPoints) + infoHtml;
    document.getElementById('contentCompareJP').innerHTML = formatBodyText(jp, effectiveQuery, item.focusPoints);
```

Trocar **apenas** as duas linhas PT:

```javascript
    document.getElementById('contentPT').innerHTML = formatEstudoBody(pt, effectiveQuery, item.focusPoints) + infoHtml;
    document.getElementById('contentJP').innerHTML = formatBodyText(jp, effectiveQuery, item.focusPoints);
    document.getElementById('contentComparePT').innerHTML = formatEstudoBody(pt, effectiveQuery, item.focusPoints) + infoHtml;
    document.getElementById('contentCompareJP').innerHTML = formatBodyText(jp, effectiveQuery, item.focusPoints);
```

(Linhas JP ficam intocadas porque markers em PT não aparecem em japonês.)

- [ ] **Step 4: Adicionar CSS em `style.css`**

Anexar ao final de `style.css`:

```css

/* ── Estudo Aprofundado — Q&A formatting ────────────────────────────────── */
.estudo-header {
    padding: 12px 0 16px;
    border-bottom: 1px solid #e8e4da;
    margin-bottom: 20px;
}
.estudo-section {
    padding: 16px 20px;
    border-radius: 8px;
    margin: 12px 0;
}
.estudo-pergunta {
    background: #f5f5f4;
}
.estudo-resposta {
    background: #fafaf8;
    border: 1px solid #e8e4da;
    font-style: italic;
    color: #555;
}
.estudo-section-label {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
    color: #888;
    margin-bottom: 8px;
    font-style: normal;
}
.dark .estudo-pergunta { background: #1a1a1a; }
.dark .estudo-resposta { background: #161616; border-color: #2a2520; color: #ccc; }
.dark .estudo-section-label { color: #888; }
.dark .estudo-header { border-bottom-color: #2a2520; }
```

- [ ] **Step 5: Sanity check no console (após cache bump da Task 2)**

Após a Task 2 bumpar caches e recarregar:

```javascript
// 1. Funções existem
[typeof parseEstudoSections, typeof formatEstudoBody]
// Esperado: ["function", "function"]

// 2. Detecção de markers
parseEstudoSections('Ensinamento de Meishu-Sama: "X" (data) Pergunta do Fiel\n"texto" Resposta de Meishu-Sama\n"resposta"')
// Esperado: { isQA: true, header: 'Ensinamento ... (data)', question: '"texto"', answer: '"resposta"' }

// 3. Conteúdo sem markers cai no fallback
parseEstudoSections('Texto comum sem markers especiais.')
// Esperado: { isQA: false, header: 'Texto comum...', question: '', answer: '' }
```

- [ ] **Step 6: Commit**

```bash
git -c core.autocrlf=false add js/ui.js js/modal.js style.css
git -c core.autocrlf=false commit -m "feat(reader): split Estudo Aprofundado articles into Q&A sections

Detects 'Pergunta do Fiel' and 'Resposta de Meishu-Sama' markers in
content_pt and renders the article as three visually distinct blocks
(header, question in light gray, answer in cream italic) — mirrors the
citation panel aesthetic. Falls back to formatBodyText when markers are
absent (~15% essay-format items).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Cache bump + verificação no browser + HANDOFF

**Files:**
- Modify: `index.html` (3 cache bumps)
- Modify: `HANDOFF.md`

- [ ] **Step 1: Bumpar cache versions em `index.html`**

| Linha | De | Para |
|-------|----|----|
| 1006 | `js/ui.js?v=122` | `js/ui.js?v=123` |
| 1013 | `js/modal.js?v=126` | `js/modal.js?v=127` |
| 54 | `style.css?v=6` | `style.css?v=7` |

- [ ] **Step 2: Hard reload no preview**

```
preview_eval: window.location.reload()
```

Aguardar 2s pra scripts carregarem.

- [ ] **Step 3: Validação do parser no console**

```javascript
preview_eval: ({
    fnExists: [typeof parseEstudoSections, typeof formatEstudoBody],
    qaTest: parseEstudoSections('Texto Pergunta do Fiel\n"q" Resposta de Meishu-Sama\n"r"'),
    fallbackTest: parseEstudoSections('Sem markers'),
    accentTest: parseEstudoSections('Pergunta DO FIEL\n"x" Resposta DE meishu-sama\n"y"').isQA
})
```

Esperado:
- `fnExists`: `["function", "function"]`
- `qaTest.isQA`: `true`, `qaTest.question` contém `"q"`, `qaTest.answer` contém `"r"`
- `fallbackTest.isQA`: `false`
- `accentTest`: `true` (case-insensitive)

- [ ] **Step 4: Validação visual — abrir um artigo de Estudo Aprofundado**

Roteiro:
1. `preview_eval: setTab('estudo_aprofundado')`
2. Aguardar 1s
3. `preview_eval: openModal(0)` (abre o primeiro artigo da lista)
4. `preview_eval: ({ hasHeader: !!document.querySelector('#contentPT .estudo-header'), hasPergunta: !!document.querySelector('#contentPT .estudo-pergunta'), hasResposta: !!document.querySelector('#contentPT .estudo-resposta') })`

Esperado: todos `true` (assumindo o primeiro artigo tem formato Q&A — que ele tem por amostra dos JK*).

- [ ] **Step 5: Validação visual — abrir artigo SEM Q&A (fallback)**

Encontrar um artigo que NÃO tenha os markers (raros, mas existem):

```javascript
preview_eval: (() => {
    const items = STATE.data.estudo_aprofundado;
    const noQA = items.findIndex(it => !parseEstudoSections(it.content_pt || '').isQA);
    return { idx: noQA, total: items.length, sample: noQA >= 0 ? items[noQA].title_pt : null };
})()
```

Se achar (`idx >= 0`):
1. `preview_eval: openModal(${idx})` (substituindo idx pelo valor)
2. `preview_eval: ({ noEstudoSections: !document.querySelector('#contentPT .estudo-header') && !document.querySelector('#contentPT .estudo-pergunta') })`
3. Esperado: `noEstudoSections: true` (renderiza como hoje, sem seções).

Se nenhum sem-Q&A for encontrado, registrar isso na verificação e continuar — não é blocker.

- [ ] **Step 6: Screenshot final**

`preview_screenshot` do modal aberto com Q&A formatado (deveria mostrar 3 blocos visualmente distintos).

- [ ] **Step 7: Verificação de busca highlight dentro de seções**

```javascript
preview_eval: (() => {
    // Open article 0 with a search query
    const item = STATE.data.estudo_aprofundado[0];
    if (typeof openModal === 'function') {
        openModal(0, item, 'fiel');
    }
    return new Promise(r => setTimeout(() => {
        const marks = document.querySelectorAll('#contentPT mark.search-highlight');
        r({ highlightCount: marks.length, sampleHighlights: [...marks].slice(0, 3).map(m => m.textContent) });
    }, 200));
})()
```

Esperado: pelo menos 1 highlight ativo. (Se zero, formatEstudoBody quebrou o highlight e precisa investigar.)

- [ ] **Step 8: Console check**

```
preview_console_logs level=error
```

Esperado: sem novos erros (warnings preexistentes do Tailwind CDN OK).

- [ ] **Step 9: Commit do cache bump**

```bash
git -c core.autocrlf=false add index.html
git -c core.autocrlf=false commit -m "chore: bump cache for Estudo Aprofundado Q&A formatting

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 10: Atualizar `HANDOFF.md`**

Adicionar nova subseção em "O que foi feito" (acima da seção 7):

```markdown
### 8. Formatação P&R no leitor de Estudo Aprofundado (2026-04-25)
- Artigos com formato pergunta-resposta (~85% do corpus) renderizam em
  3 seções visualmente distintas: header, pergunta do fiel (cinza),
  resposta de Meishu-Sama (creme + itálico)
- Detecção content-driven via regex em `content_pt` (markers "Pergunta do
  Fiel" / "Resposta de Meishu-Sama", case-insensitive)
- Artigos sem markers (~15% ensaios diretos) renderizam como antes
- Reusa `formatBodyText` em cada seção — preserva highlight de busca,
  focus points, markdown bold/italic
- Spec: `docs/superpowers/specs/2026-04-25-estudo-qa-formatting-design.md`
- Plano: `docs/superpowers/plans/2026-04-25-estudo-qa-formatting.md`
```

Em "Próximos refinamentos sugeridos", remover o item agora concluído. Se a lista ficar vazia, substituir por:

```markdown
### Próximos refinamentos sugeridos
- (lista atualmente vazia — refinamentos do guia concluídos em 2026-04-25)
```

- [ ] **Step 11: Commit do HANDOFF**

```bash
git -c core.autocrlf=false add HANDOFF.md
git -c core.autocrlf=false commit -m "docs: log Q&A formatting as completed

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ `parseEstudoSections` (componente 1) → Task 1 step 1
- ✅ `formatEstudoBody` (componente 2) → Task 1 step 2
- ✅ Integração no modal (componente 4) → Task 1 step 3
- ✅ CSS classes (componente 3) → Task 1 step 4
- ✅ Cache bumps + validação manual → Task 2
- ✅ Edge cases: fallback sem markers, só Pergunta, só Resposta, ordem invertida → cobertos no parseEstudoSections
- ✅ Validação de highlight de busca → Task 2 step 7
- ✅ Validação de fallback → Task 2 step 5

**2. Placeholder scan:** Sem TBD/TODO. Todos os passos têm código completo ou comando exato.

**3. Type consistency:**
- `parseEstudoSections` retorna `{ isQA, header, question, answer }`; usado consistentemente em `formatEstudoBody` (Task 1 step 2)
- `formatEstudoBody(text, searchQuery, focusPoints)` mesma assinatura que `formatBodyText`; substituição direta no modal.js (Task 1 step 3)
- Class names `.estudo-header`, `.estudo-section`, `.estudo-pergunta`, `.estudo-resposta`, `.estudo-section-label` consistentes entre HTML em formatEstudoBody e CSS em style.css
