// ============================================================
// SEARCH MODAL — full-screen dedicated search UI
// Inspired by caminho_da_felicidade/js/search.js.
// Replaces the old inline card-filter search + autocomplete dropdown.
// ============================================================

const RESULTS_PER_PAGE = 10;
const MAX_RESULTS = 50;
let _searchDebounce = null;
let _searchAllResults = [];
let _searchDisplayedCount = 0;
let _searchCurrentQuery = '';
let _searchFocusedIndex = -1;

function _buildSearchModalDom() {
    if (document.getElementById('searchModal')) return;
    const modal = document.createElement('div');
    modal.id = 'searchModal';
    modal.className = 'search-modal-overlay';
    modal.innerHTML = `
        <div class="search-modal" role="dialog" aria-label="Buscar nos ensinamentos">
            <button class="search-close" id="searchCloseBtn" aria-label="Fechar busca">&times;</button>
            <div class="search-header">
                <input type="text" class="search-modal-input" id="searchModalInput"
                    placeholder="Buscar nos ensinamentos..."
                    autocomplete="off" inputmode="search" enterkeyhint="search">
                <div class="search-filters">
                    <label class="filter-label"><input type="radio" name="searchFilter" value="all" checked><span>Tudo</span></label>
                    <label class="filter-label"><input type="radio" name="searchFilter" value="title"><span>Título</span></label>
                    <label class="filter-label"><input type="radio" name="searchFilter" value="content"><span>Conteúdo</span></label>
                    <label class="filter-label filter-exact" title="Busca apenas palavras inteiras">
                        <input type="checkbox" id="searchExactToggle"><span>Exata</span>
                    </label>
                </div>
            </div>
            <div id="searchCount" class="search-modal-count"></div>
            <ul class="search-results" id="searchResults"></ul>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('searchCloseBtn').addEventListener('click', closeSearch);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeSearch(); });

    const input = document.getElementById('searchModalInput');
    input.addEventListener('input', _onSearchInput);
    input.addEventListener('keydown', _onSearchKeydown);

    document.querySelectorAll('input[name="searchFilter"]').forEach(r => {
        r.addEventListener('change', () => {
            if (_searchCurrentQuery) performSearch(_searchCurrentQuery);
        });
    });

    const exactToggle = document.getElementById('searchExactToggle');
    exactToggle.checked = localStorage.getItem('search_exact') === 'true';
    exactToggle.addEventListener('change', () => {
        try { localStorage.setItem('search_exact', exactToggle.checked); } catch (e) { }
        if (_searchCurrentQuery) performSearch(_searchCurrentQuery);
    });

    // Event delegation for result clicks (XSS-safe — no inline handlers)
    document.getElementById('searchResults').addEventListener('click', (e) => {
        const el = e.target.closest('.search-result-item');
        if (!el) return;
        e.preventDefault();
        const itemId = el.dataset.itemId;
        const item = STATE.globalData && STATE.globalData[itemId];
        if (item && typeof openSearchPreview === 'function') {
            openSearchPreview(item, _searchCurrentQuery);
        }
    });
}

function _onSearchInput(e) {
    const query = e.target.value;
    clearTimeout(_searchDebounce);
    const delay = query.trim().length <= 3 ? 250 : 150;
    _searchDebounce = setTimeout(() => performSearch(query), delay);
}

function _onSearchKeydown(e) {
    const items = document.querySelectorAll('#searchResults .search-result-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _searchFocusedIndex = Math.min(_searchFocusedIndex + 1, items.length - 1);
        _updateFocused(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _searchFocusedIndex = Math.max(_searchFocusedIndex - 1, -1);
        _updateFocused(items);
    } else if (e.key === 'Enter' && _searchFocusedIndex >= 0) {
        e.preventDefault();
        items[_searchFocusedIndex]?.click();
    }
}

function _updateFocused(items) {
    items.forEach((it, i) => it.classList.toggle('is-focused', i === _searchFocusedIndex));
    if (_searchFocusedIndex >= 0) {
        items[_searchFocusedIndex]?.scrollIntoView({ block: 'nearest' });
    }
}

function openSearch() {
    _buildSearchModalDom();
    const modal = document.getElementById('searchModal');
    const input = document.getElementById('searchModalInput');
    if (!modal || !input) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input.focus(), 50);
}
window.openSearch = openSearch;

function closeSearch() {
    const modal = document.getElementById('searchModal');
    if (!modal) return;
    modal.classList.remove('active');
    // Only release body scroll if no other modal is open
    const preview = document.getElementById('searchPreviewOverlay');
    const reader = document.getElementById('readModal');
    const previewOpen = preview && !preview.classList.contains('hidden');
    const readerOpen = reader && !reader.classList.contains('hidden');
    if (!previewOpen && !readerOpen) {
        document.body.style.overflow = '';
    }
}
window.closeSearch = closeSearch;

function _getFilterMode() {
    const checked = document.querySelector('input[name="searchFilter"]:checked');
    return checked ? checked.value : 'all';
}

// tokens/regexes are prebuilt once per search and reused across items
function _matchesItem(item, tokens, regexes, filterMode) {
    const titleNorm = removeAccents(item.title_pt || item.title || '');
    const contentNorm = removeAccents(item.content_pt || item.content || '');
    const tagsNorm = (item.tags || []).map(t => removeAccents(String(t))).join(' ');
    const fpNorm = (item.focusPoints || []).map(p => removeAccents(String(p))).join(' ');
    const titleAndTags = `${titleNorm} ${tagsNorm} ${fpNorm}`;

    let score = 0;
    let hitTitle = false;
    let hitContent = false;

    for (let i = 0; i < regexes.length; i++) {
        const re = regexes[i];
        const inTitle = re.test(titleAndTags);
        const inContent = re.test(contentNorm);
        if (!inTitle && !inContent) return null;

        if (inTitle) {
            hitTitle = true;
            score += 120;
            if (titleNorm.startsWith(tokens[i])) score += 50;
        }
        if (inContent) {
            hitContent = true;
            score += 10;
        }
    }

    if (filterMode === 'title' && !hitTitle) return null;
    if (filterMode === 'content' && !hitContent) return null;
    return { score, hitContent };
}

function performSearch(query) {
    const resultsEl = document.getElementById('searchResults');
    const countEl = document.getElementById('searchCount');
    const trimmed = (query || '').trim();

    _searchCurrentQuery = trimmed;
    _searchFocusedIndex = -1;

    if (trimmed.length < 2) {
        if (resultsEl) {
            resultsEl.innerHTML = trimmed.length === 0
                ? ''
                : '<li class="search-empty">Digite pelo menos 2 caracteres…</li>';
        }
        if (countEl) countEl.textContent = '';
        _searchAllResults = [];
        _searchDisplayedCount = 0;
        return;
    }

    if (!STATE.globalData) {
        if (resultsEl) resultsEl.innerHTML = '<li class="search-empty">Carregando ensinamentos…</li>';
        return;
    }

    const filterMode = _getFilterMode();
    const exactToggle = document.getElementById('searchExactToggle');
    const useExact = exactToggle ? exactToggle.checked : false;

    const tokens = tokenizeSearchQuery(trimmed).map(t => removeAccents(t));
    if (tokens.length === 0) {
        _renderResults([], trimmed);
        return;
    }
    const regexes = tokens.map(t => {
        const esc = escapeRegex(t);
        return useExact ? new RegExp(`\\b${esc}\\b`, 'i') : new RegExp(esc, 'i');
    });

    const items = Object.values(STATE.globalData);
    const scored = [];
    for (const item of items) {
        const res = _matchesItem(item, tokens, regexes, filterMode);
        if (res) scored.push({ item, score: res.score, hitContent: res.hitContent });
    }
    scored.sort((a, b) => b.score - a.score);

    // Deduplicate by title to avoid near-identical duplicates
    const seen = new Set();
    const deduped = scored.filter(r => {
        const key = `${r.item._cat}:${(r.item.title_pt || r.item.title || '').toLowerCase().trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const hitLimit = deduped.length > MAX_RESULTS;
    const limited = deduped.slice(0, MAX_RESULTS);

    _searchAllResults = limited;
    _searchDisplayedCount = Math.min(RESULTS_PER_PAGE, limited.length);

    _renderResults(limited, trimmed, useExact, hitLimit);

    if (typeof SearchHistory !== 'undefined' && trimmed.length >= 3) {
        SearchHistory.addSearch(trimmed);
    }
}
window.performSearch = performSearch;

function _renderResults(results, query, useExact = false, hitLimit = false) {
    const resultsEl = document.getElementById('searchResults');
    const countEl = document.getElementById('searchCount');
    if (!resultsEl) return;

    if (!results.length) {
        if (query) {
            resultsEl.innerHTML = '<li class="search-empty">Nenhum resultado encontrado.</li>';
        } else {
            resultsEl.innerHTML = '';
        }
        if (countEl) countEl.textContent = '';
        return;
    }

    const visible = results.slice(0, _searchDisplayedCount);
    const remaining = results.length - _searchDisplayedCount;

    const html = visible.map(r => _renderResultItem(r.item, query, useExact)).join('');
    const loadMore = remaining > 0
        ? `<li class="search-load-more">
             <button class="btn-load-more" id="btnLoadMore">Carregar mais ${Math.min(RESULTS_PER_PAGE, remaining)} resultados</button>
             <span class="load-more-hint">(${remaining} restantes)</span>
           </li>`
        : '';
    resultsEl.innerHTML = html + loadMore;

    const btnMore = document.getElementById('btnLoadMore');
    if (btnMore) btnMore.addEventListener('click', _loadMore);

    if (countEl) {
        const total = results.length;
        const shown = _searchDisplayedCount;
        let text = `Exibindo ${shown} de ${total} resultado${total !== 1 ? 's' : ''}`;
        if (hitLimit) text += ' — refine a busca para resultados mais precisos';
        countEl.textContent = text;
    }
}

function _loadMore() {
    if (!_searchAllResults.length) return;
    _searchDisplayedCount = Math.min(_searchDisplayedCount + RESULTS_PER_PAGE, _searchAllResults.length);
    _searchFocusedIndex = -1;
    const exactToggle = document.getElementById('searchExactToggle');
    const useExact = exactToggle ? exactToggle.checked : false;
    _renderResults(_searchAllResults, _searchCurrentQuery, useExact);
}

function _renderResultItem(item, query, useExact) {
    const catConfig = CONFIG.modes[STATE.mode].cats[item._cat];
    const catLabel = catConfig ? catConfig.label : (item._cat || '');

    const rawTitle = item.title_pt || item.title || '';
    const displayTitle = typeof cleanTitle === 'function' ? cleanTitle(rawTitle) : rawTitle;
    const titleHtml = query
        ? highlightSnippet(displayTitle, query)
        : escHtmlSafe(displayTitle);

    const content = item.content_pt || item.content || '';
    const snippetText = buildSearchSnippet(content, query, 140);
    const snippetHtml = snippetText ? highlightSnippet(snippetText, query) : '';

    return `
        <li>
            <a class="search-result-item" href="#" data-item-id="${escHtmlSafe(item.id)}">
                <div class="search-result-title">${titleHtml}</div>
                ${snippetHtml ? `<div class="search-result-context">${snippetHtml}</div>` : ''}
                ${catLabel ? `<div class="search-result-meta">${escHtmlSafe(catLabel)}</div>` : ''}
            </a>
        </li>
    `;
}

// Global keyboard shortcuts: Ctrl+K / Cmd+K / '/' opens; Escape closes
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openSearch();
        return;
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        const editable = document.activeElement?.isContentEditable;
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !editable) {
            e.preventDefault();
            openSearch();
            return;
        }
    }
    if (e.key === 'Escape') {
        const modal = document.getElementById('searchModal');
        if (modal && modal.classList.contains('active')) {
            // Let preview escape handler win if preview is open
            const preview = document.getElementById('searchPreviewOverlay');
            const previewOpen = preview && !preview.classList.contains('hidden');
            if (!previewOpen) {
                closeSearch();
            }
        }
    }
});

function setupSearchModal() {
    _buildSearchModalDom();

    // Convert page-level .search-input elements into triggers that open the
    // modal. Skip inputs that live inside the search modal itself.
    document.querySelectorAll('.search-input').forEach(input => {
        if (input.closest('#searchModal')) return;
        input.setAttribute('readonly', 'readonly');
        input.style.cursor = 'pointer';
        const trigger = (e) => {
            e.preventDefault();
            openSearch();
            input.blur();
        };
        input.addEventListener('click', trigger);
        input.addEventListener('focus', trigger);
    });
}
window.setupSearchModal = setupSearchModal;
