# Orientação do Culto Mensal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um ícone envelope no header do site com badge tipo notificação que abre um modal com a orientação doutrinária do Culto Mensal — suportando leitura na tela, TTS em PT-BR e impressão limpa em papel.

**Architecture:** Arquivo MD único sobrescrito a cada mês como fonte de verdade. JS dedicado (`js/culto-mensal.js`) faz fetch, parse leve de markdown para HTML, controla modal e badge (versionado pela 1ª linha do MD via `localStorage`), e implementa TTS próprio que reusa apenas `getBestVoice()` e o rate compartilhado (`localStorage['johrei_speech_rate']`) do `modal.js` existente. CSS dedicado para layout do modal e `@media print`.

**Tech Stack:** Vanilla JS (sem build), Tailwind via CDN, Web Speech API, `localStorage`, `fetch()`.

**Spec:** `docs/superpowers/specs/2026-05-15-orientacao-culto-mensal-design.md`

**Project context:** Veja `CLAUDE.md` — site SPA estático, cache busting agressivo (bumpar `?v=N` em JS/CSS sempre), tema/fonte global persistidos em `localStorage`. Não há framework de teste — verificação é via browser (preview tools ou `python -m http.server 8004`).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `data/culto_mensal_atual.md` | Conteúdo doutrinário do mês — 1ª linha é título, 2ª é salmo, resto é corpo |
| `js/culto-mensal.js` | Fetch + parse + render do MD; abre/fecha modal; lógica de badge; TTS próprio; print() |
| `css/culto-mensal.css` | Estilos do modal (tema-aware) + `@media print` |
| `index.html` | + Botão envelope no header + estrutura HTML do modal + `<link>` e `<script>` com `?v=1` |
| `js/modal.js` | **Editado**: expor `window.getBestVoice` para reuso (sem mudar TTS existente) |

---

## Task 1: Criar arquivo de conteúdo

**Files:**
- Create: `data/culto_mensal_atual.md`

Fonte: `C:\Users\ymika\Downloads\Culto 1.maio.2026.doc.md`. Copiar conteúdo verbatim — não editar texto doutrinário.

- [ ] **Step 1: Copiar conteúdo do anexo para o arquivo do projeto**

Conteúdo completo de `Culto 1.maio.2026.doc.md` deve ser salvo como `data/culto_mensal_atual.md`. As primeiras duas linhas devem ser exatamente:

```
Culto Mensal 1º – maio – 2026

Salmo – 24 – Ensinamentos da Salvação
```

(O resto é o texto da orientação, exatamente como no anexo.)

- [ ] **Step 2: Verificar UTF-8 e acentos**

Abrir o arquivo, conferir que "espírito", "salvação", "máculas" etc. aparecem corretamente sem mojibake.

- [ ] **Step 3: Commit**

```bash
git add data/culto_mensal_atual.md
git commit -m "feat(data): add Culto Mensal maio 2026 doctrinal content

Conteúdo verbatim da mensagem do Reverendo do Culto Mensal 1º de maio
de 2026, incluindo citações de Meishu-Sama sobre superstição da lógica
e fusão entre espírito e matéria.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: CSS base do modal (sem print ainda)

**Files:**
- Create: `css/culto-mensal.css`

- [ ] **Step 1: Criar `css/culto-mensal.css` com estilos base**

```css
/* ============================================================
   Culto Mensal — modal de orientação doutrinária mensal
   ============================================================ */

/* Backdrop full-screen */
#cultoMensalModal {
    position: fixed;
    inset: 0;
    z-index: 700;
    display: none;
    align-items: center;
    justify-content: center;
}

#cultoMensalModal.is-open {
    display: flex;
}

#cultoMensalBackdrop {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(8px);
}

html.dark #cultoMensalBackdrop {
    background: rgba(0, 0, 0, 0.92);
}

/* Card do modal — respeita variáveis de tema */
#cultoMensalCard {
    position: relative;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    background: var(--n-bg, #ffffff);
    color: var(--n-fg, #1c1917);
    border-radius: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

@media (min-width: 768px) {
    #cultoMensalCard {
        width: 800px;
        max-width: 90vw;
        height: 90vh;
        border-radius: 16px;
        border: 1px solid var(--n-border, #e5e7eb);
    }
}

/* Header sticky */
#cultoMensalHeader {
    flex: none;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--n-border, #e5e7eb);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    background: var(--n-bg, #ffffff);
}

#cultoMensalHeader .cm-titles {
    flex: 1;
    min-width: 0;
}

#cultoMensalHeader .cm-title {
    font-family: 'Crimson Pro', 'Noto Serif JP', serif;
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.3;
    color: var(--n-fg, #1c1917);
    margin: 0;
}

#cultoMensalHeader .cm-salmo {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: var(--n-muted, #6b7280);
    margin-top: 0.25rem;
}

#cultoMensalHeader .cm-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

#cultoMensalHeader .cm-actions button {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--n-muted, #6b7280);
    transition: background 0.2s, color 0.2s;
}

#cultoMensalHeader .cm-actions button:hover {
    color: var(--n-fg, #1c1917);
    background: var(--n-hover, rgba(0, 0, 0, 0.05));
}

#cultoMensalHeader .cm-actions button.is-speaking {
    color: var(--n-accent, #b8860b);
    animation: cm-pulse 1.4s ease-in-out infinite;
}

@keyframes cm-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
}

/* Corpo scrollável */
#cultoMensalContent {
    flex: 1;
    overflow-y: auto;
    padding: 2rem 1.5rem 4rem;
    font-family: 'Crimson Pro', 'Noto Serif JP', serif;
    font-size: 1.0625rem;
    line-height: 1.85;
    color: var(--n-fg, #1c1917);
}

@media (min-width: 768px) {
    #cultoMensalContent {
        padding: 3rem 3.5rem 5rem;
        font-size: 1.125rem;
    }
}

#cultoMensalContent p {
    margin: 0 0 1.25em;
}

#cultoMensalContent blockquote.cm-quote {
    margin: 1.5em 0;
    padding: 0.5em 0 0.5em 1.5em;
    border-left: 3px solid var(--n-accent, #b8860b);
    font-style: italic;
    color: var(--n-fg, #1c1917);
    opacity: 0.92;
}

#cultoMensalContent .cm-attribution {
    font-weight: 600;
    margin-top: 1.5em;
    margin-bottom: 0.25em;
    font-style: normal;
}

/* Highlight do bloco em leitura (TTS) */
#cultoMensalContent .cm-highlight-speaking {
    background: rgba(255, 220, 100, 0.18);
    border-radius: 4px;
    transition: background 0.3s;
}

/* Badge no botão envelope do header */
#cultoMensalBadge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    background: #ef4444;
    color: #ffffff;
    font-size: 9px;
    font-weight: 700;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 2px var(--n-bg, #ffffff);
    pointer-events: none;
}

#cultoMensalBadge.hidden {
    display: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add css/culto-mensal.css
git commit -m "feat(css): add culto mensal modal stylesheet

Modal full-screen no mobile, card centralizado no desktop. Respeita
variáveis CSS de tema (--n-bg, --n-fg, --n-accent etc.) para integração
com os 6 temas existentes. Inclui estilos para blockquote de citações
de Meishu-Sama e badge de notificação no botão envelope.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Botão envelope no header

**Files:**
- Modify: `index.html` linhas 116–126 (após `#btnSiteMapa`)

- [ ] **Step 1: Inserir o botão envelope no header**

Encontrar este bloco em `index.html`:

```html
            <button onclick="setTab('mapa')" id="btnSiteMapa" aria-label="Mapa do corpo" title="Mapa do corpo"
                class="flex items-center justify-center w-8 h-8 rounded-full transition-opacity hover:opacity-70"
                style="color: var(--n-accent, #B8860B)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" fill="currentColor" />
                </svg>
            </button>
        </div>
```

E inserir, imediatamente antes de `</div>`, o novo botão:

```html
            <button onclick="openCultoMensal()" id="btnCultoMensal" aria-label="Orientação do Culto Mensal"
                title="Orientação do Culto Mensal"
                class="relative flex items-center justify-center w-8 h-8 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                </svg>
                <span id="cultoMensalBadge" class="hidden">1</span>
            </button>
```

- [ ] **Step 2: Verificar manualmente que o botão aparece**

Iniciar dev server (preview_start ou `python -m http.server 8004` em terminal separado) e abrir a página. Confirmar:
- Ícone envelope aparece à direita do ícone de mapa
- Hover muda cor de cinza para preto
- Badge ainda escondida (sem CSS ainda)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ui): add envelope button to site header

Quarto ícone do header, após o botão de mapa. Sem ação ainda — função
openCultoMensal() será implementada nos próximos commits.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Estrutura HTML do modal

**Files:**
- Modify: `index.html` linha ~723 (antes de `<!-- Scroll to Top Button -->`)

- [ ] **Step 1: Inserir HTML do modal**

Encontrar em `index.html`:

```html
        <!-- Toast Notification (Absolute centered) -->
        <div id="toastNotification"
            class="fixed top-1/2 left-1/2 ...
```

Inserir o modal *antes* do `<!-- Scroll to Top Button -->` que vem depois do fim do `#appContent` (procurar o comentário `<!-- Scroll to Top Button -->`). O modal vai em nível raiz do `<body>`, não dentro do `#appContent`:

```html
    <!-- Culto Mensal — Orientação Doutrinária Mensal -->
    <div id="cultoMensalModal" role="dialog" aria-modal="true" aria-labelledby="cultoMensalTitle">
        <div id="cultoMensalBackdrop" onclick="closeCultoMensal()"></div>
        <div id="cultoMensalCard">
            <div id="cultoMensalHeader">
                <div class="cm-titles">
                    <h1 id="cultoMensalTitle" class="cm-title">Carregando…</h1>
                    <p id="cultoMensalSalmo" class="cm-salmo"></p>
                </div>
                <div class="cm-actions cm-no-print">
                    <button onclick="toggleCultoMensalSpeech()" id="btnCultoMensalSpeech"
                            aria-label="Ouvir orientação" title="Ouvir">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                    </button>
                    <button onclick="printCultoMensal()" id="btnCultoMensalPrint"
                            aria-label="Imprimir" title="Imprimir">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="6 9 6 2 18 2 18 9" />
                            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                            <rect x="6" y="14" width="12" height="8" />
                        </svg>
                    </button>
                    <button onclick="closeCultoMensal()" id="btnCultoMensalClose"
                            aria-label="Fechar" title="Fechar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>
            <div id="cultoMensalContent"></div>
        </div>
    </div>
```

- [ ] **Step 2: Adicionar `<link>` para o CSS no `<head>`**

Encontrar em `index.html` (~linha 77):

```html
    <link rel="stylesheet" href="css/theme.css?v=7">
```

Adicionar logo abaixo:

```html
    <link rel="stylesheet" href="css/culto-mensal.css?v=1">
```

- [ ] **Step 3: Verificar manualmente**

Reload da página. Confirmar:
- Modal NÃO aparece (display:none por padrão)
- Inspecionar o DOM via DevTools — elementos existem
- Adicionar temporariamente `is-open` via DevTools no `#cultoMensalModal` — confirmar que abre full-screen no mobile, card centralizado no desktop, header + corpo visíveis
- Remover `is-open` após verificar

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(ui): add culto mensal modal HTML structure

Modal dedicado com header (título, salmo, botões Ouvir/Imprimir/Fechar)
e corpo scrollável. Inclui link para css/culto-mensal.css. Sem JS ainda
— funções openCultoMensal/closeCultoMensal/etc serão implementadas a
seguir.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: JS — fetch, parse e render

**Files:**
- Create: `js/culto-mensal.js`
- Modify: `index.html` (adicionar `<script>` no rodapé)

- [ ] **Step 1: Criar `js/culto-mensal.js` com fetch + parse + render**

```javascript
/* ============================================================
   js/culto-mensal.js
   Orientação do Culto Mensal — fetch do MD, render, modal,
   badge, TTS dedicado, print.

   Storage: data/culto_mensal_atual.md (sobrescrito a cada mês).
   Detecção de novidade: 1ª linha do MD comparada com
   localStorage['cultoMensalLastSeen'].
   ============================================================ */
(function () {
    'use strict';

    const SOURCE_URL = 'data/culto_mensal_atual.md';
    const LAST_SEEN_KEY = 'cultoMensalLastSeen';

    // Cache da última carga (evita 2 fetches: badge check + open modal)
    let cached = null;          // { title, salmo, body }
    let cachedRawFirstLine = null;
    let isLoading = false;

    /* --- Fetch + parse --- */

    async function fetchContent() {
        if (cached) return cached;
        if (isLoading) {
            // Espera o fetch em andamento
            await new Promise(resolve => {
                const check = () => cached ? resolve() : setTimeout(check, 50);
                check();
            });
            return cached;
        }
        isLoading = true;
        try {
            const res = await fetch(SOURCE_URL, { cache: 'no-cache' });
            if (!res.ok) throw new Error('Falha ao carregar orientação: ' + res.status);
            const raw = await res.text();
            cached = parseMarkdown(raw);
            cachedRawFirstLine = cached.title;
            return cached;
        } finally {
            isLoading = false;
        }
    }

    function parseMarkdown(raw) {
        // Normaliza CRLF -> LF e remove BOM
        raw = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');

        // Quebra em linhas não vazias
        const lines = raw.split('\n');

        // 1ª linha não vazia = título
        // 2ª linha não vazia = salmo
        const nonEmpty = lines.map(l => l.trim()).filter(Boolean);
        const title = nonEmpty[0] || 'Culto Mensal';
        const salmo = nonEmpty[1] || '';

        // Corpo = tudo após a 2ª linha não vazia
        // Recuperamos os parágrafos pelo split em linhas em branco do raw,
        // pulando os 2 primeiros blocos (título e salmo).
        const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
        const bodyBlocks = blocks.slice(2);

        const html = bodyBlocks.map(blockToHtml).join('\n');

        return { title, salmo, body: html };
    }

    function blockToHtml(block) {
        // Detecta citação: começa com aspas tipográficas ou retas
        const trimmed = block.trim();
        const startsWithQuote = /^["“"„]/.test(trimmed);
        // Detecta atribuição curta ("Meishu Sama diz:", "Meishu-Sama expressou assim:" etc.)
        const isAttribution =
            /^[A-Za-zÀ-ÿ\-\s]{0,40}(diz|expressou|fala|explica|alertava)[A-Za-zÀ-ÿ\s,]*[:.]?\s*$/i
                .test(trimmed) && trimmed.length < 80;

        let cls = '';
        let tag = 'p';
        if (startsWithQuote) {
            tag = 'blockquote';
            cls = 'cm-quote';
        } else if (isAttribution) {
            cls = 'cm-attribution';
        }

        // Itálicos inline: *texto* -> <em>texto</em>
        let inner = escapeHtml(trimmed).replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

        return `<${tag}${cls ? ` class="${cls}"` : ''}>${inner}</${tag}>`;
    }

    function escapeHtml(s) {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /* --- Render no modal --- */

    function render(data) {
        document.getElementById('cultoMensalTitle').textContent = data.title;
        document.getElementById('cultoMensalSalmo').textContent = data.salmo;
        document.getElementById('cultoMensalContent').innerHTML = data.body;
    }

    /* --- Abrir/fechar (stub — completaremos na Task 6) --- */

    window.openCultoMensal = async function () {
        try {
            const data = await fetchContent();
            render(data);
            document.getElementById('cultoMensalModal').classList.add('is-open');
            document.body.style.overflow = 'hidden';
        } catch (err) {
            console.error('[culto-mensal] erro:', err);
            alert('Não foi possível carregar a Orientação do Culto Mensal.');
        }
    };

    window.closeCultoMensal = function () {
        document.getElementById('cultoMensalModal').classList.remove('is-open');
        document.body.style.overflow = '';
    };

    /* --- Stubs para Tasks 7–9 --- */

    window.toggleCultoMensalSpeech = function () {
        console.log('[culto-mensal] TTS ainda não implementado');
    };

    window.printCultoMensal = function () {
        console.log('[culto-mensal] print ainda não implementado');
    };

    /* --- Expose internals para testing/debug --- */
    window._cultoMensal = { fetchContent, parseMarkdown, blockToHtml };
})();
```

- [ ] **Step 2: Incluir o script em `index.html`**

Encontrar o bloco de scripts em `index.html` (linhas 826–849). Após a linha `<script src="js/analytics-tracker.js?v=101"></script>` adicionar:

```html
    <script src="js/culto-mensal.js?v=1"></script>
```

- [ ] **Step 3: Verificar manualmente abrir/fechar**

Reload da página. No console:
1. Executar `openCultoMensal()` → modal abre com título "Culto Mensal 1º – maio – 2026", salmo "Salmo – 24 – Ensinamentos da Salvação" e corpo com parágrafos legíveis
2. Confirmar visualmente que parágrafos começando com aspas (`"`) viram blockquotes com borda lateral
3. Confirmar que "Meishu Sama diz:" e "Meishu Sama explica:" aparecem como `cm-attribution`
4. Clicar no backdrop → modal fecha
5. Reabrir, clicar no ✕ → modal fecha
6. Scroll do corpo funciona suavemente

- [ ] **Step 4: Commit**

```bash
git add js/culto-mensal.js index.html
git commit -m "feat(culto-mensal): add fetch/parse/render + open/close modal

Carrega data/culto_mensal_atual.md, extrai título (1ª linha) e salmo
(2ª linha), converte parágrafos em HTML. Parágrafos iniciando com
aspas viram blockquote.cm-quote; atribuições curtas (\"Meishu Sama
diz:\") viram .cm-attribution. Cache em memória evita refetch.
Stubs para TTS e print serão preenchidos nas próximas tasks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Conectar o botão envelope e fechar com ESC

**Files:**
- Modify: `js/culto-mensal.js`

- [ ] **Step 1: Adicionar listener para ESC e ajustar `openCultoMensal`**

No final do IIFE (antes do `})();`), adicionar:

```javascript
    /* --- ESC fecha o modal --- */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        const modal = document.getElementById('cultoMensalModal');
        if (modal && modal.classList.contains('is-open')) {
            window.closeCultoMensal();
        }
    });
```

- [ ] **Step 2: Verificar**

Reload. Abrir modal via `openCultoMensal()` no console. Apertar ESC. Modal fecha. Abrir pelo botão envelope no header. Apertar ESC. Fecha.

- [ ] **Step 3: Commit**

```bash
git add js/culto-mensal.js
git commit -m "feat(culto-mensal): close modal on Escape key

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Lógica da badge

**Files:**
- Modify: `js/culto-mensal.js`

- [ ] **Step 1: Adicionar funções de badge no IIFE**

Logo após o bloco `/* --- Render --- */`, adicionar:

```javascript
    /* --- Badge (notificação de novidade) --- */

    async function checkBadgeStatus() {
        try {
            const data = await fetchContent();
            const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
            const badge = document.getElementById('cultoMensalBadge');
            if (!badge) return;
            if (lastSeen === data.title) {
                badge.classList.add('hidden');
            } else {
                badge.classList.remove('hidden');
            }
        } catch (err) {
            // Falha silenciosa: badge fica escondida
            console.warn('[culto-mensal] falha ao checar badge:', err);
        }
    }

    function markAsSeen() {
        if (cachedRawFirstLine) {
            localStorage.setItem(LAST_SEEN_KEY, cachedRawFirstLine);
            const badge = document.getElementById('cultoMensalBadge');
            if (badge) badge.classList.add('hidden');
        }
    }

    /* Inicializa badge ao carregar */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkBadgeStatus);
    } else {
        checkBadgeStatus();
    }
```

- [ ] **Step 2: Chamar `markAsSeen()` em `openCultoMensal`**

Modificar `window.openCultoMensal` para chamar `markAsSeen()` após render:

```javascript
    window.openCultoMensal = async function () {
        try {
            const data = await fetchContent();
            render(data);
            document.getElementById('cultoMensalModal').classList.add('is-open');
            document.body.style.overflow = 'hidden';
            markAsSeen();   // ← linha nova
        } catch (err) {
            console.error('[culto-mensal] erro:', err);
            alert('Não foi possível carregar a Orientação do Culto Mensal.');
        }
    };
```

- [ ] **Step 3: Bump cache version do JS**

Em `index.html`, mudar `culto-mensal.js?v=1` para `culto-mensal.js?v=2`.

- [ ] **Step 4: Verificar fluxo da badge manualmente**

1. Limpar `localStorage`: no console, `localStorage.removeItem('cultoMensalLastSeen')`
2. Reload → badge "1" deve aparecer no ícone envelope (vermelho, canto superior direito)
3. Clicar no botão envelope → modal abre, badge some
4. Fechar modal, reload → badge **continua sumida** (já foi vista)
5. No console: `localStorage.removeItem('cultoMensalLastSeen')`; reload → badge reaparece

- [ ] **Step 5: Commit**

```bash
git add js/culto-mensal.js index.html
git commit -m "feat(culto-mensal): add notification badge with first-line versioning

Badge aparece quando localStorage['cultoMensalLastSeen'] não bate com
o título atual do MD. Some no primeiro clique. Quando o conteúdo de
data/culto_mensal_atual.md é sobrescrito com um novo mês, a 1ª linha
muda e a badge reaparece automaticamente para todos os usuários.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: TTS dedicado para o modal

**Files:**
- Modify: `js/modal.js` (expor `getBestVoice` no `window`)
- Modify: `js/culto-mensal.js` (adicionar máquina de TTS própria)

**Por que máquina própria:** `toggleSpeech()` em `modal.js` está acoplada ao readModal (usa `currentModalItem`, `STATE.languageView`, `contentPT`, `immersiveTimer`). Refatorar arrisca regressão. Reusamos só o voice picker.

- [ ] **Step 1: Expor `getBestVoice` em `modal.js`**

Procurar em `js/modal.js` a função `getBestVoice` (~linha 1560–1570) e mudar de `function getBestVoice()` para `window.getBestVoice = function ()` se já não estiver exposta. Verificar primeiro:

```bash
git grep -n "getBestVoice" js/modal.js
```

Se a definição for `function getBestVoice(`, alterar para `window.getBestVoice = function (`. Cuidado: o `}` de fechamento da função fica igual (sem `;`). Se necessário, adicionar `;` para fechar a expressão.

Bump `js/modal.js?v=142` → `?v=143` em `index.html`.

- [ ] **Step 2: Adicionar TTS em `js/culto-mensal.js`**

Substituir o stub `window.toggleCultoMensalSpeech` (que era `console.log`) pelo seguinte bloco. Adicionar antes dele as variáveis e helpers de estado:

```javascript
    /* --- TTS dedicado (não compartilha estado com readModal) --- */
    let cmSpeechBlocks = [];
    let cmSpeechIndex = 0;
    let cmIsSpeaking = false;

    function cmCollectBlocks() {
        const container = document.getElementById('cultoMensalContent');
        if (!container) return [];
        return Array.from(container.querySelectorAll('p, blockquote'))
            .filter(el => (el.innerText || '').trim().length > 0);
    }

    function cmGetRate() {
        const raw = parseFloat(localStorage.getItem('johrei_speech_rate'));
        return isNaN(raw) ? 0.9 : raw;
    }

    function cmSpeakNext() {
        if (cmSpeechIndex >= cmSpeechBlocks.length) {
            cmStopSpeech();
            return;
        }
        const el = cmSpeechBlocks[cmSpeechIndex];
        const text = (el.innerText || el.textContent || '').trim();
        if (!text) {
            cmSpeechIndex++;
            cmSpeakNext();
            return;
        }
        const utt = new SpeechSynthesisUtterance(text);
        const voice = (typeof window.getBestVoice === 'function') ? window.getBestVoice() : null;
        if (voice) utt.voice = voice;
        utt.lang = 'pt-BR';
        utt.rate = cmGetRate();

        utt.onstart = function () {
            el.classList.add('cm-highlight-speaking');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        utt.onend = function () {
            el.classList.remove('cm-highlight-speaking');
            cmSpeechIndex++;
            cmSpeakNext();
        };
        utt.onerror = function (e) {
            if (e.error === 'interrupted' || e.error === 'canceled') return;
            console.error('[culto-mensal] speech error:', e);
            el.classList.remove('cm-highlight-speaking');
            cmStopSpeech();
        };
        window.speechSynthesis.speak(utt);
    }

    function cmStopSpeech() {
        window.speechSynthesis.cancel();
        cmSpeechBlocks.forEach(el => el.classList.remove('cm-highlight-speaking'));
        cmSpeechBlocks = [];
        cmSpeechIndex = 0;
        cmIsSpeaking = false;
        const btn = document.getElementById('btnCultoMensalSpeech');
        if (btn) btn.classList.remove('is-speaking');
    }

    window.toggleCultoMensalSpeech = async function () {
        if (cmIsSpeaking) {
            cmStopSpeech();
            return;
        }
        // Aguarda voices carregarem se necessário
        if (window.speechSynthesis.getVoices().length === 0) {
            await new Promise(resolve => {
                const t = setTimeout(resolve, 500);
                window.speechSynthesis.onvoiceschanged = () => {
                    clearTimeout(t);
                    resolve();
                };
            });
        }
        cmSpeechBlocks = cmCollectBlocks();
        if (cmSpeechBlocks.length === 0) return;
        cmSpeechIndex = 0;
        cmIsSpeaking = true;
        const btn = document.getElementById('btnCultoMensalSpeech');
        if (btn) btn.classList.add('is-speaking');
        cmSpeakNext();
    };
```

- [ ] **Step 3: Cancelar TTS ao fechar modal**

Modificar `window.closeCultoMensal` para parar a fala:

```javascript
    window.closeCultoMensal = function () {
        cmStopSpeech();   // ← linha nova
        document.getElementById('cultoMensalModal').classList.remove('is-open');
        document.body.style.overflow = '';
    };
```

- [ ] **Step 4: Bump cache version**

Em `index.html`, `culto-mensal.js?v=2` → `?v=3`.

- [ ] **Step 5: Verificar TTS no browser**

1. Abrir modal pelo botão envelope
2. Clicar no botão "Ouvir" (alto-falante)
3. Confirmar:
   - Voz PT-BR começa a ler do título → salmo → corpo bloco por bloco
   - Botão pulsa (cor accent dourado)
   - Bloco sendo lido recebe fundo amarelo claro
   - Modal faz scroll automático para acompanhar o bloco
4. Clicar de novo no botão "Ouvir" → fala para, highlight some, botão para de pulsar
5. Reabrir, começar a falar, clicar no ✕ → modal fecha **e fala para** (não fica falando com modal fechado)
6. Verificar que TTS do readModal ainda funciona: abrir qualquer ensinamento via card da lista, clicar no botão de áudio do `readModal` → deve ler normalmente como antes

- [ ] **Step 6: Commit**

```bash
git add js/culto-mensal.js js/modal.js index.html
git commit -m "feat(culto-mensal): add TTS with shared voice picker

TTS dedicado para o modal de culto mensal, com máquina de estado
própria (cmSpeechBlocks/Index/IsSpeaking). Reusa apenas window.getBestVoice
de modal.js (exposto neste commit) e o rate compartilhado em
localStorage['johrei_speech_rate']. Evita acoplamento com readModal.
Fechar o modal cancela a leitura.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Impressão

**Files:**
- Modify: `css/culto-mensal.css` (adicionar `@media print`)
- Modify: `js/culto-mensal.js` (implementar `printCultoMensal`)

- [ ] **Step 1: Adicionar `@media print` ao CSS**

No final de `css/culto-mensal.css`, acrescentar:

```css
/* ============================================================
   Print — versão limpa para papel
   ============================================================ */
@media print {
    /* Esconde TUDO da página */
    body * {
        visibility: hidden !important;
    }

    /* Mostra só o modal e seu conteúdo */
    #cultoMensalModal,
    #cultoMensalModal * {
        visibility: visible !important;
    }

    /* Esconde backdrop e botões de ação */
    #cultoMensalBackdrop,
    .cm-no-print,
    .cm-no-print * {
        display: none !important;
    }

    /* Modal vira documento — sem overlay, sem sombra */
    #cultoMensalModal {
        position: absolute !important;
        inset: 0 !important;
        display: block !important;
        background: #ffffff !important;
        z-index: auto !important;
    }

    #cultoMensalCard {
        position: static !important;
        width: 100% !important;
        height: auto !important;
        max-width: none !important;
        max-height: none !important;
        background: #ffffff !important;
        color: #000000 !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        overflow: visible !important;
    }

    #cultoMensalHeader {
        background: #ffffff !important;
        border-bottom: 1px solid #cccccc !important;
        padding: 0 0 1rem 0 !important;
    }

    .cm-title {
        color: #000000 !important;
        font-size: 22pt !important;
    }

    .cm-salmo {
        color: #444444 !important;
    }

    #cultoMensalContent {
        overflow: visible !important;
        padding: 1rem 0 0 0 !important;
        font-size: 11pt !important;
        line-height: 1.55 !important;
        color: #000000 !important;
    }

    #cultoMensalContent p,
    #cultoMensalContent blockquote {
        page-break-inside: avoid;
        orphans: 3;
        widows: 3;
    }

    #cultoMensalContent blockquote.cm-quote {
        border-left: 2px solid #888888 !important;
        color: #222222 !important;
    }

    /* Highlight do TTS não pode aparecer na impressão */
    .cm-highlight-speaking {
        background: transparent !important;
    }
}
```

- [ ] **Step 2: Implementar `printCultoMensal` em `culto-mensal.js`**

Substituir o stub `window.printCultoMensal`:

```javascript
    window.printCultoMensal = function () {
        // Garante que o modal está aberto antes de imprimir
        const modal = document.getElementById('cultoMensalModal');
        if (!modal || !modal.classList.contains('is-open')) return;
        // Pausa TTS se estiver tocando — print bloqueia event loop
        if (cmIsSpeaking) cmStopSpeech();
        window.print();
    };
```

- [ ] **Step 3: Bump cache versions**

- `culto-mensal.css?v=1` → `?v=2`
- `culto-mensal.js?v=3` → `?v=4`

Em `index.html`.

- [ ] **Step 4: Verificar impressão**

1. Abrir modal pelo botão envelope
2. Clicar "Imprimir"
3. No diálogo de impressão do navegador, ativar **"Visualizar"** e confirmar:
   - Apenas o conteúdo aparece (sem header do site, sem cards, sem botões do modal)
   - Título no topo, depois salmo, depois corpo
   - Blockquotes preservadas com borda lateral cinza
   - Acentos preservados (espírito, salvação, máculas)
   - Sem cores de tema escuro mesmo se Quiet ativo
   - Tipografia legível, ~11pt, com quebras de página entre parágrafos longos
4. Fechar diálogo (cancelar impressão), modal continua aberto, página continua normal
5. Testar com tema "Quiet" ativo: tudo no preview de impressão deve estar preto sobre branco

- [ ] **Step 5: Commit**

```bash
git add css/culto-mensal.css js/culto-mensal.js index.html
git commit -m "feat(culto-mensal): add print support

Botão Imprimir chama window.print() com stylesheet @media print que
esconde tudo exceto #cultoMensalContent, força preto-sobre-branco
independente do tema, e adiciona quebras de página sensatas em
parágrafos e blockquotes. Pausa TTS antes de imprimir.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Verificação final e ajustes

**Files:** N/A (verificação)

- [ ] **Step 1: Verificar critérios de aceitação da spec**

Abrir cada um manualmente e confirmar:

- [ ] Ícone envelope aparece no header em todas as abas (mobile e desktop) — testar trocando de aba
- [ ] Badge "1" aparece em primeira visita (limpar `localStorage` antes)
- [ ] Modal abre com título, salmo e corpo legível
- [ ] Modal respeita os 6 temas — abrir cada tema (Original/Quiet/Paper/Calm/Focus/Bold) e confirmar legibilidade
- [ ] Modal respeita slider de fonte global (mudar fonte para 24px, abrir modal, texto cresce)
- [ ] Citações de Meishu-Sama renderizadas com borda lateral dourada e itálico
- [ ] Badge some após primeiro clique e não reaparece em reloads
- [ ] Botão Imprimir abre diálogo limpo
- [ ] TTS lê em PT-BR, bloco-a-bloco, com highlight e scroll automático
- [ ] Botão Ouvir vira "pulsando" durante leitura; clicar pausa
- [ ] Fechar modal cancela TTS
- [ ] Sem regressão no TTS do readModal (abrir qualquer card, escutar)
- [ ] Mobile responsivo: redimensionar viewport para ~375px, modal vira full-screen, todos os botões clicáveis

- [ ] **Step 2: Simular troca de mês**

Editar a 1ª linha de `data/culto_mensal_atual.md`:
```
Culto Mensal 1º – maio – 2026
```
para
```
Culto Mensal 1º – junho – 2026 (teste)
```

Reload com `Ctrl+Shift+R`. Confirmar:
- Badge "1" reaparece
- Modal mostra o novo título no header

Reverter o arquivo:
```bash
git checkout data/culto_mensal_atual.md
```

- [ ] **Step 3: Limpar console**

Buscar warnings/erros no console do browser durante uso normal. Não deve haver nenhum.

- [ ] **Step 4: Commit final (se houve ajustes)**

Se algum critério falhou e exigiu ajuste, commitar com mensagem descritiva. Caso contrário, pular este passo.

- [ ] **Step 5: Push**

```bash
git push origin main
```

(Conforme `CLAUDE.md`: autorização para commits em trabalho concluído, mas push é uma operação compartilhada — confirmar com o usuário antes deste step.)

---

## Workflow mensal (para a posteridade)

Quando chegar o conteúdo do mês seguinte (junho/2026):

1. Sobrescrever `data/culto_mensal_atual.md` com o novo conteúdo
2. Conferir 1ª linha: "Culto Mensal 1º – junho – 2026"
3. Commit: `feat(data): update Culto Mensal to junho 2026`
4. Push — badge reaparece automaticamente para todos os usuários no próximo load
