
// --- LAYOUT HELPER FOR MAP MODE ---
function updateMapLayout(activeTab) {
    // Reverted: User wants specific sidebar scroll, handled in render logic.
}

function renderTabs() {
    const container = document.getElementById('tabsContainer');

    const catMap = CONFIG.modes[STATE.mode].cats;

    // Check if search is active (Global Search visual feedback)
    const searchQuery = document.getElementById('searchInput')?.value?.trim() || '';
    const hasActiveFilters = STATE.activeTags.length > 0 || STATE.activeCategories.length > 0 || STATE.activeSources.length > 0 || STATE.activeFocusPoints.length > 0;
    const isSearchActive = searchQuery.length > 0 || hasActiveFilters;

    // Desktop Tabs
    let html = '';
    if (STATE.data) {
        html = Object.keys(STATE.data).map(id => {
            const active = !isSearchActive && STATE.activeTab === id;
            const config = catMap[id];
            const label = config ? config.label : id;
            const activeClass = active
                ? `border-${config ? config.color : 'gray-900'} text-${config ? config.color : 'gray-900'}`
                : 'border-transparent hover:text-black dark:hover:text-white text-gray-400';

            return `<button onclick="setTab('${id}')" class="tab-btn ${activeClass}">${label}</button>`;
        }).join('');
    }

    // Adiciona aba Mapa apenas no modo ensinamentos
    if (STATE.mode === 'ensinamentos') {
        const active = !isSearchActive && STATE.activeTab === 'mapa';
        const activeClass = active
            ? `border-cat-dark text-cat-dark dark:border-white dark:text-white`
            : 'border-transparent hover:text-black dark:hover:text-white text-gray-400';
        html += `<button onclick="setTab('mapa')" class="tab-btn ${activeClass}">Mapa</button>`;
    }

    // Adiciona aba Apostilas se houver itens (Modo Específico)
    const currentApostila = STATE.apostilas ? STATE.apostilas[STATE.mode] : null;
    if (currentApostila && currentApostila.items.length > 0) {
        const active = !isSearchActive && STATE.activeTab === 'apostila';
        const activeClass = active
            ? 'border-yellow-500 text-yellow-500' // Gold color for Apostila
            : 'border-transparent hover:text-black dark:hover:text-white text-gray-400';

        let label = currentApostila.title || 'Apostila';
        if (label.length > 15) label = label.substring(0, 12) + '...';

        html += `<button onclick="setTab('apostila')" class="tab-btn ${activeClass} flex items-center gap-2 ml-auto">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg>
            ${label}
            <span class="text-[0.65em] font-bold bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full ml-1 ${active ? 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30' : ''}">${currentApostila.items.length}</span>
        </button>`;
    }

    container.innerHTML = html;

    // Mobile Tabs (Clean Minimalist "Swedish" Design)
    const mobileContainer = document.getElementById('mobileTabsContainer');

    if (mobileContainer) {
        let mobileHtml = Object.keys(STATE.data).map(id => {
            const config = catMap[id];
            const label = config ? config.label : id;
            const isActive = !isSearchActive && STATE.activeTab === id;

            // Clean Typography Style
            const baseClass = "flex-none py-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all border-b-2";
            const activeStyle = "border-black text-black dark:border-white dark:text-white";
            const inactiveStyle = "border-transparent text-gray-400 hover:text-black dark:hover:text-white";

            const className = `${baseClass} ${isActive ? activeStyle : inactiveStyle}`;

            return `<button onclick="setTab('${id}')" class="${className}">${label}</button>`;
        }).join('');

        // Add Map Option to Mobile (Minimalist)
        if (STATE.mode === 'ensinamentos') {
            const isActive = !isSearchActive && STATE.activeTab === 'mapa';
            const baseClass = "flex-none py-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all border-b-2";
            const activeStyle = "border-black text-black dark:border-white dark:text-white";
            const inactiveStyle = "border-transparent text-gray-400 hover:text-black dark:hover:text-white";

            const className = `${baseClass} ${isActive ? activeStyle : inactiveStyle}`;

            mobileHtml += `<button onclick="setTab('mapa')" class="${className}">Mapa</button>`;
        }

        // Add Apostila Option to Mobile (Minimalist)
        const currentApostila = STATE.apostilas ? STATE.apostilas[STATE.mode] : null;
        if (currentApostila && currentApostila.items.length > 0) {
            const isActive = !isSearchActive && STATE.activeTab === 'apostila';
            const baseClass = "flex-none py-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all border-b-2 flex items-center gap-2";
            // Gold Theme for Apostila Active
            const activeStyle = "border-yellow-500 text-yellow-500";
            const inactiveStyle = "border-transparent text-yellow-600/70 hover:text-yellow-600";

            const className = `${baseClass} ${isActive ? activeStyle : inactiveStyle}`;

            mobileHtml += `<button onclick="setTab('apostila')" class="${className}">
                <span>Apostila</span>
                <span class="${isActive ? 'bg-yellow-500 text-white' : 'bg-yellow-100 text-yellow-800'} text-[9px] px-1.5 py-0.5 rounded-full">${currentApostila.items.length}</span>
             </button>`;
        }

        mobileContainer.innerHTML = mobileHtml;
    }

    // Populate Category Dropdown whenever tab changes
    if (typeof populateCategoryDropdown === 'function') {
        populateCategoryDropdown();
    }
    // Populate Source Dropdown
    if (typeof populateSourceDropdown === 'function') {
        populateSourceDropdown();
    }
    // Populate Subject Dropdown (New)
    if (typeof populateSubjectDropdown === 'function') {
        populateSubjectDropdown();
    }

    updateUIForTab(STATE.activeTab);
}

function renderBodyMapViews() {
    const map = document.getElementById('bodyMapContainer');
    if (!map) return;

    // Render Interactive Body Maps
    const views = [
        { id: 'front', img: 'assets/images/mapa_corporal_1.jpg', alt: 'Frente', points: BODY_DATA.points.front },
        { id: 'detail', img: 'assets/images/mapa_corporal_3.jpg', alt: 'Detalhes', points: BODY_DATA.points.detail },
        { id: 'back', img: 'assets/images/mapa_corporal_2.jpg', alt: 'Costas', points: BODY_DATA.points.back }
    ];

    let html = `
    <div class="flex flex-col-reverse min-[768px]:flex-col lg:flex-row gap-6 lg:gap-12 w-full max-w-full px-4 lg:px-8 mx-auto items-start">
        <!-- Sidebar (Desktop Only) — Guia de Atendimento -->
        <div class="hidden lg:block w-72 flex-shrink-0 bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 sticky top-4 rounded-sm shadow-sm">
            <div class="p-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#151515]">
                <p class="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-2">Filtrar por Purificação</p>
                <input id="guiaSidebarSearch" type="search" placeholder="Buscar condição..."
                    autocomplete="off"
                    oninput="filterGuiaSidebar(this.value)"
                    class="w-full px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 outline-none focus:border-gray-400"
                    style="font-family:inherit">
            </div>
            <div id="bodyPointSidebarList" style="max-height:440px !important;overflow-y:auto !important;height:440px">
                <div class="px-5 py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 transition-all text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a] hover:text-black dark:hover:text-white"
                    onclick="clearConditionGuide()">
                    — Todas as condições —
                </div>
                ${typeof generateConditionOptions === 'function' ? generateConditionOptions() : ''}
            </div>
        </div>

            <div id="mobile-map-container" class="flex-grow grid grid-cols-1 min-[768px]:grid-cols-3 gap-6 w-full">
        ${views.map((view, i) => {
        const visibilityClass = i === 0 ? 'block' : 'hidden tablet-show'; // tablet-show will override hidden at 768px+
        return `
            <div id="view-${view.id}" class="${visibilityClass} relative group transition-all duration-300">
                <p class="text-center text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4 min-[768px]:hidden">${view.alt}</p>
                <div class="relative inline-block w-full bg-white dark:bg-[#111] rounded-lg p-2">
                    <img src="${view.img}" alt="${view.alt}" class="w-full h-auto object-contain" id="${view.id}_img" />
                    <svg class="absolute inset-0 w-full h-full pointer-events-none" id="${view.id}_svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                        ${renderBodyPoints(view.points, view.id)}
                    </svg>
                </div>
            </div>`;
    }).join('')}
        </div>

        <!-- Unified Filter (Pill) - Visible on Mobile/Tablet (lg:hidden) -->
        <!-- Mobile: flex-col-reverse makes logic-last appear Visual-Top. -->
        <!-- Tablet: flex-col makes logic-first appear Visual-Top. We use order-first to make it logic-first. -->
        <div class="w-full lg:hidden flex justify-center px-4 relative z-[40] transition-all min-[768px]:order-first min-[768px]:mb-8 mb-4">
             <button onclick="openBodyFilterModal()" 
                 class="group flex items-center px-6 py-3 bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-800 rounded-full shadow-sm hover:shadow-md hover:border-black dark:hover:border-white transition-all">
                 <span class="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 group-hover:text-black dark:group-hover:text-white transition-colors">Filtrar por Purificação</span>
             </button>
        </div>
    </div>

    <!-- Context Panel: citation + top regions, below body maps -->
    <div id="contextPanel" class="w-full max-w-full px-4 lg:px-8 mx-auto mt-6 mb-8 hidden">
        <div id="guideCitationPanel" style="display:none"></div>
        <div id="topRegionsPanel"></div>
    </div>

    <!-- Mobile Tabs (Below map for easy access) -->
    <div class="flex min-[768px]:hidden justify-center gap-3 mt-6 w-full">
            ${views.map((v, i) => `
                <button onclick="switchMobileView('${v.id}')"
                    id="tab-${v.id}"
                    class="px-4 py-2 text-[10px] font-bold uppercase tracking-widest border rounded-md transition-all ${i === 0 ? 'bg-black text-white border-black dark:bg-white dark:text-black' : 'bg-white dark:bg-black text-gray-400 border-gray-200 dark:border-gray-800'}">
                    ${v.alt}
                </button>
        `).join('')}
    </div>
    `;

    map.innerHTML = html;

    // Re-populate top regions panel — its container is part of the body map
    // template that was just replaced, so the call from showConditionSelector
    // earlier in updateMapLayout was wiped out.
    if (typeof renderTopRegionsPanel === 'function') renderTopRegionsPanel();
}

// Mobile View Switcher
function switchMobileView(viewId) {
    // 1. Hide all views
    ['front', 'back', 'detail'].forEach(id => {
        const el = document.getElementById(`view-${id}`);
        const btn = document.getElementById(`tab-${id}`);
        if (el) el.classList.add('hidden');
        if (btn) {
            btn.classList.remove('bg-black', 'text-white', 'border-black', 'dark:bg-white', 'dark:text-black');
            btn.classList.add('bg-white', 'dark:bg-black', 'text-gray-400', 'border-gray-200', 'dark:border-gray-800');
        }
    });

    // 2. Show target view
    const targetEl = document.getElementById(`view-${viewId}`);
    const targetBtn = document.getElementById(`tab-${viewId}`);

    if (targetEl) targetEl.classList.remove('hidden');
    if (targetBtn) {
        targetBtn.classList.remove('bg-white', 'dark:bg-black', 'text-gray-400', 'border-gray-200', 'dark:border-gray-800');
        targetBtn.classList.add('bg-black', 'text-white', 'border-black', 'dark:bg-white', 'dark:text-black');
    }
}


// --- TABLET FILTER MODAL ---
function openBodyFilterModal() {
    // 1. Check if modal already exists
    let modal = document.getElementById('bodyFilterModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bodyFilterModal';
        modal.className = 'fixed inset-0 z-[9999] hidden';
        modal.innerHTML = `
        <div class="absolute inset-0 bg-white/60 backdrop-blur-sm transition-opacity opacity-0" id="filterModalBackdrop" onclick="closeBodyFilterModal()"></div>
            
        <!-- Modal Card(Centered) -->
        <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md bg-white/95 dark:bg-[#111]/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 flex flex-col max-h-[80vh] transition-all scale-95 opacity-0" id="filterModalCard">

            <!-- Header -->
            <div class="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800">
                <h3 class="text-xs font-bold uppercase tracking-widest text-gray-500">Filtrar por Purificação</h3>
                <button onclick="closeBodyFilterModal()" class="text-gray-400 hover:text-black dark:hover:text-white transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            <!-- List -->
            <div class="overflow-y-auto flex-1 p-0" id="filterModalList">
                <!-- Dynamic Content -->
                <div class="px-6 py-4 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 last:border-0 transition-all text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#151515]"
                    onclick="selectCustomOption('', '-- Todos os pontos --', event)">
                    -- Todos os pontos --
                </div>
                ${typeof generateSidebarOptions === 'function' ? generateSidebarOptions() : ''}
            </div>
        </div>
    `;
        document.body.appendChild(modal);
    }

    // REFRESH CONTENT EVERY TIME (To update counts)
    const list = document.getElementById('filterModalList');
    if (list && typeof generateSidebarOptions === 'function') {
        list.innerHTML = `
            <div class="px-6 py-4 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 last:border-0 transition-all text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#151515]"
                onclick="selectCustomOption('', '-- Todos os pontos --', event)">
                -- Todos os pontos --
            </div>
            ${generateSidebarOptions()}
        `;
    }

    // 2. Open Modal Animation
    modal.classList.remove('hidden');

    // Prevent background scroll
    document.body.style.overflow = 'hidden';

    // Animation
    requestAnimationFrame(() => {
        const backdrop = document.getElementById('filterModalBackdrop');
        const card = document.getElementById('filterModalCard');
        if (backdrop) backdrop.classList.remove('opacity-0');
        if (card) {
            card.classList.remove('scale-95', 'opacity-0');
            card.classList.add('scale-100', 'opacity-100');
        }
    });
}

function closeBodyFilterModal() {
    const modal = document.getElementById('bodyFilterModal');
    if (!modal) return;

    const backdrop = document.getElementById('filterModalBackdrop');
    const card = document.getElementById('filterModalCard');

    // Close Animation
    if (backdrop) backdrop.classList.add('opacity-0');
    if (card) {
        card.classList.remove('scale-100', 'opacity-100');
        card.classList.add('scale-95', 'opacity-0');
    }

    // Restore Scroll
    document.body.style.overflow = '';

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 200);
}

// Custom Material Easing Scroll Function
function smoothScrollTo(targetPosition, duration) {
    const startPosition = window.pageYOffset;
    const distance = targetPosition - startPosition;
    let startTime = null;

    // Pre-start: Trick the animation into thinking it's already 20ms in
    // This ensures the first frame has non-zero movement (~2-3% progress)
    // solving the "first frame is static" issue.
    const PRE_START_MS = 20;

    function animation(currentTime) {
        if (startTime === null) startTime = currentTime - PRE_START_MS;
        const timeElapsed = currentTime - startTime;

        // EaseOutSine (iOS-style, gentlest deceleration)
        // sin(t * π / 2)
        const ease = (t) => {
            return Math.sin(t * Math.PI / 2);
        };

        // Ensure we don't overshoots
        const run = ease(Math.min(timeElapsed / duration, 1));

        window.scrollTo(0, startPosition + (distance * run));

        if (timeElapsed < duration) {
            requestAnimationFrame(animation);
        }
    }

    // Start immediately (Synchronous)
    animation(performance.now());
}

function updateUIForTab(tabId) {
    const alpha = document.getElementById('alphabetWrapper');
    const map = document.getElementById('bodyMapContainer');
    const list = document.getElementById('contentList');
    const empty = document.getElementById('emptyState');
    const searchInputs = document.querySelectorAll('.search-input');

    alpha.classList.add('hidden');
    map.classList.add('hidden');
    list.classList.remove('hidden'); // Ensure list is visible by default for standard tabs and Apostila
    if (empty) empty.classList.add('hidden'); // Default hide empty

    if (tabId === 'pontos_focais') {
        alpha.classList.remove('hidden');
        renderAlphabet();
    }

    const inputCountEl = document.getElementById('inputResultCount');

    // Reset visibility first
    if (inputCountEl) {
        inputCountEl.classList.remove('hidden');
        inputCountEl.style.display = ''; // Reset inline style
    }
    // Reset Mobile Count Visibility
    document.querySelectorAll('.search-count').forEach(el => {
        el.style.display = '';
    });

    if (tabId !== 'mapa') {
        if (typeof hideConditionSelector === 'function') hideConditionSelector();
    }

    if (tabId === 'mapa') {
        if (typeof showConditionSelector === 'function') showConditionSelector();
        searchInputs.forEach(input => input.classList.add('input-faded'));

        // Hide Search Wrappers to remove gap
        const mobileSearch = document.getElementById('mobileSearchWrapper');
        const desktopSearch = document.getElementById('desktopSearchWrapper');
        if (mobileSearch) mobileSearch.classList.add('hidden');
        if (desktopSearch) desktopSearch.classList.add('invisible'); // Use invisible for desktop to maintain header height if needed, or hidden? 
        // Actually, for desktop, the search is in the header grid. Hiding it might shift the title?
        // Let's check the HTML structure. #desktopSearchWrapper is col-span-7. 
        // If we hide it, the grid space remains but empty? Or content shifts?
        // User asked to "remove the gaps". On mobile it's a vertical stack block.
        // On desktop, it's a grid cell.
        // Let's try 'hidden' for mobile wrapper (vertical gap).
        // For desktop, maybe 'visibility: hidden' is safer to keep layout stable, or if user wants that gap gone too?
        // User specifically mentioned "search bar we hide on the 'Maps'" -> referring to previous behavior.
        // If I hide the mobile one, that definitely fixes the mobile/tablet vertical gap.
        if (desktopSearch) desktopSearch.classList.add('opacity-0', 'pointer-events-none'); // Keep layout, hide visual

        map.classList.remove('hidden');

        // Hide card counter specifically on mapa tab
        if (inputCountEl) {
            inputCountEl.classList.add('hidden');
            inputCountEl.style.display = 'none'; // Force hide override
        }
        // Hide Mobile Count specifically on mapa tab
        document.querySelectorAll('.search-count').forEach(el => {
            el.style.display = 'none';
        });

        // Intelligent Visibility: Only hide list if NO point is selected
        // We check both legacy STATE.bodyFilter and new STATE.selectedBodyPoint
        const hasSelection = STATE.bodyFilter || (STATE.selectedBodyPoint && STATE.selectedBodyPoint.length > 0);

        if (hasSelection) {
            list.classList.remove('hidden');
        } else {
            list.classList.add('hidden');
        }

        renderBodyMapViews(); // Ensure this helper exists or inline logic

        // Auto-scroll to filter button on mobile only (not tablets)
        if (window.innerWidth < 768) {
            setTimeout(() => {
                const filterBtn = document.querySelector('[onclick*="toggleMobileBodyFilter"]');
                if (filterBtn) {
                    const header = document.querySelector('header');
                    const headerHeight = header ? header.offsetHeight : 80;
                    const elementPosition = filterBtn.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerHeight - 10;
                    smoothScrollTo(offsetPosition, 800);
                }
            }, 100); // Small delay for render
        }
    } else if (tabId === 'apostila') {
        searchInputs.forEach(input => input.classList.add('input-faded')); // Hide search for Apostila

        // Hide Tag Browser / Add All buttons in Apostila to avoid confusion
        const tagBrowser = document.getElementById('tagBrowserWrapper');
        if (tagBrowser) tagBrowser.style.display = 'none';

        // Remove Grid Layout for Apostila (It handles its own layout)
        list.className = ''; // Reset classes (removes grid/cols/gap)

        if (typeof renderApostilaView === 'function') {
            renderApostilaView();
        }
    } else {
        searchInputs.forEach(input => input.classList.remove('input-faded'));

        // Restore Search Wrappers
        const mobileSearch = document.getElementById('mobileSearchWrapper');
        const desktopSearch = document.getElementById('desktopSearchWrapper');
        // Note: mobileWrapper has 'md:hidden' by default in HTML. We just remove the explicit 'hidden' we added.
        if (mobileSearch) mobileSearch.classList.remove('hidden');
        if (desktopSearch) {
            desktopSearch.classList.remove('opacity-0', 'pointer-events-none', 'invisible');
        }

        // Reset body overflow when leaving mapa tab
        document.body.style.overflow = '';

        // Show Tag Browser for normal tabs
        const tagBrowser = document.getElementById('tagBrowserWrapper');
        if (tagBrowser) tagBrowser.style.display = 'block';

        // Restore Standard Grid Layout (Max 2 Columns for Nordic Layout)
        list.className = 'grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-x-20 md:gap-y-16 pt-12';

        // Standard list view is handled by applyFilters() which is called in setTab
    }
}

/* Observer removed as we are back to tab switching */
function updateTabStyle(activeId) {
    // Legacy function, can be removed or kept empty if other things call it
}

function renderPoints(points, prefix) {
    return points.map(p => {
        const isSelected = STATE.bodyFilter === p.id;
        const activeClass = isSelected ? 'bg-johrei-murasaki text-white scale-125 z-10 shadow-lg ring-2 ring-white dark:ring-black' : 'bg-white dark:bg-black border border-gray-200 dark:border-gray-800 hover:scale-110';

        return `
        < button onclick = "toggleBodyPoint('${p.id}')"
    class="absolute w-3 h-3 rounded-full shadow-sm transition-all duration-300 flex items-center justify-center group ${activeClass}"
    style = "left: ${p.x - 1.5}px; top: ${p.y - 1.5}px;"
    title = "${p.name}" >
        <span class="sr-only">${p.name}</span>
        </button >
        `;
    }).join('');
}

function renderActiveFilters() {
    const container = document.getElementById('activeFiltersWrapper');
    if (!container) return;

    // HIDE filters if in Apostila view (User request)
    if (STATE.activeTab === 'apostila') {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    } else {
        container.classList.remove('hidden');
    }

    let items = [];

    // Categories
    if (STATE.activeCategories) {
        STATE.activeCategories.forEach(catId => {
            const label = CONFIG.modes[STATE.mode].cats[catId]?.label || catId;
            items.push({ text: label, onclick: `toggleFilter('category', '${catId}')` });
        });
    }

    // Sources
    if (STATE.activeSources) {
        STATE.activeSources.forEach(src => {
            items.push({
                text: src,
                onclick: `toggleFilter('source', '${src.replace(/'/g, "\\'")}')`
            });
        });
    }

    // Tags
    if (STATE.activeTags) {
        STATE.activeTags.forEach(tag => {
            items.push({ text: '#' + tag, onclick: `filterByTag('${tag.replace(/'/g, "\\'")}')` });
        });
    }

    // Focus Points (New)
    if (STATE.activeFocusPoints) {
        STATE.activeFocusPoints.forEach(fp => {
            items.push({ text: 'Ponto: ' + fp, onclick: `filterByFocusPoint('${fp.replace(/'/g, "\\'")}')` });
        });
    }

    // Subject (Assunto)
    if (STATE.activeSubject) {
        items.push({
            text: 'Assunto: ' + STATE.activeSubject,
            onclick: `setSubjectFilter(null)`
        });
    }

    // Body Filter
    if (STATE.bodyFilter) {
        // Find body point name if possible
        const point = BODY_DATA && BODY_DATA.points ?
            (BODY_DATA.points.front.find(p => p.id === STATE.bodyFilter) ||
                BODY_DATA.points.back.find(p => p.id === STATE.bodyFilter) ||
                BODY_DATA.points.detail.find(p => p.id === STATE.bodyFilter))
            : null;

        const label = point ? point.name : STATE.bodyFilter;
        items.push({ text: 'Região: ' + label, onclick: `toggleBodyPoint('${STATE.bodyFilter}')` });
    }

    if (items.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    // Generate Chips HTML
    const chipsHtml = items.map(item => `
        <button onclick="${item.onclick}" class="group flex items-center gap-2 px-5 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 hover:border-red-400 hover:text-red-500 transition-colors shadow-sm active:scale-95">
            <span>${item.text}</span>
            <svg class="w-3 h-3 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
    `).join('');

    // Prepend Label
    container.innerHTML = `
        <span class="text-[10px] font-bold uppercase tracking-widest text-gray-300 self-center mr-2">Filtros:</span>
        ${chipsHtml}
    `;
}

function updateSearchPlaceholder() {
    const inputs = document.querySelectorAll('.search-input');
    const placeholder = STATE.mode === 'ensinamentos'
        ? 'Click for search (Ensinamentos)'
        : 'Click for search (Guias)';

    inputs.forEach(input => {
        input.placeholder = placeholder;
    });
}

function renderAlphabet() {
    const container = document.getElementById('alphabetContainer');
    const currentData = STATE.data[STATE.activeTab] || [];

    // For Perguntas e Orientações tab, show body parts instead of alphabet
    if (STATE.activeTab === 'qa') {
        // Extract all categories from current data
        const allCategories = new Set();
        currentData.forEach(item => {
            if (item.category_pt) {
                allCategories.add(item.category_pt);
            }
        });

        // Sort alphabetically
        const bodyParts = Array.from(allCategories).sort();

        // Clear container and add "All" button
        container.innerHTML = `<button onclick="filterByCategory('')" class="flex-none px-4 h-10 flex items-center justify-center text-xs font-bold border border-gray-200 dark:border-gray-800 rounded-full transition-all whitespace-nowrap ${STATE.activeCategory === '' ? 'btn-swiss-active' : 'bg-white dark:bg-black'}" id="btn-category-all">Todos</button>`;

        // Add body part buttons (cleaned without numbers)
        bodyParts.forEach(cat => {
            const cleanCat = typeof cleanTitle === 'function' ? cleanTitle(cat) : cat;
            const active = STATE.activeCategory === cat ? 'btn-swiss-active' : 'bg-white dark:bg-black hover:border-black dark:hover:border-white';
            const html = `<button onclick="filterByCategory('${cat.replace(/'/g, "\\'")}')" class="flex-none px-4 h-10 flex items-center justify-center text-xs font-bold border border-gray-200 dark:border-gray-800 rounded-full transition-all whitespace-nowrap ${active}">${cleanCat}</button>`;
            container.insertAdjacentHTML('beforeend', html);
        });
    } else {
        // Standard alphabet for other tabs
        const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        const availableLetters = new Set(currentData.map(i => {
            const t = i.title_pt || i.title || '';
            if (!t) return '';

            // Normalize the ENTIRE string first to match filter logic
            // This handles cases like " A" (slug: a) or "(O) bs" (slug: o-bs)
            let clean;
            if (typeof toSlug === 'function') {
                clean = toSlug(t); // returns lowercase slug
            } else {
                clean = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
            }

            if (!clean || clean.length === 0) return '';

            // Return first character as uppercase
            return clean.charAt(0).toUpperCase();
        }));

        // Clear container
        container.innerHTML = `<button onclick="filterByLetter('')" class="flex-none w-10 h-10 flex items-center justify-center text-xs font-bold border border-gray-200 dark:border-gray-800 rounded-full transition-all ${STATE.activeLetter === '' ? 'btn-swiss-active' : 'bg-white dark:bg-black'}" id="btn-letter-all">*</button>`;

        abc.forEach(l => {
            if (availableLetters.has(l)) {
                const active = STATE.activeLetter === l ? 'btn-swiss-active' : 'bg-white dark:bg-black hover:border-black dark:hover:border-white';
                const html = `<button onclick="filterByLetter('${l}')" class="flex-none w-10 h-10 flex items-center justify-center text-xs font-bold border border-gray-200 dark:border-gray-800 rounded-full transition-all ${active}">${l}</button>`;
                container.insertAdjacentHTML('beforeend', html);
            }
        });
    }
}

function toggleSearch(type, forceState = null) {
    const wrapper = document.getElementById(`${type} SearchInputWrapper`);
    const btn = document.getElementById(`${type} SearchBtn`);
    const input = document.getElementById(`${type} SearchInput`);

    if (!wrapper) return;

    const isExpanded = wrapper.classList.contains('w-0');
    const shouldExpand = forceState !== null ? forceState : !isExpanded;

    if (shouldExpand) {
        wrapper.classList.remove('w-0');
        wrapper.classList.add('w-full');
        btn.classList.add('hidden');
        btn.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => input.focus(), 100);
    } else {
        wrapper.classList.remove('w-full');
        wrapper.classList.add('w-0');
        btn.classList.remove('opacity-0', 'pointer-events-none');
    }
}
