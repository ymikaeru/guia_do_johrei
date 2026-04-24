
// --- FILTROS E ORDENAÇÃO ---

function toggleFilter(type, value) {
    if (type === 'category') {
        if (STATE.activeCategories.includes(value)) {
            STATE.activeCategories = STATE.activeCategories.filter(c => c !== value);
        } else {
            STATE.activeCategories.push(value);
        }
    } else if (type === 'source') {
        // Toggle source logic
        if (STATE.activeSources.includes(value)) {
            STATE.activeSources = STATE.activeSources.filter(s => s !== value);
        } else {
            STATE.activeSources.push(value);
        }
    }

    applyFilters();
    renderActiveFilters();
    if (typeof initializeTagBrowser === 'function') {
        initializeTagBrowser();
    }
}

function setCategoryFilter(value) {
    if (!value) {
        STATE.activeCategories = [];
    } else {
        STATE.activeCategories = [value];
    }
    applyFilters();
    renderActiveFilters();
}

function populateCategoryDropdown() {
    const selects = document.querySelectorAll('.category-filter-select');
    if (selects.length === 0) return;

    // Determine relevant data source: Current Active Tab Items
    let itemsToScan = [];

    if (STATE.activeTab && STATE.data[STATE.activeTab]) {
        itemsToScan = STATE.data[STATE.activeTab];
    } else {
        // Fallback: If no specific tab data or "search" mode across all tabs?
        // For now, default to empty or maybe accumulate all if search mode?
        // Let's stick to active tab context.
    }

    // Special Case: "Mapa" might rely on "Pontos Focais". 
    // But currently Mapa is just an entry point to Modal. 
    // If we are IN the "Pontos Focais" tab, we want its categories.

    if (!itemsToScan || itemsToScan.length === 0) {
        selects.forEach(select => select.parentElement.classList.add('hidden'));
        return;
    }

    const categories = new Set();
    itemsToScan.forEach(item => {
        // Use 'category_pt' field which is the specific sub-chapter/category
        // Ignore generic '_cat' if it's just the volume ID (which it is for current STATE.data structure)
        if (item.category_pt && typeof item.category_pt === 'string' && item.category_pt.length > 0) {
            categories.add(item.category_pt.trim());
        }
    });

    const sortedCats = Array.from(categories).sort();

    // Preserve current selection if valid
    const currentVal = STATE.activeCategories.length > 0 ? STATE.activeCategories[0] : "";

    // Build Options
    let html = '<option value="">TODAS AS CATEGORIAS</option>';
    sortedCats.forEach(cat => {
        const selected = cat === currentVal ? 'selected' : '';
        html += `<option value="${cat}" ${selected}>${cat}</option>`;
    });

    selects.forEach(select => {
        select.innerHTML = html;

        // Visibility Logic: Hide if no categories found (<= 0 options besides default?)
        // Actually if only default exists (sortedCats.length === 0), usually hide.
        if (sortedCats.length === 0) {
            select.parentElement.classList.add('hidden');
        } else {
            select.parentElement.classList.remove('hidden');
        }

        // Ensure event listener is attached? It's done in HTML usually (onchange="setCategoryFilter(this.value)")
    });
}
// --- SOURCE FILTER LOGIC ---
function setSourceFilter(value) {
    if (!value) {
        STATE.activeSources = [];
    } else {
        STATE.activeSources = [value];
    }
    applyFilters();
    renderActiveFilters();
}

function populateSourceDropdown() {
    const selects = document.querySelectorAll('.source-filter-select');
    if (selects.length === 0) return;

    // Determine relevant data source: Current Active Tab Items
    let itemsToScan = [];
    if (STATE.activeTab && STATE.data[STATE.activeTab]) {
        itemsToScan = STATE.data[STATE.activeTab];
    }

    if (!itemsToScan || itemsToScan.length === 0) {
        selects.forEach(select => select.parentElement.classList.add('hidden'));
        return;
    }

    const sources = new Set();
    const sourceRegex = /Fonte:\s*(.*?)[\)\n]/i; // Simple regex to capture source name

    itemsToScan.forEach(item => {
        // 1. Prefer explicit 'source' field
        if (item.source) {
            sources.add(item.source.trim());
        }
        // 2. Fallback: Parse from content_pt
        else if (item.content_pt) {
            const match = item.content_pt.match(sourceRegex);
            if (match && match[1]) {
                // Clean up source name: remove page numbers, etc if simpler
                // E.g. "Shinkō Zatsuwa 2, p. 11–12" -> "Shinkō Zatsuwa 2"
                // Maybe split by comma?
                let cleanSource = match[1].split(',')[0].trim();
                sources.add(cleanSource);

                // Temp: Tag item with parsed source for filtering
                item._tempSource = cleanSource;
            }
        }
    });

    const sortedSources = Array.from(sources).sort();

    // Preserve selection
    const currentVal = STATE.activeSources.length > 0 ? STATE.activeSources[0] : "";

    let html = '<option value="">FONTES</option>';
    sortedSources.forEach(src => {
        const selected = src === currentVal ? 'selected' : '';
        html += `<option value="${src}" ${selected}>${src}</option>`;
    });

    selects.forEach(select => {
        select.innerHTML = html;
        if (sortedSources.length === 0) {
            select.parentElement.classList.add('hidden');
        } else {
            select.parentElement.classList.remove('hidden');
        }
    });
}

// Call this when tab changes
// Hooking into updateUIForTab or similar might be needed.
// For now, renderTabs calls renderList, maybe we add it there or where populateCategoryDropdown is called.


// --- SUBJECT FILTER LOGIC (TITULO MESTRE) ---
function setSubjectFilter(value) {
    if (!value) {
        STATE.activeSubject = null;
    } else {
        STATE.activeSubject = value;
    }
    applyFilters();
    renderActiveFilters();
}

function populateSubjectDropdown() {
    // Deprecated in favor of Modal
    populateSubjectBrowser();
}

// --- SUBJECT BROWSER MODAL (New) ---
// Global variable to store current full list for filtering
let CURRENT_SUBJECTS_LIST = [];

function toggleSubjectBrowser() {
    const content = document.getElementById('subjectBrowserContent');
    if (!content) return;

    const isHidden = content.classList.contains('hidden');

    if (isHidden) {
        // Open
        populateSubjectBrowser(); // Refresh list on open
        content.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Lock scroll

        // Auto-focus search
        setTimeout(() => {
            const searchInput = document.getElementById('subjectSearchInput');
            if (searchInput) searchInput.focus();
        }, 10);

    } else {
        // Close
        content.classList.add('hidden');
        document.body.style.overflow = ''; // Unlock scroll
    }
}


function populateSubjectBrowser() {
    // 1. Check visibility conditions (same as old dropdown)
    const container = document.getElementById('subjectFilterContainer');
    const allowedTabs = ['cases_qa', 'qa', 'casos_especificos', 'pontos_focais'];

    if (!STATE.activeTab || !allowedTabs.includes(STATE.activeTab)) {
        if (container) container.classList.add('hidden');
        return;
    }

    // 2. Scan Items
    let itemsToScan = [];
    if (STATE.activeTab && STATE.data[STATE.activeTab]) {
        itemsToScan = STATE.data[STATE.activeTab];
    }

    if (!itemsToScan || itemsToScan.length === 0) {
        if (container) container.classList.add('hidden');
        return;
    }

    // Show container
    if (container) container.classList.remove('hidden');

    // 3. Extract Subjects & Counts
    const subjectCounts = {};
    itemsToScan.forEach(item => {
        let subj = item.Master_Title || item.Master_title || item.titulo_mestre;
        if (subj) {
            subj = subj.trim();
            subjectCounts[subj] = (subjectCounts[subj] || 0) + 1;
        }
    });

    // Create list of objects {name, count}
    CURRENT_SUBJECTS_LIST = Object.keys(subjectCounts).map(name => ({
        name: name,
        count: subjectCounts[name]
    })).sort((a, b) => a.name.localeCompare(b.name));

    // 4. Render Initial List
    renderSubjectList(CURRENT_SUBJECTS_LIST);

    // 5. Update Button Label based on current selection
    const labelEl = document.getElementById('currentSubjectLabel');
    if (labelEl) {
        labelEl.textContent = STATE.activeSubject ? STATE.activeSubject : 'ASSUNTOS';
        if (STATE.activeSubject) {
            labelEl.classList.add('text-black', 'dark:text-white');
            labelEl.classList.remove('text-gray-500');
        } else {
            labelEl.classList.remove('text-black', 'dark:text-white');
            labelEl.classList.add('text-gray-500');
        }
    }
}

function renderSubjectList(list) {
    const listContainer = document.getElementById('subjectListContainer');
    if (!listContainer) return;

    if (list.length === 0) {
        listContainer.innerHTML = '<div class="p-4 text-center text-[10px] bg-gray-50 dark:bg-[#222] text-gray-400 font-bold uppercase tracking-widest">Nenhum assunto encontrado</div>';
        return;
    }

    let html = '';

    // Add "All Subjects" option at top if not searching? 
    // Or just a clear button (which is implicit by unselecting or clearing filter elsewhere).
    // Let's add a "Todos" option at top.
    const isAllSelected = !STATE.activeSubject;
    html += `
        <button onclick="setSubjectFilter(null); toggleSubjectBrowser()" 
            class="w-full text-left px-4 py-3 rounded-md transition-colors text-[10px] font-bold uppercase tracking-widest border-b border-gray-50 dark:border-gray-800 last:border-0 ${isAllSelected ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-50 dark:hover:bg-[#1a1a1a] text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white'}">
            TODOS OS ASSUNTOS
        </button>
    `;

    list.forEach(item => {
        const subjName = item.name;
        const count = item.count;
        const isActive = STATE.activeSubject === subjName;
        const activeClass = isActive ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-50 dark:hover:bg-[#1a1a1a] text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white';
        const countClass = isActive ? 'text-white/60 dark:text-black/60' : 'text-gray-300 group-hover:text-gray-400';

        html += `
            <button onclick="setSubjectFilter('${subjName.replace(/'/g, "\\'")}'); toggleSubjectBrowser()" 
                class="group w-full text-left px-4 py-3 rounded-md transition-colors text-[10px] font-bold uppercase tracking-widest border-b border-gray-50 dark:border-gray-800 last:border-0 ${activeClass} flex justify-between items-center">
                <span>${subjName}</span>
                <span class="${countClass} text-[9px] font-mono">${count}</span>
            </button>
        `;
    });

    listContainer.innerHTML = html;
}

function filterSubjectList(query) {
    if (!query) {
        renderSubjectList(CURRENT_SUBJECTS_LIST);
        return;
    }

    const q = removeAccents(query.toLowerCase());
    const filtered = CURRENT_SUBJECTS_LIST.filter(s => removeAccents(s.name.toLowerCase()).includes(q));
    renderSubjectList(filtered);
}


function applyFilters() {
    // Text search lives in js/search-modal.js; this handles structural filters only.
    const { activeTab, activeLetter, activeTags, bodyFilter, activeSubject } = STATE;

    // Fix: If in Apostila tab and no filter active, skip (view is self-rendered)
    if (activeTab === 'apostila' && activeTags.length === 0 && !bodyFilter && !activeSubject) {
        return;
    }

    let rawItems = [];
    let label = "TODOS";

    if (activeTags.length > 0 || activeTab === 'mapa' || bodyFilter || activeSubject) {
        Object.keys(STATE.data).forEach(cat => {
            STATE.data[cat].forEach(i => rawItems.push({ ...i, _cat: cat }));
        });

        if (activeTags.length > 0 && bodyFilter) label = `TAGS: ${activeTags.map(t => `#${t}`).join(' ')} + ${document.getElementById('selectedBodyPointName')?.textContent || 'Filtro'} `;
        else if (activeTags.length > 0) label = `TAGS: ${activeTags.map(t => `#${t}`).join(' ')} `;
        else if (bodyFilter) label = "PONTO FOCAL SELECIONADO";
        else if (activeTab === 'mapa') label = "SELECIONE UMA REGIÃO ACIMA";
    } else {
        rawItems = (STATE.data[activeTab] || []).map(i => ({ ...i, _cat: activeTab }));
        label = CONFIG.modes[STATE.mode].cats[activeTab] ? CONFIG.modes[STATE.mode].cats[activeTab].label : activeTab;
    }

    // Filter Logic — structural filters only
    let filtered = rawItems.filter(item => {
        // 1.2 Filter by TAGS (AND Logic)
        if (activeTags.length > 0) {
            if (!item.tags) return false;
            // Check if item has ALL active tags
            const hasAllTags = activeTags.every(tag => item.tags.includes(tag));
            if (!hasAllTags) return false;
        }

        // 1.5 Filtro de PONTOS FOCAIS (Multi-select)
        if (STATE.activeFocusPoints.length > 0) {
            if (!item.focusPoints) return false;
            const hasAllPoints = STATE.activeFocusPoints.every(fp => item.focusPoints.includes(fp));
            if (!hasAllPoints) return false;
        }

        // 1.6 Filtro de FONTE (OR Logic for list of sources)
        if (STATE.activeSources.length > 0) {
            const itemSource = item.source || item._tempSource;
            if (!itemSource || !STATE.activeSources.includes(itemSource)) return false;
        }

        // 1.7 Filtro de CATEGORIA (OR logic) - Added for Category Filtering
        if (STATE.activeCategories.length > 0) {
            // Check category_pt first, then fallback to implicit categories logic if needed
            // But strict matching to category_pt is best for the dropdown.
            if (!item.category_pt || !STATE.activeCategories.includes(item.category_pt)) return false;
        }

        // 1.8 Filtro de CATEGORIA (single category for Q&A alphabet replacement)
        if (STATE.activeCategory && STATE.activeCategory !== '') {
            if (!item.category_pt || item.category_pt !== STATE.activeCategory) return false;
        }

        // 2. Filtro do MAPA (Integração)
        // Se estiver na aba mapa e nenhum ponto selecionado (e sem tag), não mostra nada
        if (activeTab === 'mapa' && !bodyFilter && activeTags.length === 0) return false;



        // Se houver um filtro de corpo, usa a função matchBodyPoint do body-map.js
        if (bodyFilter && typeof matchBodyPoint === 'function') {
            if (!matchBodyPoint(item, bodyFilter)) return false;
        }

        // 3. Filtro de LETRA (Alfabeto)
        if (activeTags.length === 0 && !bodyFilter && activeLetter) {
            const t = item.title_pt || item.title || '';
            // Normalize exactly as UI renderer
            let cleanTitle;
            if (typeof toSlug === 'function') {
                cleanTitle = toSlug(t).toUpperCase();
            } else {
                cleanTitle = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '').toUpperCase();
            }

            if (!cleanTitle.startsWith(activeLetter)) return false;
        }

        // 3.5. Filtro de ASSUNTO (Master_Title for Q&A)
        if (activeSubject) {
            const itemSubject = item.Master_Title || item.Master_title || item.titulo_mestre;
            if (!itemSubject || itemSubject.trim() !== activeSubject) {
                return false;
            }
        }

        return true;
    });

    // Preserve numeric order where available
    filtered.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
            return a.order - b.order;
        }
        return 0;
    });

    STATE.list = filtered;

    // Detect cross-tab mode and update state
    const uniqueCategories = new Set(filtered.map(item => item._cat));
    const wasCrossTabMode = STATE.isCrossTabMode;
    STATE.isCrossTabMode = uniqueCategories.size > 1;

    // Re-render tabs if cross-tab mode changed
    if (wasCrossTabMode !== STATE.isCrossTabMode) {
        renderTabs();
    }

    // LIST VISIBILITY ON MAP TAB
    // Ensure list is visible if we have results and filters, even on 'mapa' tab
    const list = document.getElementById('contentList');
    const empty = document.getElementById('emptyState');

    if (activeTab === 'mapa') {
        const hasFilters = activeTags.length > 0 || bodyFilter;
        if (hasFilters) {
            list.classList.remove('hidden');
            if (filtered.length === 0 && empty) empty.classList.remove('hidden');
        } else {
            // If no filters, hide list (show only map)
            list.classList.add('hidden');
            if (empty) empty.classList.add('hidden');
        }
    }

    // Atualiza contadores e UI (Multiple elements)
    document.querySelectorAll('.search-count').forEach(el => {
        el.textContent = `${filtered.length} Itens`;
    });

    // Show/Hide Clear Buttons
    const hasActiveFilters = STATE.activeTags.length > 0 || STATE.activeCategories.length > 0 || STATE.activeSources.length > 0 || STATE.activeFocusPoints.length > 0;

    // 1. Update Input Result Count (New Permanent Indicator)
    // 1. Update Input Result Count (New Permanent Indicator)
    const inputCountEl = document.getElementById('inputResultCount');
    if (inputCountEl) {
        if (activeTab === 'mapa' || activeTab === 'apostila') {
            inputCountEl.classList.add('hidden');
        } else {
            inputCountEl.classList.remove('hidden');
            inputCountEl.textContent = `${filtered.length} CARDS DISPLAYED`;

            if (hasActiveFilters) {
                inputCountEl.classList.remove('text-gray-400');
                inputCountEl.classList.add('text-gray-900', 'dark:text-white');
            } else {
                inputCountEl.classList.add('text-gray-400');
                inputCountEl.classList.remove('text-gray-900', 'dark:text-white');
            }
        }
    }

    // 2. Legacy clear button visibility (only shown for structural filters now)
    document.querySelectorAll('.clear-search-btn').forEach(btn => {
        if (hasActiveFilters || STATE.bodyFilter) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    });

    // 3. Toggle Header "Limpar Filtros" Button
    const headerClearBtn = document.getElementById('headerClearFiltersBtn');
    if (headerClearBtn) {
        if (hasActiveFilters) {
            headerClearBtn.classList.remove('hidden');
        } else {
            headerClearBtn.classList.add('hidden');
        }
    }

    // 4. Update "Add All" Button State (Toggle Text)
    const addAllBtn = document.getElementById('addAllBtn');
    if (addAllBtn && STATE.apostilas) {
        const currentApostila = STATE.apostilas[STATE.mode];
        const btnSpan = addAllBtn.querySelector('span');

        if (filtered.length > 0) {
            const allPresent = filtered.every(item => currentApostila.items.includes(item.id));
            if (btnSpan) {
                btnSpan.textContent = allPresent ? 'Remove All' : 'Add All';
            }
            // Optional: Toggle Style/Icon if needed (e.g. Red for Remove), but keeping simple text toggle for now per request.
        } else {
            if (btnSpan) btnSpan.textContent = 'Add All';
        }
    }

    // Render filtered results
    renderList(filtered, activeTags, STATE.mode, activeTab);
}

function filterByTag(tag, event) {
    if (event) event.stopPropagation();

    const index = STATE.activeTags.indexOf(tag);
    if (index > -1) {
        STATE.activeTags.splice(index, 1); // Remove if exists
    } else {
        STATE.activeTags.push(tag); // Add if not exists
    }

    document.querySelectorAll('.search-input').forEach(input => input.value = '');
    STATE.activeLetter = '';

    // DECISÃO DE INTEGRAÇÃO:
    // Se estivermos na aba MAPA, NÃO limpamos o bodyFilter.
    // Isso permite clicar em "Cabeça" e depois na tag "#Cura" para ver a interseção.
    if (STATE.activeTab !== 'mapa') {
        if (typeof clearBodyFilter === 'function') clearBodyFilter();
        STATE.bodyFilter = null;
    }

    applyFilters();
    renderActiveFilters();
}

function filterByLetter(l) {
    STATE.activeLetter = l;
    STATE.activeTags = [];
    renderAlphabet();
    applyFilters();
}

function filterByFocusPoint(point, event) {
    if (event) event.stopPropagation();
    closeModal();

    if (STATE.activeTab === 'pontos_focais') {
        // Multi-select mode (only on pontos_focais tab)
        const index = STATE.activeFocusPoints.indexOf(point);
        if (index > -1) {
            STATE.activeFocusPoints.splice(index, 1);
        } else {
            STATE.activeFocusPoints.push(point);
        }
    } else {
        // Single focus point filter on other tabs
        STATE.activeTags = [];
        STATE.activeLetter = '';
        STATE.bodyFilter = null;
        STATE.activeFocusPoints = [point];
    }

    applyFilters();
    renderActiveFilters();
}

function clearSearch() {
    document.querySelectorAll('.search-input').forEach(input => input.value = '');

    STATE.activeTags = [];
    STATE.activeCategories = [];
    STATE.activeSources = [];
    STATE.activeFocusPoints = [];
    STATE.activeSubject = null;

    // Opcional: Limpar mapa ao limpar busca? Geralmente não.
    // if(typeof clearBodyFilter === 'function') clearBodyFilter();

    // Update Tag Browser UI
    if (typeof initializeTagBrowser === 'function') {
        initializeTagBrowser(); // Full re-render handles all types
    } else if (typeof updateTagPillStates === 'function') {
        updateTagPillStates(); // Partial fallback
    }

    // Update Active Filters Display (Swedish Minimalist Design)
    renderActiveFilters();

    applyFilters();

    // Collapse search if empty
    toggleSearch('desktop', false);
    toggleSearch('mobile', false);
}

// selectSuggestion removed — suggestions dropdown no longer exists.

function toggleBodyPoint(id) {
    if (STATE.bodyFilter === id) {
        STATE.bodyFilter = null;
        document.getElementById('mobileFab').classList.add('hidden');
    } else {
        STATE.bodyFilter = id;
        // Show FAB on mobile if point selected
        if (window.innerWidth < 1024) {
            const fab = document.getElementById('mobileFab');
            fab.classList.remove('hidden');
            // Update FAB count if possible? For now just visual cue.
            // Pulse animation
            fab.firstElementChild.classList.add('scale-110');
            setTimeout(() => fab.firstElementChild.classList.remove('scale-110'), 200);
        }
    }

    // Update UI for CURRENT tab, not hardcoded 'mapa'
    // This was causing tags to navigate to maps tab
    updateUIForTab(STATE.activeTab);

    // Update list
    applyFilters();

    // Control page scroll on tablets in map tab: allow when point selected
    if (STATE.activeTab === 'mapa' && window.innerWidth >= 768) {
        if (STATE.bodyFilter) {
            // Has selection - allow scrolling to see results
            document.body.style.overflow = '';
        } else {
            // No selection - block scrolling
            document.body.style.overflow = 'hidden';
        }
    }

    if (window.innerWidth >= 1024 && STATE.bodyFilter) {
        const list = document.getElementById('contentList');
        if (list) list.classList.remove('hidden');
    }
}

// --- SETUP ---
function updateSearchPlaceholder() {
    const inputs = document.querySelectorAll('.search-input');
    const modeConfig = CONFIG.modes[STATE.mode];
    const catConfig = modeConfig.cats[STATE.activeTab];
    const label = catConfig ? catConfig.label : 'Ensinamento';

    inputs.forEach(input => {
        if (input.closest('#searchModal')) return;
        input.placeholder = `Pesquisar em ${label}...`;
    });
}


// Filter by category (body part) for Q&A tab
function filterByCategory(category) {
    STATE.activeCategory = category;
    STATE.activeLetter = ''; // Clear letter filter
    applyFilters();
    renderAlphabet(); // Update button states
}

// Make it globally available
window.filterByCategory = filterByCategory;
