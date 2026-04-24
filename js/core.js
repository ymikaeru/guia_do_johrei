
// --- CARREGAMENTO DE DADOS ---
// Nova estrutura: carrega volumes individuais e agrupa por tabs via index.json
async function loadData() {
    const cfg = CONFIG.modes[STATE.mode];
    try {
        // 1. Fetch Main Index
        const idxRes = await fetch(`${cfg.path}${cfg.file}?t=${Date.now()}`);
        const idxData = await idxRes.json();

        // 2. Fetch Explicações Index (opcional - pode estar vazio)
        let explicacoesItems = [];
        // Dependency removed to avoid 404 on explicacoes_index.json

        // 3. Load all volumes and group by tab
        const volumesByTab = {};

        // Process each category in index
        await Promise.all(idxData.categories.map(async category => {
            // Get tab ID from category (not from individual volumes)
            const tabId = category.tab;

            // Each category has volumes with tab metadata
            await Promise.all(category.volumes.map(async volInfo => {
                // Use file defined in index.json directly
                const fileName = volInfo.file;
                const res = await fetch(`${cfg.path}${fileName}?t=${Date.now()}`);
                const items = await res.json();

                // Extract source name from category and volume number from filename
                const categoryName = category.name || fileName.replace('_bilingual.json', '').replace('_site.json', '');
                const volMatch = fileName.match(/vol(\d+)/i);
                const volNumber = volMatch ? ` Vol.${volMatch[1].padStart(2, '0')}` : '';
                const sourceName = categoryName + volNumber;

                // Initialize tab array if needed
                if (!volumesByTab[tabId]) {
                    volumesByTab[tabId] = [];
                }

                // Add all items to this tab, filtering out empty titles and adding source
                const validItems = items
                    .filter(i => (i.title_pt || i.title) && (i.title_pt || i.title).trim().length > 0)
                    .map(i => ({ ...i, source: sourceName }));
                volumesByTab[tabId].push(...validItems);
            }));
        }));

        // 4. Construct STATE.data
        STATE.data = {};

        // Map new tab IDs to old structure
        // fundamentos -> fundamentos
        // cases_qa -> qa (all items, no split)
        // pontos_focais -> pontos_focais

        STATE.data['fundamentos'] = [
            ...(volumesByTab['fundamentos'] || []),
            ...explicacoesItems
        ];

        // All cases_qa items go to qa tab (no testemunhos split)
        STATE.data['qa'] = volumesByTab['cases_qa'] || [];

        STATE.data['pontos_focais'] = volumesByTab['pontos_focais'] || [];

        // 5. Populate Global Cached Data
        STATE.globalData = {};
        Object.entries(STATE.data).forEach(([tabId, items]) => {
            items.forEach(item => {
                if (item && item.id) {
                    STATE.globalData[item.id] = { ...item, _cat: tabId };
                }
            });
        });

        console.log("Loaded volumes by tab:", Object.keys(volumesByTab));
        console.log("Global Data ID Cache Size:", Object.keys(STATE.globalData).length);
        console.log("Tabs:", Object.keys(STATE.data).map(k => `${k}: ${STATE.data[k].length}`));

        if (!STATE.activeTab) STATE.activeTab = 'fundamentos';

        renderTabs();
        renderAlphabet();
        applyFilters();

        // Refresh filters dropdowns for the initial tab
        if (typeof populateCategoryDropdown === 'function') populateCategoryDropdown();
        if (typeof populateSourceDropdown === 'function') populateSourceDropdown();

        // Initialize tag browser if available
        if (typeof initializeTagBrowser === 'function') {
            initializeTagBrowser();
        }

        // Render inicial se já estiver na aba mapa (raro no load, mas seguro)
        if (STATE.activeTab === 'mapa') {
            setTimeout(renderBodyMaps, 100);
        }

        // Check URL for Deep Link AFTER UI is fully rendered
        checkUrlForDeepLink();

    } catch (e) { console.error("Erro load:", e); }
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
    STATE.activeLetter = '';
    STATE.activeSubject = null; // Reset Subject Filter on Tab Change

    // Ao mudar de aba, geralmente queremos resetar o filtro específico do corpo
    // a menos que estejamos indo PARA o mapa.
    if (id !== 'mapa' && typeof clearBodyFilter === 'function') {
        clearBodyFilter();
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
