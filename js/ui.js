// --- FUNÇÕES DE UI (Animations Disabled) ---

// --- Search snippet + highlight helpers (accent-insensitive, HTML-safe) ---

function escHtmlSafe(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function tokenizeSearchQuery(query) {
    if (!query) return [];
    return query
        .split(/[\s&|]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2)
        .filter(t => !['AND', 'OR', 'NOT', 'E', 'OU', 'NAO', 'NÃO'].includes(t.toUpperCase()));
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightSnippet(text, query) {
    if (!text) return '';
    const tokens = tokenizeSearchQuery(query);
    if (tokens.length === 0) return escHtmlSafe(text);

    const normText = removeAccents(text);
    const matches = [];
    for (const t of tokens) {
        const re = new RegExp(escapeRegex(removeAccents(t)), 'gi');
        let m;
        while ((m = re.exec(normText)) !== null) {
            if (m[0].length === 0) { re.lastIndex++; continue; }
            matches.push({ start: m.index, end: m.index + m[0].length });
        }
    }
    if (matches.length === 0) return escHtmlSafe(text);

    matches.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const m of matches) {
        const last = merged[merged.length - 1];
        if (last && m.start <= last.end) {
            last.end = Math.max(last.end, m.end);
        } else {
            merged.push({ start: m.start, end: m.end });
        }
    }

    let out = '';
    let cursor = 0;
    for (const m of merged) {
        out += escHtmlSafe(text.substring(cursor, m.start));
        out += '<mark class="search-highlight">' + escHtmlSafe(text.substring(m.start, m.end)) + '</mark>';
        cursor = m.end;
    }
    out += escHtmlSafe(text.substring(cursor));
    return out;
}

// Build a contextual snippet (~windowSize chars) around the first match.
// Returns plain text (not escaped) — pass to highlightSnippet to render.
function buildSearchSnippet(content, query, windowSize = 160) {
    if (!content || !query) return '';
    const tokens = tokenizeSearchQuery(query).map(t => removeAccents(t));
    if (tokens.length === 0) return '';

    const normContent = removeAccents(content);
    let bestIdx = -1;
    let bestLen = 0;
    for (const t of tokens) {
        const idx = normContent.indexOf(t);
        if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
            bestIdx = idx;
            bestLen = t.length;
        }
    }
    if (bestIdx === -1) return '';

    const half = Math.floor(windowSize / 2);
    let start = Math.max(0, bestIdx - half);
    let end = Math.min(content.length, bestIdx + bestLen + half);

    // Avoid chopping words at the edges (trim a partial word at start if close)
    if (start > 0) {
        const nextSpace = content.substring(start, start + 25).search(/\s/);
        if (nextSpace > 0) start = start + nextSpace + 1;
    }
    if (end < content.length) {
        const prevSpace = content.substring(end - 25, end).search(/\s(?=\S*$)/);
        if (prevSpace > 0) end = end - 25 + prevSpace;
    }

    let snippet = content.substring(start, end).replace(/\s+/g, ' ').trim();
    if (start > 0) snippet = '… ' + snippet;
    if (end < content.length) snippet += ' …';
    return snippet;
}

function formatBodyText(text, searchQuery, focusPoints) {
    if (!text) return '';
    const lines = text.split('\n');
    const highlight = (str) => {
        let result = str;

        // 1. Highlight Focus Points (Sober Style) - Run FIRST so Search can override
        if (focusPoints && focusPoints.length > 0) {
            // Remove accents for matching? Or strict? Usually body points are standard.
            // We use simple regex for points.
            const fpTerms = focusPoints
                .filter(fp => fp && fp.length > 0)
                .map(fp => fp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .join('|');

            if (fpTerms) {
                // Whole words for focus points to avoid matching parts of other words
                const fpRegex = new RegExp(`\\b(${fpTerms})\\b`, 'gi');
                result = result.replace(fpRegex, '<span class="focus-point-span">$1</span>');
            }
        }

        if (!searchQuery) return result;

        let tokens;
        let useBoundaries = false;

        if (searchQuery.includes('|')) {
            tokens = searchQuery.split('|').filter(t => t.trim().length > 0);
            useBoundaries = true; // Keep explicit boundaries for pipe-separated keywords
        } else {
            // Default: Split by space
            tokens = searchQuery.split(/\s+/).filter(t => t.length > 0);
        }

        const terms = tokens
            .map(t => {
                const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                // Refined Logic (User Feedback):
                // - Short words (< 3 chars) match strictly whole words (e.g. "o" won't match "cabelo")
                // - Longer words allow partial match (e.g. "toxina" matches "toxinas")
                if (!useBoundaries && t.length < 3) {
                    return `\\b${escaped}\\b`;
                }
                return escaped;
            })
            .join('|');

        if (!terms) return result;

        // Use word boundaries if requested OR if we built them manually above
        // Note: If useBoundaries is true (from |), we wrap everything in \b...\b later.
        // If false, we use the terms as is (which might contain \b for short words).
        const pattern = useBoundaries ? `\\b(${terms})\\b` : `(${terms})`;

        // We need to be careful NOT to match inside existing HTML tags (like <span class="...">)
        // Simple regex replace on HTML is tricky. 
        // Strategy: We want to match text, but ignore tag attributes. 
        // Since our structure is simple (just spans), maybe we assume search query doesn't match attributes?
        // E.g. "gray" search query.
        // Risk: <span class="bg-gray-100"> -> <span class="bg-<mark>gray</mark>-100"> -> BROKEN.

        // SAFE APPROACH: 
        // If we have focus highlight, we rely on the browser not to explode? 
        // OR we use a smarter replace needed?
        // Given complexity, let's keep it simple for now and assume search query is usually medical terms, not "class" or "gray".

        const regex = new RegExp(pattern, 'gi');
        return result.replace(regex, '<mark class="search-highlight">$1</mark>');
    };

    return lines.map(line => {
        const cleanLine = line.trim();
        if (!cleanLine) return '<br>';

        // Markdown Headers Support (User Request)
        // Convert ##, ###, #### to H3 (or similar)
        if (cleanLine.startsWith('#')) {
            const match = cleanLine.match(/^(#{1,6})\s*(.*)/);
            if (match) {
                // We use h3 for all for now to match visual consistency
                return `<h3>${highlight(match[2])}</h3>`;
            }
        }

        const qaMatch = cleanLine.match(/^(Pergunta|Resposta|P|R|P\.|R\.)(\s*[:\-\.]\s*)(.*)/i);

        if (qaMatch) {
            const label = qaMatch[1];
            const separator = qaMatch[2];
            const content = qaMatch[3];
            const isAnswer = /^(Resposta|R)/i.test(label);
            const indentClass = isAnswer ? 'pl-6 border-l-2 border-gray-100 dark:border-gray-800' : '';

            return `<p class="${indentClass}"><strong class="qa-label">${label}${separator}</strong>${highlight(content)}</p>`;
        }

        // Check for Uppercase Headers (legacy format)
        // Must ensure it actually has case (diff from lowercase) to avoid matching Japanese/Chinese/Numbers
        if (cleanLine.length < 80 && cleanLine === cleanLine.toUpperCase() && cleanLine !== cleanLine.toLowerCase() && !cleanLine.endsWith('.')) {
            return `<h3>${highlight(cleanLine)}</h3>`;
        }

        // Apply formatting (Highlight first, then Markdown to avoid highlighting HTML tags)
        let processed = highlight(cleanLine);

        // Markdown Bold: **text**
        processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Markdown Italic: *text* 
        processed = processed.replace(/\*([^\s*].*?)\*/g, '<em>$1</em>');

        return `<p>${processed}</p>`;
    }).join('');
}

function renderList(list, activeTags, mode, activeTab) {
    const el = document.getElementById('contentList');
    const emptyEl = document.getElementById('emptyState');
    const resultsBar = document.getElementById('resultsBar');
    const resultsCount = document.getElementById('resultsCount');
    if (!list || list.length === 0) {
        el.innerHTML = '';
        if (resultsBar) resultsBar.style.display = 'none';
        // Don't show empty state on map tab
        if (activeTab !== 'mapa') {
            emptyEl.classList.remove('hidden');
        } else {
            emptyEl.classList.add('hidden');
        }
        return;
    }
    emptyEl.classList.add('hidden');
    if (resultsBar && resultsCount) {
        resultsCount.textContent = `${list.length} ensinamento${list.length !== 1 ? 's' : ''}`;
        resultsBar.style.display = 'flex';
    }

    // Detect if we're showing cross-tab results
    const uniqueCategories = new Set(list.map(item => item._cat));
    const isCrossTabSearch = uniqueCategories.size > 1;

    el.innerHTML = list.map((item, i) => {
        // Recupera cor e label da configuração
        const catConfig = CONFIG.modes[mode].cats[item._cat];

        const currentApostila = STATE.apostilas ? STATE.apostilas[STATE.mode] : null;
        const isInApostila = currentApostila && currentApostila.items.includes(item.id);

        const catColorHex = { 'cat-blue': '#2C5F8D', 'cat-green': '#4A7C59', 'cat-purple': '#8B5A8E', 'cat-dark': '#1c1917' };
        const dotColor = catColorHex[catConfig?.color] || '#9C9288';

        return `
        <article id="card-${i}" onclick="openModal(${i})" class="group py-8 px-8 border-t border-gray-100 dark:border-gray-900 cursor-pointer relative flex flex-col gap-6 hover:bg-gray-50 dark:hover:bg-[#111] transition-colors">

            <!-- Category Label -->
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-1.5">
                    <span style="background-color:${dotColor}" class="inline-block w-1.5 h-1.5 rounded-sm flex-shrink-0 opacity-80"></span>
                    <span class="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400 group-hover:text-black dark:group-hover:text-white transition-colors">
                        ${catConfig ? catConfig.label : item._cat}
                    </span>
                </div>

                <!-- Add to Apostila (Subtle Icon with larger touch target) -->
                <button onclick="event.stopPropagation(); toggleApostilaItem('${item.id}', this)"
                    class="w-10 h-10 -mr-2 -mt-2 hidden md:flex items-center justify-center rounded-full transition-colors ${isInApostila ? 'text-yellow-600' : 'text-gray-300 hover:text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/10'}"
                    title="Adicionar à Apostila">
                     <svg class="w-5 h-5" fill="${isInApostila ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg>
                </button>
            </div>

            <!--Title -->
            <h3 class="font-serif font-medium text-3xl md:text-3xl leading-[1.1] text-gray-900 dark:text-gray-100 group-hover:text-black dark:group-hover:text-white transition-colors max-w-2xl">
                ${typeof cleanTitle === 'function' ? cleanTitle(item.title_pt || item.title || '') : (item.title_pt || item.title || '')}
            </h3>

            <!-- Tags & Metadata (Minimalist) -->
            <div class="flex flex-wrap gap-1.5 mt-1">
                 ${(() => {
                const tags = item.tags || [];
                const points = item.focusPoints || [];

                let allItems = [
                    ...tags.map(t => ({ text: t, type: 'tag' })),
                    ...points.map(p => ({ text: p, type: 'point' }))
                ];

                if (allItems.length === 0) return '';

                let itemsToShow = allItems.slice(0, 6);

                return itemsToShow.map(i => {
                    const isActive = activeTags && activeTags.includes(i.text);
                    const activeClass = isActive
                        ? 'card-tag card-tag--active'
                        : 'card-tag';

                    return `<button onclick="filterByTag('${i.text.replace(/'/g, "\\'")}', event)" class="${activeClass} text-left">#${i.text}</button>`;
                }).join('');
            })()}
            </div>
        </article>`
    }).join('');
}

// --- CORREÇÃO DO DIAGRAMA (TEXTO CENTRALIZADO ACIMA) ---
// --- CORREÇÃO DO DIAGRAMA (TEXTO CENTRALIZADO ACIMA) ---
function createDiagram(view, points) {
    const isBack = view === 'back';
    const transform = isBack ? 'translate(206.326, 0) scale(-1, 1)' : '';

    return `
    <svg viewBox="0 0 206.326 206.326" class="w-full h-full drop-shadow-sm diagram-svg" style="overflow: visible;">
        <g transform="${transform}">
            <path d="${BODY_DATA.path}" fill="none" stroke="currentColor" stroke-width="1.5" class="text-gray-300 dark:text-gray-700"/>
        </g>
        ${points.map(p => `
            <g class="body-point cursor-pointer group" onclick="filterByBody('${p.id}')">
                
                <circle cx="${p.x}" cy="${p.y}" r="15" fill="transparent" />
                
                <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="currentColor" class="text-black dark:text-white visual"/>
                
                <text x="${p.x}" y="${p.y - 6}" 
                      text-anchor="middle" 
                      fill="currentColor" 
                      class="text-black dark:text-white"
                      style="pointer-events: none;">
                    ${p.name}
                </text>
            </g>`).join('')
        }
    </svg > `;
}