const CONFIG = {
    modes: {
        ensinamentos: {
            description: 'Ensinamentos de Meishu-Sama',
            file: 'index.json', path: 'data/',
            cats: {
                fundamentos: { label: 'Fundamentos', color: 'cat-blue' },
                qa: { label: 'Perguntas e Orientações', color: 'cat-green' },
                pontos_focais: { label: 'Casos Específicos', color: 'cat-purple' }
            }
        }
    }
};

const BODY_DATA = {
    points: {
        front: [
            { id: 'vertice', name: 'Alto da cabeça (Vértice)', x: 50, y: 2 },
            { id: 'frontal', name: 'Frontal - Região frontal/Testa', x: 50, y: 7 },
            { id: 'sobrancelhas', name: 'Sobrancelhas', x: 45, y: 13 }, // Novo
            { id: 'olhos', name: 'Olhos', x: 55, y: 15 },
            { id: 'nariz', name: 'Nariz', x: 50, y: 17.5 },
            { id: 'boca', name: 'Boca', x: 50, y: 22.5 },
            { id: 'garganta', name: 'Garganta', x: 50, y: 30 },
            { id: 'laterais-pescoco', name: 'Laterais do pescoço', x: 42, y: 28 },
            { id: 'arredores-garganta', name: 'Arredores de garganta', x: 58, y: 28 },
            { id: 'linfaticas', name: 'Glândulas linfáticas cervicais', x: 53, y: 32 },
            { id: 'ombros', name: 'Ombros', x: 28, y: 37 },
            { id: 'bracos', name: 'Braços (raiz do braço)', x: 22, y: 43 },
            { id: 'torax', name: 'Tórax', x: 50, y: 38 }, // Novo
            { id: 'coracao', name: 'Coração', x: 50, y: 44.5 },
            { id: 'axilas', name: 'Axilas', x: 30, y: 52 },
            { id: 'pulmoes', name: 'Pulmões', x: 62, y: 49 },
            { id: 'diafragma', name: 'Diafragma', x: 60, y: 57 },
            { id: 'figado', name: 'Fígado', x: 53, y: 59.5 },
            { id: 'estomago', name: 'Estômago', x: 57, y: 65 },
            { id: 'pancreas', name: 'Pâncreas', x: 52, y: 67 },
            { id: 'intestino', name: 'Intestino', x: 50, y: 74 }, // Novo
            { id: 'umbigo', name: 'Umbigo', x: 50, y: 76 },
            { id: 'baixo-ventre', name: 'Baixo ventre', x: 50, y: 78 },
            { id: 'bexiga', name: 'Bexiga', x: 50, y: 80 },
            { id: 'inguinal', name: 'Região inguinal', x: 63, y: 84 },
            { id: 'virilha', name: 'Virilha', x: 42, y: 89 },
            { id: 'membros', name: 'Membros e Extremidades', x: 72, y: 92 }
        ],

        back: [
            { id: 'occipital', name: 'Região Occipital', x: 50, y: 20.5 },
            { id: 'nuca', name: 'Nuca', x: 50, y: 25 },
            { id: 'bulbo', name: 'Bulbo Raquidiano', x: 50, y: 29 },
            { id: 'medula-cervical', name: 'Medula cervical', x: 50, y: 32.5 },
            { id: 'regiao_omoplatas', name: 'Região entre as omoplatas', x: 69, y: 41 },
            { id: 'cardiaca-posterior', name: 'Região Cardíaca Posterior', x: 31, y: 41 }, // Novo
            { id: 'coluna', name: 'Coluna', x: 52, y: 53 },
            { id: 'rins', name: 'Rins - Região renal', x: 37, y: 66 },
            { id: 'sacro', name: 'Sacro', x: 55, y: 80.5 },
            { id: 'gluteos', name: 'Glúteos', x: 65, y: 86.5 },
            { id: 'anus', name: 'Ânus', x: 50, y: 92 },
            { id: 'coccix', name: 'Cóccix', x: 50, y: 95 }
        ],

        detail: [
            // --- Seção Superior: Cabeça (Perfil) ---
            { id: 'ouvidos', name: 'Ouvidos', x: 54, y: 21 },
            { id: 'parotida', name: 'Glândula parótida', x: 48, y: 23 },
            { id: 'occipital-detail', name: 'Região Occipital', x: 63, y: 21 },
            { id: 'nuca-detail', name: 'Nuca', x: 57, y: 25 },
            { id: 'bulbo-detail', name: 'Bulbo Raquidiano', x: 56, y: 29 },
            { id: 'medula-detail', name: 'Medula cervical', x: 56, y: 35 },
            { id: 'bochechas', name: 'Bochechas', x: 43, y: 25 }, // Novo (Perfil)
            { id: 'maxilar', name: 'Maxilar', x: 40, y: 28 }, // Novo (Perfil)
            // --- Seção do Meio: Digestivo ---
            { id: 'esofago', name: 'Esôfago', x: 47, y: 49 },
            { id: 'figado-detail', name: 'Fígado', x: 34, y: 59 },
            { id: 'estomago-detail', name: 'Estômago', x: 56, y: 60 },
            { id: 'pancreas-detail', name: 'Pâncreas', x: 50, y: 65 },
            // --- Seção Inferior: Pélvico ---
            { id: 'orgaos-internos', name: 'Órgãos Internos', x: 60, y: 80 },
            { id: 'utero', name: 'Útero (costas do útero)', x: 48, y: 83 }
        ]
    },
    keywords: {
        // Front view keywords
        vertice: ['vértice', 'topo', 'alto', 'cabeça', 'centro da cabeça', 'alto da cabeça', 'ministrar johrei na cabeça cura', 'a cabeça fica mais leve após a hemorragia'],
        frontal: ['fronte', 'frontal', 'testa', 'lobo frontal', 'recitar a oração zengensanji', 'região frontal', 'da região frontal até os olhos'],
        olhos: ['olhos', 'vista', 'visão', 'parte superior dos olhos (sobrancelhas)'],
        sobrancelhas: ['sobrancelhas', 'região frontal (sobrancelhas)'],
        nariz: ['nariz', 'narinas', 'parte posterior do nariz', 'o nariz', 'arredores do nariz'],
        'lados_nariz': ['lateral nariz', 'lados do nariz'],
        boca: ['boca', 'lábios'],
        bochechas: ['bochechas', 'face'],
        maxilar: ['maxilar', 'mandíbula'],
        pescoco: ['pescoço', 'ao redor do pescoço', 'laterais do pescoço', 'cervical'],
        garganta: ['garganta', 'faringe', 'arredores da garganta', 'amígdalas', 'laringe'],
        'arredores-garganta': ['arredores garganta', 'garganta', 'pescoço', 'amígdalas'],
        linfaticas: ['glândulas linfáticas', 'linfonodos', 'gânglios', 'glândulas linfáticas de pescoço', 'glândulas linfáticas cervicais'],
        'laterais-pescoco': ['lateral pescoço', 'pescoço', 'cervical', 'linfáticas', 'ombros', 'ouvidos'],
        ombros: ['ombros', 'ombro'],
        bracos: ['braços', 'raiz braço'],
        axilas: ['axilas', 'axila'],
        torax: ['tórax', 'peito'],
        coracao: ['coração', 'cardíaco', 'se a trindade pulmão-coração-estômago estiver bem'],
        pulmoes: ['pulmões', 'pulmonar', 'costas do pulmão', 'sem fazer o longo trajeto pelos pulmões'],
        diafragma: ['diafragma', 'borda inferior do diafragma', 'região do diafragma'],
        figado: ['fígado', 'hepático', 'fígado (costas)', 'costas do fígado', 'assim como a compressão do fígado afeta a vesícula'],
        estomago: ['estômago', 'gástrico', 'estômago (costas)'],
        pancreas: ['pâncreas', 'pâncreas (costas)'],
        intestino: ['intestino', 'intestinos'],
        'baixo-ventre': ['baixo ventre', 'hipogástrio', 'costas da região entre o umbigo'],
        'regiao_inguinal': ['inguinal', 'virilha', 'parte superior da região inguinal'],
        inguinal: ['inguinal', 'virilha'],
        virilha: ['virilha'],
        membros: ['membros', 'extremidades', 'braços', 'pernas'],
        umbigo: ['umbigo'],
        bexiga: ['bexiga'],

        // Back view keywords
        'centro_cabeca': ['centro cabeça'],
        'centro_cerebro': ['centro cérebro'],
        cerebro: ['cérebro', 'craniano'],
        occipital: ['occipital', 'occipício', 'região occipital'],
        nuca: ['nuca'],
        bulbo: ['bulbo', 'bulbo raquidiano', 'medula oblonga', 'arredores do bulbo', 'lado direito do bulbo'],
        'medula-cervical': ['medula cervical', 'cervical'],
        'regiao_cardiaca_posterior': ['região cardíaca posterior', 'cardíaca costas', 'região cardíaca nas costas'],
        'cardiaca-posterior': ['região cardíaca posterior', 'cardíaca costas', 'região cardíaca nas costas'],
        costas: ['costas', 'dorso'],
        regiao_omoplatas: ['omoplatas', 'escápulas', 'entre as omoplatas', 'intercostais', 'espaços intercostais', 'meio das costas', 'parte superior das costas'],
        coluna: ['coluna', 'espinha', 'vértebras', 'a coluna'],
        rins: ['rins', 'renal', 'região renal', 'reativar os rins', 'região renal nas costas', 'paralisia da perna: rins', 'rins. nota: no johrei'],
        'regiao_lombar': ['lombar', 'região lombar'],
        sacro: ['sacro', 'costas do útero (sacro)'],
        gluteos: ['glúteos', 'nádegas'],
        anus: ['ânus'],
        coccix: ['cóccix'],

        // Detail view keywords
        ouvidos: ['ouvidos', 'orelha'],
        parotida: ['glândula parótida', 'parótida', 'arredores da parótida'],
        'occipital-detail': ['occipital'],
        'nuca-detail': ['nuca'],
        'bulbo-detail': ['bulbo'],
        'medula-detail': ['medula cervical'],
        esofago: ['esôfago', 'esôfago (nas costas)'],
        'figado-detail': ['fígado'],
        'estomago-detail': ['estômago'],
        'pancreas-detail': ['pâncreas'],
        'orgaos-internos': ['órgãos internos'],
        utero: ['útero', 'uterino', 'útero costas']
    }
};