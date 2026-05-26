# Lazy Loading — Carregamento em 2 Fases

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir o carregamento inicial de 6,5 MB para ~170 KB carregando só `tab_fundamentos.json` na fase 1 e as demais tabs + `related_v2.json` em background logo depois.

**Architecture:** `loadData()` em `core.js` é dividido em fase 1 (bloqueante, renderiza imediatamente) e `_loadBackgroundTabs()` (não bloqueante, merge silencioso). `setTab()` passa a ser `async` e aguarda o promise específico da tab se ainda estiver carregando. O campo `STATE._tabLoading` guarda os promises individuais por tabId.

**Tech Stack:** Vanilla JS, Supabase Storage (fetch), sem dependências extras.

---

### Task 1: Adicionar `_tabLoading` ao STATE

**Files:**
- Modify: `js/state.js:2-32`

- [ ] **Step 1: Adicionar `_tabLoading` à declaração do STATE**

Em `js/state.js`, adicione o campo `_tabLoading: {}` logo após `data: {}`:

```javascript
let STATE = {
    activeTab: 'fundamentos',
    activeSubAba: null,
    activeCategoria: null,
    tabStructure: {},
    activeLetter: '',
    activeCategory: '',
    activeTags: [],
    activeCategories: [],
    activeSources: [],
    activeFocusPoints: [],
    bodyFilter: null,
    apostilas: {
        ensinamentos: { items: [], title: "Minha Apostila" },
        explicacoes: { items: [], title: "Meus Estudos" }
    },
    mode: 'ensinamentos',
    list: [],
    idx: -1,
    isCrossTabMode: false,
    selectedBodyPoint: null,
    globalData: {},
    data: {},
    _tabLoading: {},           // ← NOVO: promises de background por tabId

    essencia: null,
    essenciaCollapsed: false,
    readingHistory: []
};
```

- [ ] **Step 2: Bump versão do state.js em index.html**

Em `index.html` linha 983, mudar `v=104` → `v=105`:

```html
<script src="js/state.js?v=105"></script>
```

---

### Task 2: Refatorar `loadData()` — Fase 1 apenas

**Files:**
- Modify: `js/core.js:31-123`

- [ ] **Step 1: Substituir o corpo inteiro de `loadData()`**

Substituir as linhas 31–123 de `js/core.js` pelo código abaixo.
A constante `BACKGROUND_TABS` vai na linha 1 do arquivo (antes de `loadTabData`).

```javascript
// Linha 1 — constante de tabs carregadas em background
const BACKGROUND_TABS = ['pratica', 'critica_farmacologica', 'por_regiao', 'estudo_detalhado', 'estudo_aprofundado'];

// --- CARREGAMENTO DE DADOS ---
const NEW_TAB_IDS = ['fundamentos', 'pratica', 'critica_farmacologica', 'por_regiao', 'estudo_aprofundado'];

async function loadTabData(tabId) {
    const res = await fetch(window.guiaDataUrl(`tab_${tabId}.json`));
    if (!res.ok) throw new Error(`Erro ao carregar tab_${tabId}.json: ${res.status}`);
    return await res.json();
}

function flattenTabData(tabData) {
    const items = [];
    tabData.sub_abas.forEach(subAba => {
        subAba.categorias.forEach(cat => {
            cat.artigos.forEach(artigo => {
                items.push({
                    ...artigo,
                    title_pt:         artigo.titulo || artigo.title_pt || artigo.title || '',
                    content_pt:       artigo.conteudo || artigo.content_pt || artigo.content || '',
                    _cat:             tabData.id,
                    _subAbaId:        subAba.id,
                    _subAbaTitulo:    subAba.titulo,
                    _categoriaTitulo: cat.titulo,
                });
            });
        });
    });
    return items;
}

async function loadData() {
    const cfg = CONFIG.modes[STATE.mode];
    STATE._tabLoading = {};   // reset a cada chamada (suporta setMode)

    try {
        // ── Fase 1: só o necessário para o primeiro render ───────────────────
        const [, fundData, synData] = await Promise.all([
            fetch(`${cfg.path}${cfg.file}?t=${Date.now()}`).then(r => r.json()),
            loadTabData('fundamentos'),
            fetch(`${cfg.path}synonyms_pt.json?t=${Date.now()}`)
                .then(r => r.ok ? r.json() : null).catch(() => null),
        ]);

        STATE.data         = {};
        STATE.tabStructure = {};

        STATE.tabStructure['fundamentos'] = fundData;
        STATE.data['fundamentos']         = flattenTabData(fundData);

        // globalData inicial — apenas fundamentos
        STATE.globalData = {};
        STATE.data['fundamentos'].forEach(item => {
            if (item?.id) STATE.globalData[item.id] = { ...item, _cat: 'fundamentos' };
        });

        // Sinônimos de busca
        if (synData && typeof SearchEngine !== 'undefined' && typeof SearchEngine.mergeSynonyms === 'function') {
            SearchEngine.mergeSynonyms(synData);
        }

        if (!STATE.activeTab || !STATE.data[STATE.activeTab]) STATE.activeTab = 'fundamentos';

        // ── Render imediato ──────────────────────────────────────────────────
        renderTabs();
        renderAlphabet();
        applyFilters();
        if (typeof updateApostilaBadge   === 'function') updateApostilaBadge();
        if (typeof populateCategoryDropdown === 'function') populateCategoryDropdown();
        if (typeof populateSourceDropdown   === 'function') populateSourceDropdown();
        if (typeof initializeTagBrowser     === 'function') initializeTagBrowser();
        if (STATE.activeTab === 'mapa') setTimeout(renderBodyMaps, 100);

        // ── Fase 2: background (não bloqueia o render) ───────────────────────
        const _deepLinkParams = new URLSearchParams(window.location.search);
        const _hasDeepLink    = !!(_deepLinkParams.get('id') || _deepLinkParams.get('item'));

        _loadBackgroundTabs(cfg, _hasDeepLink);

        // Deep link: se o item pode estar numa tab ainda carregando, aguarda
        if (_hasDeepLink && Object.keys(STATE._tabLoading).length > 0) {
            await Promise.all(Object.values(STATE._tabLoading));
        }

        checkUrlForDeepLink();

    } catch (e) { console.error('Erro loadData:', e); }
}
```

---

### Task 3: Implementar `_loadBackgroundTabs()`

**Files:**
- Modify: `js/core.js` — inserir após `loadData()` (após a linha do `catch`)

- [ ] **Step 1: Inserir `_loadBackgroundTabs` logo após o fechamento de `loadData()`**

```javascript
// ── Fase 2: carregamento em background ──────────────────────────────────────
function _loadBackgroundTabs(cfg, hasDeepLink) {
    const t = Date.now();

    // Uma promise por tab: merge silencioso no STATE quando chega
    BACKGROUND_TABS.forEach(tid => {
        STATE._tabLoading[tid] = loadTabData(tid)
            .then(tabData => {
                STATE.tabStructure[tid] = tabData;
                STATE.data[tid]         = flattenTabData(tabData);
                // Alias estudo_detalhado → pontos_focais (body-map-helpers.js depende disso)
                if (tid === 'estudo_detalhado') {
                    STATE.data['pontos_focais'] = STATE.data['estudo_detalhado'];
                }
                // Merge no globalData
                STATE.data[tid].forEach(item => {
                    if (item?.id) STATE.globalData[item.id] = { ...item, _cat: tid };
                });
                delete STATE._tabLoading[tid];
            })
            .catch(e => {
                console.warn(`Tab ${tid} background load failed:`, e);
                delete STATE._tabLoading[tid];
            });
    });

    // related_v2.json — lazy, só usado no "Veja Também" do modal
    fetch(`${cfg.path}related_v2.json?t=${t}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (data) {
                STATE.relatedIndex = data;
                console.log('Related index loaded:', Object.keys(data).length);
            }
        })
        .catch(e => console.warn('No related_v2.json:', e));

    // Supabase essência — mostrar welcome quando chegar (se não há deep link aberto)
    const SB_URL  = 'https://succhmnbajvbpmoqrktq.supabase.co/rest/v1/johrei_essencia';
    const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1Y2NobW5iYWp2YnBtb3Fya3RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NjY3MDgsImV4cCI6MjA5MjA0MjcwOH0.humCcLYpnnnapkLtLOeb9ZVo5EZWoWw6ItNo0WVY3DY';
    fetch(`${SB_URL}?select=article_id,excerpt_pt,updated_at&id=eq.1&limit=1`, {
        headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
        cache: 'no-cache'
    })
    .then(r => r.ok ? r.json() : null)
    .then(rows => {
        if (rows?.length === 1) {
            STATE.essencia = rows[0];
            if (!hasDeepLink && typeof showEssenciaWelcome === 'function') {
                const readModal = document.getElementById('readModal');
                if (!readModal || readModal.classList.contains('hidden')) {
                    history.replaceState(null, '', window.location.pathname);
                    showEssenciaWelcome();
                }
            }
        }
    })
    .catch(e => console.warn('Essência indisponível:', e));
}
```

---

### Task 4: Atualizar `setTab()` para aguardar tab em loading

**Files:**
- Modify: `js/core.js:271` — função `setTab`

- [ ] **Step 1: Substituir a função `setTab` inteira (linhas 271–308 de `js/core.js`)**

```javascript
async function setTab(id) {
    // Fast Exit for Clear Button: reduce friction when switching contexts
    document.querySelectorAll('.clear-search-btn').forEach(btn => {
        btn.classList.add('fast-exit');
        setTimeout(() => btn.classList.remove('fast-exit'), 300);
    });

    STATE.activeTab       = id;
    STATE.activeSubAba    = null;
    STATE.activeCategoria = null;
    STATE.activeLetter    = '';
    STATE.activeSubject   = null;

    if (id !== 'mapa') {
        if (typeof clearBodyFilter     === 'function') clearBodyFilter();
        if (typeof clearConditionGuide === 'function') clearConditionGuide();
    }

    // ── Se a tab ainda está carregando em background, mostrar spinner ────────
    if (STATE._tabLoading?.[id]) {
        const contentList = document.getElementById('contentList');
        if (contentList) {
            contentList.innerHTML = `
                <div class="col-span-full flex justify-center items-center py-20">
                    <svg class="animate-spin w-8 h-8 text-gray-300 dark:text-gray-600"
                         fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10"
                                stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                        </path>
                    </svg>
                </div>`;
        }
        await STATE._tabLoading[id];
    }
    // ────────────────────────────────────────────────────────────────────────

    document.querySelectorAll('.search-input').forEach(input => input.value = '');

    renderTabs();
    applyFilters();
    updateMapLayout(id);

    if (typeof populateCategoryDropdown === 'function') populateCategoryDropdown();
    if (typeof populateSourceDropdown   === 'function') populateSourceDropdown();
    if (typeof initializeTagBrowser     === 'function') initializeTagBrowser();
}
```

---

### Task 5: Bump versão do core.js em index.html e verificar

**Files:**
- Modify: `index.html:991`

- [ ] **Step 1: Bump versão do core.js**

Em `index.html` linha 991, mudar `v=128` → `v=129`:

```html
<script src="js/core.js?v=129"></script>
```

- [ ] **Step 2: Iniciar servidor local e abrir o site**

```powershell
python -m http.server 8004
```

Abrir `http://localhost:8004` e verificar:

1. ✅ A aba **Fundamentos** carrega e mostra artigos em < 1 s
2. ✅ As outras abas (Prática, Purificações, etc.) funcionam ao clicar
3. ✅ Abrir DevTools → Network → confirmar que `tab_fundamentos.json` é o primeiro JSON a completar
4. ✅ Confirmar que `related_v2.json` aparece depois (background), não bloqueando o render
5. ✅ Clicar em "Veja Também" em algum artigo — funciona (usa relatedIndex se já carregou, ou heurística se não)
6. ✅ Aba **Mapa** ainda funciona (bodyFilter + sidebar)

- [ ] **Step 3: Commit**

```bash
git add js/state.js js/core.js index.html
git commit -m "perf: 2-phase loading — render fundamentos first, background rest

Phase 1 (~170 KB): tab_fundamentos + synonyms → immediate render
Phase 2 (background): 5 remaining tabs + related_v2 + Supabase essencia
Reduces initial payload from 6.5 MB to ~170 KB.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
