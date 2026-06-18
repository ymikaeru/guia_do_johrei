// --- ESTADO GLOBAL ---
let STATE = {
    activeTab: 'fundamentos', // Default tab
    activeSubAba: null,
    activeCategoria: null, // Filtro por _categoriaTitulo (usado no estudo_detalhado)
    tabStructure: {},
    activeLetter: '',
    activeCategory: '', // Single category filter for Perguntas e Orientações alphabet replacement
    activeTags: [], // Changed from activeTag to activeTags array
    activeCategories: [], // Filter by categories (combined)
    activeSources: [], // Add generic support for sources even if not used initially
    activeFocusPoints: [], // Multi-select for focus points
    bodyFilter: null, // Agora suporta array ou null, mas vamos manter simples por enquanto
    apostilas: {
        ensinamentos: { items: [], title: "Minha Apostila" },
        explicacoes: { items: [], title: "Meus Estudos" }
    },
    mode: 'ensinamentos', // 'ensinamentos' ou 'explicacoes'
    list: [],
    idx: -1,
    isCrossTabMode: false, // True when showing results from multiple tabs
    selectedBodyPoint: null, // Selected body point for filtering
    globalData: {}, // Cache for all loaded data (persists across modes)
    data: {}, // Holds loaded content
    _tabLoading: {},           // background tab load promises: tabId → Promise

    // Essência (featured teaching) — fetched from Supabase in core.js#loadData
    essencia: null,           // { article_id, excerpt_pt, updated_at } ou null
    essenciaCollapsed: false, // estado em memória (só durante a sessão)

    // History Feature
    readingHistory: []
};

// Initialize History from LocalStorage
try {
    const saved = localStorage.getItem('johrei_history');
    if (saved) {
        STATE.readingHistory = JSON.parse(saved);
    }
} catch (e) {
    console.error('Error loading history', e);
}

// Initialize Apostilas from LocalStorage — sem isto a apostila do usuário
// some a cada reload (era só estado em memória).
try {
    const savedAp = localStorage.getItem('johrei_apostilas');
    if (savedAp) {
        const parsed = JSON.parse(savedAp);
        if (parsed && typeof parsed === 'object') {
            ['ensinamentos', 'explicacoes'].forEach(mode => {
                const p = parsed[mode];
                if (p && Array.isArray(p.items)) {
                    STATE.apostilas[mode] = {
                        items: p.items.filter(x => typeof x === 'string'),
                        title: typeof p.title === 'string' && p.title ? p.title : STATE.apostilas[mode].title
                    };
                }
            });
        }
    }
} catch (e) {
    console.error('Error loading apostilas', e);
}

// Persiste a apostila atual no LocalStorage. Chamar em toda mutação
// (adicionar/remover item, renomear, limpar).
function saveApostilas() {
    try {
        localStorage.setItem('johrei_apostilas', JSON.stringify(STATE.apostilas));
    } catch (e) {
        // localStorage cheio/indisponível — falha silenciosa, não quebra a UI.
    }
}

// Add Item to History
function addToHistory(item) {
    if (!item || !item.id) return;

    // Remove if exists (to move to top)
    STATE.readingHistory = STATE.readingHistory.filter(h => h.id !== item.id);

    // Add to top
    const rawTitle = item.title_pt || item.titulo || item.title || item.id;
    const cleanedTitle = (typeof cleanTitle === 'function') ? cleanTitle(rawTitle) : rawTitle;
    STATE.readingHistory.unshift({
        id: item.id,
        title: cleanedTitle,
        cat: item._cat,
        time: Date.now()
    });

    // Limit to 10
    if (STATE.readingHistory.length > 10) {
        STATE.readingHistory = STATE.readingHistory.slice(0, 10);
    }

    // Save
    localStorage.setItem('johrei_history', JSON.stringify(STATE.readingHistory));
}

// Helper to remove accents
function removeAccents(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
