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
            <button onclick="document.getElementById('guiaSidebarSearch').value='';filterGuiaSidebar('')"
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

    // If a condition is currently selected, preserve the citation card on top
    // and filter only the "Outras condições" section beneath it.
    if (activeConditionKey && GUIA && GUIA[activeConditionKey]) {
        const cond = GUIA[activeConditionKey];
        const trecho = (cond.trecho_meishu || '')
            .replace(/\*\*/g, '').replace(/\[|\]/g, '').trim();
        const ptsHtml = cond.focal_points.map((fp, i) =>
            `<span style="display:inline-block;padding:3px 9px;margin:2px;border-radius:10px;font-size:10px;
                font-weight:600;background:${i===0?'#000':'#f0f0f0'};color:${i===0?'#fff':'#444'}">${escHtml(fp.label)}</span>`
        ).join('');
        const citationHtml = `
            <div style="padding:12px;background:#fafaf8;border-bottom:2px solid #e8e4da">
                <div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:#999;margin-bottom:6px">
                    Pontos Vitais · ${escHtml(cond.label)}
                </div>
                <div style="margin-bottom:${trecho?'8px':'0'}">${ptsHtml}</div>
                ${trecho ? `<div style="font-size:11px;color:#888;line-height:1.5;font-style:italic;border-top:1px solid #e8e4da;padding-top:8px;margin-top:4px">
                    "${escHtml(trecho.substring(0, 200))}${trecho.length>200?'…':''}"
                </div>` : ''}
                <button onclick="clearConditionGuide()" style="margin-top:8px;font-size:10px;color:#aaa;background:none;border:none;cursor:pointer;padding:0">
                    ← Todas as condições
                </button>
            </div>
            <div class="px-5 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-400 bg-gray-50 border-b border-gray-100">
                Outras condições
            </div>
            ${html}`;
        if (list) list.innerHTML = citationHtml;
        if (mlist) mlist.innerHTML = citationHtml;
        return;
    }

    // No active condition — show "todas as condições" prefix + filtered list
    const prefix = `<div class="px-5 py-3 cursor-pointer text-[10px] font-bold uppercase tracking-widest border-b border-gray-100 dark:border-gray-800 transition-all text-gray-400 hover:bg-gray-50 hover:text-black" onclick="clearConditionGuide()">— Todas as condições —</div>`;
    if (list) list.innerHTML = prefix + html;
    if (mlist) mlist.innerHTML = prefix + html;
};

// ── Select a condition ─────────────────────────────────────────────────────
window.selectConditionGuide = function(key) {
    if (!GUIA || !GUIA[key]) return;
    const cond = GUIA[key];
    activeConditionKey = key;

    // 1. Refresh sidebar — show citation card at top, then list
    const sidebar = document.getElementById('bodyPointSidebarList');
    if (sidebar) {
        const trecho = (cond.trecho_meishu || '')
            .replace(/\*\*/g, '').replace(/\[|\]/g, '').trim();
        const ptsHtml = cond.focal_points.map((fp, i) =>
            `<span style="display:inline-block;padding:3px 9px;margin:2px;border-radius:10px;font-size:10px;
                font-weight:600;background:${i===0?'#000':'#f0f0f0'};color:${i===0?'#fff':'#444'}">${escHtml(fp.label)}</span>`
        ).join('');
        const citationHtml = `
            <div style="padding:12px;background:#fafaf8;border-bottom:2px solid #e8e4da">
                <div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:#999;margin-bottom:6px">
                    Pontos Vitais · ${escHtml(cond.label)}
                </div>
                <div style="margin-bottom:${trecho?'8px':'0'}">${ptsHtml}</div>
                ${trecho ? `<div style="font-size:11px;color:#888;line-height:1.5;font-style:italic;border-top:1px solid #e8e4da;padding-top:8px;margin-top:4px">
                    "${escHtml(trecho.substring(0, 200))}${trecho.length>200?'…':''}"
                </div>` : ''}
                <button onclick="clearConditionGuide()" style="margin-top:8px;font-size:10px;color:#aaa;background:none;border:none;cursor:pointer;padding:0">
                    ← Todas as condições
                </button>
            </div>
            <div class="px-5 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-400 bg-gray-50 border-b border-gray-100">
                Outras condições
            </div>
            ${window.generateConditionOptions()}`;
        sidebar.innerHTML = citationHtml;
        sidebar.scrollTop = 0;
    }

    // 2. Visual only: highlight points on map WITHOUT triggering body-point article filter
    if (cond.map_points && cond.map_points.length > 0) {
        STATE.selectedBodyPoint = cond.map_points.join(',');
        if (typeof updatePointsVisual === 'function') updatePointsVisual();
    }

    // 3. Remove old external panel if any
    const oldPanel = document.getElementById('guideCitationPanel');
    if (oldPanel) oldPanel.remove();

    // 4. Filter articles by title match (custom logic, bypasses applyFilters)
    STATE.bodyFilter = '';
    const searchTerm = cond.label.replace(/\s*\(.*?\)\s*/g, '').replace(/[–-].*$/, '').trim().toLowerCase();
    const labelLower = cond.label.toLowerCase();

    // Collect items across all tabs whose title matches condition label
    const filtered = [];
    Object.entries(STATE.data).forEach(([cat, items]) => {
        items.forEach(item => {
            const title = (item.title_pt || item.title || '').toLowerCase();
            if (!title) return;
            // Match: full label substring OR first-word substring
            if (title.includes(labelLower) || (searchTerm && title.includes(searchTerm))) {
                filtered.push({ ...item, _cat: cat });
            }
        });
    });

    STATE.list = filtered;

    // Show list and render directly
    const list = document.getElementById('contentList');
    if (list) list.classList.remove('hidden');
    if (typeof renderList === 'function') {
        renderList(filtered, [], STATE.mode, 'mapa');
    }

    // Update count display
    document.querySelectorAll('.search-count').forEach(el => {
        el.textContent = filtered.length + ' Itens';
    });

    // Close mobile modal if open
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

    // Remove citation panel
    const panel = document.getElementById('guideCitationPanel');
    if (panel) panel.remove();

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
    let panel = document.getElementById('guideCitationPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'guideCitationPanel';
        // Insert after bodyMapContainer
        const mapContainer = document.getElementById('bodyMapContainer');
        if (mapContainer && mapContainer.parentNode) {
            mapContainer.parentNode.insertBefore(panel, mapContainer.nextSibling);
        }
    }

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

    panel.style.cssText = 'margin:0 32px 24px;padding:20px 24px;border-radius:10px;' +
        'background:#fafaf8;border:1px solid #e8e4da;';
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
        </div>` : ''}`;
}

// ── Show / hide on tab switch ──────────────────────────────────────────────
function showConditionSelector() {
    loadGuia(); // pre-fetch
    // Auto-focus the search on desktop only — mobile would open the virtual keyboard.
    if (window.matchMedia && window.matchMedia('(min-width: 1024px)').matches) {
        setTimeout(() => {
            const inp = document.getElementById('guiaSidebarSearch');
            if (inp && document.activeElement !== inp) inp.focus({ preventScroll: true });
        }, 200);
    }
}
function hideConditionSelector() {
    // Nothing to hide — sidebar is inside bodyMapContainer
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
