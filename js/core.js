
// Tabs carregadas em background (após o primeiro render)
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

        console.log('Phase 1 loaded: fundamentos');

        // ── Render imediato ──────────────────────────────────────────────────
        renderTabs();
        renderAlphabet();
        applyFilters();
        if (typeof updateApostilaBadge      === 'function') updateApostilaBadge();
        if (typeof populateCategoryDropdown === 'function') populateCategoryDropdown();
        if (typeof populateSourceDropdown   === 'function') populateSourceDropdown();
        if (typeof initializeTagBrowser     === 'function') initializeTagBrowser();
        if (STATE.activeTab === 'mapa') setTimeout(renderBodyMaps, 100);

        // ── Fase 2: background (não bloqueia o render) ───────────────────────
        const _deepLinkParams = new URLSearchParams(window.location.search);
        const _hasDeepLink    = !!(_deepLinkParams.get('id') || _deepLinkParams.get('item'));

        _loadBackgroundTabs(cfg, _hasDeepLink);

        // Deep link em outra tab: aguarda fase 2 antes de tentar abrir o artigo
        if (_hasDeepLink && Object.keys(STATE._tabLoading).length > 0) {
            await Promise.all(Object.values(STATE._tabLoading));
        }

        checkUrlForDeepLink();

    } catch (e) { console.error('Erro loadData:', e); }
}

// ── Fase 2: carregamento em background ──────────────────────────────────────
function _loadBackgroundTabs(cfg, hasDeepLink) {
    const t = Date.now();

    // Uma promise por tab — merge silencioso no STATE quando chega
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
                console.log(`Background tab loaded: ${tid}`);
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

    // Supabase essência — mostrar welcome quando chegar
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

function checkUrlForDeepLink() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const itemSlug = urlParams.get('item');
        const itemId = urlParams.get('id');
        // ?focus=<trecho> usado pelo admin pra abrir o artigo já com a
        // passagem reportada destacada e scrollada à vista.
        const focusText = urlParams.get('focus') || '';
        // ?paragraph=<idx> usado pelo admin (Phase 8) — pula direto pro
        // ¶ correto sem depender de match de substring (que falha quando
        // o texto PT mudou desde o reporte).
        const focusParaIdxStr = urlParams.get('paragraph');
        const focusParaIdx = focusParaIdxStr != null && /^\d+$/.test(focusParaIdxStr)
          ? parseInt(focusParaIdxStr, 10) : null;
        // Empacota como string "PARA:<n>:<text fallback>" pra reusar o
        // 3º arg de openModal (highlightQuery) sem mudar signature.
        const focusPayload = focusParaIdx != null
          ? 'PARA:' + focusParaIdx + ':' + focusText
          : focusText;

        // Detect Mode Switch
        const urlMode = urlParams.get('mode');

        if (urlMode && CONFIG.modes[urlMode]) {
            if (STATE.mode !== urlMode) {
                console.log(`Deep Link: Switching mode to ${urlMode}`);
                if (typeof setMode === 'function') {
                    setMode(urlMode);
                    return;
                }
            }
        }

        // Fallback: Detect Mode based on ID prefix if logic exists (Optional, kept for backward compat)
        if (itemId && !urlMode) {
            let requiredMode = null;
            if (itemId.startsWith('explicacao_')) {
                // Legacy explicacoes maps to fundamentos tab (merged)
                if (STATE.activeTab !== 'fundamentos') {
                    setTab('fundamentos');
                    return;
                }
            } else if (itemId.startsWith('fundamentos_')) {
                if (STATE.activeTab !== 'fundamentos') { setTab('fundamentos'); return; }
            } else if (itemId.startsWith('curas_') && itemId.includes('Perguntas e Orientações')) {
                if (STATE.activeTab !== 'qa') { setTab('qa'); return; }
            } else if (itemId.startsWith('pontos_')) {
                if (STATE.activeTab !== 'pontos_focais') { setTab('pontos_focais'); return; }
            }
        }

        if (STATE.globalData) {
            let foundId = null;

            // 1. Try Direct ID Match
            if (itemId && STATE.globalData[itemId]) {
                foundId = itemId;
            }

            // 2. Try Slug Match (if no ID match or ID not provided)
            if (!foundId && itemSlug) {
                foundId = Object.keys(STATE.globalData).find(key => {
                    const item = STATE.globalData[key];
                    return item && (item.title_pt || item.title) && toSlug(item.title_pt || item.title) === itemSlug;
                });
            }

            if (foundId) {
                console.log("Deep link found for:", foundId);

                // Ensure fresh state
                applyFilters();

                const newIndex = STATE.list.findIndex(listItem => listItem.id === foundId);

                if (newIndex !== -1) {
                    // Item is in the current filtered list
                    openModal(newIndex, null, focusPayload || null);
                } else {
                    // Item exists in global data but is hidden by current filters/tabs
                    // Open in "Standalone Mode" (like related items)
                    console.log("Opening deep-linked item in standalone mode:", foundId);
                    const item = STATE.globalData[foundId];
                    if (item) {
                        openModal(-1, item, focusPayload || null);
                    } else {
                        console.error("Deep-linked item data missing:", foundId);
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error checking deep link:", e);
    }
}

// --- CONTROLE DE MODO ---
function setMode(newMode) {
    if (STATE.mode === newMode) return;
    STATE.mode = newMode;

    const btnEns = document.getElementById('switch-ens');
    const btnGuia = document.getElementById('switch-guia');
    const activeClass = 'flex-1 py-4 text-[10px] md:text-xs font-sans font-bold uppercase tracking-wider rounded-lg transition-all btn-mode-active';
    const inactiveClass = 'flex-1 py-4 text-[10px] md:text-xs font-sans font-bold uppercase tracking-wider rounded-lg transition-all btn-mode-inactive';

    if (btnEns && btnGuia) {
        if (newMode === 'ensinamentos') {
            btnEns.className = activeClass;
            btnGuia.className = inactiveClass;
        } else {
            btnEns.className = inactiveClass;
            btnGuia.className = activeClass;
        }
    }

    const descEl = document.getElementById('modeDescription');
    descEl.style.opacity = '0';
    setTimeout(() => {
        descEl.textContent = CONFIG.modes[newMode].description;
        descEl.style.opacity = '1';
    }, 150);

    STATE.activeTab = null;
    STATE.activeLetter = '';

    // Reseta filtros do mapa usando a função do body-map.js se existir
    if (typeof clearBodyFilter === 'function') clearBodyFilter();
    else STATE.bodyFilter = null;

    STATE.activeTag = null;
    STATE.activeTags = [];       // Reset Tags
    STATE.activeCategories = []; // Reset Categories
    STATE.activeSources = [];    // Reset Sources

    // Update Active Filters UI
    if (typeof renderActiveFilters === 'function') renderActiveFilters();

    // Update Search Inputs (Clear and Set Placeholder)
    document.querySelectorAll('.search-input').forEach(input => input.value = '');
    updateSearchPlaceholder();

    loadData();
}

// --- CONTROLE DE ABAS ---
async function setTab(id) {
    // Fast Exit for Clear Button: reduce friction when switching contexts
    document.querySelectorAll('.clear-search-btn').forEach(btn => {
        btn.classList.add('fast-exit');
        // Cleanup after transition
        setTimeout(() => btn.classList.remove('fast-exit'), 300);
    });

    STATE.activeTab       = id;
    STATE.activeSubAba    = null;
    STATE.activeCategoria = null;
    STATE.activeLetter    = '';
    STATE.activeSubject   = null; // Reset Subject Filter on Tab Change

    // Ao mudar de aba, resetar filtros do mapa (corpo e condição guia).
    if (id !== 'mapa') {
        if (typeof clearBodyFilter     === 'function') clearBodyFilter();
        if (typeof clearConditionGuide === 'function') clearConditionGuide();
    }

    // STATE.activeTag = null; // Removed to persist tags across tabs
    // STATE.activeTags is NOT cleared here, so filters persist.

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

    // Refresh filters dropdowns for the new tab
    if (typeof populateCategoryDropdown === 'function') populateCategoryDropdown();
    if (typeof populateSourceDropdown   === 'function') populateSourceDropdown();

    // Refresh tag browser with new tab data
    if (typeof initializeTagBrowser === 'function') {
        initializeTagBrowser();
    }
}
