// --- ESTADO GLOBAL ---
let STATE = {
    activeTab: 'fundamentos', // Default tab
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

// Add Item to History
function addToHistory(item) {
    if (!item || !item.id) return;

    // Remove if exists (to move to top)
    STATE.readingHistory = STATE.readingHistory.filter(h => h.id !== item.id);

    // Add to top
    STATE.readingHistory.unshift({
        id: item.id,
        title: item.title,
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
