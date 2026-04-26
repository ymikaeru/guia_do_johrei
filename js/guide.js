// ── Guia de Atendimento — integração com o mapa corporal ──────────────────
// Usa a barra lateral existente para listar condições (88 verificadas).
// Ao selecionar uma condição:
//   1. Ilumina os pontos vitais no diagrama do corpo
//   2. Mostra a citação de Meishu-Sama
//   3. Filtra os ensinamentos relacionados abaixo do mapa

let GUIA = null;
let guiaConditions = [];
let activeConditionKey = null;
let SYNONYMS_PT = null;

async function loadGuia() {
    if (GUIA) return GUIA;
    try {
        const res = await fetch('data/guia_atendimento.json?t=' + Date.now());
        GUIA = await res.json();
        guiaConditions = Object.values(GUIA).sort((a, b) =>
            a.label.localeCompare(b.label, 'pt'));
        return GUIA;
    } catch (e) {
        console.warn('Guia de atendimento não carregado:', e);
        return null;
    }
}

async function loadSynonyms() {
    if (SYNONYMS_PT) return SYNONYMS_PT;
    try {
        const res = await fetch('data/synonyms_pt.json?t=' + Date.now());
        const raw = await res.json();
        SYNONYMS_PT = {};
        for (const [k, v] of Object.entries(raw)) {
            if (k.startsWith('_')) continue;
            SYNONYMS_PT[k] = v;
        }
    } catch (e) {
        console.warn('Sinônimos PT não carregados:', e);
        SYNONYMS_PT = {};
    }
    return SYNONYMS_PT;
}

// Lookup: takes a normalized query, returns { synonym, canonical } or null.
// Uses bidirectional substring match so partial typing works ("tont" finds
// "tontura" → "vertigem"). Min length 3 prevents premature matches like
// "av" → "avc". Stops at first hit, which is fine because the dictionary
// is small and curated 1:1.
function resolveSynonym(qNorm) {
    if (!SYNONYMS_PT || !qNorm || qNorm.length < 3) return null;
    for (const [syn, canonical] of Object.entries(SYNONYMS_PT)) {
        if (syn.includes(qNorm) || qNorm.includes(syn)) {
            return { synonym: syn, canonical };
        }
    }
    return null;
}

// ── Generate condition list HTML for sidebar ───────────────────────────────
window.generateConditionOptions = function(filter) {
    if (!guiaConditions.length) {
        // Return placeholder; will be updated after async load
        loadGuia().then(() => {
            const sidebar = document.getElementById('bodyPointSidebarList');
            const modal   = document.getElementById('filterModalList');
            const html = window.generateConditionOptions();
            if (sidebar) sidebar.innerHTML = `
                <div class="px-5 py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 transition-all text-gray-400 hover:bg-gray-50 hover:text-black" onclick="clearConditionGuide()">— Todas as condições —</div>
                ${html}`;
            if (modal) modal.innerHTML = `
                <div class="px-6 py-4 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 transition-all text-gray-400 hover:text-black" onclick="clearConditionGuide();closeBodyFilterModal()">— Todas as condições —</div>
                ${html}`;
        });
        return '<div class="px-5 py-4 text-[10px] text-gray-400 text-center">Carregando...</div>';
    }

    const q = normalize(filter);
    const synHit = q ? resolveSynonym(q) : null;
    const synCanonical = synHit ? normalize(synHit.canonical) : null;

    const list = q
        ? guiaConditions.filter(c => {
            const ln = normalize(c.label);
            return ln.includes(q) || (synCanonical && ln.includes(synCanonical));
        })
        : guiaConditions;

    if (q && list.length === 0) {
        const safeQ = escHtml(filter || '');
        return `<div class="px-5 py-8 text-center text-[11px] text-gray-400">
            Nenhuma condição para «${safeQ}»
            <button onclick="['guiaSidebarSearch','guiaModalSearch'].forEach(id=>{var el=document.getElementById(id);if(el)el.value='';});filterGuiaSidebar('')"
                class="block mx-auto mt-2 text-[10px] underline cursor-pointer">
                limpar busca
            </button>
        </div>`;
    }

    // Synonym hint: when the user typed lay terminology, surface the canonical
    // doctrinal term so the ministrant learns Meishu-Sama's vocabulary.
    const synHintHtml = synHit ? `
        <div style="padding:9px 20px;background:rgba(184,134,11,.07);
            border-bottom:1px solid rgba(184,134,11,.25);
            font-size:10.5px;color:#7a5500;line-height:1.45">
            Mostrando <b style="text-transform:uppercase;letter-spacing:.04em">${escHtml(synHit.canonical)}</b>
            <span style="opacity:.75">· você digitou "${escHtml(synHit.synonym)}"</span>
        </div>` : '';

    return synHintHtml + list.map(c => {
        const isActive = c.key === activeConditionKey;
        return `<div class="px-5 py-3 cursor-pointer text-[11px] border-b border-gray-100 dark:border-gray-800 last:border-0 transition-all
            ${isActive
                ? 'bg-black text-white dark:bg-white dark:text-black font-bold'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1a1a] hover:text-black dark:hover:text-white'}"
            onclick="selectConditionGuide('${escapeAttr(c.key)}');${isActive ? '' : ''}">
            ${escHtml(c.label)}
            <span class="text-[9px] ml-1 opacity-60">${c.focal_points.length}pts</span>
        </div>`;
    }).join('');
};

// ── Live search filter in sidebar ──────────────────────────────────────────
window.filterGuiaSidebar = function(q) {
    const list = document.getElementById('bodyPointSidebarList');
    const mlist = document.getElementById('filterModalList');
    const html = window.generateConditionOptions(q);
    const prefix = `<div class="px-5 py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 transition-all text-gray-400 hover:bg-gray-50 hover:text-black" onclick="clearConditionGuide()">— Todas as condições —</div>`;
    if (list) list.innerHTML = prefix + html;
    if (mlist) mlist.innerHTML = prefix + html;
};

// ── Determine which body-map views contain at least one of these point ids ─
// Returns ordered subset of ['front', 'detail', 'back']. Empty mapPoints →
// all views (so the user can still navigate freely).
function viewsWithFocalPoints(mapPoints) {
    if (!mapPoints || !mapPoints.length || typeof BODY_DATA === 'undefined') {
        return ['front', 'detail', 'back'];
    }
    const ids = {
        front: new Set(BODY_DATA.points.front.map(p => p.id)),
        detail: new Set(BODY_DATA.points.detail.map(p => p.id)),
        back: new Set(BODY_DATA.points.back.map(p => p.id))
    };
    const present = new Set();
    mapPoints.forEach(id => {
        if (ids.front.has(id)) present.add('front');
        if (ids.detail.has(id)) present.add('detail');
        if (ids.back.has(id)) present.add('back');
    });
    const ordered = ['front', 'detail', 'back'].filter(v => present.has(v));
    return ordered.length ? ordered : ['front', 'detail', 'back'];
}

// ── Mobile-only: hide tab buttons whose view has no focal point ───────────
// Tablet/desktop are intentionally untouched: the three maps always show
// side-by-side (tabs are `min-[768px]:hidden` already, so toggling them
// here has no visual effect above 768px).
function applyViewFilter(visibleViews) {
    ['front', 'detail', 'back'].forEach(id => {
        const tab = document.getElementById(`tab-${id}`);
        if (tab) tab.classList.toggle('hidden', !visibleViews.includes(id));
    });

    // Auto-switch on mobile if current view has no focal point
    if (window.innerWidth < 768 && visibleViews.length) {
        const current = STATE.currentMobileView || 'front';
        if (!visibleViews.includes(current)
            && typeof switchMobileView === 'function') {
            switchMobileView(visibleViews[0]);
        }
    }
}

// ── Select a condition ─────────────────────────────────────────────────────
window.selectConditionGuide = function(key) {
    if (!GUIA || !GUIA[key]) return;
    const cond = GUIA[key];
    activeConditionKey = key;

    // 1. Refresh sidebar — show conditions list normally; the active item
    //    will be visually highlighted by generateConditionOptions (isActive).
    const sidebar = document.getElementById('bodyPointSidebarList');
    if (sidebar) {
        sidebar.innerHTML = `
            <div class="px-5 py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 transition-all text-gray-400 hover:bg-gray-50 hover:text-black" onclick="clearConditionGuide()">— Todas as condições —</div>
            ${window.generateConditionOptions()}`;
    }

    // 2. Render citation in the context panel below the map
    renderCitationPanel(cond);

    // 3. Visual: highlight points on map
    if (cond.map_points && cond.map_points.length > 0) {
        STATE.selectedBodyPoint = cond.map_points.join(',');
        if (typeof updatePointsVisual === 'function') updatePointsVisual();
    }

    // 3b. Mobile: keep only tabs whose view actually has focal points
    applyViewFilter(viewsWithFocalPoints(cond.map_points));

    // 4. Filter articles by title match (custom logic, bypasses applyFilters)
    STATE.bodyFilter = '';
    const searchTerm = cond.label.replace(/\s*\(.*?\)\s*/g, '').replace(/[–-].*$/, '').trim().toLowerCase();
    const labelLower = cond.label.toLowerCase();

    const filtered = [];
    Object.entries(STATE.data).forEach(([cat, items]) => {
        items.forEach(item => {
            const title = (item.title_pt || item.title || '').toLowerCase();
            if (!title) return;
            if (title.includes(labelLower) || (searchTerm && title.includes(searchTerm))) {
                filtered.push({ ...item, _cat: cat });
            }
        });
    });

    STATE.list = filtered;

    const list = document.getElementById('contentList');
    if (list) list.classList.remove('hidden');
    if (typeof renderList === 'function') {
        renderList(filtered, [], STATE.mode, 'mapa');
    }

    document.querySelectorAll('.search-count').forEach(el => {
        el.textContent = filtered.length + ' Itens';
    });

    if (typeof closeBodyFilterModal === 'function') closeBodyFilterModal();
};

window.clearConditionGuide = function() {
    activeConditionKey = null;

    // Restore all mobile map tabs
    applyViewFilter(['front', 'detail', 'back']);

    // Clear search
    if (typeof STATE !== 'undefined') {
        STATE.searchQuery = '';
        const searchInputs = document.querySelectorAll('#searchInput, #mobileSearchInput, #desktopSearchInput');
        searchInputs.forEach(el => { if (el) el.value = ''; });
        if (typeof applyFilters === 'function') applyFilters();
    }

    // Clear map selection
    if (typeof clearBodyFilter === 'function') clearBodyFilter();

    // Hide citation panel (don't destroy — kept persistent in DOM)
    hideCitationPanel();

    // Reset sidebar
    const sidebar = document.getElementById('bodyPointSidebarList');
    if (sidebar) {
        sidebar.innerHTML = `
            <div class="px-5 py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 transition-all text-gray-400 hover:bg-gray-50 hover:text-black" onclick="clearConditionGuide()">— Todas as condições —</div>
            ${window.generateConditionOptions()}`;
    }
};

// ── Find and open the teaching linked to a guia condition ─────────────────
window.openGuiaEnsinamento = function(condKey) {
    if (!GUIA || !GUIA[condKey]) return;
    const cond = GUIA[condKey];
    if (!cond.source_file || !STATE.globalData) return;

    // _sourceKey is derived from filename by stripping '_bilingual.json'
    const sourceKey = cond.source_file.replace('_bilingual.json', '').replace('_site.json', '');
    const labelNorm = normalize(cond.label);

    // Try exact title match first, then partial
    let foundItem = null;
    for (const item of Object.values(STATE.globalData)) {
        if (item._sourceKey !== sourceKey) continue;
        const titleNorm = normalize(item.title_pt || item.title || '');
        if (titleNorm === labelNorm) { foundItem = item; break; }
    }
    // Fallback: partial match
    if (!foundItem) {
        for (const item of Object.values(STATE.globalData)) {
            if (item._sourceKey !== sourceKey) continue;
            const titleNorm = normalize(item.title_pt || item.title || '');
            if (titleNorm.includes(labelNorm) || labelNorm.includes(titleNorm)) {
                foundItem = item; break;
            }
        }
    }

    if (foundItem) {
        openRelatedItem(foundItem.id);
    } else {
        console.warn('Ensinamento não encontrado para:', condKey, 'sourceKey:', sourceKey);
    }
};

// ── Source fidelity badge ─────────────────────────────────────────────────
// Renders a small pill above the focal-points chips attesting that the list
// of vital points came verbatim from a Pontos Focais volume. Defensively
// handles `fonte !== "explicito"` for future entries that may be inferred.
const FONTE_LABELS = {
    'pontos_focais_vol01_bilingual.json': 'Pontos Focais, Vol. 1',
    'pontos_focais_vol02_bilingual.json': 'Pontos Focais, Vol. 2',
};
function fonteLabel(sourceFile) {
    return FONTE_LABELS[sourceFile] ||
        String(sourceFile || '').replace(/_bilingual\.json$/, '').replace(/_/g, ' ');
}
function renderFidelidadeBadge(cond) {
    if (cond.fonte === 'explicito') {
        const src = fonteLabel(cond.source_file);
        return `<span style="display:inline-flex;align-items:center;gap:5px;
            font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;
            font-weight:700;color:#B8860B;
            padding:3px 9px;border:1px solid rgba(184,134,11,.35);
            border-radius:4px;background:rgba(184,134,11,.06);
            white-space:nowrap;">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="3.5"
                stroke-linecap="round" stroke-linejoin="round"
                style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>
            Citação literal · ${escHtml(src)}
        </span>`;
    }
    return `<span style="display:inline-flex;align-items:center;gap:5px;
        font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;
        font-weight:700;color:#888;
        padding:3px 9px;border:1px solid rgba(0,0,0,.15);
        border-radius:4px;background:rgba(0,0,0,.03);
        white-space:nowrap;">
        ⚠ Por inferência
    </span>`;
}

// ── Citation panel below the maps ──────────────────────────────────────────
function renderCitationPanel(cond) {
    const panel = document.getElementById('guideCitationPanel');
    if (!panel) return;

    const pts = cond.focal_points.map((fp, i) =>
        `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;
             border-radius:14px;font-size:12px;font-weight:600;margin:3px;
             background:${i === 0 ? 'rgba(0,0,0,.85)' : 'rgba(0,0,0,.06)'};
             color:${i === 0 ? '#fff' : 'inherit'};
             border:1px solid ${i === 0 ? 'transparent' : 'rgba(0,0,0,.12)'}">
            <span style="width:6px;height:6px;border-radius:50%;
                background:${i === 0 ? '#fff' : 'rgba(0,0,0,.3)'}"></span>
            ${escHtml(fp.label)}
        </span>`
    ).join('');

    const trecho = (cond.trecho_meishu || '')
        .replace(/\*\*/g, '').replace(/\[|\]/g, '').trim();

    // Show open-teaching button only if source_file is available
    const hasEnsinamento = !!cond.source_file;
    const openBtnHtml = hasEnsinamento ? `
        <button onclick="openGuiaEnsinamento('${escapeAttr(cond.key)}')"
            title="Abrir ensinamento completo"
            style="display:inline-flex;align-items:center;gap:5px;background:none;
                border:1px solid rgba(0,0,0,.15);border-radius:6px;cursor:pointer;
                font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;
                color:#888;padding:4px 10px;transition:all .15s;
                font-family:inherit;margin-top:10px;"
            onmouseover="this.style.color='#333';this.style.borderColor='rgba(0,0,0,.4)'"
            onmouseout="this.style.color='#888';this.style.borderColor='rgba(0,0,0,.15)'">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Ver ensinamento
        </button>` : '';

    panel.style.cssText = 'padding:20px 24px;border-radius:10px;' +
        'background:#fafaf8;border:1px solid #e8e4da;display:block;';
    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
            <div>
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:#888;margin-bottom:6px">
                    Pontos Vitais do Johrei — ${escHtml(cond.label)}
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:#666">
                    ${renderFidelidadeBadge(cond)}
                    <span>${cond.focal_points.length} pontos</span>
                </div>
            </div>
            <button onclick="clearConditionGuide()"
                style="background:none;border:none;cursor:pointer;font-size:20px;color:#aaa;line-height:1">×</button>
        </div>
        <div style="margin-bottom:${trecho ? '14px' : '0'}">${pts}</div>
        ${trecho ? `<div style="border-top:1px solid #e8e4da;padding-top:12px;margin-top:4px;
            font-size:13px;color:#666;line-height:1.65;font-style:italic">
            <span style="font-style:normal;font-size:10px;text-transform:uppercase;
                letter-spacing:.07em;font-weight:700;color:#aaa;display:block;margin-bottom:5px">
                Meishu-Sama</span>
            "${escHtml(trecho)}"
        </div>` : ''}
        ${openBtnHtml}`;
}

function hideCitationPanel() {
    const panel = document.getElementById('guideCitationPanel');
    if (panel) {
        panel.style.display = 'none';
        panel.innerHTML = '';
    }
}

// ── Top regions panel — discovery by teaching density ─────────────────────
let _topRegionsCache = null;

function computeTopRegions(n) {
    if (_topRegionsCache && _topRegionsCache.length > 0) return _topRegionsCache;
    if (!STATE || !STATE.data || !STATE.data.por_regiao || typeof BODY_DATA === 'undefined') return [];

    const allPoints = [
        ...BODY_DATA.points.front,
        ...BODY_DATA.points.back,
        ...BODY_DATA.points.detail
    ];
    const byName = {};
    allPoints.forEach(p => {
        if (!byName[p.name]) byName[p.name] = [];
        byName[p.name].push(p.id);
    });

    const data = STATE.data.por_regiao;
    const counts = Object.entries(byName).map(([name, ids]) => {
        const count = data.filter(item => ids.some(id => matchBodyPoint(item, id))).length;
        return { name, ids, count };
    });

    _topRegionsCache = counts.filter(r => r.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, n);
    return _topRegionsCache;
}

function renderTopRegionsPanel() {
    const panel = document.getElementById('topRegionsPanel');
    if (!panel) return;

    const top = computeTopRegions(10);
    if (top.length === 0) {
        panel.innerHTML = '';
        panel.style.display = 'none';
        return;
    }

    const items = top.map(r => `
        <button
            type="button"
            onclick="selectBodyPoint('${escapeAttr(r.ids.join(','))}')"
            onmouseenter="previewBodyPoints('${escapeAttr(r.ids.join(','))}')"
            onmouseleave="clearBodyPointPreview()"
            class="text-left px-3 py-2 rounded-lg bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 hover:border-purple-500 dark:hover:border-purple-400 transition-all">
            <span class="block text-xs font-bold text-gray-800 dark:text-gray-100">${escHtml(r.name)}</span>
            <span class="block text-[9px] text-gray-400 mt-0.5">${r.count} ensinamento${r.count === 1 ? '' : 's'}</span>
        </button>
    `).join('');

    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="bg-gray-50 dark:bg-[#161616] rounded-lg p-5 mt-4">
            <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-3">
                Regiões com mais ensinamentos
            </h3>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
                ${items}
            </div>
        </div>`;
}

// ── Show / hide on tab switch ──────────────────────────────────────────────
function showConditionSelector() {
    loadGuia(); // pre-fetch
    loadSynonyms();
    const ctx = document.getElementById('contextPanel');
    if (ctx) ctx.classList.remove('hidden');
    renderTopRegionsPanel();
    // Auto-focus the search on desktop only — mobile would open the virtual keyboard.
    if (window.matchMedia && window.matchMedia('(min-width: 1024px)').matches) {
        setTimeout(() => {
            const inp = document.getElementById('guiaSidebarSearch');
            if (inp && document.activeElement !== inp) inp.focus({ preventScroll: true });
        }, 200);
    }
}
function hideConditionSelector() {
    const ctx = document.getElementById('contextPanel');
    if (ctx) ctx.classList.add('hidden');
}

// ── Mobile modal: also show conditions ────────────────────────────────────
// Patch openBodyFilterModal to populate with conditions after it's created
const _origOpenModal = window.openBodyFilterModal;
window.openBodyFilterModal = function() {
    if (typeof _origOpenModal === 'function') _origOpenModal();
    setTimeout(() => {
        const mlist = document.getElementById('filterModalList');
        if (mlist && guiaConditions.length) {
            mlist.innerHTML = `
                <div class="px-6 py-4 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 transition-all text-gray-400 hover:text-black" onclick="clearConditionGuide();closeBodyFilterModal()">— Todas as condições —</div>
                ${window.generateConditionOptions()}`;

            // Add search
            const header = document.querySelector('#filterModalCard .flex.justify-between');
            if (header && !document.getElementById('guiaModalSearch')) {
                const inp = document.createElement('input');
                inp.id = 'guiaModalSearch';
                inp.type = 'search';
                inp.placeholder = 'Buscar condição...';
                inp.oninput = () => filterGuiaSidebar(inp.value);
                inp.style.cssText = 'width:100%;padding:8px 12px;margin:8px 0 0;font-size:12px;' +
                    'border:1px solid #e5e7eb;border-radius:6px;outline:none;';
                header.insertAdjacentElement('afterend', inp);
            }
        }
    }, 50);
};

// ── Purificação Quick Search (top bar) ─────────────────────────────────────
// Entry point from any tab — types a purification name, autocompletes against
// the 88 canonical conditions (with synonym support), and on selection
// switches to the mapa tab and selects the condition.
window.onPurificacaoInput = function(value) {
    // Lazy-load data the first time the user interacts with the bar.
    if (!GUIA) loadGuia().then(() => onPurificacaoInput(value));
    if (!SYNONYMS_PT) loadSynonyms();

    const dropdown = document.getElementById('purificacaoSuggestions');
    const clearBtn = document.getElementById('purificacaoClear');
    if (!dropdown) return;

    const trimmed = (value || '').trim();
    if (clearBtn) clearBtn.classList.toggle('hidden', !trimmed);

    if (!trimmed) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
        return;
    }
    if (!guiaConditions.length) {
        // Data still loading; show a placeholder
        dropdown.innerHTML = `<div style="padding:10px 16px;font-size:11px;color:#aaa">Carregando guia…</div>`;
        dropdown.classList.remove('hidden');
        return;
    }

    const q = normalize(trimmed);
    const synHit = resolveSynonym(q);
    const synCanonical = synHit ? normalize(synHit.canonical) : null;

    const matches = guiaConditions.filter(c => {
        const ln = normalize(c.label);
        return ln.includes(q) || (synCanonical && ln.includes(synCanonical));
    }).slice(0, 8);

    if (matches.length === 0) {
        dropdown.innerHTML = `
            <div class="px-4 py-3.5 text-[12px] text-gray-500 dark:text-gray-400 text-center">
                Nenhuma purificação para «${escHtml(trimmed)}»
            </div>`;
        dropdown.classList.remove('hidden');
        return;
    }

    const synBanner = synHit ? `
        <div class="px-4 py-2 border-b border-amber-200/40 dark:border-amber-700/40 text-[10.5px] leading-snug
            text-amber-800 dark:text-amber-300"
            style="background:rgba(184,134,11,.08)">
            Mostrando <b class="uppercase" style="letter-spacing:.04em">${escHtml(synHit.canonical)}</b>
            <span class="opacity-70">· você digitou "${escHtml(synHit.synonym)}"</span>
        </div>` : '';

    const rows = matches.map((c, i) => `
        <div data-key="${escapeAttr(c.key)}"
            class="purificacao-suggestion px-4 py-2.5 cursor-pointer text-[13px] flex items-center justify-between gap-3
                border-b border-gray-100 dark:border-gray-800 last:border-0
                text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1a1a1a] hover:text-black dark:hover:text-white
                ${i === 0 ? 'bg-gray-50 dark:bg-[#1a1a1a]' : ''}"
            onclick="selectPurificacao('${escapeAttr(c.key)}')">
            <span>${escHtml(c.label)}</span>
            <span class="text-[9.5px] font-bold uppercase whitespace-nowrap text-gray-400 dark:text-gray-500"
                style="letter-spacing:.06em">
                ${c.focal_points.length} pts
            </span>
        </div>
    `).join('');

    dropdown.innerHTML = synBanner + rows;
    dropdown.classList.remove('hidden');
};

window.onPurificacaoKeydown = function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const first = document.querySelector('#purificacaoSuggestions [data-key]');
        if (first) selectPurificacao(first.getAttribute('data-key'));
    } else if (e.key === 'Escape') {
        closePurificacaoDropdown();
        e.target.blur();
    }
};

window.selectPurificacao = function(key) {
    if (!GUIA || !GUIA[key]) return;

    // Switch to mapa tab if we're not already there
    if (typeof STATE !== 'undefined' && STATE.activeTab !== 'mapa') {
        if (typeof setTab === 'function') setTab('mapa');
        if (typeof showConditionSelector === 'function') showConditionSelector();
    }

    // Select condition (sets focal points, citation, related teachings).
    // Wrap in setTimeout so the tab switch's DOM updates settle first.
    setTimeout(() => {
        if (typeof selectConditionGuide === 'function') selectConditionGuide(key);
    }, 60);

    closePurificacaoDropdown();
    clearPurificacaoSearch();
};

window.clearPurificacaoSearch = function() {
    const inp = document.getElementById('purificacaoInput');
    const clearBtn = document.getElementById('purificacaoClear');
    if (inp) inp.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    closePurificacaoDropdown();
};

window.closePurificacaoDropdown = function() {
    const dropdown = document.getElementById('purificacaoSuggestions');
    if (dropdown) {
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
    }
};

// Close dropdown when clicking outside the search bar
document.addEventListener('click', (e) => {
    const bar = document.getElementById('purificacaoSearchBar');
    if (bar && !bar.contains(e.target)) closePurificacaoDropdown();
});

// ── Helpers ────────────────────────────────────────────────────────────────
function normalize(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function escHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return String(s || '').replace(/'/g, "\\'"); }

// ── Expose to global scope ─────────────────────────────────────────────────
window.showConditionSelector = showConditionSelector;
window.hideConditionSelector = hideConditionSelector;
window.loadGuia = loadGuia;

// ── Auto-init ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (typeof STATE !== 'undefined' && STATE.activeTab === 'mapa') {
        loadGuia();
        loadSynonyms();
    }
});
