
// --- APOSTILA FEATURE LOGIC ---

// Global state for Apostila (will be initialized in state.js, but fallback here)
if (!window.STATE) window.STATE = {};
if (!window.STATE.apostilas) {
    window.STATE.apostilas = {
        ensinamentos: { items: [], title: "Minha Apostila" },
        explicacoes: { items: [], title: "Meus Estudos" }
    };
}

/**
 * Toggles a card's presence in the Apostila.
 * @param {string} cardId - The ID of the card to toggle.
 * @param {HTMLElement} btnElement - The button element triggered (for visual feedback).
 */
function toggleApostilaItem(cardId, btnElement) {
    const icon = btnElement.querySelector('svg');
    const currentApostila = STATE.apostilas[STATE.mode];
    const index = currentApostila.items.indexOf(cardId);

    // Active/Inactive Class Sets
    const activeClasses = ['bg-yellow-50', 'text-yellow-600', 'border-yellow-200'];
    const inactiveClasses = ['bg-white', 'text-gray-300', 'border-gray-100'];

    if (index === -1) {
        // First item check: Prompt for Title
        if (currentApostila.items.length === 0) {
            setTimeout(() => {
                const newTitle = prompt("Dê um nome para sua nova apostila:", currentApostila.title);
                if (newTitle && newTitle.trim() !== "") {
                    currentApostila.title = newTitle;
                    if (STATE.activeTab === 'apostila') renderApostilaView();
                    renderTabs();
                }
            }, 50);
        }

        // Add
        currentApostila.items.push(cardId);

        // Update Button Style
        btnElement.classList.add(...activeClasses);
        btnElement.classList.remove(...inactiveClasses);

        showToast('Adicionado à Apostila');
    } else {
        // Remove
        currentApostila.items.splice(index, 1);

        // Update Button Style
        btnElement.classList.add(...inactiveClasses);
        btnElement.classList.remove(...activeClasses);

        showToast('Removido da Apostila');
    }

    // Refresh Tabs to show/hide Apostila tab if needed
    if (typeof renderTabs === 'function') renderTabs();

    // If we are currently IN the Apostila tab, re-render the view
    if (STATE.activeTab === 'apostila') {
        renderApostilaView();
    }
}

/**
 * Renders the main Apostila interface in the content area.
 */
function renderApostilaView() {
    const container = document.getElementById('contentList');
    const currentApostila = STATE.apostilas[STATE.mode];

    container.innerHTML = '';
    container.classList.remove('hidden');

    if (currentApostila.items.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-64 opacity-50">
                <p class="text-xl font-serif italic text-gray-400">Sua apostila está vazia.</p>
                <p class="text-sm text-gray-500 mt-2 flex items-center gap-1">Adicione cards clicando no ícone <svg class="w-4 h-4 inline-block text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg> na listagem.</p>
            </div>
        `;
        return;
    }

    // Header (Hybrid Design: Structured but Clean)
    // Using a subtle card with minimal shadows to give structure without weight.
    // Default to numeric 24 if not set or if it was a string (migration)
    let currentFontSize = parseInt(STATE.printFontSize) || 18;
    // Migration check: if it was 'small'/'medium'/'large', reset to meaningful defaults
    if (STATE.printFontSize === 'small') currentFontSize = 14;
    if (STATE.printFontSize === 'medium') currentFontSize = 18;
    if (STATE.printFontSize === 'large') currentFontSize = 22;

    // Clamp to new limits
    if (currentFontSize < 12) currentFontSize = 12;
    if (currentFontSize > 25) currentFontSize = 25;

    STATE.printFontSize = currentFontSize; // Ensure state is numeric now

    // Default Alignment
    const currentAlign = STATE.printAlignment || 'justify';

    let html = `
        <div class="w-full max-w-7xl mx-auto mt-8 mb-16 px-4 md:px-8">
             <div class="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-8 mb-12 relative group shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
                
                <!-- Top Right: Clear/Delete Button -->
                <div class="absolute top-6 right-6 z-10">
                     <button onclick="clearApostila()" class="p-2 bg-white/50 dark:bg-black/50 backdrop-blur-sm rounded-full transition-colors text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40" title="Limpar Apostila">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <!-- Title Input -->
                <div class="w-full relative pr-16 mb-16">
                    <label class="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">Título da Coleção</label>
                    <input type="text" id="apostilaTitleInput" 
                        value="${currentApostila.title}" 
                        oninput="updateApostilaTitle(this.value)"
                        class="w-full text-3xl md:text-4xl font-serif font-medium bg-transparent border-b border-transparent hover:border-gray-200 focus:border-black dark:focus:border-white outline-none placeholder-gray-300 dark:placeholder-gray-700 text-gray-900 dark:text-white tracking-tight transition-colors py-2" 
                        placeholder="Sem Título"
                    />
                </div>

                <!-- Bottom Right: Controls -->
                <div class="absolute bottom-6 right-6 z-10 flex flex-wrap items-center gap-4 justify-end">
                     
                     <!-- Alignment Selector -->
                     <div class="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700">
                        <span class="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Texto</span>
                        <select onchange="setPrintAlignment(this.value)" class="bg-transparent text-xs font-bold uppercase tracking-wider text-black dark:text-white outline-none cursor-pointer border-none p-0 focus:ring-0">
                            <option value="justify" ${currentAlign === 'justify' ? 'selected' : ''}>Normal</option>
                            <option value="left" ${currentAlign === 'left' ? 'selected' : ''}>Corrido</option>
                            <option value="hyphen" ${currentAlign === 'hyphen' ? 'selected' : ''}>Hifenizado</option>
                        </select>
                     </div>

                     <!-- Font Size Slider -->
                     <div class="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded-full border border-gray-100 dark:border-gray-700">
                        <span class="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Tamanho</span>
                        <input type="range" min="12" max="25" step="1" value="${currentFontSize}" 
                            oninput="setPrintFontSize(this.value)"
                            class="w-20 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer range-sm accent-black dark:accent-white"
                        >
                        <span id="fontSizeDisplay" class="text-xs font-mono font-bold w-6 text-right">${currentFontSize}</span>
                     </div>

                     <!-- Print Button -->
                     <button onclick="printApostila()" class="flex items-center gap-2 px-5 py-2.5 bg-black text-white dark:bg-white dark:text-black hover:opacity-80 rounded-lg transition-all duration-300 text-[10px] font-bold uppercase tracking-widest shadow-md">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                        IMPRIMIR
                    </button>
                </div>
             </div>

             <div class="grid grid-cols-2 lg:grid-cols-3 gap-6">
    `;

    // List of Items - using EXACT CARD style from ui.js
    // We get the color from the category configuration
    const catConfig = CONFIG.modes[STATE.mode].cats;
    const activeTags = STATE.activeTags || [];

    currentApostila.items.forEach(id => {
        const item = STATE.globalData ? STATE.globalData[id] : null;

        if (item) {
            // Configuration for Category
            const catId = item._cat;
            const config = catConfig && catConfig[catId] ? catConfig[catId] : null;

            // Badge Styling (Exact match)
            const catLabel = config ? config.label : (item._cat || 'Geral');
            // We use the simple badge style from the main list (unless cross-tab, which simple view implies single tab usually, but let's be safe)
            const categoryBadgeClasses = `text-[10px] px-2 py-1 rounded-md ${config ? `bg-${config.color} text-white dark:bg-${config.color} dark:text-white` : 'bg-gray-400 text-white'}`;

            // Focus Points Logic (if any)
            const focusPointsHtml = (item.focusPoints && item.focusPoints.length > 0) ? `
                <div class="mb-3 mt-2">
                    <div class="flex flex-wrap gap-2">
                        ${item.focusPoints.map(fp => {
                return `<span class="text-[9px] font-bold uppercase tracking-widest border border-gray-100 dark:border-gray-800 text-gray-400 px-2 py-1 rounded-md">${fp}</span>`;
            }).join('')}
                    </div>
                </div>
            ` : '';

            // Footer Tags Logic (reusing safe slice logic)
            const tags = item.tags || [];
            const points = item.focusPoints || [];
            let allItems = [
                ...tags.map(t => ({ text: t, type: 'tag' })),
                // ...points.map(p => ({text: p, type: 'point' })) // Points usually handled above, but main UI merges them in footer if not focus tab.
                // Let's mimic main UI: activeTab !== 'pontos_focais' usually shows them at bottom.
            ];

            let footerHtml = '';
            if (allItems.length > 0) {
                const itemsToShow = allItems.slice(0, 6);
                footerHtml = `
                <div class="mt-[0.3rem] border-t border-gray-50 dark:border-gray-900 flex flex-wrap gap-2 pt-3">
                    ${itemsToShow.map(i => {
                    return `<span class="tag-btn text-[9px] px-2 py-1 rounded-md uppercase tracking-wider font-bold bg-gray-100 text-gray-500 dark:bg-[#1a1a1a] dark:text-gray-400">${i.text}</span>`;
                }).join('')}
                </div>`;
            }

            html += `
                <div onclick="openApostilaModal('${item.id}')" class="group p-4 border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#111] hover:border-black dark:hover:border-white transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between h-full shadow-sm hover:shadow-md rounded-none md:rounded-lg">

                    <div class="absolute top-3 right-3 z-20">
                        <button onclick="toggleApostilaItem('${item.id}', this); event.stopPropagation();" class="w-8 h-8 flex items-center justify-center rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 transition-colors" title="Remover da Apostila">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>

                    <div>
                        <div class="mb-2 mr-8">
                            <span class="${categoryBadgeClasses} font-bold uppercase tracking-widest">${catLabel}</span>
                        </div>
                        <h3 class="font-serif font-bold text-[1.525rem] leading-tight mb-2 group-hover:text-black dark:group-hover:text-white transition-colors">${item.title_pt || item.title}</h3>

                        <div class="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 leading-relaxed mb-4">
                            ${(item.content_pt || item.content || '').substring(0, 150)}...
                        </div>

                        ${focusPointsHtml}
                    </div>

                    ${footerHtml}
                </div>
                `;
        }
    });

    html += `</div></div > `;
    container.innerHTML = html;
}

/**
 * Opens the modal for a specific Apostila item.
 * Duplicates relevant logic from main.js openModal but adapted for direct ID access.
 */
function openApostilaModal(id) {
    const item = STATE.globalData[id];
    if (!item) return;

    const catConfig = CONFIG.modes[STATE.mode].cats[item._cat];

    document.getElementById('modalTitle').textContent = item.title_pt || item.title;
    const catEl = document.getElementById('modalCategory');
    catEl.textContent = catConfig ? catConfig.label : (item._cat || 'Geral');

    // Reset classes
    catEl.className = 'text-[10px] font-sans font-bold uppercase tracking-widest block mb-2';
    if (catConfig) {
        catEl.classList.add(`text-${catConfig.color}`);
    } else {
        catEl.classList.add('text-gray-500');
    }

    document.getElementById('modalSource').textContent = item.source || "Fonte Original";
    // In Apostila, we don't have a rigid list index, so we hide or simplify the ref number
    document.getElementById('modalRef').textContent = '';

    // Body Text
    // formatBodyText is global in main.js
    if (typeof formatBodyText === 'function') {
        document.getElementById('modalContent').innerHTML = formatBodyText(item.content_pt || item.content, '');
    } else {
        document.getElementById('modalContent').innerHTML = (item.content_pt || item.content || '').replace(/\n/g, '<br>');
    }

    // Focus Points
    const fpContainer = document.getElementById('modalFocusContainer');
    // Always show if available in Apostila view
    if (item.focusPoints && item.focusPoints.length > 0) {
        fpContainer.classList.remove('hidden');
        const html = item.focusPoints.map(p => {
            const baseClass = "text-[10px] font-bold uppercase tracking-widest border px-2 py-1 transition-colors border-black dark:border-white bg-white dark:bg-black text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black";
            // Note: filterByFocusPoint is global, will switch tab to map. Acceptable behavior.
            return `<button onclick="filterByFocusPoint('${p}')" class="${baseClass}">${p}</button>`;
        }).join('');
        document.getElementById('modalFocusPoints').innerHTML = html;
    } else {
        fpContainer.classList.add('hidden');
    }

    // Disable Navigation for now (Simplify)
    document.getElementById('prevBtn').disabled = true;
    document.getElementById('nextBtn').disabled = true;

    // Show Modal
    const modal = document.getElementById('readModal');
    const card = document.getElementById('modalCard');
    const backdrop = document.getElementById('modalBackdrop');

    modal.classList.remove('hidden');
    void modal.offsetWidth; // Force Reflow
    card.classList.add('open');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
}

let titleDebounceTimer;
function updateApostilaTitle(newTitle) {
    if (STATE.apostilas && STATE.apostilas[STATE.mode]) {
        STATE.apostilas[STATE.mode].title = newTitle;

        // Debounce the tab update to prevent any focus loss or layout thrashing while typing
        clearTimeout(titleDebounceTimer);
        titleDebounceTimer = setTimeout(() => {
            if (typeof renderTabs === 'function') renderTabs();
        }, 1000);
    }
}

function setPrintAlignment(val) {
    STATE.printAlignment = val;
}

/**
 * Generates the print view (using a print window or printing the formatted content).
 */
function printApostila() {
    const currentApostila = STATE.apostilas[STATE.mode];
    const items = [];

    // Gather Data from Global Cache
    currentApostila.items.forEach(id => {
        const item = STATE.globalData ? STATE.globalData[id] : null;
        if (item) items.push(item);
    });

    if (items.length === 0) return;

    // Detect Global Body Points mentioned
    const mentionedPoints = new Set();
    const pointKeywords = [];

    // 1. Build Keyword Map from BODY_DATA
    // This assumes BODY_DATA is globally available from js/data.js
    if (typeof BODY_DATA !== 'undefined' && BODY_DATA.keywords) {
        Object.keys(BODY_DATA.keywords).forEach(pointId => {
            BODY_DATA.keywords[pointId].forEach(kw => {
                pointKeywords.push({ term: kw.toLowerCase(), id: pointId });
            });
        });
    }

    // 2. Scan Items for Keywords (Very simplistic search)
    items.forEach(item => {
        // Check item tags
        if (item.tags) {
            item.tags.forEach(tag => {
                // Try to find matching point for tag
                // This logic mirrors finding a point by fuzzy name
                const tagLower = tag.toLowerCase();
                pointKeywords.forEach(pk => {
                    if (tagLower.includes(pk.term) || pk.term.includes(tagLower)) {
                        mentionedPoints.add(pk.id);
                    }
                });
            });
        }

        // Search tags logic here (simplified)
        if (item.searchKeywords) {
            item.searchKeywords.forEach(sk => {
                const skLower = sk.toLowerCase();
                pointKeywords.forEach(pk => {
                    if (skLower === pk.term) mentionedPoints.add(pk.id);
                });
            });
        }
    });

    // 3. Generate HTML content for Print Window
    // Font Size Logic
    // Default to numeric or parse
    const currentFontSize = parseInt(STATE.printFontSize) || 18;
    const bodyFontSize = `${currentFontSize}px`;

    // Alignment CSS
    const alignMode = STATE.printAlignment || 'justify';
    let alignCss = 'text-align: justify;'; // default
    if (alignMode === 'left') alignCss = 'text-align: left;';
    if (alignMode === 'hyphen') alignCss = 'text-align: justify; hyphens: auto; -webkit-hyphens: auto;';

    const printContent = `
        <!DOCTYPE html>
            <html lang="pt-BR">
                <head>
                    <title>${currentApostila.title}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;700&family=Inter:wght@300;400;700&display=swap');

                        body {font-family: 'Inter', sans-serif; color: #000; padding: 40px; max-width: 800px; margin: 0 auto;}
                        h1, h2, h3 {font-family: 'Cormorant Garamond', serif;}

                        .cover {text-align: center; margin-top: 200px; page-break-after: always;}
                        .cover h1 {font-size: 48px; margin-bottom: 20px;}
                        .cover p {font-size: 14px; text-transform: uppercase; letter-spacing: 0.2em; color: #666;}

                        .index-section {page-break-after: always; margin-top: 60px;}
                        .index-header {font-size: 24px; text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 30px;}
                        .index-list {list-style: none; padding: 0;}
                        .index-item {display: flex; margin-bottom: 12px; font-size: 14px; font-family: 'Inter', sans-serif; color: #333;}
                        .index-num {font-weight: bold; width: 30px; flex-shrink: 0;}
                        .index-title {border-bottom: 1px dotted #ccc; flex-grow: 1; padding-bottom: 2px;}

                        .item {margin-bottom: 60px; page-break-inside: avoid;}
                        .item h2 {font-size: 24px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 10px;}
                        .item .meta {font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 20px; letter-spacing: 0.1em;}
                        .item-content {font-size: ${bodyFontSize}; line-height: 1.8; ${alignCss}}
                        .item-content p {margin-bottom: 1em;}

                        .glossary-section {page-break-before: always; border-top: 5px solid #000; padding-top: 40px;}
                        .map-container {position: relative; width: 400px; margin: 0 auto;}
                        .map-container svg {width: 100%; height: auto;}

                        .glossary-list {margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 12px;}
                        .glossary-item {padding: 10px; background: #f9f9f9; border-left: 2px solid #000;}
                        .glossary-item strong {display: block; text-transform: uppercase; margin-bottom: 4px;}

                        @media print {
                            @page {margin: 2cm;}
                            body {-webkit-print-color-adjust: exact;}
                        }
                    </style>
                </head>
                <body>
                    <div class="cover">
                        <h1>${currentApostila.title}</h1>
                        <p>Guia de Estudos Johrei</p>
                        <p style="margin-top: 40px; font-size: 10px;">Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
                    </div>

                    <div class="index-section">
                        <div class="index-header">Índice</div>
                        <ul class="index-list">
                            ${items.map((item, idx) => `
                                <li class="index-item">
                                    <span class="index-num">${String(idx + 1).padStart(2, '0')}</span>
                                    <span class="index-title">${item.title_pt || item.title}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>

                    ${items.map(item => `
                <div class="item">
                    <h2>${item.title_pt || item.title}</h2>
                    <div class="meta">${item.course ? item.course + ' • ' : ''} ${item.source}</div>
                    <div class="item-content">
                        ${(item.content_pt || item.content || '').replace(/\n/g, '<br>')}
                    </div>
                    ${item.tags && item.tags.length > 0 ? `
                        <div style="margin-top: 20px; font-size: 10px; color: #666; font-style: italic;">
                            <strong>Tags:</strong> ${item.tags.join(', ')}
                        </div>
                    ` : ''}
                </div>
            `).join('')}

                    ${mentionedPoints.size > 0 ? generateMapsHtml([...mentionedPoints]) : ''}

                    <script>
                        window.onload = function() {window.print();}
                    </script>
                </body>
            </html>
    `;

    const win = window.open('', '_blank');
    win.document.write(printContent);
    win.document.close();
}

/**
 * Helper to generate maps HTML for the print view.
 * Reuses the global generate maps logic but simplifies it for print.
 */
function generateMapsHtml(pointIds) {
    // We need to render the maps that contain these points.
    // We can assume Front and Back are the main ones.

    // This relies on renderBodyPoints from body-map-helpers.js being available globally?
    // Actually, renderBodyPoints generates SVG content. We can re-use it if we mock the view.

    // Filter points for Front View
    const frontPoints = (BODY_DATA.points.front || []).filter(p => pointIds.includes(p.id));
    const backPoints = (BODY_DATA.points.back || []).filter(p => pointIds.includes(p.id));

    if (frontPoints.length === 0 && backPoints.length === 0) return '';

    // Assign global indices for the glossary matches
    let globalIndex = 1;
    function assignIndex(p) { p._printIndex = globalIndex++; return p; }

    // We clone objects to avoid polluting the global BODY_DATA
    const frontPointsIndexed = frontPoints.map(p => ({ ...p })).map(assignIndex);
    const backPointsIndexed = backPoints.map(p => ({ ...p })).map(assignIndex);
    const allPointsIndexed = [...frontPointsIndexed, ...backPointsIndexed];

    return `
        <div class="glossary-section">
            <h2 style="text-align: center; margin-bottom: 40px;">Glossário de Pontos Focais</h2>
            
            <div style="display: flex; justify-content: center; gap: 40px;">
                ${frontPointsIndexed.length > 0 ? `
                <div class="map-container">
                    <p style="text-align: center; text-transform: uppercase; font-size: 10px; font-weight: bold; margin-bottom: 10px;">Frente</p>
                    <div style="position: relative;">
                        <img src="assets/images/mapa_corporal_1.jpg" style="width: 100%; opacity: 0.3;" />
                        <svg viewBox="0 0 100 100" style="position: absolute; top:0; left:0; width: 100%; height: 100%;">
                            ${frontPointsIndexed.map(p => `
                                <circle cx="${p.x}" cy="${p.y}" r="2.5" fill="black" />
                                <text x="${p.x}" y="${p.y + 1}" font-size="2.5" fill="white" text-anchor="middle" font-weight="bold">${p._printIndex}</text>
                            `).join('')}
                        </svg>
                    </div>
                </div>` : ''}

                ${backPointsIndexed.length > 0 ? `
                <div class="map-container">
                    <p style="text-align: center; text-transform: uppercase; font-size: 10px; font-weight: bold; margin-bottom: 10px;">Costas</p>
                    <div style="position: relative;">
                         <img src="assets/images/mapa_corporal_2.jpg" style="width: 100%; opacity: 0.3;" />
                         <svg viewBox="0 0 100 100" style="position: absolute; top:0; left:0; width: 100%; height: 100%;">
                            ${backPointsIndexed.map(p => `
                                <circle cx="${p.x}" cy="${p.y}" r="2.5" fill="black" />
                                <text x="${p.x}" y="${p.y + 1}" font-size="2.5" fill="white" text-anchor="middle" font-weight="bold">${p._printIndex}</text>
                            `).join('')}
                        </svg>
                    </div>
                </div>` : ''}
            </div>

            <div class="glossary-list">
                ${allPointsIndexed.map(p => `
                    <div class="glossary-item">
                        <strong><span style="display:inline-block; width: 20px; height: 20px; background:black; color:white; text-align:center; border-radius:50%; font-size:10px; line-height:20px; margin-right: 8px;">${p._printIndex}</span> ${p.name}</strong>
                        Indicado para tratamento localizado.
                    </div>
                `).join('')}
            </div>
        </div >
        `;
}

// Helper to show a simple toast notification
function showToast(msg) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = 'fixed bottom-8 right-8 bg-black text-white px-6 py-3 rounded-lg shadow-xl text-xs font-bold uppercase tracking-widest transform translate-y-20 opacity-0 transition-all duration-300 z-[100]';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 2000);
}

/**
 * Adds ALL currently visible items (in STATE.list) to the Apostila.
 */
function addAllVisibleToApostila() {
    if (!STATE.list || STATE.list.length === 0) {
        showToast('Nenhum item visível');
        return;
    }

    const currentApostila = STATE.apostilas[STATE.mode];
    // Check if ALL are present
    const allPresent = STATE.list.every(item => currentApostila.items.includes(item.id));

    if (allPresent) {
        // ACTION: Remove All visible items
        STATE.list.forEach(item => {
            const idx = currentApostila.items.indexOf(item.id);
            if (idx > -1) currentApostila.items.splice(idx, 1);
        });
        showToast(`${STATE.list.length} itens removidos da Apostila`);
    } else {
        // ACTION: Add missing items
        let addedCount = 0;
        STATE.list.forEach(item => {
            if (!currentApostila.items.includes(item.id)) {
                currentApostila.items.push(item.id);
                addedCount++;
            }
        });

        if (addedCount > 0) {
            if (currentApostila.items.length === addedCount) {
                // First time add, prompt logic kept
                setTimeout(() => {
                    const newTitle = prompt("Dê um nome para sua nova apostila:", currentApostila.title);
                    if (newTitle && newTitle.trim() !== "") {
                        currentApostila.title = newTitle;
                    }
                    renderTabs();
                }, 100);
            }
            showToast(`${addedCount} itens adicionados à Apostila`);
        } else {
            showToast('Todos os itens já estão na Apostila');
        }
    }

    renderTabs();
    applyFilters(); // Re-render to update UI (Button state)
}

/**
 * Clears ALL items from the current Apostila.
 */
function clearApostila() {
    if (!confirm('Tem certeza que deseja limpar toda a apostila?')) return;

    const currentApostila = STATE.apostilas[STATE.mode];
    currentApostila.items = [];
    currentApostila.title = "Minha Apostila"; // Reset title? Optional. Let's keep title or reset? User asked to "Delete Apostila", implies reset.

    showToast('Apostila limpa');
    renderTabs();
    if (STATE.activeTab === 'apostila') {
        renderApostilaView();
    }
}

/**
 * Sets the font size for the print view.
 * @param {string|number} size - numeric value or old string values (migration handled)
 */
function setPrintFontSize(size) {
    STATE.printFontSize = parseInt(size);
    // Update live display
    const label = document.getElementById('fontSizeDisplay');
    if (label) label.textContent = `${STATE.printFontSize}px`;
}
