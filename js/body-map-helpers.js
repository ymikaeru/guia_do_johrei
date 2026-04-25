// --- INTERACTIVE BODY MAP HELPERS ---

// ── Visual state for a single point — single source of truth ───────────────
// Pure: derives all visual state for a single point ID from current STATE.
function getPointVisualState(pointId) {
    const selectedIds = STATE.selectedBodyPoint ? STATE.selectedBodyPoint.split(',') : [];
    const previewIds = (typeof previewState !== 'undefined' && previewState) ? previewState.split(',') : [];
    const isSelected = selectedIds.includes(pointId);
    const isPreviewed = !isSelected && previewIds.includes(pointId);
    return { isSelected, isPreviewed };
}

// Computes concrete style values from a state object.
function pointStyleFor(state) {
    let fill, fillOpacity, stroke, strokeWidth, baseRadius, glow;
    if (state.isSelected) {
        fill = '#7c3aed'; fillOpacity = '1';
        stroke = '#ffffff'; strokeWidth = '0.5';
        baseRadius = 1.8;
        glow = 'drop-shadow(0 0 4px rgba(124, 58, 237, 0.7))';
    } else if (state.isPreviewed) {
        fill = '#9333ea'; fillOpacity = '1';
        stroke = '#ffffff'; strokeWidth = '0.5';
        baseRadius = 1.8;
        glow = 'drop-shadow(0 0 5px rgba(147, 51, 234, 0.6))';
    } else {
        fill = '#94a3b8'; fillOpacity = '0.6';
        stroke = '#ffffff'; strokeWidth = '0.25';
        baseRadius = 1.2;
        glow = 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))';
    }
    return {
        fill, fillOpacity, stroke, strokeWidth,
        rx: baseRadius * 1.5, ry: baseRadius, glow,
        visible: state.isSelected || state.isPreviewed
    };
}

// Applies state to an existing DOM ellipse + its ripple sibling. Single
// place that mutates point visuals at runtime.
function applyPointState(ellipse) {
    if (!ellipse) return;
    const pointId = ellipse.getAttribute('data-point-id');
    const state = getPointVisualState(pointId);
    const style = pointStyleFor(state);
    const blinking = ellipse.classList.contains('blinking-highlight');

    // Hide inactive points: visible only when selected, previewed, or blinking.
    const display = (style.visible || blinking) ? '' : 'none';
    ellipse.style.display = display;

    ellipse.setAttribute('rx', style.rx);
    ellipse.setAttribute('ry', style.ry);
    ellipse.setAttribute('fill', style.fill);
    ellipse.setAttribute('fill-opacity', style.fillOpacity);
    ellipse.setAttribute('stroke', style.stroke);
    ellipse.setAttribute('stroke-width', style.strokeWidth);
    ellipse.style.filter = style.glow;

    const ripple = ellipse.previousElementSibling;
    if (ripple && ripple.tagName.toLowerCase() === 'ellipse') {
        if (state.isSelected || state.isPreviewed) {
            const rippleColor = state.isSelected ? '#7c3aed' : '#9333ea';
            ripple.setAttribute('fill', rippleColor);
            ripple.setAttribute('fill-opacity', '0.5');
            ripple.setAttribute('rx', style.rx);
            ripple.setAttribute('ry', style.ry);
            ripple.style.display = 'block';
        } else {
            ripple.style.display = 'none';
        }
    }
}

function renderBodyPoints(points, viewId) {
    if (!points || points.length === 0) return '';

    // For mapa tab use por_regiao (closest to former pontos_focais)
    const dataKey = STATE.activeTab === 'mapa' ? 'por_regiao' : STATE.activeTab;
    const currentData = STATE.data[dataKey] || STATE.data['por_regiao'] || [];

    return points.map(point => {
        // Count items matching this point — skip rendering if zero
        const count = currentData.filter(item => matchBodyPoint(item, point.id)).length;
        if (count === 0) return '';

        const state = getPointVisualState(point.id);
        const style = pointStyleFor(state);
        const showRipple = state.isSelected || state.isPreviewed;
        const rippleColor = state.isSelected ? '#7c3aed' : (state.isPreviewed ? '#9333ea' : 'none');

        const rippleElement = `
            <ellipse
                cx="${point.x}"
                cy="${point.y}"
                rx="${style.rx}"
                ry="${style.ry}"
                fill="${rippleColor}"
                fill-opacity="${showRipple ? '0.5' : '0'}"
                stroke="none"
                class="animate-pulse-ring pointer-events-none"
                style="transform-origin: center; transform-box: fill-box; display: ${showRipple ? 'block' : 'none'};"
            ></ellipse>
        `;

        return `
            ${rippleElement}
            <ellipse
                cx="${point.x}"
                cy="${point.y}"
                rx="${style.rx}"
                ry="${style.ry}"
                fill="${style.fill}"
                fill-opacity="${style.fillOpacity}"
                stroke="${style.stroke}"
                stroke-width="${style.strokeWidth}"
                class="body-map-point pointer-events-auto cursor-pointer transition-all duration-200"
                style="filter: ${style.glow}; transform-origin: center; display: ${style.visible ? '' : 'none'};"
                data-point-id="${point.id}"
                data-point-name="${point.name}"
                onclick="selectBodyPoint('${point.id}')"
                onmouseover="highlightBodyPoint(this, '${point.name}', event)"
                onmouseout="unhighlightBodyPoint(this)"
            >
                <title>${point.name}</title>
            </ellipse>
        `;
    }).join('');
}


function selectBodyPoint(pointIds) {
    if (!pointIds) {
        clearBodyFilter();
        return;
    }

    // Handle both single ID and comma-separated multiple IDs
    STATE.selectedBodyPoint = pointIds;

    const idArray = pointIds.split(',');

    // Find the point name from first ID
    let pointName = '';
    ['front', 'back', 'detail'].forEach(view => {
        const point = BODY_DATA.points[view].find(p => p.id === idArray[0]);
        if (point) pointName = point.name;
    });

    // Update Custom Dropdown Label (if exists)
    const btnLabel = document.getElementById('customDropdownLabel');
    if (btnLabel) {
        btnLabel.textContent = pointName || '-- Todos os pontos --';
    }

    // Update label
    const label = document.getElementById('selectedPointLabel');
    if (label) {
        label.textContent = `Filtrando por: ${pointName}`;
        label.classList.remove('hidden');
    }

    // Filter content based on body point keywords (use first ID for keywords)
    filterByBodyPoint(idArray[0], pointName);

    // Re-render maps to update selected point visualization (Kept for visual feedback on map)
    updatePointsVisual();

    // NO SCROLL or LIST update needed for Modal Mode
    // But we might want to ensure the list is hidden or reset?
    // Actually, sticking to "Glossary Mode" means we don't change the underlying list state necessarily.
}

function selectBodyPointFromDropdown(pointIds) {
    selectBodyPoint(pointIds);
}

function filterByBodyPoint(pointId, pointName) {
    // Set bodyFilter state
    STATE.bodyFilter = pointId;

    // Update selected point name display
    const nameEl = document.getElementById('selectedBodyPointName');
    if (nameEl) nameEl.textContent = pointName || 'Ponto Focal';

    // Apply filters to show cards below
    applyFilters();

    // Switch Mobile View to the correct map (Front/Back/Detail)
    if (window.innerWidth < 768) {
        let targetView = 'front'; // Default

        // Find which view contains the point
        if (BODY_DATA.points.back.find(p => p.id === pointId)) {
            targetView = 'back';
        } else if (BODY_DATA.points.detail.find(p => p.id === pointId)) {
            targetView = 'detail';
        }

        if (typeof switchMobileView === 'function') {
            switchMobileView(targetView);
        }
    }

    // REMOVED Autoscroll to results on mobile (User Request)
    /*
    const contentList = document.getElementById('contentList');
    if (contentList && window.innerWidth < 1024) {
        setTimeout(() => {
            contentList.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
    }
    */
}

function highlightBodyPoint(element, name, event) {
    // Skip if this point is invisible (default state of inactive points)
    if (element.style.display === 'none') return;

    // Skip if this point is already selected
    const pointId = element.getAttribute('data-point-id');
    const selectedIds = STATE.selectedBodyPoint ? STATE.selectedBodyPoint.split(',') : [];
    if (selectedIds.includes(pointId)) return;

    // Apply hover effect: larger size, purple color, glow
    const hoverRadius = 2.2;
    element.setAttribute('rx', hoverRadius * 1.5);
    element.setAttribute('ry', hoverRadius);
    element.setAttribute('fill', '#7c3aed');
    element.setAttribute('fill-opacity', '1');
    element.setAttribute('stroke', '#7c3aed');
    element.setAttribute('stroke-width', '0.5');
    element.style.filter = 'drop-shadow(0 0 4px rgba(124, 58, 237, 0.8))';

    // Calculate item count
    const keywords = BODY_DATA.keywords[pointId] || [];
    let count = 0;

    if (keywords.length > 0 && STATE.data) {
        // Collect all items from all tabs
        let allItems = [];
        Object.keys(STATE.data).forEach(tabId => {
            if (STATE.data[tabId]) {
                allItems.push(...STATE.data[tabId]);
            }
        });

        // Show Tooltip
        // Remove existing tooltip if any
        const existingTooltip = document.getElementById('body-tooltip');
        if (existingTooltip) existingTooltip.remove();

        const tooltip = document.createElement('div');
        tooltip.id = 'body-tooltip';
        // Count items matching this point
        // Count items matching this point using the STRICT logic
        count = allItems.filter(item => matchBodyPoint(item, pointId)).length;

        tooltip.innerHTML = `${name.toUpperCase()} <span style="opacity: 0.7; font-size: 0.9em; margin-left: 2px;">(${count})</span>`;

        // Style - Fixed position to avoid scrolling issues, but we might want it to move?
        // User complaint: "tooltip scrolls with the page". Usually means it stays fixed on screen relative to viewport, effectively sliding over content.
        // Or it means "It moves UP with the page" (absolute). 
        // If we want it to DISAPPEAR on scroll, we add a listener.
        tooltip.className = 'body-point-tooltip absolute z-[1000] bg-white dark:bg-[#111] text-black dark:text-white text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 whitespace-nowrap';

        document.body.appendChild(tooltip);

        const rect = element.getBoundingClientRect();
        const topY = rect.top + window.scrollY; // Absolute position relative to document
        const leftX = rect.left + window.scrollX + (rect.width / 2);

        tooltip.style.top = `${topY - 16}px`; // 16px offset
        tooltip.style.left = `${leftX}px`;

        // Hide on scroll to prevent detachment issues
        const hideOnScroll = () => {
            unhighlightBodyPoint(); // Call unhighlight to remove tooltip and reset element
            window.removeEventListener('scroll', hideOnScroll);
        };
        window.addEventListener('scroll', hideOnScroll, { passive: true });
        // Also store the listener to remove it if unmatched manually
        element.dataset.scrollListener = 'active';
    }
}

function unhighlightBodyPoint(element) {
    // 1. Always remove tooltip first
    const tooltip = document.getElementById('body-tooltip');
    if (tooltip) tooltip.remove();

    // If element is not provided, it means it's called from scroll listener, so we need to find the currently highlighted one
    if (!element) {
        const highlighted = document.querySelector('.body-map-point[data-scroll-listener="active"]');
        if (highlighted) {
            element = highlighted;
        } else {
            // No element to unhighlight, and tooltip already removed above
            return;
        }
    }

    // Skip if this point is selected (selection takes precedence over hover)
    const pointId = element.getAttribute('data-point-id');
    const selectedIds = STATE.selectedBodyPoint ? STATE.selectedBodyPoint.split(',') : [];
    if (selectedIds.includes(pointId)) return;

    // Restore correct state via single source of truth
    if (element.dataset.scrollListener) delete element.dataset.scrollListener;
    applyPointState(element);
}

// Preview points when hovering over dropdown options
let previewState = null;

function previewBodyPoints(pointIds) {
    if (!pointIds) {
        clearBodyPointPreview();
        return;
    }

    previewState = pointIds;
    updatePointsVisual();
}

function clearBodyPointPreview() {
    previewState = null;
    updatePointsVisual();
}

function isPointPreviewed(pointId) {
    if (!previewState) return false;
    const previewIds = previewState.split(',');
    return previewIds.includes(pointId);
}

function updatePointsVisual() {
    document.querySelectorAll('.body-map-point').forEach(applyPointState);
}



// --- CUSTOM DROPDOWN / SIDEBAR FUNCTIONS ---

function generateSidebarOptions() {
    const allPoints = [
        ...BODY_DATA.points.front,
        ...BODY_DATA.points.back,
        ...BODY_DATA.points.detail
    ];

    const pointsByName = {};
    allPoints.forEach(point => {
        if (!pointsByName[point.name]) {
            pointsByName[point.name] = [];
        }
        pointsByName[point.name].push(point.id);
    });

    const sortedNames = Object.keys(pointsByName).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const dataKey = STATE.activeTab === 'mapa' ? 'pontos_focais' : STATE.activeTab;
    const currentData = STATE.data && STATE.data[dataKey] ? STATE.data[dataKey] : [];

    return sortedNames.map(name => {
        const ids = pointsByName[name].join(',');
        const idList = pointsByName[name];

        // Count items matching ANY of the IDs for this name
        const count = currentData.filter(item => {
            return idList.some(id => matchBodyPoint(item, id));
        }).length;

        // Hide items with no results
        if (count === 0) return '';

        return `
            <div class="px-5 py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 last:border-0 transition-all group hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black flex justify-between items-center"
                onclick="selectCustomOption('${ids}', '${name}', event)"
                onmouseenter="previewBodyPoints('${ids}')"
                onmouseleave="clearBodyPointPreview()"
            >
                <span class="text-gray-900 dark:text-gray-100 group-hover:text-white dark:group-hover:text-black transition-colors block flex-1 pr-2">${name}</span>
                <span class="text-[9px] font-bold text-gray-400 group-hover:text-white dark:group-hover:text-black flex-shrink-0">${count}</span>
            </div>
        `;
    }).join('');
}

function toggleCustomDropdown(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('customDropdownMenu');
    const icon = document.getElementById('customDropdownIcon');

    if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        // Animate open
        requestAnimationFrame(() => {
            menu.classList.remove('opacity-0', '-translate-y-2');
            menu.classList.add('opacity-100', 'translate-y-0');
            if (icon) icon.style.transform = 'rotate(180deg)';
        });
    } else {
        closeCustomDropdown();
    }
}

function closeCustomDropdown() {
    const menu = document.getElementById('customDropdownMenu');
    const icon = document.getElementById('customDropdownIcon');

    if (!menu) return;

    // Animate close
    menu.classList.remove('opacity-100', 'translate-y-0');
    menu.classList.add('opacity-0', '-translate-y-2');
    if (icon) icon.style.transform = 'rotate(0deg)';

    setTimeout(() => {
        menu.classList.add('hidden');
    }, 200);
}

function selectCustomOption(ids, name, event) {
    if (event) event.stopPropagation();

    if (!ids) {
        clearBodyFilter();
    } else {
        selectBodyPoint(ids);
    }

    closeCustomDropdown();
    // Also close Mobile/Tablet Dropdown if exists
    const mobileList = document.getElementById('mobileBodyFilterList');
    if (mobileList) mobileList.classList.add('hidden');

    // Close Modal filter (Tablet)
    if (typeof closeBodyFilterModal === 'function') closeBodyFilterModal();

    clearBodyPointPreview();
}

// --- GLOSSARY MODE HELPERS ---

// Inject Styles for Blink Animation
(function () {
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes blink-purple {
            0%, 100% { fill-opacity: 0.6; }
            50% { fill-opacity: 1; fill: #7c3aed; filter: drop-shadow(0 0 8px #7c3aed); }
        }
        .blinking-highlight {
            animation: blink-purple 1s ease-in-out infinite;
        }
        
        /* Tooltip with centered triangle arrow at bottom */
        .body-point-tooltip::after {
            content: '';
            position: absolute;
            bottom: -6px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-top: 6px solid white;
        }
        
        /* Dark mode triangle */
        .dark .body-point-tooltip::after {
            border-top-color: #111;
        }
    `;
    document.head.appendChild(style);
})();

function blinkBodyPoint(pointIds) {
    if (!pointIds) return;
    const ids = pointIds.split(',');

    const elements = [];
    ids.forEach(id => {
        const el = document.querySelector(`.body-map-point[data-point-id="${id}"]`);
        if (el) elements.push(el);
    });

    if (elements.length === 0) return;

    // Auto-switch to correct view on mobile (< 768px)
    if (window.innerWidth < 768 && elements.length > 0) {
        const firstEl = elements[0];
        const svg = firstEl.closest('svg');
        if (svg) {
            const viewId = svg.id.replace('_svg', '');
            if (typeof switchMobileView === 'function') {
                switchMobileView(viewId);
            }
        }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    elements.forEach(el => {
        el.classList.add('blinking-highlight');
        applyPointState(el); // makes invisible point visible because of class check
    });

    setTimeout(() => {
        elements.forEach(el => {
            el.classList.remove('blinking-highlight');
            applyPointState(el); // restores correct state (back to hidden if not selected)
        });
    }, 3000);
}

function generateGlossaryGrid() {
    const allPoints = [
        ...BODY_DATA.points.front,
        ...BODY_DATA.points.back,
        ...BODY_DATA.points.detail
    ];

    const pointsByName = {};
    allPoints.forEach(point => {
        if (!pointsByName[point.name]) {
            pointsByName[point.name] = [];
        }
        pointsByName[point.name].push(point.id);
    });

    const sortedNames = Object.keys(pointsByName).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return sortedNames.map(name => {
        const ids = pointsByName[name].join(',');
        return `
            <button 
                class="text-left px-4 py-3 rounded-lg bg-gray-50 dark:bg-[#161616] border border-gray-100 dark:border-gray-800 hover:border-purple-500 dark:hover:border-purple-500 hover:bg-white dark:hover:bg-[#222] transition-all group"
                onclick="blinkBodyPoint('${ids}')"
                onmouseenter="previewBodyPoints('${ids}')"
                onmouseleave="clearBodyPointPreview()"
            >
                <span class="text-xs font-bold uppercase tracking-widest text-gray-500 group-hover:text-purple-600 dark:text-gray-400 dark:group-hover:text-purple-400 transition-colors">${name}</span>
            </button>
        `;
    }).join('');
}

function clearBodyFilter() {
    STATE.selectedBodyPoint = null;
    const label = document.getElementById('selectedPointLabel');
    if (label) label.classList.add('hidden');

    // Update Button Label
    const btnLabel = document.getElementById('customDropdownLabel');
    if (btnLabel) btnLabel.textContent = 'Filtrar por Região';

    if (typeof updatePointsVisual === 'function') updatePointsVisual();
    applyFilters();
}

// Close custom dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('customBodyPointDropdown');
    const menu = document.getElementById('customDropdownMenu');
    if (dropdown && menu && !menu.classList.contains('hidden')) {
        if (!dropdown.contains(e.target)) {
            closeCustomDropdown();
        }
    }
});

// Polyfill for matchBodyPoint provided for safety
// Robust matchBodyPoint for filtering
// Robust matchBodyPoint for filtering
function matchBodyPoint(item, pointId) {
    // 1. Get Keywords
    const rawKey = BODY_DATA.keywords[pointId] || pointId;
    const searchKeys = Array.isArray(rawKey) ? rawKey : [rawKey];

    // 2. Check overlap
    return searchKeys.some(k => {
        if (!k) return false;
        const q = removeAccents(String(k).toLowerCase());

        // Escape special chars in q just in case
        const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${safeQ}\\b`, 'i');

        // Check Focus Points (Strict Mode)
        if (item.focusPoints && item.focusPoints.some(fp => regex.test(removeAccents(fp.toLowerCase())))) return true;

        // Check searchKeywords (often used for body parts in JSONs)
        if (item.searchKeywords && item.searchKeywords.some(sk => regex.test(removeAccents(sk.toLowerCase())))) return true;

        // Backup: Check Tags (sometimes body parts are tags)
        if (item.tags && item.tags.some(t => regex.test(removeAccents(t.toLowerCase())))) return true;

        // Backup: Check Title
        if (item.title && regex.test(removeAccents(item.title.toLowerCase()))) return true;

        // Backup: Check Content (Deep search)
        if (item.content && regex.test(removeAccents(item.content.toLowerCase()))) return true;

        return false;
    });
}

// --- SCROLL INDICATOR ---

function showScrollIndicator() {
    let indicator = document.getElementById('scrollIndicatorArrow');

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'scrollIndicatorArrow';
        indicator.className = 'fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 cursor-pointer animate-bounce transition-opacity duration-500';
        indicator.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-full p-2 shadow-lg border border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-300 opacity-90 hover:opacity-100 flex items-center justify-center">
                <svg class="w-6 h-6" style="transform: translateY(-3px);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7-7-7"></path>
                </svg>
            </div>
        `;
        document.body.appendChild(indicator);

        indicator.onclick = () => {
            const contentList = document.getElementById('contentList');
            if (contentList) {
                contentList.scrollIntoView({ behavior: 'smooth', block: 'start' });
                hideScrollIndicator();
            }
        };
    }

    // Show
    indicator.classList.remove('opacity-0', 'pointer-events-none');

    // Auto-hide on scroll
    const hideOnScroll = () => {
        // Hide if scrolled down sufficiently or near bottom? 
        // Just hiding on any significant scroll is good UX to clear clutter
        if (window.scrollY > (window.innerHeight * 0.2)) {
            hideScrollIndicator();
            window.removeEventListener('scroll', hideOnScroll);
        }
    };

    window.addEventListener('scroll', hideOnScroll, { passive: true });
}

function hideScrollIndicator() {
    const indicator = document.getElementById('scrollIndicatorArrow');
    if (indicator) {
        indicator.classList.add('opacity-0', 'pointer-events-none');
    }
}
