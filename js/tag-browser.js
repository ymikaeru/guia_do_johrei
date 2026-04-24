// Tag Browser - Categorized tag organization and filtering

const TAG_CATEGORIES = {
    'Corpo e Sistemas': [
        'estômago',
        'intestinos',
        'fígado',
        'coração',
        'pulmões',
        'rins',
        'cabeça',
        'pescoço',
        'ombros',
        'coluna',
        'pele',
        'olhos',
        'ouvidos',
        'nariz',
        'garganta',
        'dentes',
        'boca'
    ],
    'Público e Ciclo de Vida': [
        'criança',
        'bebê',
        'mulher',
        'gravidez',
        'idoso'
    ],
    'Condições e Sintomas': [
        'dor',
        'rigidez',
        'febre',
        'tosse',
        'catarro',
        'gripe',
        'resfriado',
        'tuberculose',
        'diabetes',
        'asma',
        'hipertensão',
        'derrame',
        'paralisia',
        'neuralgia',
        'anemia',
        'induração'
    ],
    'Conceitos Johrei': [
        'johrei',
        'purificação',
        'toxinas',
        'toxinas_medicamentosas',
        'pontos_vitais',
        'mundo_espiritual'
    ],
    'Outros': [
        'arte',
        'beleza',
        'agricultura',
        'alimentação'
    ]
};

const ICON_MAP = {
    'coração': '❤️',
    'rins': '💧',
    'pulmões': '🫁',
    'cabeça': '🧠',
    'pescoço': '🧠',
    'estômago': '🍽️',
    'intestinos': '🍽️',
    'fígado': '🍽️',
    'olhos': '👁️',
    'ouvidos': '👂',
    'dentes': '🦷',
    'boca': '🦷',
    'pele': '🖐️',
    'mulher': '👩',
    'gravidez': '🤰',
    'criança': '👶',
    'bebê': '👶',
    'mundo_espiritual': '👻',
    'purificação': '✨',
    'johrei': '✋',
    'toxinas': '⚠️',
    'toxinas_medicamentosas': '💊'
};

function formatSourceLabel(src) {
    if (src.includes('Johrei Hõ Kõza')) {
        return src.replace('Johrei Hõ Kõza ', 'Vol. ');
    }
    if (src.includes('Estudos Específicos')) {
        return src.replace('Estudos Específicos ', 'Estudos ');
    }
    return src;
}

function initializeTagBrowser() {
    // Wrapper checks for button visibility control (if needed)
    const wrapper = document.getElementById('tagBrowserWrapper');
    // Content is now the INNER container for injection
    const content = document.getElementById('tagBrowserInnerContent');

    if (!content) return;

    // Only show on ensinamentos/explicacoes mode and NOT on map tab, OR if there are active filters
    const hasActiveFilters = (STATE.activeTags && STATE.activeTags.length > 0) ||
        (STATE.activeCategories && STATE.activeCategories.length > 0) ||
        (STATE.activeSources && STATE.activeSources.length > 0) ||
        (STATE.activeFocusPoints && STATE.activeFocusPoints.length > 0) ||
        STATE.bodyFilter;

    const allowedModes = ['ensinamentos', 'explicacoes'];

    // Control visibility of the BUTTON wrapper in the header
    if (wrapper) {
        if ((!allowedModes.includes(STATE.mode) || STATE.activeTab === 'mapa' || STATE.activeTab === 'apostila') && !hasActiveFilters) {
            wrapper.style.display = 'none';
        } else {
            wrapper.style.display = 'block';
        }
    }

    // Get all tags from current data with counts
    const tagCounts = {};
    if (STATE.data && STATE.data[STATE.activeTab]) {
        STATE.data[STATE.activeTab].forEach(item => {
            const tags = item.tags || [];
            tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        });
    }

    // --- INJECT SOURCES SECTION ---
    let html = '';

    // Get unique sources
    const allItems = STATE.data[STATE.activeTab] || [];
    const sourceCounts = {};
    allItems.forEach(item => {
        if (item.source) {
            sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;
        }
    });

    const validSources = Object.keys(sourceCounts).sort();

    if (validSources.length > 0) {
        html += `
            <div class="tag-category">
                <div class="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-4 mt-2">Fontes</div>
                <div class="flex flex-col gap-2">
                    ${validSources.map(src => {
            const count = sourceCounts[src];
            const isActive = STATE.activeSources.includes(src);
            let label = formatSourceLabel(src);
            label = typeof cleanTitle === 'function' ? cleanTitle(label) : label;

            const activeClass = isActive
                ? 'border-gray-900 bg-gray-50 text-black dark:border-white dark:bg-gray-800 dark:text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-800 dark:bg-[#1a1a1a] dark:text-gray-300 dark:hover:border-gray-600';

            return `
                            <button onclick="toggleFilter('source', '${src.replace(/'/g, "\\'")}'); toggleTagBrowser()" 
                                class="w-full text-left px-4 py-3 border rounded-lg transition-all flex items-center justify-between group ${activeClass}">
                                <span class="text-sm font-medium flex-1 pr-4 ${isActive ? 'font-bold' : ''}">${label}</span>
                                <span class="text-xs font-bold text-gray-400 flex-shrink-0 ${isActive ? 'text-black dark:text-white' : ''}">${count}</span>
                            </button>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }

    // --- INJECT SUBJECTS vs CATEGORIES SECTION ---
    // If Fundamentos -> Show Categories (from item.categories)
    // Else -> Show Subjects (Assuntos)

    if (STATE.activeTab === 'fundamentos') {
        const categoryCounts = {};
        const items = STATE.data[STATE.activeTab] || [];

        items.forEach(item => {
            if (item.categories && Array.isArray(item.categories)) {
                item.categories.forEach(cat => {
                    if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
                });
            } else if (item.category) {
                categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
            }
        });

        const validCategories = Object.keys(categoryCounts).sort();

        if (validCategories.length > 0) {
            html += `
                <div class="tag-category">
                    <div class="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-4 mt-6">Categorias</div>
                    <div class="flex flex-col gap-2">
                        ${validCategories.map(cat => {
                const count = categoryCounts[cat];
                const cleanCat = typeof cleanTitle === 'function' ? cleanTitle(cat) : cat;
                // Reuse category filter logic if exists, or simple tag logic?
                // Using toggleFilter('category', ...) seems appropriate if filter supports it. 
                // Let's assume toggleFilter('category') works or we use toggleCategory logic.
                // Re-checking filters.js: toggleFilter supports 'category'.
                const isActive = STATE.activeCategories.includes(cat);

                const activeClass = isActive
                    ? 'border-gray-900 bg-gray-50 text-black dark:border-white dark:bg-gray-800 dark:text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-800 dark:bg-[#1a1a1a] dark:text-gray-300 dark:hover:border-gray-600';

                return `
                                <button onclick="toggleFilter('category', '${cat.replace(/'/g, "\\'")}'); toggleTagBrowser()" 
                                    class="w-full text-left px-4 py-3 border rounded-lg transition-all flex items-center justify-between group ${activeClass}">
                                    <span class="text-sm font-medium flex-1 pr-4 ${isActive ? 'font-bold' : ''}">${cleanCat}</span>
                                    <span class="text-xs font-bold text-gray-400 flex-shrink-0 ${isActive ? 'text-black dark:text-white' : ''}">${count}</span>
                                </button>
                            `;
            }).join('')}
                    </div>
                </div>
            `;
        }

    } else {
        // --- INJECT SUBJECTS SECTION (Standard for Perguntas e Orientações, etc) ---
        const subjectCounts = {};
        const items = STATE.data[STATE.activeTab] || [];
        items.forEach(item => {
            let subj = item.Master_Title || item.Master_title || item.titulo_mestre;
            if (subj) {
                subj = subj.trim();
                subjectCounts[subj] = (subjectCounts[subj] || 0) + 1;
            }
        });

        const validSubjects = Object.keys(subjectCounts).sort();

        if (validSubjects.length > 0) {
            html += `
                <div class="tag-category">
                    <div class="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-4 mt-6">Assuntos</div>
                    <div class="flex flex-col gap-2">
                        ${validSubjects.map(subj => {
                const count = subjectCounts[subj];
                const isActive = STATE.activeSubject === subj;

                const activeClass = isActive
                    ? 'border-gray-900 bg-gray-50 text-black dark:border-white dark:bg-gray-800 dark:text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-800 dark:bg-[#1a1a1a] dark:text-gray-300 dark:hover:border-gray-600';

                return `
                                <button onclick="setSubjectFilter('${subj.replace(/'/g, "\\'")}'); toggleTagBrowser()" 
                                    class="w-full text-left px-4 py-3 border rounded-lg transition-all flex items-center justify-between group ${activeClass}">
                                    <span class="text-sm font-medium flex-1 pr-4 ${isActive ? 'font-bold' : ''}">${subj}</span>
                                    <span class="text-xs font-bold text-gray-400 flex-shrink-0 ${isActive ? 'text-black dark:text-white' : ''}">${count}</span>
                                </button>
                            `;
            }).join('')}
                    </div>
                </div>
            `;
        }
    }

    // Generate HTML for each category


    content.innerHTML = html;
}

function toggleTagBrowser() {
    const modal = document.getElementById('tagBrowserContent');
    if (!modal) return;

    const isHidden = modal.classList.contains('hidden');

    if (isHidden) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Lock scroll
    } else {
        modal.classList.add('hidden');
        document.body.style.overflow = ''; // Unlock scroll
    }
}

function toggleTag(tag, event) {
    if (event) event.preventDefault();

    const index = STATE.activeTags.indexOf(tag);

    if (index > -1) {
        STATE.activeTags.splice(index, 1);
    } else {
        STATE.activeTags.push(tag);
    }

    updateTagPillStates();
    applyFilters();
}

function updateTagPillStates() {
    document.querySelectorAll('.tag-pill').forEach(pill => {
        const tag = pill.dataset.tag;
        if (STATE.activeTags.includes(tag)) {
            pill.classList.add('tag-pill-active');
        } else {
            pill.classList.remove('tag-pill-active');
        }
    });
}

window.toggleTagBrowser = toggleTagBrowser;
window.toggleTag = toggleTag;
