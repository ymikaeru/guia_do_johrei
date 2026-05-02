// Search Enhancement Module
// Handles advanced search features: ranking, fuzzy matching, synonyms, operators

const SearchEngine = {
    // Synonym dictionary — bidirectional groups for PT-BR search
    // Keys and values are all lowercase without accents (removeAccents applied at lookup time)
    synonyms: {
        // ── Morfológicos simples ───────────────────────────────────────────
        'quadril':              ['quadris'],
        'ombro':                ['ombros'],
        'rim':                  ['rins', 'renal', 'renais'],
        'rins':                 ['rim', 'renal', 'renais'],
        'pulmao':               ['pulmoes', 'pulmonar'],
        'pulmoes':              ['pulmao', 'pulmonar'],
        'coracao':              ['cardiaco', 'miocardio', 'cardiac'],
        'pescoco':              ['nuca', 'cervical'],
        'nuca':                 ['pescoco', 'cervical'],

        // ── Condições / nomes alternativos ────────────────────────────────
        'cefaleia':             ['dor de cabeca', 'dor na cabeca', 'enxaqueca'],
        'dor de cabeca':        ['cefaleia', 'enxaqueca'],
        'enxaqueca':            ['cefaleia', 'dor de cabeca', 'hemicrania'],
        'vertigem':             ['tontura', 'tonturas', 'labirintite', 'zonzeira'],
        'tontura':              ['vertigem', 'tonturas', 'zonzeira'],
        'tonturas':             ['vertigem', 'tontura'],
        'apoplexia':            ['derrame', 'avc', 'ave', 'hemorragia cerebral'],
        'derrame':              ['apoplexia', 'avc', 'ave'],
        'avc':                  ['apoplexia', 'derrame', 'apoplexia cerebral'],
        'ave':                  ['apoplexia', 'derrame', 'avc'],
        'hipertensao':          ['pressao alta', 'pressao arterial alta'],
        'pressao alta':         ['hipertensao', 'pressao arterial alta'],
        'diabetes':             ['diabete', 'diabetico', 'diabetica', 'glicose'],
        'diabete':              ['diabetes', 'diabetico'],
        'paralisia':            ['hemiplegia', 'paralisia cerebral', 'meio corpo'],
        'lombar':               ['lombalgia', 'dor lombar', 'dor nas costas'],
        'lombalgia':            ['lombar', 'dor lombar'],
        'dor lombar':           ['lombar', 'lombalgia'],
        'dor nas costas':       ['lombar', 'costas'],

        // ── Termos doutrinários ↔ coloquial ────────────────────────────────
        'induracao':            ['nodulo', 'caroco', 'bolinha', 'solidificacao', 'endurecimento'],
        'nodulo':               ['induracao', 'caroco', 'solidificacao'],
        'solidificacao':        ['induracao', 'nodulo'],
        'toxinas medicinais':   ['remedio', 'medicamento', 'farmaco', 'droga', 'veneno remedio'],
        'remedio':              ['toxinas medicinais', 'medicamento', 'farmaco'],
        'medicamento':          ['toxinas medicinais', 'remedio', 'farmaco'],
        'sangue toxico':        ['toxinas sanquineas', 'sangue envenenado', 'toxemia'],
        'bulbo raquidiano':     ['bulbo', 'medula oblonga', 'nuca posterior'],
        'bulbo':                ['bulbo raquidiano', 'medula oblonga'],
        'glandulas linfaticas': ['linfaticos', 'linfonodos', 'ingua', 'ganglio linfatico'],
        'linfonodos':           ['glandulas linfaticas', 'ingua'],

        // ── Condições oculares ────────────────────────────────────────────
        'miopia':               ['vista curta', 'miope', 'vista fraca', 'curto de vista'],
        'cegueira':             ['amaurose', 'cego', 'perda da visao'],
        'amaurose':             ['cegueira', 'cego'],
        'catarata':             ['sokohi', 'vista embacada', 'lente opaca'],

        // ── Condições auditivas / nasais ──────────────────────────────────
        'surdez':               ['perda auditiva', 'surdo', 'dificuldade auditiva'],
        'otite':                ['dor de ouvido', 'infecao no ouvido'],
        'dor de ouvido':        ['otite'],
        'zumbido':              ['tinnitus', 'barulho no ouvido'],
        'sinusite':             ['sinusal', 'empiema nasal', 'seio paranasal'],
        'rinite':               ['coriza', 'nariz entupido', 'nariz escorrendo'],
        'asma':                 ['asthma', 'bronquite asmatica', 'falta de ar', 'chiado'],
        'bronquite':            ['tosse cronica', 'chiado no peito'],

        // ── Condições digestivas / sistêmicas ─────────────────────────────
        'gastrite':             ['dor no estomago', 'estomago inflamado'],
        'hepatite':             ['figado inflamado', 'ictericia'],
        'calculos':             ['pedras nos rins', 'pedra na vesicula'],
        'reumatismo':           ['artrite', 'artrose', 'dor nas juntas'],
        'artrite':              ['reumatismo', 'artrose', 'inflamacao nas juntas'],
    },

    // Merge an external synonym map {coloquial: canonico} into the dictionary (bidirectional)
    mergeSynonyms(externalMap) {
        for (const [coloquial, canonico] of Object.entries(externalMap)) {
            if (coloquial === '_meta') continue;
            const c = removeAccents(coloquial.toLowerCase());
            const k = removeAccents(canonico.toLowerCase());
            if (!this.synonyms[c]) this.synonyms[c] = [];
            if (!this.synonyms[c].includes(k)) this.synonyms[c].push(k);
            if (!this.synonyms[k]) this.synonyms[k] = [];
            if (!this.synonyms[k].includes(c)) this.synonyms[k].push(c);
        }
    },

    // Get all related terms for a query (including synonyms, bidirectional)
    getRelatedTerms(word) {
        const normalized = removeAccents(word.toLowerCase().trim());
        const related = new Set([word, normalized]);

        // Direct key lookup (supports multi-word queries)
        if (this.synonyms[normalized]) {
            this.synonyms[normalized].forEach(s => related.add(s));
        }

        // Reverse lookup: word is a synonym of some key
        for (const [key, syns] of Object.entries(this.synonyms)) {
            if (syns.some(syn => removeAccents(syn) === normalized)) {
                related.add(key);
                syns.forEach(s => related.add(s));
            }
        }

        return [...related];
    },

    // Improved fuzzy matching using Levenshtein distance
    fuzzyMatch(query, target, threshold = 0.7) {
        const q = removeAccents(query.toLowerCase());
        const t = removeAccents(target.toLowerCase());

        // Exact match
        if (t.includes(q)) return 1.0;

        // Use Levenshtein for better quality
        const dist = this.levenshtein(q, t);
        const maxLen = Math.max(q.length, t.length);
        if (maxLen === 0) return 1.0;

        const similarity = 1 - (dist / maxLen);

        return similarity >= threshold ? similarity : 0;
    },

    // Parse search query for operators (AND, OR, NOT)
    parseQuery(query) {
        const tokens = [];
        let current = '';
        let operator = 'AND'; // Default operator

        const words = query.split(/\s+/);

        for (const word of words) {
            const upper = word.toUpperCase();

            if (upper === 'E' || upper === 'AND' || upper === '&&') {
                if (current) tokens.push({ term: current, operator: 'AND' });
                current = '';
                operator = 'AND';
            } else if (upper === 'OU' || upper === 'OR' || upper === '||') {
                if (current) tokens.push({ term: current, operator });
                current = '';
                operator = 'OR';
            } else if (upper === 'NAO' || upper === 'NÃO' || upper === 'NOT' || upper === '-') {
                if (current) tokens.push({ term: current, operator });
                current = '';
                operator = 'NOT';
            } else {
                if (current) current += ' ';
                current += word;
                if (!current.trim()) continue;
            }
        }

        if (current) tokens.push({ term: current, operator });

        return tokens.length > 0 ? tokens : [{ term: query, operator: 'AND' }];
    },

    // Score an item based on search relevance
    scoreItem(item, query, useOperators = false) {
        let score = 0;
        const q = removeAccents(query.toLowerCase());

        // Get all related search terms
        const searchTerms = this.getRelatedTerms(query);

        // Title matches (highest weight)
        const title = removeAccents(item.title_pt || item.title || '').toLowerCase();
        if (title === q) score += 100; // Exact match
        else if (title.startsWith(q)) score += 80; // Starts with
        else if (title.includes(q)) score += 60; // Contains
        else {
            // Check synonyms - Boosted score
            for (const term of searchTerms) {
                const termNorm = removeAccents(term.toLowerCase());
                if (title.includes(termNorm)) {
                    score += 60; // Boosted from 40 to 60 for synonyms in title
                    break;
                }
            }
            // Fuzzy match
            const fuzzy = this.fuzzyMatch(q, title);
            if (fuzzy > 0) score += fuzzy * 30;
        }

        // Tag matches (medium-high weight)
        if (item.tags && Array.isArray(item.tags)) {
            for (const tag of item.tags) {
                const tagNorm = removeAccents(tag.toLowerCase());
                if (tagNorm === q) score += 50;
                else if (tagNorm.includes(q)) score += 35;
                else {
                    for (const term of searchTerms) {
                        if (tagNorm.includes(removeAccents(term.toLowerCase()))) {
                            score += 30; // Boosted from 25
                            break;
                        }
                    }
                }
            }
        }

        // Focus points (medium weight)
        if (item.focusPoints && Array.isArray(item.focusPoints)) {
            for (const fp of item.focusPoints) {
                const fpNorm = removeAccents(fp.toLowerCase());
                if (fpNorm === q) score += 40;
                else if (fpNorm.includes(q)) score += 28;
                else {
                    for (const term of searchTerms) {
                        if (fpNorm.includes(removeAccents(term.toLowerCase()))) {
                            score += 25; // Boosted from 20
                            break;
                        }
                    }
                }
            }
        }

        // Content matches (lower weight, but still valuable)
        if (item.content_pt || item.content) {
            const content = removeAccents((item.content_pt || item.content).toLowerCase());
            const matches = content.split(q).length - 1;
            score += Math.min(matches * 12, 50); // Higher weight to catch single mentions

            // Check synonyms in content
            for (const term of searchTerms) {
                const termNorm = removeAccents(term.toLowerCase());
                const synonymMatches = content.split(termNorm).length - 1;
                if (synonymMatches > 0) {
                    score += Math.min(synonymMatches * 20, 60); // Boosted from *10 to *20, cap 60
                    break;
                }
            }

            // Bonus if query appears in first 100 chars
            if (content.substring(0, 100).includes(q)) score += 10;
        }

        return score;
    },

    // Enhanced search with all features
    search(items, query, options = {}) {
        const {
            minScore = 5,  // Lowered from 10 to allow more content matches
            maxResults = 100,
            useOperators = true,
            useFuzzy = true,
            useSynonyms = true
        } = options;

        if (!query || query.length < 1) return [];

        const results = [];
        const tokens = useOperators ? this.parseQuery(query) : [{ term: query, operator: 'AND' }];

        for (const item of items) {
            let totalScore = 0;
            let matches = 0;
            let excludes = 0;

            for (const token of tokens) {
                const score = this.scoreItem(item, token.term);

                if (token.operator === 'NOT') {
                    if (score > 0) excludes++;
                } else if (token.operator === 'OR') {
                    if (score > 0) {
                        matches++;
                        totalScore = Math.max(totalScore, score);
                    }
                } else { // AND
                    if (score > 0) {
                        matches++;
                        totalScore += score;
                    }
                }
            }

            // Skip if excluded
            if (excludes > 0) continue;

            // For AND operations, all terms must match
            const andTokens = tokens.filter(t => t.operator === 'AND').length;
            if (andTokens > 0 && matches < andTokens) continue;

            // Must meet minimum score
            if (totalScore >= minScore) {
                results.push({
                    item,
                    score: totalScore,
                    query
                });
            }
        }

        // Sort by score (highest first) and limit results
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults)
            .map(r => r.item);
    },

    // Spell correction using Levenshtein distance
    suggestCorrection(query, candidates) {
        const q = removeAccents(query.toLowerCase());
        if (q.length < 3) return null; // Too short to correct

        let bestMatch = null;
        let minDistance = Infinity;

        candidates.forEach(candidate => {
            const term = removeAccents(candidate.toLowerCase());
            const dist = this.levenshtein(q, term);

            // Dynamic threshold: Allow 1 error for short words, 2 for longer
            const threshold = q.length <= 4 ? 1 : 2;

            if (dist <= threshold && dist < minDistance) {
                minDistance = dist;
                bestMatch = candidate; // Return original casing
            }
        });

        // Only suggest if distance is small and it's not the query itself
        if (bestMatch && minDistance > 0) {
            return bestMatch;
        }
        return null;
    },

    // Levenshtein Distance Algorithm
    levenshtein(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix = [];

        // Initialize first column
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        // Initialize first row
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        // Fill matrix
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }
};

// Search History Manager
const SearchHistory = {
    maxHistory: 10,
    storageKey: 'johrei_search_history',

    getHistory() {
        try {
            const history = localStorage.getItem(this.storageKey);
            return history ? JSON.parse(history) : [];
        } catch (e) {
            return [];
        }
    },

    addSearch(query) {
        if (!query || query.trim().length < 2) return;

        let history = this.getHistory();

        // Remove duplicates
        history = history.filter(h => h !== query);

        // Add to front
        history.unshift(query);

        // Limit size
        history = history.slice(0, this.maxHistory);

        try {
            localStorage.setItem(this.storageKey, JSON.stringify(history));
        } catch (e) {
            console.error('Failed to save search history:', e);
        }
    },

    clearHistory() {
        try {
            localStorage.removeItem(this.storageKey);
        } catch (e) {
            console.error('Failed to clear search history:', e);
        }
    },

    getRelatedSearches(currentQuery) {
        const history = this.getHistory();
        const q = removeAccents(currentQuery.toLowerCase());

        return history.filter(h => {
            const hNorm = removeAccents(h.toLowerCase());
            return hNorm.includes(q) || q.includes(hNorm);
        }).slice(0, 5);
    },

    removeHistoryItem(query) {
        try {
            let history = this.getHistory();
            history = history.filter(h => h !== query);
            localStorage.setItem(this.storageKey, JSON.stringify(history));
            return true;
        } catch (e) {
            console.error('Failed to remove search history item:', e);
            return false;
        }
    }
};
