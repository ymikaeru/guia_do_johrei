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

// ── Estudo Aprofundado Q&A formatting ─────────────────────────────────────
// Pure: splits an article's content into header / question / answer sections
// using the markers "Pergunta do Fiel" and "Resposta de Meishu-Sama".
// Returns { isQA, header, question, answer } — isQA=false means no markers.
function parseEstudoSections(content) {
    if (!content) return { isQA: false, header: '', question: '', answer: '' };
    const PERGUNTA = /Pergunta\s+do\s+Fiel/i;
    // "Resposta" is the most common, "Orientação" appears in ~160 articles —
    // both mean Meishu-Sama's answer. Negative lookahead `(?!:)` excludes the
    // article header form ("Orientação de Meishu-Sama: \"[title]\"") which
    // shares the same prefix but is not a response separator.
    const RESPOSTA = /(?:Resposta|Orientação)\s+de\s+Meishu-Sama(?!:)/i;

    const pMatch = content.match(PERGUNTA);
    const rMatch = content.match(RESPOSTA);

    if (!pMatch && !rMatch) {
        return { isQA: false, header: content, question: '', answer: '' };
    }

    let header = '';
    let question = '';
    let answer = '';

    if (pMatch && rMatch && rMatch.index > pMatch.index) {
        header = content.slice(0, pMatch.index).trim();
        question = content.slice(pMatch.index + pMatch[0].length, rMatch.index).trim();
        answer = content.slice(rMatch.index + rMatch[0].length).trim();
    } else if (pMatch && !rMatch) {
        header = content.slice(0, pMatch.index).trim();
        question = content.slice(pMatch.index + pMatch[0].length).trim();
    } else if (rMatch && !pMatch) {
        header = content.slice(0, rMatch.index).trim();
        answer = content.slice(rMatch.index + rMatch[0].length).trim();
    } else {
        return { isQA: false, header: content, question: '', answer: '' };
    }

    return { isQA: true, header, question, answer };
}

// Wrapper: detects Q&A markers and renders sections, otherwise delegates
// to formatBodyText. Reuses formatBodyText inside each section so search
// highlight, focus points, markdown bold/italic, and headers all work.
function formatEstudoBody(text, searchQuery, focusPoints) {
    const sections = parseEstudoSections(text);
    if (!sections.isQA) {
        return formatBodyText(text, searchQuery, focusPoints);
    }

    const headerHtml = sections.header
        ? `<div class="estudo-header">${formatBodyText(sections.header, searchQuery, focusPoints)}</div>`
        : '';
    const questionHtml = sections.question
        ? `<div class="estudo-section estudo-pergunta">
                <span class="estudo-section-label">Pergunta do Fiel</span>
                ${formatBodyText(sections.question, searchQuery, focusPoints)}
           </div>`
        : '';
    const answerHtml = sections.answer
        ? `<div class="estudo-section estudo-resposta">
                <span class="estudo-section-label">Meishu-Sama</span>
                ${formatBodyText(sections.answer, searchQuery, focusPoints)}
           </div>`
        : '';

    return headerHtml + questionHtml + answerHtml;
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
        const catColor = catColorHex[catConfig?.color] || 'var(--n-muted)';

        const allTags = [...(item.tags || []), ...(item.focusPoints || [])].slice(0, 6);
        const tagsHtml = allTags.length === 0 ? '' :
            `<div class="ci-tags">${allTags.map((t, idx) =>
                (idx > 0 ? '<span class="ci-dot" aria-hidden="true">·</span>' : '') +
                `<button onclick="filterByTag('${t.replace(/'/g, "\\'")}', event)" class="ci-tag${activeTags && activeTags.includes(t) ? ' is-active' : ''}">${t}</button>`
            ).join('')}</div>`;

        return `
        <article id="card-${i}" onclick="openModal(${i})" class="card-item cursor-pointer group">
            <div class="ci-header">
                <span class="ci-cat" style="color:${catColor}">${catConfig ? catConfig.label : item._cat}</span>
                <div class="ci-actions">
                    <button onclick="event.stopPropagation(); toggleApostilaItem('${item.id}', this)"
                        class="ci-save${isInApostila ? ' text-yellow-600' : ''}"
                        title="Adicionar à Apostila" aria-label="Adicionar à Apostila">
                        <svg width="14" height="14" fill="${isInApostila ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                    </button>
                    <span class="ci-arrow" aria-hidden="true">›</span>
                </div>
            </div>
            <h3 class="ci-title font-serif">${typeof cleanTitle === 'function' ? cleanTitle(item.title_pt || item.title || '') : (item.title_pt || item.title || '')}</h3>
            ${tagsHtml}
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