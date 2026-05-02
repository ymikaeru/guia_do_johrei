
// --- CARREGAMENTO DE DADOS ---
const NEW_TAB_IDS = ['fundamentos', 'pratica', 'critica_farmacologica', 'por_regiao'];

async function loadTabData(tabId) {
    const res = await fetch(`data/tab_${tabId}.json?t=${Date.now()}`);
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
                    title_pt:         artigo.titulo,
                    content_pt:       artigo.conteudo,
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
    try {
        const idxRes = await fetch(`${cfg.path}${cfg.file}?t=${Date.now()}`);
        const idxData = await idxRes.json();

        STATE.data = {};
        STATE.tabStructure = {};

        // 1) Carrega 4 tabs novas em paralelo, ordem fixa
        const newTabs = ['fundamentos', 'pratica', 'critica_farmacologica', 'por_regiao'];
        const loaded = await Promise.all(newTabs.map(tid => loadTabData(tid)));
        newTabs.forEach((tid, i) => {
            STATE.tabStructure[tid] = loaded[i];
            STATE.data[tid] = flattenTabData(loaded[i]);
        });

        // 2) Estudo Aprofundado: mantém intacto, carrega via index.json categories
        if (idxData.categories) {
            const eaCategory = idxData.categories.find(c => c.tab === 'estudo_aprofundado');
            if (eaCategory) {
                STATE.data['estudo_aprofundado'] = [];
                await Promise.all(eaCategory.volumes.map(async volInfo => {
                    const res = await fetch(`${cfg.path}${volInfo.file}?t=${Date.now()}`);
                    const items = await res.json();
                    const categoryName = eaCategory.name || volInfo.file;
                    const volMatch = volInfo.file.match(/JK(\d+)/i);
                    const volNumber = volMatch ? ` JK${volMatch[1]}` : '';
                    const sourceName = categoryName + volNumber;
                    const validItems = items
                        .filter(i => (i.title_pt || i.title) && (i.title_pt || i.title).trim().length > 0)
                        .map(i => ({ ...i, source: sourceName, _cat: 'estudo_aprofundado' }));
                    STATE.data['estudo_aprofundado'].push(...validItems);
                }));
            }

            // 3) pontos_focais: chave HIDDEN para alimentar Mapa
            const pfCategory = idxData.categories.find(c => c.tab === 'pontos_focais');
            if (pfCategory) {
                STATE.data['pontos_focais'] = [];
                await Promise.all(pfCategory.volumes.map(async volInfo => {
                    const res = await fetch(`${cfg.path}${volInfo.file}?t=${Date.now()}`);
                    const items = await res.json();
                    const validItems = items
                        .filter(i => (i.title_pt || i.title) && (i.title_pt || i.title).trim().length > 0)
                        .map(i => ({ ...i, _cat: 'pontos_focais' }));
                    STATE.data['pontos_focais'].push(...validItems);
                }));
            }
        }

        // 4) Cache global por ID
        STATE.globalData = {};
        Object.entries(STATE.data).forEach(([tabId, items]) => {
            items.forEach(item => {
                if (item?.id) STATE.globalData[item.id] = { ...item, _cat: tabId };
            });
        });

        // 5) related_v2.json (Veja Também)
        try {
            const relRes = await fetch(`${cfg.path}related_v2.json?t=${Date.now()}`);
            if (relRes.ok) {
                STATE.relatedIndex = await relRes.json();
                console.log('Related index loaded:', Object.keys(STATE.relatedIndex).length);
            }
        } catch (e) { console.warn('No related_v2.json:', e); }

        // 6) Essência (Supabase) — preserva lógica original
        try {
            const SB_URL = 'https://succhmnbajvbpmoqrktq.supabase.co/rest/v1/johrei_essencia';
            const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1Y2NobW5iYWp2YnBtb3Fya3RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NjY3MDgsImV4cCI6MjA5MjA0MjcwOH0.humCcLYpnnnapkLtLOeb9ZVo5EZWoWw6ItNo0WVY3DY';
            const essRes = await fetch(`${SB_URL}?select=article_id,excerpt_pt,updated_at&id=eq.1&limit=1`, {
                headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
                cache: 'no-cache'
            });
            if (essRes.ok) {
                const rows = await essRes.json();
                if (rows.length === 1) STATE.essencia = rows[0];
            }
        } catch (e) { console.warn('Essência indisponível:', e); }

        if (!STATE.activeTab || !STATE.data[STATE.activeTab]) STATE.activeTab = 'fundamentos';

        console.log('Tabs:', Object.keys(STATE.data).map(k => `${k}:${STATE.data[k].length}`));

        renderTabs();
        renderAlphabet();
        applyFilters();

        if (typeof populateCategoryDropdown === 'function') populateCategoryDropdown();
        if (typeof populateSourceDropdown === 'function') populateSourceDropdown();
        if (typeof initializeTagBrowser === 'function') initializeTagBrowser();
        if (STATE.activeTab === 'mapa') setTimeout(renderBodyMaps, 100);

        checkUrlForDeepLink();

        if (STATE.essencia && typeof showEssenciaWelcome === 'function') {
            history.replaceState(null, '', window.location.pathname);
            const readModal = document.getElementById('readModal');
            if (readModal && !readModal.classList.contains('hidden') && typeof closeModal === 'function') {
                closeModal();
            }
            showEssenciaWelcome();
        }

    } catch (e) { console.error('Erro loadData:', e); }
}

function checkUrlForDeepLink() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const itemSlug = urlParams.get('item');
        const itemId = urlParams.get('id');

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
                    openModal(newIndex);
                } else {
                    // Item exists in global data but is hidden by current filters/tabs
                    // Open in "Standalone Mode" (like related items)
                    console.log("Opening deep-linked item in standalone mode:", foundId);
                    const item = STATE.globalData[foundId];
                    if (item) {
                        openModal(-1, item);
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
function setTab(id) {
    // Fast Exit for Clear Button: reduce friction when switching contexts
    document.querySelectorAll('.clear-search-btn').forEach(btn => {
        btn.classList.add('fast-exit');
        // Cleanup after transition
        setTimeout(() => btn.classList.remove('fast-exit'), 300);
    });

    STATE.activeTab = id;
    STATE.activeSubAba = null;
    STATE.activeLetter = '';
    STATE.activeSubject = null; // Reset Subject Filter on Tab Change

    // Ao mudar de aba, resetar filtros do mapa (corpo e condição guia).
    if (id !== 'mapa') {
        if (typeof clearBodyFilter === 'function') clearBodyFilter();
        if (typeof clearConditionGuide === 'function') clearConditionGuide();
    }

    // STATE.activeTag = null; // Removed to persist tags across tabs
    // STATE.activeTags is NOT cleared here, so filters persist.

    document.querySelectorAll('.search-input').forEach(input => input.value = '');

    renderTabs();
    applyFilters();
    updateMapLayout(id);

    // Refresh filters dropdowns for the new tab
    if (typeof populateCategoryDropdown === 'function') populateCategoryDropdown();
    if (typeof populateSourceDropdown === 'function') populateSourceDropdown();

    // Refresh tag browser with new tab data
    if (typeof initializeTagBrowser === 'function') {
        initializeTagBrowser();
    }
}
