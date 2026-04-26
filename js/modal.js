// --- MODAL LOGIC ---
let currentModalIndex = -1;
let currentModalItem = null;
STATE.readingMode = 'filtered'; // 'filtered' or 'book'
STATE.languageView = localStorage.getItem('languageView') || 'pt'; // 'pt', 'jp', or 'compare'

// Split bilingual content
function splitContent(content) {
    if (!content) return { pt: '', jp: '' };

    // Split by the Japanese marker
    const marker = /---\s*\n\s*\*\*Original \(Japonês\):\*\*\s*\n/;
    const parts = content.split(marker);

    return {
        pt: parts[0] || '',
        jp: parts[1] || ''
    };
}

// Toggle language bar visibility


// Switch language view
window.switchLanguageView = function (mode) {
    STATE.languageView = mode;
    localStorage.setItem('languageView', mode);

    // Update button states
    document.querySelectorAll('.lang-toggle-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.lang === mode) {
            btn.classList.add('active');
        }
    });

    // Show/hide content containers
    const containers = {
        pt: document.getElementById('contentPT'),
        jp: document.getElementById('contentJP'),
        compare: document.getElementById('contentCompare')
    };

    Object.keys(containers).forEach(key => {
        if (key === mode) {
            containers[key]?.classList.remove('hidden');
        } else {
            containers[key]?.classList.add('hidden');
        }
    });

    // Apply reading settings to all visible containers
    applyReadingSettings();
}

// Apply font size and alignment to all content containers
function applyReadingSettings() {
    const size = STATE.modalFontSize || 18;
    const align = STATE.modalAlignment || 'justify';

    const allContainers = [
        document.getElementById('contentPT'),
        document.getElementById('contentJP'),
        document.getElementById('contentComparePT'),
        document.getElementById('contentCompareJP')
    ];

    allContainers.forEach(contentEl => {
        if (!contentEl) return;

        contentEl.style.fontSize = `${size}px`;
        contentEl.style.lineHeight = '1.8';
        contentEl.querySelectorAll('p, li, div').forEach(child => child.style.fontSize = 'inherit');

        if (align === 'hyphen') {
            contentEl.style.textAlign = 'justify';
            contentEl.style.hyphens = 'auto';
            contentEl.style.webkitHyphens = 'auto';
        } else {
            contentEl.style.textAlign = align;
            contentEl.style.hyphens = 'none';
            contentEl.style.webkitHyphens = 'none';
        }
    });
}

// Helper for Background Sync (Book Mode)
function syncBackgroundContext(item) {
    if (!item) return;

    let needsUpdate = false;

    // 1. Sync Tab
    if (item._cat && item._cat !== STATE.activeTab) {
        setTab(item._cat);
        // setTab already calls applyFilters, but we might need to override filters next
        needsUpdate = false; // setTab handles render
    }

    // 2. Sync Source Filter if in Book Mode
    if (item.source) {
        const currentSource = STATE.activeSources && STATE.activeSources.length > 0 ? STATE.activeSources[0] : null;
        if (currentSource !== item.source) {
            // STRICT: Clear ALL filters for clean book context
            STATE.activeTags = [];
            STATE.activeFocusPoints = [];
            STATE.bodyFilter = null;
            STATE.activeSources = [item.source];
            needsUpdate = true;
        }
    }

    if (needsUpdate) {
        applyFilters();
        renderActiveFilters();
    }
}

// Refactored to accept direct Item
function openModal(i, explicitItem = null, highlightQuery = null) {
    currentModalIndex = i;
    const item = explicitItem || STATE.list[i];
    currentModalItem = item;

    if (!item) return;

    const searchQuery = (highlightQuery || '').trim();

    // Determine Reading Mode
    // If opened via index from list -> Filtered Mode
    // If opened via explicit item (i = -1) -> Book Mode
    if (i >= 0) {
        STATE.readingMode = 'filtered';
    } else {
        STATE.readingMode = 'book';
        // Ensure background is synced when entering book mode
        syncBackgroundContext(item);
    }

    // ... (rest of function remains same)

    // Add to History IMMEDIATELY (Safety First)
    if (typeof addToHistory === 'function') {
        addToHistory(item);
    } else {
        console.warn("addToHistory function not found!");
    }

    const catConfig = CONFIG.modes[STATE.mode].cats[item._cat];

    // Updated Title Logic: Prioritize PT title, default to item.title (if exists) or item.id
    const rawTitle = item.title_pt || item.title_jp || item.title || item.id;
    const displayTitle = typeof cleanTitle === 'function' ? cleanTitle(rawTitle) : rawTitle;
    document.getElementById('modalTitle').textContent = displayTitle;

    // ... (Category logic remains same) ...

    const catEl = document.getElementById('modalCategory');
    catEl.textContent = catConfig ? catConfig.label : (item._cat || 'Geral');

    const sourceEl = document.getElementById('modalSource');
    const refEl = document.getElementById('modalRef');

    if (sourceEl) {
        // Updated Logic: Always show the Source (Volume/Book Name) here
        // Previously it was overriding with info_pt (citation)
        const sourceText = item.source || 'JOHREI: O GUIA PRÁTICO';

        // Make it clickable to filter
        // Escape single quotes for the onclick handler
        const escapedSource = sourceText.replace(/'/g, "\\'");
        sourceEl.innerHTML = `<span class="cursor-pointer hover:underline hover:opacity-70 transition-opacity" title="Filtrar por esta fonte" onclick="filterBySourceFromModal('${escapedSource}')">${sourceText}</span>`;

        // Clear refEl or set it to empty for now as sourceEl covers the book name
        if (refEl) refEl.textContent = '';
    }

    // ... (URL Update logic remains same, but using displayTitle) ... 

    // Update URL with deep link (Slug + Mode)
    if (displayTitle) {
        const newUrl = new URL(window.location);
        const slug = typeof toSlug === 'function' ? toSlug(displayTitle) : item.id;
        newUrl.searchParams.delete('id');
        newUrl.searchParams.set('item', slug);
        newUrl.searchParams.set('mode', STATE.mode);
        window.history.pushState({ path: newUrl.href }, '', newUrl.href);
    }

    // Split and render bilingual content
    let pt, jp;

    // Strict Mode: Expect explicit fields
    if (item.content_pt || item.content_jp) {
        pt = item.content_pt || "";
        jp = item.content_jp || "";
    } else {
        // Fallback for legacy items ONLY (if any remain)
        const parts = splitContent(item.content);
        pt = parts.pt;
        jp = parts.jp;
    }

    // Prepare info_pt html if it exists
    const infoHtml = item.info_pt ? `<br><br><p class="text-sm text-gray-500 italic border-t pt-2 mt-4">${item.info_pt}</p>` : '';

    // Expand query with synonyms for rich highlighting
    let effectiveQuery = searchQuery;
    if (searchQuery && typeof SearchEngine !== 'undefined' && typeof SearchEngine.getRelatedTerms === 'function') {
        const related = SearchEngine.getRelatedTerms(searchQuery);
        // Join with pipe for regex OR logic in formatBodyText
        if (related.length > 0) {
            effectiveQuery = related.join('|');
        }
    }

    // Render all three views
    document.getElementById('contentPT').innerHTML = formatEstudoBody(pt, effectiveQuery, item.focusPoints) + infoHtml;
    document.getElementById('contentJP').innerHTML = formatBodyText(jp, effectiveQuery, item.focusPoints);
    document.getElementById('contentComparePT').innerHTML = formatEstudoBody(pt, effectiveQuery, item.focusPoints) + infoHtml;
    document.getElementById('contentCompareJP').innerHTML = formatBodyText(jp, effectiveQuery, item.focusPoints);

    const fpContainer = document.getElementById('modalFocusContainer');
    const showFocusPoints = true;

    // Highlight Regex
    let highlightRegex = null;
    if (searchQuery) {
        let tokens;
        let useBoundaries = false;
        if (searchQuery.includes('|')) {
            tokens = searchQuery.split('|').filter(t => t.trim().length > 0);
            useBoundaries = true;
        } else {
            tokens = searchQuery.split(/\s+/).filter(t => t.length > 0);
        }
        const terms = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        if (terms) {
            const pattern = useBoundaries ? `\\b(${terms}) \\b` : `(${terms})`;
            highlightRegex = new RegExp(pattern, 'gi');
        }
    }

    if (showFocusPoints && item.focusPoints && item.focusPoints.length > 0) {
        fpContainer.classList.remove('hidden');
        fpContainer.className = "mb-8 p-0 md:p-6 transition-colors duration-300";

        const html = item.focusPoints.map(p => {
            const isMatch = highlightRegex && highlightRegex.test(removeAccents(p));
            const baseClass = "text-xs font-medium uppercase tracking-wide py-2 px-3 transition-colors rounded cursor-pointer";
            const colorClass = isMatch
                ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300"
                : "bg-white dark:bg-[#1a1a1a] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#222]";
            return '<div onclick="filterByFocusPoint(\'' + p + '\')" class="' + baseClass + ' ' + colorClass + '">' + p + '</div>';
        }).join('');

        const fpTitle = fpContainer.querySelector('h3');
        if (fpTitle) fpTitle.className = "text-[10px] font-sans font-bold uppercase tracking-widest mb-4 opacity-50";

        document.getElementById('modalFocusPoints').innerHTML = html;
    } else {
        fpContainer.classList.add('hidden');
    }

    const modal = document.getElementById('readModal');
    const card = document.getElementById('modalCard');
    const backdrop = document.getElementById('modalBackdrop');

    modal.classList.remove('hidden');
    void modal.offsetWidth;

    card.classList.add('open');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    _installFocusTrap();

    const scrollContainer = document.getElementById('modalScrollContainer');
    if (scrollContainer) scrollContainer.scrollTop = 0;

    // --- APPLY READING SETTINGS ---
    if (!STATE.modalFontSize) STATE.modalFontSize = parseInt(localStorage.getItem('modalFontSize')) || 18;
    if (!STATE.modalAlignment) STATE.modalAlignment = localStorage.getItem('modalAlignment') || 'justify';
    if (!STATE.modalTheme) STATE.modalTheme = localStorage.getItem('modalTheme') || 'auto';

    if (typeof setModalTheme === 'function') {
        setModalTheme(STATE.modalTheme);
    }

    // Apply language view and reading settings
    switchLanguageView(STATE.languageView);
    applyReadingSettings();

    const slider = document.getElementById('modalFontSlider');
    if (slider) slider.value = STATE.modalFontSize;
    const display = document.getElementById('modalFontSizeDisplay');
    if (display) display.textContent = STATE.modalFontSize;
    const select = document.getElementById('modalAlignSelect');
    if (select) select.value = STATE.modalAlignment;

    renderRelatedItems(item);
    initImmersiveMode();
    initSwipeGestures();
    updateSpeechRateUI();

    // Focus management: move focus into modal after animation settles
    _modalPreviousFocus = document.activeElement;
    setTimeout(() => {
        const firstFocusable = _getModalFocusables()[0];
        if (firstFocusable) firstFocusable.focus();
    }, 310);
}

// --- FOCUS TRAP ---
let _modalPreviousFocus = null;
let _modalFocusTrapHandler = null;

function _getModalFocusables() {
    const card = document.getElementById('modalCard');
    if (!card) return [];
    return Array.from(card.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => !el.closest('.hidden') && el.offsetParent !== null);
}

function _installFocusTrap() {
    _modalFocusTrapHandler = function (e) {
        if (e.key !== 'Tab') return;
        const focusables = _getModalFocusables();
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    };
    document.addEventListener('keydown', _modalFocusTrapHandler);
}

function _removeFocusTrap() {
    if (_modalFocusTrapHandler) {
        document.removeEventListener('keydown', _modalFocusTrapHandler);
        _modalFocusTrapHandler = null;
    }
}

function closeModal() {
    const modal = document.getElementById('readModal');
    const card = document.getElementById('modalCard');
    const backdrop = document.getElementById('modalBackdrop');
    const item = currentModalItem; // Capture current item before closing

    stopSpeech(true); // Stop audio if playing
    destroyImmersiveMode();
    destroySwipeGestures();


    // Restore URL
    const newUrl = new URL(window.location);
    newUrl.searchParams.delete('id');
    newUrl.searchParams.delete('item');
    newUrl.searchParams.delete('mode');
    window.history.pushState({ path: newUrl.href }, '', newUrl.href);

    card.classList.remove('open');
    backdrop.classList.remove('open');
    _removeFocusTrap();

    // Stop Immersive Timer
    destroyImmersiveMode();

    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        if (_modalPreviousFocus && typeof _modalPreviousFocus.focus === 'function') {
            _modalPreviousFocus.focus();
        }
        _modalPreviousFocus = null;
    }, 250);
}

function preloadVoices() {
    // Force browser to load voices early
    window.speechSynthesis.getVoices();
}
// Call on load
preloadVoices();

// --- IMMERSIVE READING MODE ---
let immersiveTimer = null;
let isControlsVisible = true;

function initImmersiveMode() {
    const scrollContainer = document.getElementById('modalScrollContainer');
    if (!scrollContainer) return;

    // Reset State
    showControls();

    // Listeners
    scrollContainer.addEventListener('scroll', resetImmersiveTimer);
    scrollContainer.addEventListener('scroll', updateProgressBar);
    scrollContainer.addEventListener('click', toggleImmersiveControls);
    scrollContainer.addEventListener('touchstart', resetImmersiveTimer);

    // Start Timer
    resetImmersiveTimer();
    updateProgressBar(); // Init state
}

function destroyImmersiveMode() {
    clearTimeout(immersiveTimer);
    const scrollContainer = document.getElementById('modalScrollContainer');
    if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', resetImmersiveTimer);
        scrollContainer.removeEventListener('scroll', updateProgressBar);
        scrollContainer.removeEventListener('click', toggleImmersiveControls);
        scrollContainer.removeEventListener('touchstart', resetImmersiveTimer);
    }
}


// --- SWIPE GESTURES ---
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

function initSwipeGestures() {
    const card = document.getElementById('modalCard');
    if (!card) return;

    card.addEventListener('touchstart', handleTouchStart, { passive: true });
    card.addEventListener('touchend', handleTouchEnd, { passive: true });
}

function destroySwipeGestures() {
    const card = document.getElementById('modalCard');
    if (!card) return;

    card.removeEventListener('touchstart', handleTouchStart);
    card.removeEventListener('touchend', handleTouchEnd);
}

function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}

function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipeGesture();
}

function handleSwipeGesture() {
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    const threshold = 50; // min swipe distance

    // Check if horizontal swipe is dominant
    if (Math.abs(diffX) > Math.abs(diffY)) {
        if (Math.abs(diffX) > threshold) {
            if (diffX > 0) {
                // Swiped Right -> Prev
                readPrevInSequence();
            } else {
                // Swiped Left -> Next
                readNextInSequence();
            }
        }
    }
}



function updateProgressBar() {
    const scrollContainer = document.getElementById('modalScrollContainer');
    const bar = document.getElementById('modalProgressBar');
    if (!scrollContainer || !bar) return;

    const scrollTop = scrollContainer.scrollTop;
    const scrollHeight = scrollContainer.scrollHeight;
    const clientHeight = scrollContainer.clientHeight;

    const availableScroll = scrollHeight - clientHeight;
    let percentage = 0;

    if (availableScroll > 0) {
        percentage = (scrollTop / availableScroll) * 100;
    }

    bar.style.width = `${percentage}%`;
}

function resetImmersiveTimer() {
    showControls();
    clearTimeout(immersiveTimer);
    // Hide after 3 seconds of inactivity
    immersiveTimer = setTimeout(hideControls, 3000);
}

function hideControls() {
    isControlsVisible = false;
    const footer = document.getElementById('modalFooter');

    // User Request: Hide ONLY the bottom bar (footer)
    // Header remains visible

    if (footer) {
        footer.style.opacity = '0';
        footer.style.pointerEvents = 'none';
        footer.style.transform = 'translateY(100%)';
    }
}

function showControls() {
    // Check if footer is already visible (optimization)
    const footer = document.getElementById('modalFooter');
    if (isControlsVisible && footer && footer.style.opacity === '1') return;

    isControlsVisible = true;

    if (footer) {
        footer.style.opacity = '1';
        footer.style.pointerEvents = 'auto';
        footer.style.transform = 'translateY(0)';
    }
}

function toggleImmersiveControls(e) {
    // Ignore clicks on interactive elements inside the content
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.closest('button') || e.target.closest('a')) {
        return;
    }

    if (isControlsVisible) {
        clearTimeout(immersiveTimer);
        hideControls();
    } else {
        resetImmersiveTimer();
    }
}

function navModal(dir) {
    const next = currentModalIndex + dir;
    if (next >= 0 && next < STATE.list.length) {
        const scrollContainer = document.getElementById('modalScrollContainer');
        if (scrollContainer) scrollContainer.style.opacity = '0';
        setTimeout(() => {
            openModal(next);
            if (scrollContainer) scrollContainer.style.opacity = '1';
        }, 200);
    } else if (STATE.readingMode === 'book') {
        // --- CROSS-BOOK NAVIGATION (Continuous Mode) ---
        // If we reach the end of the list in Book Mode (which is limited by source),
        // we should try to jump to the NEXT book/source.
        // NOTE: This assumes STATE.list IS currently filtered by a source.
        // If STATE.list is the FULL manual list (no filters), then we are truly at the end.

        // 1. Identify current source (if any)
        const currentSource = currentModalItem ? currentModalItem.source : null;

        if (dir > 0 && currentSource) {
            // Going Next + Has Source context
            // Identify Next Source Logic
            // We need a list of unique sources in consistent order.
            // Using globalData to derive list or hardcoded?
            // Let's use STATE.globalData to get all unique sources in order of keys (or some index)
            // Ideally we need the order from the original JSONs.

            // Heuristic: Find first item in globalData that is DIFFERENT source and after current items.
            // This is expensive. Better: if we have `STATE.activeSources` set, we know where we are.
            if (STATE.activeSources && STATE.activeSources.length > 0) {
                // We are locked to a source. Let's find the next one.
                // We need a master list of sources.
                // Let's derive it from the GLOBAL keys order in STATE.data[STATE.activeTab]
                const fullList = STATE.data[STATE.activeTab] || [];
                // Find index of current item in full list
                const globalIndex = fullList.findIndex(i => i.id === currentModalItem.id);

                if (globalIndex !== -1 && globalIndex < fullList.length - 1) {
                    // Get next item from FULL list
                    const nextGlobalItem = fullList[globalIndex + 1];

                    // If next item has a DIFFERENT source, we switch to it.
                    const nextSource = nextGlobalItem.source;
                    if (nextSource && nextSource !== currentSource) {
                        // SWITCH SOURCE CONTEXT
                        STATE.activeSources = [nextSource];
                        STATE.activeTags = []; // Clear other filters
                        STATE.bodyFilter = null;

                        // Re-apply filters to load new book
                        applyFilters();

                        // Open first item of new list
                        openModal(0);

                        // Optional: Toast "Mudando para [Fonte]"
                        const toast = document.createElement('div');
                        toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest z-[10000] animate-fade-in-out';
                        toast.textContent = `Lendo: ${nextSource}`;
                        document.body.appendChild(toast);
                        setTimeout(() => toast.remove(), 2000);
                        return; // Done
                    }
                }
            }
        }
    }
}

// Helper for Recommendation Clicks
// Helper for Recommendation Clicks
// Helper for Recommendation Clicks
window.openRelatedItem = function (id) {
    const item = STATE.globalData ? STATE.globalData[id] : null;

    if (item) {
        // 1. Sync Tab if needed
        if (item._cat && item._cat !== STATE.activeTab) {
            setTab(item._cat);
        }

        // 2. Sync Source Filter (User Request: Contextualize background list)
        // REVERT: We DO NOT lock the source filter anymore to allow "Continuous Mode" feel.
        // Instead, we just let it open.
        // However, if we don't filter, the `STATE.list` might not contain the item, causing index = -1.
        // If index = -1, arrows don't work well unless we fallback to "Cross-Book" logic.
        // BUT, for the arrows to work on *this* book, we nominally need the list to be this book.
        // The User prefers "Highlight on Close" over "Source Tag".
        // So we will SILENTLY filter (change list) but NOT add the generic activeSource tag visually?
        // No, `activeSources` drives the UI pill.
        // Let's TRY leaving `activeSources` EMPTY.
        // If empty, `STATE.list` is the full Tab list.
        // Then `index` will be the index in the FULL list.
        // IF the item is in the current Tab list (which it typically is if we synced Tab),
        // then index != -1, and arrows work perfectly across the whole Tab!
        // This effectively gives "Continuous Mode" by default.

        // OLD LOGIC REMOVED:
        /*
        if (item.source) {
            STATE.activeTags = [];
            STATE.activeFocusPoints = [];
            STATE.bodyFilter = null;
            STATE.activeSources = [item.source];

            applyFilters();
            renderActiveFilters();
        }
        */

        // Clean slate for other filters though to ensure visibility
        STATE.activeTags = [];
        STATE.activeFocusPoints = [];
        STATE.bodyFilter = null;
        STATE.activeSources = []; // Ensure we are NOT source constrained

        applyFilters();
        renderActiveFilters();


        // 3. Find index in the NEWLY filtered list
        const index = STATE.list.findIndex(i => i.id === id);

        if (index !== -1) {
            // Open with context of the new list
            openModal(index);
        } else {
            // Should be rare if we just filtered by its source, but possible if other filters block it
            openModal(-1, item);
        }
    } else {
        console.error("Related item not found:", id);
    }
}

// --- HISTORY SYSTEM ---
window.toggleHistory = function (e) {
    e.stopPropagation();
    const dropdown = document.getElementById('historyDropdown');
    const listEl = document.getElementById('historyList');

    if (dropdown.classList.contains('hidden')) {
        // Show
        renderHistoryList(listEl);
        dropdown.classList.remove('hidden');

        // Close on click outside
        const closeFn = (ev) => {
            if (!dropdown.contains(ev.target)) {
                dropdown.classList.add('hidden');
                document.removeEventListener('click', closeFn);
            }
        };
        setTimeout(() => document.addEventListener('click', closeFn), 0);
    } else {
        dropdown.classList.add('hidden');
    }
}

function renderHistoryList(container) {
    if (!STATE.readingHistory || STATE.readingHistory.length === 0) {
        container.innerHTML = '<div class="p-4 text-xs text-gray-400 text-center">Nenhum histórico recente</div>';
        return;
    }

    container.innerHTML = STATE.readingHistory.map(h => {
        // Simple time ago
        const diff = Math.floor((Date.now() - h.time) / 60000); // mins
        let timeStr = 'agora';
        if (diff > 0) timeStr = `${diff} m`;
        if (diff > 60) timeStr = `${Math.floor(diff / 60)} h`;

        return `
            <div onclick="openRelatedItem('${h.id}')" class="px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#222] cursor-pointer border-b border-gray-50 dark:border-gray-800 last:border-0 transition-colors group">
                <div class="flex justify-between items-baseline mb-1">
                    <span class="text-[9px] font-bold uppercase tracking-widest text-gray-400 group-hover:text-black dark:group-hover:text-gray-300 transition-colors">${h.cat || 'Geral'}</span>
                    <span class="text-[9px] text-gray-300">${timeStr}</span>
                </div>
                <h4 class="font-serif font-medium text-sm text-gray-700 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white line-clamp-1">${h.title}</h4>
            </div>
        `;
    }).join('');
}

// --- RECOMMENDATION SYSTEM ---
// Usa índice pré-computado em data/related_v2.json (TF-IDF + tag-IDF + sinais
// editoriais, gerado por scripts/migration/build_related.py). Cai de volta
// para heurística por sobreposição de tags se o índice estiver indisponível.
function renderRelatedItems(currentItem) {
    const container = document.getElementById('modalRelated');
    const listEl = document.getElementById('modalRelatedList');
    if (!container || !listEl) return;

    if (!currentItem) {
        container.classList.add('hidden');
        return;
    }

    let topItems = [];

    // 1. Caminho preferencial: índice pré-computado.
    if (STATE.relatedIndex && STATE.relatedIndex[currentItem.id]) {
        const MIN_SCORE = 0.05;
        const neighbors = STATE.relatedIndex[currentItem.id];
        for (const n of neighbors) {
            if (typeof n.score === 'number' && n.score < MIN_SCORE) continue;
            const item = (STATE.globalData && STATE.globalData[n.id]) || null;
            if (item) topItems.push(item);
            if (topItems.length >= 3) break;
        }
    }

    // 2. Fallback: heurística antiga por sobreposição de tags/focusPoints.
    if (topItems.length === 0) {
        const currentTags = new Set(currentItem.tags || []);
        const currentPoints = new Set(currentItem.focusPoints || []);
        const currentCat = currentItem._cat;

        let sourceList = STATE.list;
        if (STATE.globalData && Object.keys(STATE.globalData).length > 0) {
            sourceList = Object.values(STATE.globalData);
        }

        let allowedCats = new Set();
        for (const modeKey in CONFIG.modes) {
            const modeConfig = CONFIG.modes[modeKey];
            if (modeConfig.cats && modeConfig.cats[currentCat]) {
                Object.keys(modeConfig.cats).forEach(cat => allowedCats.add(cat));
                break;
            }
        }
        if (allowedCats.size === 0) allowedCats.add(currentCat);
        sourceList = sourceList.filter(item => allowedCats.has(item._cat));

        const scores = [];
        sourceList.forEach((item) => {
            if (item.id === currentItem.id) return;
            let score = 0;
            if (item.tags) item.tags.forEach(t => { if (currentTags.has(t)) score += 5; });
            if (item.focusPoints) item.focusPoints.forEach(p => { if (currentPoints.has(p)) score += 10; });
            if (item._cat === currentCat) score += 2;
            if (score > 0) scores.push({ score, item });
        });
        scores.sort((a, b) => b.score - a.score);
        topItems = scores.slice(0, 3).map(s => s.item);
    }

    if (topItems.length === 0) {
        container.classList.add('hidden');
        return;
    }

    const html = topItems.map((item) => {
        const catConfig = CONFIG.modes[STATE.mode].cats[item._cat];
        const catLabel = catConfig ? catConfig.label : (item._cat || 'Geral');

        return `
            <div onclick="openRelatedItem('${item.id}')" class="group cursor-pointer p-4 rounded-lg bg-gray-50 dark:bg-[#161616] border border-gray-100 dark:border-gray-800 hover:border-black dark:hover:border-white transition-all transform hover:-translate-y-1">
                <span class="text-[8px] font-bold uppercase tracking-widest text-gray-400 mb-2 block">${catLabel}</span>
                <h4 class="font-serif font-bold text-sm leading-tight text-gray-800 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white line-clamp-2">${typeof cleanTitle === 'function' ? cleanTitle(item.title_pt || item.title_jp || item.title || '') : (item.title_pt || item.title_jp || item.title || '')}</h4>
            </div>
        `;
    }).join('');

    listEl.innerHTML = html;
    container.classList.remove('hidden');
}

// Global helper for opening related items
window.openRelatedItem = function (id) {
    if (!STATE.list) return;

    // Check if item is in current list
    let index = STATE.list.findIndex(i => i.id === id);
    if (index >= 0) {
        openModal(index);
    } else {
        // If not in current filtered list, try global data
        if (STATE.globalData && STATE.globalData[id]) {
            openModal(-1, STATE.globalData[id]);
        }
    }
}

// --- MODAL CONTROLS ---

window.setModalFontSize = function (size) {
    size = parseInt(size);
    if (size < 12) size = 12;
    if (size > 32) size = 32;

    STATE.modalFontSize = size;
    localStorage.setItem('modalFontSize', size);

    applyReadingSettings();

    const display = document.getElementById('modalFontSizeDisplay');
    if (display) display.textContent = size;
}

window.setModalAlignment = function (align) {
    STATE.modalAlignment = align;
    localStorage.setItem('modalAlignment', align);

    applyReadingSettings();
}

window.setModalTheme = function (theme) {
    STATE.modalTheme = theme;
    localStorage.setItem('modalTheme', theme);
    const scrollContainer = document.getElementById('modalScrollContainer');
    // const content = document.getElementById('modalContent'); // REMOVED
    const title = document.getElementById('modalTitle');
    const source = document.getElementById('modalSource');
    const header = document.getElementById('modalHeader');
    const footer = document.getElementById('modalFooter');
    const card = document.getElementById('modalCard');

    if (!scrollContainer) return;

    // Reset classes first
    scrollContainer.className = 'flex-grow overflow-y-auto scroll-smooth relative transition-colors duration-300';

    // Target all content views
    const contentViews = [
        document.getElementById('contentPT'),
        document.getElementById('contentJP'),
        document.getElementById('contentComparePT'),
        document.getElementById('contentCompareJP')
    ];

    contentViews.forEach(el => {
        if (el) el.className = 'content-view rich-text leading-loose transition-colors duration-300';
    });

    // Default Variables
    let bgClass = '';
    let textClass = '';
    let titleClass = '';
    let interfaceBg = '';
    let interfaceBorder = '';
    let cardBg = '';
    let fontClass = 'font-serif';
    let backdropBg = '';
    let metaTextClass = '';

    // Highlight Variables
    let highlightBg = '#fef08a';
    let highlightText = '#000000';
    // Focus Point Variables
    let focusPointBg = '#f3f4f6';
    let focusPointText = '#1f2937';

    switch (theme) {
        case 'quiet':
            // user: bg #4A494E text #ABAAAE
            bgClass = 'bg-[#4A494E]';
            textClass = 'text-[#ABAAAE]';
            titleClass = 'text-[#d4d4d4]'; // lighter for title
            interfaceBg = 'bg-[#4A494E]/95';
            interfaceBorder = 'border-[#5A595E]';
            cardBg = '#4A494E';
            // Custom Highlight for Dark Mode (Muted Olive/Gold)
            highlightBg = '#635F40';
            highlightText = '#E0E0E0';
            // Custom Focus for Quiet
            focusPointBg = '#5c5c61';
            focusPointText = '#ffffff';
            backdropBg = 'bg-black/80';
            metaTextClass = 'text-[#7a7a80]';
            break;
        case 'paper':
            // user: bg #EDEDED text #1D1D1D
            bgClass = 'bg-[#EDEDED]';
            textClass = 'text-[#1D1D1D]';
            titleClass = 'text-[#000000]';
            interfaceBg = 'bg-[#EDEDED]/95';
            interfaceBorder = 'border-[#DEDEDE]';
            cardBg = '#EDEDED';
            highlightBg = '#E3DEB3'; // Muted Paper Yellow
            highlightText = '#1D1D1D';
            // Custom Focus for Paper
            focusPointBg = '#d6d3c9';
            focusPointText = '#1D1D1D';
            backdropBg = 'bg-black/80';
            metaTextClass = 'text-[#757575]';
            break;
        case 'calm':
            // user: bg #EEE2CC text #362D25
            bgClass = 'bg-[#EEE2CC]';
            textClass = 'text-[#362D25]';
            titleClass = 'text-[#2b241e]';
            interfaceBg = 'bg-[#EEE2CC]/95';
            interfaceBorder = 'border-[#E0D4BE]';
            cardBg = '#EEE2CC';
            highlightBg = '#E6CEA8'; // Warm Sepia Highlight
            highlightText = '#362D25';
            // Custom Focus for Calm
            focusPointBg = '#dbc8a4';
            focusPointText = '#2b241e';
            backdropBg = 'bg-black/80';
            metaTextClass = 'text-[#8c7b68]';
            break;
        case 'focus':
            // user: bg #FFFCF5 text #141205
            bgClass = 'bg-[#FFFCF5]';
            textClass = 'text-[#141205]';
            titleClass = 'text-[#000000]';
            interfaceBg = 'bg-[#FFFCF5]/95';
            interfaceBorder = 'border-[#EBE5D5]';
            cardBg = '#FFFCF5';
            highlightBg = '#fff59d'; // Light Yellow
            highlightText = '#000000';
            // Custom Focus for Focus Theme
            focusPointBg = '#e8e8e8'; // Very subtle gray
            focusPointText = '#000000';
            backdropBg = 'bg-black/80';
            metaTextClass = 'text-[#8f8b80]';
            break;
        case 'bold':
            // Semibold logic
            bgClass = 'bg-white';
            textClass = 'text-black font-semibold'; // Apply semibold here
            titleClass = 'text-black font-bold';
            interfaceBg = 'bg-white/95';
            interfaceBorder = 'border-gray-200';
            cardBg = '#ffffff';
            // Custom font weight handling might be needed if classes clash, but 'font-semibold' should work.
            highlightBg = '#fef08a';
            highlightText = '#000000';
            // Custom Focus for Bold (Standard)
            focusPointBg = '#f3f4f6';
            focusPointText = '#1f2937';
            backdropBg = 'bg-white/95';
            metaTextClass = 'text-gray-500';
            break;
        case 'original':
        default: // White (Standard)
            bgClass = 'bg-white';
            textClass = 'text-gray-900';
            titleClass = 'text-black';
            interfaceBg = 'bg-white/95';
            interfaceBorder = 'border-gray-100';
            cardBg = '#ffffff';
            highlightBg = '#fef08a';
            highlightText = '#000000';
            // Custom Focus for Original (Standard)
            focusPointBg = '#f3f4f6';
            focusPointText = '#1f2937';
            backdropBg = 'bg-white/95 dark:bg-black/95';
            metaTextClass = 'text-gray-400';
            break;
    }

    // Apply Styles
    scrollContainer.classList.add(...bgClass.split(' '));

    contentViews.forEach(el => {
        if (el) el.classList.add(...textClass.split(' '), fontClass);
    });

    // Apply Backdrop
    const backdrop = document.getElementById('modalBackdrop');
    if (backdrop) {
        // Reset base classes (keep core transition/position/blur)
        // Note: backdrop has defaults in HTML: "absolute inset-0 bg-white/95 dark:bg-black/95 backdrop-blur-md opacity-0 transition-opacity duration-300"
        // We override the color part.
        backdrop.className = `absolute inset-0 backdrop-blur-md opacity-0 transition-opacity duration-300 ${backdropBg} open`;
        // Re-add 'open' if it was open (logic in openModal puts 'open' class for opacity)
        // Wait, 'open' class controls opacity in CSS or logic? 
        // In openModal: backdrop.classList.add('open');
        // Let's check CSS/Logic. Usually 'open' adds opacity-100.
        // Yes line 190: backdrop.classList.add('open');
        // So we must preserve 'open' if it's currently open.
        // However, this function is called ON open, and on switch.
        // If we reset className, we lose 'open'.
        // Better approach: remove all bg- classes and add new one.

        // Simpler: Just set style directly or use cleaner class manipulation
        // But Tailwind classes are dynamic.
        // Let's just set ClassName string and re-add 'open' if it was there?
        // OR: `backdrop.className` replacement is risky if we don't know "open" state.

        // SAFER:
        backdrop.classList.remove('bg-white/95', 'dark:bg-black/95', 'bg-[#4A494E]', 'bg-[#EDEDED]', 'bg-[#EEE2CC]', 'bg-[#FFFCF5]', 'bg-white', 'bg-black/90', 'bg-black/95', 'bg-black/80');
        // Add new one
        const bgParts = backdropBg.split(' ');
        backdrop.classList.add(...bgParts);
    }

    // Apply Meta Colors (Source, Related, etc)
    const sourceLabel = document.getElementById('modalSourceLabel');
    const refLabel = document.getElementById('modalRef');
    const relatedLabel = document.getElementById('modalRelatedLabel');
    const categoryLabel = document.getElementById('modalCategory'); // Breadcrumb is also meta

    const metaElements = [sourceLabel, refLabel, relatedLabel, categoryLabel];
    metaElements.forEach(el => {
        if (el) {
            // Remove previous hardcoded gray classes to avoid conflict
            el.classList.remove('text-gray-300', 'text-gray-400', 'text-[#7a7a80]', 'text-[#757575]', 'text-[#8c7b68]', 'text-[#8f8b80]', 'text-gray-500');
            el.classList.add(metaTextClass.replace('text-', '')); // Logic check: metaTextClass is full class like 'text-[#...]'
            // Simpler: just add the class string.
            // But if it's 'text-[#...]', classList.add fails if not standard? No, Tailwind arbitrary values work as class names.
            // However, removing dynamic colors is hard if we don't track them.
            // For now, I listed specific removals. 
            // Better: el.className = ... but that wipes alignment/font classes.
            el.className = el.className.replace(/text-\[#.*?\]/g, '').replace(/text-gray-\d+/g, '').trim();
            el.classList.add(metaTextClass.split(' ')[0]); // Assuming single class in variable
        }
    });

    // Apply Highlight Variables
    // Apply Highlight Variables
    contentViews.forEach(el => {
        if (!el) return;
        el.style.setProperty('--highlight-bg', highlightBg);
        el.style.setProperty('--highlight-text', highlightText);
        el.style.setProperty('--focus-point-bg', focusPointBg);
        el.style.setProperty('--focus-point-text', focusPointText);

        // Force color inheritance
        el.querySelectorAll('p, li, div, h1, h2, h3, h4, h5, h6, strong, span, em').forEach(child => {
            child.style.color = 'inherit';
        });
    });

    if (card) card.style.backgroundColor = cardBg;

    if (title) {
        title.className = `text-3xl md:text-4xl ${fontClass} font-medium mb-8 md:mb-12 leading-[1.2] text-center transition-colors duration-300 ${titleClass}`;
    }

    // Update Category Color matches Theme
    const catEl = document.getElementById('modalCategory');
    if (catEl) {
        let catColor = '';
        switch (theme) {
            case 'quiet': catColor = 'text-[#ABAAAE]'; break;
            case 'paper': catColor = 'text-[#555]'; break; // Dark gray
            case 'calm': catColor = 'text-[#8c7b6c]'; break; // Muted brown
            case 'focus': catColor = 'text-[#666]'; break;
            case 'bold': catColor = 'text-black'; break;
            case 'original': default: catColor = 'text-gray-500'; break;
        }
        // Reset base classes and add theme color
        catEl.className = `text-[10px] font-sans font-bold uppercase tracking-widest block mb-2 ${catColor}`;
    }

    if (source) {
        source.className = `text-xs font-sans font-bold uppercase tracking-widest text-center transition-colors duration-300 ${titleClass}`;
        source.style.opacity = theme === 'quiet' ? '0.6' : '1';
    }

    // Apply to Header & Footer
    if (header) {
        header.className = `flex-none px-6 py-4 border-b flex justify-between items-center backdrop-blur-md z-20 relative transition-all duration-500 ease-in-out ${interfaceBg} ${interfaceBorder}`;
    }
    if (footer) {
        // Absolute positioning so content fills full height behind it
        footer.className = `absolute bottom-0 w-full p-3 md:p-6 border-t z-20 transition-all duration-500 ease-in-out ${interfaceBg} ${interfaceBorder}`;
    }

    // Apply Scroll Container Padding to prevent content being hidden behind absolute footer
    if (scrollContainer) {
        // Ensure enough padding at bottom for the footer
        scrollContainer.classList.add('pb-24', 'md:pb-32');
    }

    // Update Navigation Buttons (Arrows) Colors
    const btnPrev = document.getElementById('btnReadPrev');
    const btnNext = document.getElementById('btnReadNext');

    // Define button styles based on theme
    let arrowBg = '';
    let arrowText = '';
    let iconColor = '';

    switch (theme) {
        case 'quiet':
            arrowBg = 'bg-[#5A595E] hover:bg-[#6A696E]';
            arrowText = 'text-[#E0E0E0]';
            iconColor = 'text-[#ABAAAE] hover:text-[#E0E0E0]';
            break;
        case 'paper':
            arrowBg = 'bg-white hover:bg-gray-100 border border-[#DEDEDE]';
            arrowText = 'text-[#1D1D1D]';
            iconColor = 'text-gray-400 hover:text-black';
            break;
        case 'calm':
            arrowBg = 'bg-[#E0D4BE] hover:bg-[#D4C4A8]';
            arrowText = 'text-[#2b241e]';
            iconColor = 'text-[#8c7b6c] hover:text-[#2b241e]';
            break;
        case 'focus':
            arrowBg = 'bg-[#EBE5D5] hover:bg-[#DCD0B0]';
            arrowText = 'text-[#141205]';
            iconColor = 'text-[#999] hover:text-black';
            break;
        case 'bold':
            arrowBg = 'bg-gray-100 dark:bg-[#1a1a1a] hover:bg-gray-200 dark:hover:bg-[#252525] border border-gray-200';
            arrowText = 'text-black dark:text-gray-100';
            iconColor = 'text-gray-400 hover:text-black dark:hover:text-white';
            break;
        case 'original':
        default:
            arrowBg = 'bg-gray-100 dark:bg-[#1a1a1a] hover:bg-gray-200 dark:hover:bg-[#252525]';
            arrowText = 'text-gray-900 dark:text-gray-100';
            iconColor = 'text-gray-400 hover:text-black dark:hover:text-white';
            break;
    }

    const arrowBaseClass = "py-2 md:py-4 rounded-lg text-lg font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 flex-1";

    if (btnPrev) {
        btnPrev.className = `${arrowBaseClass} ${arrowBg} ${arrowText}`;
    }
    if (btnNext) {
        btnNext.className = `${arrowBaseClass} ${arrowBg} ${arrowText}`;
    }

    // Update Header Icons
    const headerBtns = [
        'btnHeaderAppearance', 'btnHeaderCopyText', 'btnHeaderCopyLink', 'btnHeaderHistory', 'btnHeaderClose'
    ];
    headerBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            const isHidden = btn.classList.contains('hidden');
            const base = "w-10 h-10 flex items-center justify-center rounded-full transition-colors focus:outline-none";
            // Hover bg depends on theme too? Standardizing hover bg to be subtle
            const hoverBg = theme === 'quiet' ? 'hover:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10';
            btn.className = `${base} ${iconColor} ${hoverBg} ${isHidden ? 'hidden' : ''}`;
        }
    });

    // Update Footer Close Button
    const btnFooterClose = document.getElementById('btnFooterClose');
    if (btnFooterClose) {
        const baseFooterClose = "py-2 md:py-4 rounded-lg text-lg font-bold uppercase tracking-widest transition-colors";
        // e.g. "hover:bg-red-50" might clash, so let's simplify to standard theme toggle
        const hoverBg = theme === 'quiet' ? 'hover:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10';
        btnFooterClose.className = `${baseFooterClose} ${iconColor} ${hoverBg}`;
    }

    // Update Focus Points Section (Container & Buttons)
    const fpContainer = document.getElementById('modalFocusContainer');
    if (fpContainer) {
        const fpTitle = fpContainer.querySelector('h3');
        const fpButtons = fpContainer.querySelectorAll('button');

        // Define Theme Styles
        let fpBg = '', fpTitleColor = '', fpBtnNormal = '';

        switch (theme) {
            case 'quiet':
                fpBg = 'bg-[#535257] border-l-4 border-[#888]';
                fpTitleColor = 'text-[#E0E0E0] opacity-90';
                fpBtnNormal = 'border-[#999] text-[#E0E0E0] hover:bg-white/10 hover:border-white';
                break;
            case 'paper':
                fpBg = 'bg-[#F9F9F9] border-l-4 border-[#DEDEDE]';
                fpTitleColor = 'text-[#555]';
                fpBtnNormal = 'border-[#ccc] text-[#333] hover:bg-black/5 hover:border-[#999]';
                break;
            case 'calm':
                fpBg = 'bg-[#E6CEA8]/20 border-l-4 border-[#C5B595]';
                fpTitleColor = 'text-[#5C4D3D]';
                fpBtnNormal = 'border-[#C5B595] text-[#362D25] hover:bg-[#362D25]/5 hover:border-[#8C7B6C]';
                break;
            case 'focus':
                fpBg = 'bg-[#FFF9C4]/20 border-l-4 border-[#EBE5D5]';
                fpTitleColor = 'text-[#5D4037] opacity-80';
                fpBtnNormal = 'border-[#D7CCC8] text-[#5D4037] hover:bg-black/5 hover:border-[#A1887F]';
                break;
            case 'bold':
                fpBg = 'bg-gray-50 border-l-4 border-black';
                fpTitleColor = 'text-black font-bold';
                fpBtnNormal = 'border-black text-black hover:bg-black hover:text-white';
                break;
            default: // original
                fpBg = 'bg-gray-50 dark:bg-[#1C1C1E] border-l-4 border-gray-200 dark:border-gray-700';
                fpTitleColor = 'text-gray-400';
                fpBtnNormal = 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:text-black dark:hover:text-white hover:border-gray-400';
                break;
        }

        // Apply Container Styles
        // Note: we preserve layout classes but update colors
        const isHidden = fpContainer.classList.contains('hidden');
        const fpBase = "mb-8 p-6 rounded-r-xl transition-colors duration-300";
        fpContainer.className = `${fpBase} ${fpBg} ${isHidden ? 'hidden' : ''}`;

        if (fpTitle) fpTitle.className = `text-[10px] font-sans font-bold uppercase tracking-widest mb-4 ${fpTitleColor}`;

        // Update Buttons
        fpButtons.forEach(btn => {
            if (btn.classList.contains('border-yellow-500')) {
                // Keep match (highlighted) logic, but maybe tune text color for dark themes
                if (theme === 'quiet' || theme === 'original') { // Darkish contexts
                    // Ensure yellow text pops
                    btn.classList.remove('text-yellow-700');
                    btn.classList.add('text-yellow-600', 'dark:text-yellow-300');
                }
            } else {
                const btnBase = "text-[10px] font-bold uppercase tracking-widest border transition-colors rounded-full px-3 py-1 bg-transparent";
                btn.className = `${btnBase} ${fpBtnNormal}`;
            }
        });
    }

    // Update active state in menu (Visual feedback)
    // We can't easily access the buttons here without IDs or complex selectors, 
    // but the logic works.
}

window.toggleAppearanceMenu = function (e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('appearanceMenu');
    menu.classList.toggle('hidden');

    // Close on outside click
    if (!menu.classList.contains('hidden')) {
        const closeFn = (ev) => {
            if (!menu.contains(ev.target) && !ev.target.closest('[onclick="toggleAppearanceMenu(event)"]')) {
                menu.classList.add('hidden');
                document.removeEventListener('click', closeFn);
            }
        };
        setTimeout(() => document.addEventListener('click', closeFn), 0);
    }
}

window.copyDeepLink = function () {
    // Ensure URL is up to date (should be already from openModal)
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        showToast("Link Copiado!");
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showToast("Erro ao copiar");
    });
}

window.copyCardContent = function () {
    if (!currentModalItem) return;

    // Create plain text representation
    // Strip HTML tags for content
    const tmp = document.createElement("DIV");
    tmp.innerHTML = currentModalItem.content;
    const cleanContent = tmp.textContent || tmp.innerText || "";

    const ref = currentModalItem.ref ? ` - ${currentModalItem.ref}` : '';
    const text = `${currentModalItem.title}\n\n${cleanContent}\n\n> Fonte: ${currentModalItem.source || 'Johrei: Guia Prático'}${ref}`;

    navigator.clipboard.writeText(text).then(() => {
        showToast("Texto Copiado!");
    }).catch(err => {
        console.error('Failed to copy', err);
        showToast("Erro ao copiar");
        showToast("Erro ao copiar");
    });
}

// --- TEXT TO SPEECH (Audio) ---
// --- TEXT TO SPEECH (Audio) ---
let currentUtterance = null;
let currentSpeechRate = parseFloat(localStorage.getItem('johrei_speech_rate')) || 0.9;
const availableRates = [0.6, 0.8, 0.9, 1.0, 1.2, 1.5, 2.0, 2.5];
let speechBlocks = [];
let currentSpeechIndex = 0;

window.toggleSpeechRate = function () {
    // Find next rate
    let idx = availableRates.indexOf(currentSpeechRate);
    idx = (idx + 1) % availableRates.length;
    currentSpeechRate = availableRates[idx];

    // Save
    localStorage.setItem('johrei_speech_rate', currentSpeechRate);

    // Update UI
    updateSpeechRateUI();

    // If speaking, restart with new rate
    if (window.speechSynthesis.speaking) {
        stopSpeech(false); // Pause (don't reset index)
        setTimeout(speakNextBlock, 200); // Resume (Increased delay to prevent silence glitch)
    }
}

function updateSpeechRateUI() {
    const btn = document.getElementById('btnHeaderSpeechRate');
    if (btn) {
        btn.textContent = `${currentSpeechRate}x`;
    }
}

window.toggleSpeech = async function () {
    const btn = document.getElementById('btnHeaderSpeech');

    if (window.speechSynthesis.speaking) {
        stopSpeech(true);
        return;
    }

    if (!currentModalItem) return;

    // Ensure voices are loaded (prevents robotic start)
    if (window.speechSynthesis.getVoices().length === 0) {
        // Show loading state on button?
        await waitForVoices();
    }

    // Get Text Blocks (Karaoke Mode)
    // Get available container based on mode
    let contentContainer = document.getElementById('contentPT');
    if (STATE.languageView === 'compare') {
        contentContainer = document.getElementById('contentComparePT');
    }

    // Fallback if PT is empty but maybe we are in another mode? 
    // For now TTS is PT-only.

    if (!contentContainer) return;

    // Prepare content for granular highlighting (Sentence Level)
    prepareContentForKaraoke(contentContainer);

    // Select readable blocks (Sentences and Headings)
    speechBlocks = Array.from(contentContainer.querySelectorAll('.reading-segment, h1, h2, h3, h4, h5, h6, blockquote'));

    // Filter empty blocks
    speechBlocks = speechBlocks.filter(el => el.innerText.trim().length > 0);

    if (speechBlocks.length === 0) {
        // Fallback to title if no blocks found
        const title = currentModalItem.title;
        const msg = new SpeechSynthesisUtterance(title);
        msg.lang = 'pt-BR';
        window.speechSynthesis.speak(msg);
        return;
    }

    // Add Title as first block (virtual or actual element)
    // Actually, title is typically in #modalTitle, separate from content.
    // Let's just read content for highlighting simplicity, or we'd need to select #modalTitle too.
    const titleEl = document.getElementById('modalTitle');
    if (titleEl) speechBlocks.unshift(titleEl);

    currentSpeechIndex = 0;

    // Pause immersive hide-timer while TTS is playing
    clearTimeout(immersiveTimer);
    showControls();

    // Update Icon to Stop
    if (btn) {
        btn.innerHTML = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"></path></svg>`;
        btn.classList.add('text-black', 'dark:text-white', 'animate-pulse');
        btn.classList.remove('text-gray-400');
    }

    setSpeedButtonVisibility(true); // Show Speed Button
    speakNextBlock();
}

function speakNextBlock() {
    if (currentSpeechIndex >= speechBlocks.length) {
        stopSpeech(); // Finished
        return;
    }

    const el = speechBlocks[currentSpeechIndex];
    if (!el) {
        currentSpeechIndex++;
        speakNextBlock();
        return;
    }

    // Prepare Text
    const text = el.innerText || el.textContent;
    const utterance = new SpeechSynthesisUtterance(text);

    // Voice Config
    const bestVoice = getBestVoice();
    if (bestVoice) {
        utterance.voice = bestVoice;
    }
    utterance.lang = 'pt-BR';
    utterance.rate = currentSpeechRate;

    // Events
    utterance.onstart = function () {
        // Highlight
        el.classList.add('highlight-speaking');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    utterance.onend = function () {
        // Remove Highlight
        el.classList.remove('highlight-speaking');
        currentSpeechIndex++;
        speakNextBlock(); // Next
    };

    utterance.onerror = function (e) {
        if (e.error === 'interrupted' || e.error === 'canceled') {
            // Expected when changing speed or clicking items. Do nothing.
            return;
        }
        console.error('Speech error', e);
        el.classList.remove('highlight-speaking');
        stopSpeech();
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
}

function stopSpeech(reset = true) {
    window.speechSynthesis.cancel();
    // Resume immersive timer now that TTS has stopped
    if (reset) resetImmersiveTimer();

    // Clear Highlights
    if (speechBlocks) {
        speechBlocks.forEach(el => el.classList.remove('highlight-speaking'));
    }

    if (reset) {
        speechBlocks = [];
        currentSpeechIndex = 0;
        resetSpeechIcon();
        setSpeedButtonVisibility(false); // Hide Speed Button
    }
}

function setSpeedButtonVisibility(visible) {
    const btn = document.getElementById('btnHeaderSpeechRate');
    if (!btn) return;

    if (visible) {
        // Expand
        btn.classList.remove('w-0', 'opacity-0', 'ml-0', 'scale-90');
        btn.classList.add('w-10', 'opacity-100', 'ml-2', 'scale-100');
    } else {
        // Collapse
        btn.classList.remove('w-10', 'opacity-100', 'ml-2', 'scale-100');
        btn.classList.add('w-0', 'opacity-0', 'ml-0', 'scale-90');
    }
}

function waitForVoices() {
    return new Promise((resolve) => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            resolve(voices);
            return;
        }
        window.speechSynthesis.onvoiceschanged = () => {
            resolve(window.speechSynthesis.getVoices());
        };
        // Timeout fallback
        setTimeout(() => resolve([]), 2000);
    });
}

// Removed duplicate definition to avoid conflict

function resetSpeechIcon() {
    const btn = document.getElementById('btnHeaderSpeech');
    if (btn) {
        // Speaker Icon
        btn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>`;
        btn.classList.remove('text-black', 'dark:text-white', 'animate-pulse');
        btn.classList.add('text-gray-400');
    }
    currentUtterance = null;
}

function getBestVoice() {
    const voices = window.speechSynthesis.getVoices();
    const isPt = v => v.lang.toLowerCase().startsWith('pt');

    // 1. Preferred natural/neural voices — must be a PT lang
    const preferences = ['Francisca', 'Helia', 'Luciana', 'Google Português do Brasil', 'Vitória', 'Maria', 'Daniel', 'Joana'];
    for (const name of preferences) {
        const voice = voices.find(v => v.name.includes(name) && isPt(v));
        if (voice) return voice;
    }

    // 2. Any voice explicitly tagged pt-BR
    const ptBR = voices.find(v => v.lang === 'pt-BR' || v.lang === 'pt_BR');
    if (ptBR) return ptBR;

    // 3. Any voice with a PT lang (pt-PT included)
    const pt = voices.find(v => isPt(v));
    if (pt) return pt;

    // 4. Last resort: name contains Portuguese/Brazil keywords
    const byName = voices.find(v => /portugu|brazil|brasil/i.test(v.name));
    if (byName) return byName;

    // No PT voice found — caller will log available voices
    console.warn('[TTS] No Portuguese voice found. Available voices:', voices.map(v => `${v.name} (${v.lang})`));
    return null;
}

function prepareContentForKaraoke(container) {
    if (!container) return;

    // Check if Intl.Segmenter is supported
    if (typeof Intl.Segmenter === 'undefined') return;

    const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'sentence' });
    const blocks = container.querySelectorAll('p, li'); // Targets for splitting

    blocks.forEach(block => {
        // Skip if already processed
        if (block.querySelector('.reading-segment')) return;

        const text = block.innerText;
        const segments = segmenter.segment(text);
        let newHTML = '';

        for (const segment of segments) {
            const trimmed = segment.segment.trim();
            if (trimmed.length > 0) {
                newHTML += `<span class="reading-segment hover:bg-black/5 dark:hover:bg-white/10 rounded cursor-pointer transition-colors" onclick="playSegment(this)">${segment.segment}</span>`;
            } else {
                newHTML += segment.segment; // Preserve whitespace
            }
        }

        block.innerHTML = newHTML;
    });
}

// Allow clicking a sentence to read it
window.playSegment = function (el) {
    if (!el) return;

    // Stop current
    stopSpeech();

    // Find index of this element in global speechBlocks
    // (Need to re-select blocks to handle dynamically added spans if strictly necessary, 
    // but toggleSpeech usually initializes speechBlocks. If we are just reading one, we just read one.)

    // For simplicity, let's just read this one segment immediately
    const text = el.innerText;
    const utterance = new SpeechSynthesisUtterance(text);
    const bestVoice = getBestVoice();
    if (bestVoice) {
        utterance.voice = bestVoice;
    }
    utterance.lang = 'pt-BR';

    utterance.rate = currentSpeechRate; // use current rate

    utterance.onstart = function () {
        el.classList.add('highlight-speaking');
    };
    utterance.onend = function () {
        el.classList.remove('highlight-speaking');
    };

    window.speechSynthesis.speak(utterance);
}

// --- SEQUENTIAL READING (Ignore Filters) ---
// Navigation: Previous
window.readPrevInSequence = function () {
    // Mode 1: Filtered Navigation (Search Results)
    if (STATE.readingMode === 'filtered') {
        const idx = currentModalIndex;
        if (idx > 0) {
            transitionModal(STATE.list[idx - 1]);
        } else {
            showToast("Início dos resultados");
        }
        return;
    }

    // Mode 2: Book Navigation (Sequence)
    // Fallback
    if (!currentModalItem || !currentModalItem._cat) return;

    const cat = currentModalItem._cat;
    let sourceArray = [];
    if (cat && STATE.data[cat]) {
        sourceArray = STATE.data[cat];
    } else {
        Object.values(STATE.data).forEach(arr => sourceArray.push(...arr));
    }

    const idx = sourceArray.findIndex(i => i.id === currentModalItem.id);

    if (idx > 0) {
        const prevItem = sourceArray[idx - 1];
        if (!prevItem._cat) prevItem._cat = cat;

        syncBackgroundContext(prevItem); // Sync Background
        transitionModal(prevItem);

    } else if (idx === 0) {
        // Jump to Previous Category
        const categories = Object.keys(STATE.data);
        const currentCatIndex = categories.indexOf(cat);

        if (currentCatIndex > 0) {
            const prevCat = categories[currentCatIndex - 1];
            const prevList = STATE.data[prevCat];
            if (prevList && prevList.length > 0) {
                const prevItem = prevList[prevList.length - 1];
                if (!prevItem._cat) prevItem._cat = prevCat;

                showToast(`Retornando para ${CONFIG.modes[STATE.mode].cats[prevCat].label}`);
                syncBackgroundContext(prevItem); // Sync Background
                transitionModal(prevItem);
            }
        } else {
            showToast("Início da sequência");
        }
    } else {
        showToast("Início da sequência");
    }
}

// Navigation: Next
window.readNextInSequence = function () {
    // Mode 1: Filtered Navigation (Search Results)
    if (STATE.readingMode === 'filtered') {
        const idx = currentModalIndex;
        if (idx !== -1 && idx < STATE.list.length - 1) {
            transitionModal(STATE.list[idx + 1]);
        } else {
            showToast("Fim dos resultados");
        }
        return;
    }

    // Mode 2: Book Navigation (Sequence)
    if (!currentModalItem || !currentModalItem._cat) return;

    const cat = currentModalItem._cat;
    let sourceArray = [];
    if (cat && STATE.data[cat]) {
        sourceArray = STATE.data[cat];
    } else {
        Object.values(STATE.data).forEach(arr => sourceArray.push(...arr));
    }

    const idx = sourceArray.findIndex(i => i.id === currentModalItem.id);

    if (idx !== -1 && idx < sourceArray.length - 1) {
        const nextItem = sourceArray[idx + 1];
        if (!nextItem._cat) nextItem._cat = cat;

        syncBackgroundContext(nextItem); // Sync Background
        transitionModal(nextItem);

    } else if (idx === sourceArray.length - 1) {
        // Jump to Next Category
        const categories = Object.keys(STATE.data);
        const currentCatIndex = categories.indexOf(cat);

        if (currentCatIndex !== -1 && currentCatIndex < categories.length - 1) {
            const nextCat = categories[currentCatIndex + 1];
            const nextList = STATE.data[nextCat];
            if (nextList && nextList.length > 0) {
                const nextItem = nextList[0];
                if (!nextItem._cat) nextItem._cat = nextCat;

                showToast(`Avançando para ${CONFIG.modes[STATE.mode].cats[nextCat].label}`);
                syncBackgroundContext(nextItem); // Sync Background
                transitionModal(nextItem);
            }
        } else {
            showToast("Fim da sequência");
        }
    } else {
        showToast("Fim da sequência");
    }
}

// Helper for smooth transition
function transitionModal(item) {
    const scrollC = document.getElementById('modalScrollContainer');
    if (scrollC) scrollC.style.opacity = '0';

    setTimeout(() => {
        // Pass -1 to force Book Mode if we are in Book Mode?
        // Wait, if we are in 'filtered' mode, we usually pass index.
        // But transitionModal usually takes an item.
        // If we are in 'filtered' mode, we should pass the index to openModal to maintain 'filtered' state.

        if (STATE.readingMode === 'filtered') {
            const listIdx = STATE.list.findIndex(i => i.id === item.id);
            openModal(listIdx); // Passing index maintains 'filtered' mode
        } else {
            openModal(-1, item); // Passing -1 maintains (or sets) 'book' mode
        }

        if (scrollC) {
            scrollC.scrollTop = 0;
            scrollC.style.opacity = '1';
        }
    }, 200);
}

function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    const msgEl = document.getElementById('toastMessage');
    if (!toast || !msgEl) return;

    msgEl.textContent = msg;
    toast.classList.remove('opacity-0', 'scale-90');

    setTimeout(() => {
        toast.classList.add('opacity-0', 'scale-90');
    }, 2000);
}

window.filterBySourceFromModal = function (source) {
    closeModal();
    setTimeout(() => {
        if (!STATE.activeSources.includes(source)) {
            toggleFilter('source', source);
        } else {
            applyFilters();
        }
    }, 100);
}

// --- GLOSSARY MODAL LOGIC (Body Map Drill-down) ---
let currentGlossaryItems = [];
let isGlossaryMode = false;

function openGlossaryModal(title, items, pointId) {
    currentGlossaryItems = items;
    isGlossaryMode = true;

    // 1. Setup Modal Structure for List View
    const modal = document.getElementById('detailsModal');
    let glossaryView = document.getElementById('glossaryView');
    const readingView = document.getElementById('readingView');

    // Create glossaryView if missing
    if (!glossaryView) {
        glossaryView = document.createElement('div');
        glossaryView.id = 'glossaryView';
        // Match readingView classes generally
        glossaryView.className = 'w-full max-w-4xl mx-auto pb-20';
        // Insert before readingView
        document.getElementById('modalContent').insertBefore(glossaryView, readingView);
    }

    // Show Glossary, Hide Reading
    readingView.classList.add('hidden');
    glossaryView.classList.remove('hidden');
    glossaryView.innerHTML = renderGlossaryList(title, items, pointId);

    // Update Header
    document.getElementById('modalTitle').textContent = title.toUpperCase();

    // Hide standard category/tag/source/search in header
    // We might want to keep simple header or simplify it further?
    // For now, let's keep title and close button.

    // Show Modal
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modal.classList.add('opacity-100');
    });
    document.body.style.overflow = 'hidden';

    // Hide Navigation Buttons
    const prevBtn = document.getElementById('modalPrevBtn');
    const nextBtn = document.getElementById('modalNextBtn');
    if (prevBtn) prevBtn.classList.add('hidden');
    if (nextBtn) nextBtn.classList.add('hidden');

    // Back Button Logic (Closes Modal)
    const backBtn = document.getElementById('modalBackBtn');
    if (backBtn) {
        backBtn.onclick = closeModal;
        backBtn.classList.remove('hidden'); // Ensure visible
    }
}

function renderGlossaryList(title, items, pointId) {
    if (!items || items.length === 0) {
        return `<div class="p-8 text-center text-gray-400 font-serif italic">Nenhum item encontrado para esta região.</div>`;
    }

    const html = items.map((item, index) => {
        // Strip HTML tags for clean preview if needed, or just allow full render in accordion
        const fullContentPt = item.content_pt || item.content || '';

        return `
        <div class="border-b border-gray-100 dark:border-gray-800 last:border-0 transition-all duration-300 group">
            <button onclick="toggleGlossaryItem(${index})" 
                 class="w-full text-left py-5 px-4 md:px-6 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors flex items-start justify-between gap-4 group-focus:outline-none">
                <div>
                    <h3 class="font-serif text-lg text-gray-900 dark:text-gray-100 mb-1 leading-tight group-hover:text-purple-700 dark:group-hover:text-purple-400 transition-colors">${item.title_pt || item.title}</h3>
                    <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">${item.category_pt || item._cat || ''}</p>
                </div>
                <!-- Icon -->
                <div class="mt-1 text-gray-400 transition-transform duration-300" id="accordion-icon-${index}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            </button>
            
            <div id="accordion-content-${index}" class="hidden bg-gray-50/50 dark:bg-[#111]/50 px-4 md:px-8 py-6 text-gray-800 dark:text-gray-200 font-serif leading-relaxed space-y-4">
                ${formatBodyText(fullContentPt, null, item.focusPoints)}
                
                <!-- Action Footer -->
                <div class="pt-6 mt-6 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
                     <!-- "Read Full" button removed as we show full content. Maybe "View Original"? -->
                     ${item.content_jp ? `
                     <button onclick="currentModalIndex=${index}; currentModalItem=currentGlossaryItems[${index}]; closeModal(); setTimeout(() => openModal(-1, currentModalItem), 100);" class="text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                        Ver Original (JP)
                     </button>
                     ` : ''}
                </div>
            </div>
        </div>
        `;
    }).join('');

    return `
        <div class="pt-6">
            <div class="px-4 md:px-6 mb-2 flex items-center gap-4 border-b border-gray-100 dark:border-gray-800 pb-6 sticky top-0 bg-white dark:bg-[#0a0a0a] z-10 pt-2">
               <div class="w-12 h-12 shrink-0 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
               </div>
               <div>
                   <h2 class="font-serif text-2xl text-black dark:text-white">${title}</h2>
                   <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">${items.length} ITENS RELACIONADOS</p>
               </div>
            </div>
            <div class="">
                ${html}
            </div>
        </div>
    `;
}

function toggleGlossaryItem(index) {
    const content = document.getElementById(`accordion-content-${index}`);
    const icon = document.getElementById(`accordion-icon-${index}`);

    if (!content) return;

    const isHidden = content.classList.contains('hidden');

    if (isHidden) {
        content.classList.remove('hidden');
        if (icon) icon.style.transform = 'rotate(180deg)';
    } else {
        content.classList.add('hidden');
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

// Modify closeModal to cleanup
const originalCloseModal = closeModal;
closeModal = function () {
    originalCloseModal();
    // Cleanup Glossary
    isGlossaryMode = false;
    currentGlossaryItems = [];
    const glossaryView = document.getElementById('glossaryView');
    if (glossaryView) glossaryView.classList.add('hidden');
    const readingView = document.getElementById('readingView');
    if (readingView) readingView.classList.remove('hidden'); // Reset for next time
}

// --- HELPER FOR MODAL FILTERING ---
window.filterBySourceFromModal = function (sourceName) {
    // 1. Set the source filter (exclusive mode for clarity)
    if (typeof setSourceFilter === 'function') {
        setSourceFilter(sourceName);
    } else {
        console.warn("setSourceFilter function not found!");
        STATE.activeSources = [sourceName];
        if (typeof applyFilters === 'function') applyFilters();
        if (typeof renderActiveFilters === 'function') renderActiveFilters();
    }

    // 2. Clear other filters to avoid empty results and focus on the source content
    STATE.activeTags = [];
    STATE.activeFocusPoints = [];
    STATE.bodyFilter = null;

    // Re-apply to ensure clean state
    if (typeof applyFilters === 'function') applyFilters();
    if (typeof renderActiveFilters === 'function') renderActiveFilters();

    closeModal();
}

// ============================================================
// SEARCH PREVIEW MODAL — lightweight peek with highlights
// Inspired by caminho_da_felicidade's searchPreviewModal.
// Opened from the search modal when a result is clicked.
// ============================================================

let _previewItem = null;
let _previewQuery = '';

function _buildSearchPreviewDom() {
    if (document.getElementById('searchPreviewOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'searchPreviewOverlay';
    overlay.className = 'search-preview-overlay hidden';
    overlay.innerHTML = `
        <div id="searchPreviewBackdrop" class="search-preview-backdrop"></div>
        <div id="searchPreviewPanel" class="search-preview-panel">
            <button id="searchPreviewClose" class="search-preview-close" aria-label="Fechar">&times;</button>
            <div class="search-preview-scroll">
                <div id="searchPreviewCategory" class="search-preview-category"></div>
                <h2 id="searchPreviewTitle" class="search-preview-title"></h2>
                <div id="searchPreviewBody" class="search-preview-body"></div>
            </div>
            <footer class="search-preview-footer">
                <button id="searchPreviewBack" class="search-preview-back">← Voltar</button>
                <button id="searchPreviewOpen" class="search-preview-open">Abrir ensinamento</button>
            </footer>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('searchPreviewBackdrop').addEventListener('click', closeSearchPreview);
    document.getElementById('searchPreviewBack').addEventListener('click', closeSearchPreview);
    document.getElementById('searchPreviewClose').addEventListener('click', closeSearchPreview);
    document.getElementById('searchPreviewOpen').addEventListener('click', () => {
        const item = _previewItem;
        const query = _previewQuery;
        if (!item) return;
        closeSearchPreview(true);
        if (typeof closeSearch === 'function') closeSearch();
        setTimeout(() => openModal(-1, item, query), 220);
    });
}

function _renderSearchPreviewContent(content, query) {
    if (!content) {
        return '<p class="text-gray-400 italic">Conteúdo indisponível.</p>';
    }
    const paragraphs = content.split(/\n+/).map(p => p.trim()).filter(Boolean);
    return paragraphs.map(p => {
        const isHeader = /^\s*#+\s+/.test(p);
        let clean = p.replace(/^\s*#+\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1').trim();
        const html = typeof highlightSnippet === 'function'
            ? highlightSnippet(clean, query)
            : escHtmlSafe(clean);
        if (isHeader) {
            return `<h3 class="font-sans text-xs font-bold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400 mt-4 mb-1">${html}</h3>`;
        }
        return `<p>${html}</p>`;
    }).join('');
}

function openSearchPreview(item, query) {
    _buildSearchPreviewDom();
    if (!item) return;

    _previewItem = item;
    _previewQuery = query || '';

    const catConfig = CONFIG.modes[STATE.mode].cats[item._cat];
    const categoryLabel = catConfig ? catConfig.label : (item._cat || '');

    const rawTitle = item.title_pt || item.title || '';
    const displayTitle = typeof cleanTitle === 'function' ? cleanTitle(rawTitle) : rawTitle;
    const titleHtml = query
        ? (typeof highlightSnippet === 'function' ? highlightSnippet(displayTitle, query) : displayTitle)
        : displayTitle;

    const content = item.content_pt || item.content || '';

    document.getElementById('searchPreviewCategory').textContent = categoryLabel;
    document.getElementById('searchPreviewTitle').innerHTML = titleHtml;
    document.getElementById('searchPreviewBody').innerHTML = _renderSearchPreviewContent(content, query);

    const overlay = document.getElementById('searchPreviewOverlay');
    overlay.classList.remove('hidden');
    // Use requestAnimationFrame so CSS transition runs
    requestAnimationFrame(() => overlay.classList.add('active'));
    document.body.style.overflow = 'hidden';

    const scroll = overlay.querySelector('.search-preview-scroll');
    if (scroll) scroll.scrollTop = 0;

    setTimeout(() => {
        const firstMark = document.querySelector('#searchPreviewBody .search-highlight');
        if (firstMark) firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 260);
}

function closeSearchPreview(skipRestoreScroll = false) {
    const overlay = document.getElementById('searchPreviewOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');

    setTimeout(() => {
        overlay.classList.add('hidden');
        _previewItem = null;
        _previewQuery = '';
        // Release body scroll unless another modal is about to take over
        if (!skipRestoreScroll) {
            const searchModal = document.getElementById('searchModal');
            const readerModal = document.getElementById('readModal');
            const searchOpen = searchModal && searchModal.classList.contains('active');
            const readerOpen = readerModal && !readerModal.classList.contains('hidden');
            if (!searchOpen && !readerOpen) {
                document.body.style.overflow = '';
            }
        }
    }, 200);
}

// Escape key support for the preview
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const overlay = document.getElementById('searchPreviewOverlay');
    if (overlay && !overlay.classList.contains('hidden')) {
        e.stopPropagation();
        closeSearchPreview();
    }
});

window.openSearchPreview = openSearchPreview;
window.closeSearchPreview = closeSearchPreview;
