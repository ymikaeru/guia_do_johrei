// ── Guia de Atendimento — integração com o mapa corporal ──────────────────
// Usa a barra lateral existente para listar condições (88 verificadas).
// Ao selecionar uma condição:
//   1. Ilumina os pontos vitais no diagrama do corpo
//   2. Mostra a citação de Meishu-Sama
//   3. Filtra os ensinamentos relacionados abaixo do mapa

let GUIA = null;
let guiaConditions = [];
let activeConditionKey = null;

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
    const list = q
        ? guiaConditions.filter(c => normalize(c.label).includes(q))
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

    return list.map(c => {
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

    const estudoCount = countEstudoMatchesFor(cond.label);
    const labelAttr = String(cond.label || '').replace(/'/g, "\\'");
    const ctaHtml = estudoCount > 0
        ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e8e4da">
            <button onclick="goToEstudoForCondition('${labelAttr}')"
                style="background:none;border:1px solid #d4cfc1;cursor:pointer;
                       font-size:11px;color:#555;padding:8px 14px;border-radius:6px;
                       font-weight:600;letter-spacing:.04em;
                       transition:background .15s,color .15s"
                onmouseover="this.style.background='#1c1917';this.style.color='#fff'"
                onmouseout="this.style.background='none';this.style.color='#555'">
                Ver ${estudoCount} ${estudoCount === 1 ? 'ensinamento original' : 'ensinamentos originais'} de Meishu-Sama →
            </button>
        </div>`
        : '';

    panel.style.cssText = 'padding:20px 24px;border-radius:10px;' +
        'background:#fafaf8;border:1px solid #e8e4da;display:block;';
    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
            <div>
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:#888;margin-bottom:4px">
                    Pontos Vitais do Johrei — ${escHtml(cond.label)}
                </div>
                <div style="font-size:11px;color:#666">Ensinamento verificado · ${cond.focal_points.length} pontos</div>
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
        ${ctaHtml}`;
}

function hideCitationPanel() {
    const panel = document.getElementById('guideCitationPanel');
    if (panel) {
        panel.style.display = 'none';
        panel.innerHTML = '';
    }
}

// ── Cross-link to Estudo Aprofundado ──────────────────────────────────────
// Extracts the broad search term from a condition label: strips
// parentheticals, cuts at em-dash/hyphen, then takes the first word.
// Broader than the full label — "Tuberculose Faríngea" yields "tuberculose",
// which matches every tuberculose-related teaching in the corpus.
function _extractEstudoTerm(condLabel) {
    const cleaned = (condLabel || '')
        .replace(/\s*\(.*?\)\s*/g, '')
        .replace(/[–-].*$/, '')
        .trim();
    return cleaned.split(/\s+/)[0] || '';
}

// Returns the count of estudo_aprofundado items whose normalized title
// contains the normalized first word from a condition label.
function countEstudoMatchesFor(condLabel) {
    const items = (STATE && STATE.data && STATE.data.estudo_aprofundado) || [];
    if (items.length === 0) return 0;
    const term = normalize(_extractEstudoTerm(condLabel));
    if (!term) return 0;
    return items.filter(it => normalize(it.title_pt || it.title || '').includes(term)).length;
}

// Switches to the estudo_aprofundado tab and renders only the items whose
// titles match the condition's term. Mirrors the manual-filter pattern used
// by selectConditionGuide (text search on this tab is not wired through
// applyFilters — searchInput is readonly and opens a modal).
window.goToEstudoForCondition = function(condLabel) {
    const term = _extractEstudoTerm(condLabel);
    const termN = normalize(term);
    if (typeof setTab !== 'function' || !termN) return;

    setTab('estudo_aprofundado');

    setTimeout(() => {
        const items = (STATE && STATE.data && STATE.data.estudo_aprofundado) || [];
        const filtered = items
            .filter(it => normalize(it.title_pt || it.title || '').includes(termN))
            .map(it => ({ ...it, _cat: 'estudo_aprofundado' }));

        STATE.list = filtered;
        STATE.searchQuery = term;

        const listEl = document.getElementById('contentList');
        if (listEl) listEl.classList.remove('hidden');
        if (typeof renderList === 'function') {
            renderList(filtered, [], STATE.mode, 'estudo_aprofundado');
        }

        document.querySelectorAll('.search-count').forEach(el => {
            el.textContent = filtered.length + ' Itens';
        });

        // Scroll to the list so user sees the result immediately
        if (listEl) listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
};

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
    if (typeof STATE !== 'undefined' && STATE.activeTab === 'mapa') loadGuia();
});
