/* ============================================================
   js/culto-mensal.js
   Orientação do Culto Mensal — fetch do MD, render, modal,
   badge, TTS dedicado, print.

   Storage: data/culto_mensal_atual.md (sobrescrito a cada mês).
   Detecção de novidade: 1ª linha do MD comparada com
   localStorage['cultoMensalLastSeen'].
   ============================================================ */
(function () {
    'use strict';

    // ── Variantes ────────────────────────────────────────────────────────────
    // O MESMO modal/CSS/JS serve duas orientações karaokê: o Culto Mensal (rotativo
    // todo mês) e o Culto Especial (one-off, ex.: Dia do Paraíso Terrestre). Só muda
    // o slug dos arquivos, o rótulo da categoria, a chave de analytics e a de "visto".
    const VARIANTS = {
        mensal: {
            name: 'mensal',
            slug: 'culto_mensal_atual',
            category: 'Orientação do Mês',
            audioKey: null,                       // sem prop audio: preserva métrica histórica
            seenKey: 'cultoMensalLastSeen',       // title-based (rotativo)
            modalParam: 'culto-mensal',
        },
        especial: {
            name: 'especial',
            slug: 'culto_especial_atual',
            category: 'Culto Paraíso Terrestre',
            audioKey: 'culto_especial',           // discrimina no dashboard (≈ DIR_AUDIO_KEY)
            seenKey: 'cultoEspecialSeen',          // flag simples '1' (one-off, não rotaciona)
            modalParam: 'culto-especial',
        },
    };
    let V = VARIANTS.mensal;     // variante ativa

    // SOURCE_URL é resolvido lazy no 1º fetch (window.guiaDataUrl pode não estar
    // pronto no momento em que esta IIFE roda, dependendo da ordem dos scripts).

    // Cache da última carga (evita 2 fetches: badge check + open modal).
    // Específico da variante: trocar de culto reseta tudo (ver setVariant).
    let cached = null;          // { title, salmo, body }
    let cachedRawFirstLine = null;
    let isLoading = false;

    function cmAudioUrl() { return 'assets/audio/' + V.slug + '.mp3'; }
    function cmTimestampsFile() { return V.slug + '.timestamps.json'; }

    // Troca a variante ativa e invalida os caches dependentes dela. No-op se já é
    // a variante pedida. Reseta também o <audio> (src muda entre cultos).
    function setVariant(name) {
        const next = VARIANTS[name];
        if (!next || next === V) return;
        V = next;
        cached = null; cachedRawFirstLine = null; isLoading = false;
        cmTimestamps = null; cmTimestampsTried = false; cmCurrentFragIdx = -1;
        const a = document.getElementById('cultoMensalAudioEl');
        if (a) { try { a.pause(); } catch (e) {} a.removeAttribute('src'); try { a.load(); } catch (e) {} }
        const bar = document.getElementById('cultoMensalAudioBar');
        if (bar) bar.hidden = true;
        const follow = document.getElementById('btnCultoMensalFollow');
        if (follow) follow.hidden = true;
    }

    /* --- Fetch + parse --- */

    async function fetchContent() {
        if (cached) return cached;
        if (isLoading) {
            // Espera o fetch em andamento
            await new Promise(resolve => {
                const check = () => cached ? resolve() : setTimeout(check, 50);
                check();
            });
            return cached;
        }
        isLoading = true;
        try {
            const res = await fetch(window.guiaDataUrl(V.slug + '.md'), { cache: 'no-cache' });
            if (!res.ok) throw new Error('Falha ao carregar orientação: ' + res.status);
            const raw = await res.text();
            cached = parseMarkdown(raw);
            cachedRawFirstLine = cached.title;
            return cached;
        } finally {
            isLoading = false;
        }
    }

    function parseMarkdown(raw) {
        // Normaliza CRLF -> LF e remove BOM
        raw = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');

        // Quebra em linhas não vazias
        const lines = raw.split('\n');

        // 1ª linha não vazia = título
        // 2ª linha não vazia = salmo
        const nonEmpty = lines.map(l => l.trim()).filter(Boolean);
        const title = nonEmpty[0] || 'Culto Mensal';
        const salmo = nonEmpty[1] || '';

        // Corpo = tudo após a 2ª linha não vazia
        // Recuperamos os parágrafos pelo split em linhas em branco do raw,
        // pulando os 2 primeiros blocos (título e salmo).
        const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
        const bodyBlocks = blocks.slice(2);

        // Citações de Meishu-Sama frequentemente atravessam vários parágrafos:
        // abrem com "..." em um parágrafo e fecham com ..." em outro vários
        // parágrafos depois. Marcamos como blockquote todos os blocos entre
        // abertura e fechamento (inclusive os intermediários, que não começam
        // nem terminam com aspas).
        // Salmos/poemas: no MD cada verso é um bloco próprio (1 verso = 1
        // fragmento de áudio). Detectamos o poema pela linha introdutória que
        // termina em "Salmo:" e marcamos os versos curtos seguintes como
        // .cm-verse — o render agrupa a estrofe (itálico, centralizado, sem os
        // vãos de parágrafo). Encerra na 1ª linha longa/parentética/citação.
        let inQuote = false;
        let verseMode = false;
        let stanzaOpen = false;      // versos consecutivos são envoltos numa estrofe
        const pieces = [];
        bodyBlocks.forEach((block, idx) => {
            const trimmed = block.trim();
            // continuation: já estamos dentro de citação aberta em bloco anterior
            const continuation = inQuote;
            const opens = quoteOpens(block) || attrQuoteOpens(block);
            const closes = quoteCloses(block);
            const isQuote = continuation || opens;
            // Atualiza estado para próximo bloco
            if (opens && !closes) inQuote = true;
            else if (closes) inQuote = false;
            // (caso edge: abre e fecha no mesmo bloco — isQuote=true, inQuote=false)

            // Verso: em verseMode (bloco anterior terminou em "Salmo:") e a
            // linha parece verso. Senão, encerra o modo verso.
            let isVerse = false;
            if (verseMode && !isQuote && isVerseLine(trimmed)) isVerse = true;
            else verseMode = false;
            // Liga verseMode para o PRÓXIMO bloco se este introduz um salmo.
            if (!isQuote && /salmo\s*:\s*$/i.test(trimmed)) verseMode = true;

            // Envolve versos consecutivos numa <div.cm-stanza> — permite ornamentar
            // a estrofe (::before/::after) sem afetar o data-frag de cada verso.
            if (!isVerse && stanzaOpen) { pieces.push('</div>'); stanzaOpen = false; }
            if (isVerse && !stanzaOpen) { pieces.push('<div class="cm-stanza">'); stanzaOpen = true; }

            pieces.push(blockToHtml(block, isQuote, idx, isVerse, continuation));
        });
        if (stanzaOpen) pieces.push('</div>');
        const html = pieces.join('\n');

        return { title, salmo, body: html };
    }

    // Atribuição curta terminada em ':' seguida imediatamente de aspa.
    // Grupo 1 = atribuição, grupo 2 = da aspa em diante.
    const ATTR_QUOTE_RE = /^([^"“”„.!?]{1,40}?:)\s*(["“”„][\s\S]*)$/;

    function quoteOpens(block) {
        return /^["“”„]/.test(block.trim());
    }

    function quoteCloses(block) {
        // Procura aspa de fechamento perto do final do bloco
        // (permite pontuação trailing como ." ou ".)
        return /["“”]\s*[.,;:!?]*\s*$/.test(block.trim());
    }

    // Atribuição curta ("Meishu Sama:") seguida de citação que ABRE e não fecha
    // no mesmo bloco — ou seja, o bloco inicia uma citação multi-parágrafo. Sem
    // isto, quoteOpens() não enxerga a abertura (o bloco começa por letra, não
    // por aspa) e os parágrafos seguintes da citação não são recuados.
    // Nº ímpar de aspas na parte citada = abriu e ficou aberta.
    function attrQuoteOpens(block) {
        const m = ATTR_QUOTE_RE.exec(block.trim());
        if (!m) return false;
        return ((m[2].match(/["“”„]/g) || []).length % 2) === 1;
    }

    // Verso de salmo: linha curta, não parentética (nota editorial) e não a
    // própria linha introdutória ("...diz o Salmo:").
    function isVerseLine(t) {
        if (!t || t.length > 80) return false;
        if (/^[(（]/.test(t)) return false;
        if (/salmo\s*:\s*$/i.test(t)) return false;
        return true;
    }

    // Remove escapes de markdown (\. \, \! etc.) e processa itálicos *texto* -> <em>
    function cmInner(text) {
        return escapeHtml(text)
            .replace(/\\([.,!?:;'"()\[\]\\\-])/g, '$1')
            .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    }

    // Atribuição(ões) com citação "colada" no MESMO parágrafo. Ex.:
    //   Meishu Sama diz: “…”
    //   Meishu-Sama disse: “…”. Disse também: “…”.
    // Cada atribuição curta vira uma linha normal (.cm-attribution) e cada
    // citação um blockquote recuado — todos com o MESMO data-frag, pois o áudio
    // narra o parágrafo como um único fragmento (highlight/seek via
    // querySelectorAll). Devolve null se o bloco não começa com atribuição+aspa.
    function cmSplitAttributedQuotes(text, fragAttr) {
        // atribuição curta (sem . ! ?) terminada em ':' + citação entre aspas
        const seg = /([^"“”„.!?]{1,40}?:)\s*(["“”„][^"“”]*["“”][.,;:!?]*)/g;
        const out = [];
        let m, last = 0, startedAtZero = false;
        while ((m = seg.exec(text)) !== null) {
            const gap = text.slice(last, m.index).trim();
            if (gap) out.push('<p' + fragAttr + '>' + cmInner(gap) + '</p>');
            if (m.index === 0) startedAtZero = true;
            out.push('<p' + fragAttr + ' class="cm-attribution">' + cmInner(m[1].trim()) + '</p>');
            out.push('<blockquote' + fragAttr + ' class="cm-quote">' + cmInner(m[2].trim()) + '</blockquote>');
            last = seg.lastIndex;
        }
        // Só aplica se o padrão bate a partir do início do bloco.
        if (!startedAtZero || !out.length) return null;
        // O resto pode ser uma 2ª citação sem atribuição própria — ex.:
        //   Meishu-Sama: "…deve ser dito". "Como já afirmei…"
        // Nesse caso ela também é recuada, senão só a 1ª citação ficaria.
        const tail = text.slice(last).trim();
        if (tail) {
            out.push(quoteOpens(tail)
                ? '<blockquote' + fragAttr + ' class="cm-quote">' + cmInner(tail) + '</blockquote>'
                : '<p' + fragAttr + '>' + cmInner(tail) + '</p>');
        }
        return out.join('\n');
    }

    // Atribuição + citação multi-parágrafo (abre aqui, fecha blocos adiante).
    // Ex.: Meishu Sama: “Sim, o mercado de ações desaparecerá. …
    // A atribuição fica como linha normal e a citação abre recuada; os blocos
    // seguintes são recuados pelo estado inQuote até a aspa de fechamento.
    function cmSplitAttributionOpen(text, fragAttr) {
        const m = ATTR_QUOTE_RE.exec(text);
        if (!m) return null;
        return '<p' + fragAttr + ' class="cm-attribution">' + cmInner(m[1].trim()) + '</p>\n'
            + '<blockquote' + fragAttr + ' class="cm-quote">' + cmInner(m[2].trim()) + '</blockquote>';
    }

    function blockToHtml(block, isQuote, idx, isVerse, continuation) {
        const trimmed = block.trim();
        const fragAttr = (typeof idx === 'number') ? ' data-frag="' + idx + '"' : '';

        // Verso de salmo — parágrafo próprio, agrupado em estrofe pelo CSS.
        if (isVerse) {
            return '<p' + fragAttr + ' class="cm-verse">' + cmInner(trimmed) + '</p>';
        }

        // Citação(ões) "colada(s)" na atribuição no MESMO parágrafo. Só quando o
        // bloco não é continuação de citação multi-parágrafo já aberta (aí ele
        // é recuado inteiro, sem tentar separar atribuição).
        if (!continuation) {
            // 1º os pares atribuição+citação completos no mesmo bloco
            const split = cmSplitAttributedQuotes(trimmed, fragAttr);
            if (split) return split;
            // 2º a atribuição que abre citação e só fecha adiante
            if (isQuote) {
                const attrOpen = cmSplitAttributionOpen(trimmed, fragAttr);
                if (attrOpen) return attrOpen;
            }
        }

        // Atribuição curta ("Meishu Sama diz:", "Meishu-Sama expressou assim:" etc.)
        const isAttribution =
            /^[A-Za-zÀ-ÿ\-\s]{0,40}(diz|expressou|fala|explica|alertava)[A-Za-zÀ-ÿ\s,]*[:.]?\s*$/i
                .test(trimmed) && trimmed.length < 80;

        let cls = '';
        let tag = 'p';
        if (isQuote) {
            tag = 'blockquote';
            cls = 'cm-quote';
        } else if (isAttribution) {
            cls = 'cm-attribution';
        }

        return '<' + tag + fragAttr + (cls ? ' class="' + cls + '"' : '') + '>' + cmInner(trimmed) + '</' + tag + '>';
    }

    function escapeHtml(s) {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /* --- Render no modal --- */

    function render(data) {
        const cat = document.getElementById('cultoMensalCategory');
        if (cat) cat.textContent = V.category;
        document.getElementById('cultoMensalTitle').textContent = data.title;
        document.getElementById('cultoMensalSalmo').textContent = data.salmo;
        document.getElementById('cultoMensalBody').innerHTML = data.body;
    }

    /* --- Badge (notificação de novidade) --- */

    // "Culto Mensal 7 – junho – 2026" → "07/junho/2026". Devolve null se não casar
    // (mantém o fallback fixo do HTML). Cobre dia com ordinal ("1º").
    function cmParseMenuDate(title) {
        const parts = String(title || '').split(/[–—-]/);
        if (parts.length < 3) return null;
        const dayM = parts[0].match(/(\d{1,2})\s*º?\s*$/);
        const month = parts[1].trim().toLowerCase();
        const yearM = parts[2].match(/\d{4}/);
        if (!dayM || !month || !yearM) return null;
        return `${dayM[1].padStart(2, '0')}/${month}/${yearM[0]}`;
    }

    async function checkBadgeStatus() {
        // Roda no load com V = mensal: checa novidade do Culto Mensal (title-based)
        // e seta o state-holder invisível #cultoMensalBadge. O Especial não faz
        // fetch no load — sua novidade é um flag simples (ver refreshOrientacoesBadge).
        try {
            const data = await fetchContent();
            // Data dinâmica no menu Orientações, lida do título do MD do mensal.
            const dateEl = document.getElementById('cultoMensalMenuDate');
            if (dateEl) { const d = cmParseMenuDate(data.title); if (d) dateEl.textContent = d; }
            const lastSeen = localStorage.getItem(VARIANTS.mensal.seenKey);
            const badge = document.getElementById('cultoMensalBadge');
            if (!badge) return;
            if (lastSeen === data.title) {
                badge.classList.add('hidden');
            } else {
                badge.classList.remove('hidden');
            }
        } catch (err) {
            console.warn('[culto-mensal] falha ao checar badge:', err);
        }
    }

    function markAsSeen() {
        if (V.name === 'mensal') {
            if (cachedRawFirstLine) {
                localStorage.setItem(V.seenKey, cachedRawFirstLine);
                const badge = document.getElementById('cultoMensalBadge');
                if (badge) badge.classList.add('hidden');
            }
        } else {
            // One-off: marca como visto com flag simples (não rotaciona por título)
            try { localStorage.setItem(V.seenKey, '1'); } catch (e) {}
        }
        if (typeof window._refreshOrientacoesBadge === 'function') window._refreshOrientacoesBadge();
    }

    /* Inicializa badge ao carregar */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkBadgeStatus);
    } else {
        checkBadgeStatus();
    }

    /* --- Abrir/fechar --- */

    /* --- Virtual pageview p/ analytics ---
       Ao abrir o modal, fazemos pushState com `?modal=culto-mensal`. O
       analytics-tracker.js já patcha pushState/popstate e emite pageview;
       a partir desse ponto heartbeat/scroll passam a ser atribuídos ao
       Culto Mensal, dando "permanência na leitura" sem código extra de
       tracking. O state.cultoMensal nos permite reverter no close sem
       quebrar a navegação anterior do guia (?item=...). */
    let cmOriginalUrl = null;

    function cmPushModalUrl() {
        cmOriginalUrl = location.pathname + location.search + location.hash;
        const url = new URL(location.href);
        url.searchParams.set('modal', V.modalParam);
        try {
            history.pushState({ cultoMensal: true }, '', url.pathname + url.search + url.hash);
        } catch (_) { /* navegador antigo — ignora */ }
    }

    function cmPopModalUrl() {
        if (!cmOriginalUrl) return;
        const onModal = new URLSearchParams(location.search).get('modal') === V.modalParam;
        if (onModal) {
            try { history.pushState({}, '', cmOriginalUrl); } catch (_) {}
        }
        cmOriginalUrl = null;
    }

    function cmHideModal() {
        document.getElementById('cultoMensalModal').classList.remove('is-open');
        document.body.style.overflow = '';
    }

    async function openCulto(variantName) {
        setVariant(variantName);
        try {
            const data = await fetchContent();
            render(data);
            document.getElementById('cultoMensalModal').classList.add('is-open');
            document.body.style.overflow = 'hidden';
            cmBindFollowGestures();
            cmBindBodyClick();
            cmUpdateFollowButton();
            // Carrega timestamps em paralelo (não bloqueia abertura)
            cmLoadTimestamps().then(ts => {
                const hasTs = !!ts && ts.length > 0;
                const btn = document.getElementById('btnCultoMensalFollow');
                if (btn) btn.hidden = !hasTs;
                const body = document.getElementById('cultoMensalBody');
                if (body) body.classList.toggle('cm-has-timestamps', hasTs);
            });
            cmPushModalUrl();
            markAsSeen();
        } catch (err) {
            console.error('[culto-mensal] erro:', err);
            alert('Não foi possível carregar a orientação.');
        }
    }

    window.openCultoMensal = function () { return openCulto('mensal'); };
    window.openCultoEspecial = function () { return openCulto('especial'); };

    window.closeCultoMensal = function () {
        cmStopAudio();
        cmFlushAudioStats();
        cmHideModal();
        cmPopModalUrl();
    };

    /* Back-button do navegador: se a URL deixar de ter modal=culto-mensal
       mas o modal ainda estiver aberto, fecha sem novo pushState (a URL
       já voltou pra original via popstate). */
    window.addEventListener('popstate', () => {
        const modal = document.getElementById('cultoMensalModal');
        if (!modal || !modal.classList.contains('is-open')) return;
        const onModalUrl = new URLSearchParams(location.search).get('modal') === V.modalParam;
        if (!onModalUrl) {
            cmStopAudio();
            cmFlushAudioStats();
            cmHideModal();
            cmOriginalUrl = null;
        }
    });

    /* --- Áudio (substitui o TTS) ---
       URL do MP3 e do timestamps são resolvidos por variante via cmAudioUrl()/
       cmTimestampsFile() (definidos no topo). MP3 fica em assets/audio (não migrou
       pro Storage). Timestamps vão pro Storage como o resto dos dados editáveis. */
    let cmAudioBound = false;

    function cmBindAudio() {
        if (cmAudioBound) return document.getElementById('cultoMensalAudioEl');
        const a = document.getElementById('cultoMensalAudioEl');
        if (!a) return null;
        const btn = () => document.getElementById('btnCultoMensalAudio');
        a.addEventListener('play', () => {
            const b = btn(); if (b) b.classList.add('is-speaking');
            // Ao iniciar reprodução, reativa o "acompanhar texto"
            cmFollowMode = true;
            cmUpdateFollowButton();
            cmOnAudioPlay();
        });
        a.addEventListener('pause', () => {
            const b = btn(); if (b) b.classList.remove('is-speaking');
            cmOnAudioPause();
        });
        a.addEventListener('ended', () => {
            const b = btn(); if (b) b.classList.remove('is-speaking');
            cmOnAudioEnded();
        });
        a.addEventListener('error', () => {
            const bar = document.getElementById('cultoMensalAudioBar');
            if (bar) bar.hidden = true;
            const b = btn(); if (b) b.classList.remove('is-speaking');
            alert('Áudio do mês ainda não disponível.');
        });
        a.addEventListener('timeupdate', cmOnAudioTimeUpdate);
        a.addEventListener('seeking', cmOnAudioTimeUpdate);
        cmAudioBound = true;
        return a;
    }

    /* --- Tracking de escuta do áudio (analytics) ---
       Pipeline: cmOnAudioPlay/Pause/Ended → window.mioshieTrack (exposto
       por js/analytics-tracker.js). Acumulamos segundos efetivamente
       ouvidos via timestamp do play e diferença no pause/ended, sem
       depender de timeupdate (mais leve e robusto a seeks). */
    let cmAudioPlaying = false;
    let cmAudioPlayStartMs = 0;
    let cmAudioPlayStartPos = 0;
    let cmAudioTotalPlayed = 0;
    let cmAudioDuration = 0;
    let cmEndedFiredThisPlay = false; // debounce: no máx. 1 'ended' por reprodução

    function cmTrackAudio(type, extra) {
        if (typeof window.mioshieTrack !== 'function') return;
        const props = Object.assign({
            duration_seconds: cmAudioDuration ? Math.round(cmAudioDuration) : null
        }, V.audioKey ? { audio: V.audioKey } : {}, extra || {});
        try { window.mioshieTrack(type, props); } catch (_) {}
    }

    function cmOnAudioPlay() {
        if (cmAudioPlaying) return;
        cmAudioPlaying = true;
        cmEndedFiredThisPlay = false; // nova reprodução libera 1 novo 'ended'
        const a = document.getElementById('cultoMensalAudioEl');
        cmAudioPlayStartMs = Date.now();
        cmAudioPlayStartPos = a ? a.currentTime : 0;
        if (a && isFinite(a.duration)) cmAudioDuration = a.duration;
        cmTrackAudio('audio_play', {
            position_seconds: Math.round(cmAudioPlayStartPos)
        });
    }

    function cmOnAudioPause() {
        if (!cmAudioPlaying) return;
        cmAudioPlaying = false;
        const elapsed = (Date.now() - cmAudioPlayStartMs) / 1000;
        cmAudioTotalPlayed += elapsed;
        const a = document.getElementById('cultoMensalAudioEl');
        cmTrackAudio('audio_pause', {
            position_seconds: a ? Math.round(a.currentTime) : null,
            segment_seconds: Math.round(elapsed),
            total_played_seconds: Math.round(cmAudioTotalPlayed)
        });
    }

    function cmOnAudioEnded() {
        cmOnAudioPause();
        // Só registra 'fim' se realmente chegou ao fim tocando: no máx. 1 por
        // reprodução (debounce) e com o playhead perto da duração. Filtra
        // disparos em rajada / arrastar-até-o-fim que inflavam "escutas
        // completas" no analytics (1 navegador chegou a gerar 99 endeds).
        if (cmEndedFiredThisPlay) return;
        const a = document.getElementById('cultoMensalAudioEl');
        const reachedEnd = a && isFinite(a.duration) && a.currentTime >= a.duration - 2;
        if (!reachedEnd) return;
        cmEndedFiredThisPlay = true;
        cmTrackAudio('audio_ended', {
            total_played_seconds: Math.round(cmAudioTotalPlayed)
        });
    }

    /* Chamado em closeCultoMensal: se o áudio ainda estava tocando, fecha
       o segmento atual e zera o acumulado pra próxima sessão. */
    function cmFlushAudioStats() {
        const a = document.getElementById('cultoMensalAudioEl');
        if (a && !a.paused && cmAudioPlaying) {
            cmOnAudioPause();
        }
        cmAudioTotalPlayed = 0;
    }

    /* --- Sincronização texto↔áudio por timestamps (aeneas) --- */
    let cmTimestamps = null;      // [{ begin, end }] paralelo a bodyBlocks
    let cmTimestampsTried = false;
    let cmCurrentFragIdx = -1;
    let cmFollowMode = true;

    async function cmLoadTimestamps() {
        if (cmTimestampsTried) return cmTimestamps;
        cmTimestampsTried = true;
        try {
            const res = await fetch(window.guiaDataUrl(cmTimestampsFile()), { cache: 'no-cache' });
            if (!res.ok) { cmTimestamps = []; return cmTimestamps; }
            const data = await res.json();
            const frags = (data && data.fragments) || [];
            cmTimestamps = frags.map(f => ({
                begin: parseFloat(f.begin),
                end: parseFloat(f.end)
            }));
        } catch (e) {
            cmTimestamps = [];
        }
        return cmTimestamps;
    }

    function cmFindFragment(t) {
        if (!cmTimestamps || cmTimestamps.length === 0) return -1;
        // Busca binária pelo fragmento que contém t
        let lo = 0, hi = cmTimestamps.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const f = cmTimestamps[mid];
            if (t < f.begin) hi = mid - 1;
            else if (t >= f.end) lo = mid + 1;
            else return mid;
        }
        // Entre fragmentos: devolve o anterior (já consumido)
        return Math.max(0, hi);
    }

    function cmScrollToParagraph(el) {
        const content = document.getElementById('cultoMensalContent');
        if (!content || !el) return;
        const elRect = el.getBoundingClientRect();
        const cRect = content.getBoundingClientRect();
        const offsetWithin = elRect.top - cRect.top + content.scrollTop;
        const target = offsetWithin - content.clientHeight * 0.35;
        const max = content.scrollHeight - content.clientHeight;
        const clamped = Math.max(0, Math.min(max, target));
        content.scrollTo({ top: clamped, behavior: 'smooth' });
    }

    function cmOnAudioTimeUpdate() {
        if (!cmTimestamps || cmTimestamps.length === 0) return;
        const a = document.getElementById('cultoMensalAudioEl');
        if (!a) return;
        const idx = cmFindFragment(a.currentTime);
        if (idx === cmCurrentFragIdx || idx < 0) return;

        const body = document.getElementById('cultoMensalBody');
        if (!body) return;
        // Um fragmento pode render 2 elementos (atribuição + blockquote) com o
        // mesmo data-frag — usa querySelectorAll pra pintar/limpar ambos.
        body.querySelectorAll('[data-frag].cm-current').forEach(el => el.classList.remove('cm-current'));
        const nexts = body.querySelectorAll('[data-frag="' + idx + '"]');
        nexts.forEach(el => el.classList.add('cm-current'));
        if (nexts.length && cmFollowMode) cmScrollToParagraph(nexts[0]);
        cmCurrentFragIdx = idx;
    }

    function cmUpdateFollowButton() {
        const btn = document.getElementById('btnCultoMensalFollow');
        if (!btn) return;
        btn.setAttribute('aria-pressed', String(cmFollowMode));
        btn.title = cmFollowMode
            ? 'Acompanhando o texto — clique para soltar'
            : 'Acompanhar texto durante o áudio';
    }

    function cmDisableFollow() {
        if (!cmFollowMode) return;
        cmFollowMode = false;
        cmUpdateFollowButton();
    }

    function cmBindFollowGestures() {
        const content = document.getElementById('cultoMensalContent');
        if (!content || content.__cmFollowBound) return;
        content.addEventListener('wheel', cmDisableFollow, { passive: true });
        // touchmove removido propositalmente — no mobile o usuário não tem botão
        // pra reativar follow, então qualquer toque acidental travava o auto-scroll.
        // wheel + keydown cobrem desktop (mouse, trackpad e teclado).
        content.addEventListener('keydown', (e) => {
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) {
                cmDisableFollow();
            }
        });
        content.__cmFollowBound = true;
    }

    /* Clique em parágrafo -> seek no áudio para o início desse parágrafo */
    function cmOnBodyClick(e) {
        if (!cmTimestamps || cmTimestamps.length === 0) return;
        // Não interrompe seleção de texto (usuário copiando/marcando)
        const sel = window.getSelection && window.getSelection();
        if (sel && sel.toString().trim().length > 0) return;

        const el = e.target.closest('[data-frag]');
        if (!el) return;
        const idx = parseInt(el.getAttribute('data-frag'), 10);
        if (isNaN(idx) || !cmTimestamps[idx]) return;

        const audio = document.getElementById('cultoMensalAudioEl');
        if (!audio) return;

        // Garante que o player está visível e com src carregado
        const bar = document.getElementById('cultoMensalAudioBar');
        if (bar && bar.hidden) window.toggleCultoMensalAudio();

        const begin = cmTimestamps[idx].begin;
        // Re-ativa follow (usuário acabou de pedir explicitamente para ir ali)
        cmFollowMode = true;
        cmUpdateFollowButton();

        cmSeekAndPlay(begin);
    }

    /* Seek + play robusto. Lida com o caso de o áudio ainda não ter metadata
       carregada (audio.readyState < HAVE_METADATA): nesse caso espera o
       loadedmetadata antes de seekar. */
    function cmSeekAndPlay(targetTime) {
        const audio = document.getElementById('cultoMensalAudioEl');
        if (!audio) return;

        const doSeek = () => {
            try { audio.currentTime = targetTime; } catch (_) {}
            if (audio.paused) audio.play().catch(() => {});
        };

        if (audio.readyState >= 1) {
            doSeek();
        } else {
            // Força o carregamento da metadata
            try { audio.load(); } catch (_) {}
            audio.addEventListener('loadedmetadata', doSeek, { once: true });
        }
    }

    function cmBindBodyClick() {
        const body = document.getElementById('cultoMensalBody');
        if (!body || body.__cmClickBound) return;
        body.addEventListener('click', cmOnBodyClick);
        body.__cmClickBound = true;
    }

    window.toggleCultoMensalFollow = function () {
        cmFollowMode = !cmFollowMode;
        cmUpdateFollowButton();
        if (cmFollowMode) {
            // Snap imediato para o parágrafo atual
            const body = document.getElementById('cultoMensalBody');
            const cur = body && body.querySelector('[data-frag].cm-current');
            if (cur) cmScrollToParagraph(cur);
        }
    };

    function cmStopAudio() {
        const a = document.getElementById('cultoMensalAudioEl');
        if (a && !a.paused) a.pause();
    }

    window.toggleCultoMensalAudio = function () {
        const bar = document.getElementById('cultoMensalAudioBar');
        const a = cmBindAudio();
        if (!bar || !a) return;
        if (bar.hidden) {
            bar.hidden = false;
            if (!a.src) a.src = cmAudioUrl() + '?v=' + Date.now();
        } else {
            if (!a.paused) a.pause();
            bar.hidden = true;
        }
    };

    /* --- Download (áudio + PDF da transcrição) --- */

    // Substitui chars proibidos em filenames (Windows/macOS/Linux),
    // preservando º, –, acentos, etc.
    function cmFilenameFor(title) {
        const safe = (title || 'Culto Mensal')
            .replace(/[\\/:*?"<>|]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();
        return safe || 'Culto Mensal';
    }

    // jsPDF (Helvetica/Times standard) só suporta Latin-1. Substitui
    // chars que renderizam como '?' por equivalentes ASCII seguros.
    function cmPdfSafe(s) {
        return (s || '')
            .replace(/ /g, ' ')           // NBSP
            .replace(/[–—]/g, '-')   // en/em-dash → hífen
            .replace(/[“”„]/g, '"') // aspas duplas curvas
            .replace(/[‘’‚]/g, "'") // aspas simples curvas
            .replace(/…/g, '...')         // ellipsis
            .replace(/•/g, '-');          // bullet
    }

    let _jsPdfPromise = null;
    let _jsZipPromise = null;

    function cmLoadScript(src, check, errMsg) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => {
                const val = check();
                if (val) resolve(val);
                else reject(new Error(errMsg + ' (script carregou mas globais ausentes)'));
            };
            s.onerror = () => reject(new Error(errMsg + ' (falha de rede?)'));
            document.head.appendChild(s);
        });
    }

    function cmLoadJsPDF() {
        if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
        if (_jsPdfPromise) return _jsPdfPromise;
        _jsPdfPromise = cmLoadScript(
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
            () => window.jspdf && window.jspdf.jsPDF,
            'Falha ao carregar o gerador de PDF'
        ).catch(err => { _jsPdfPromise = null; throw err; });
        return _jsPdfPromise;
    }

    function cmLoadJsZip() {
        if (window.JSZip) return Promise.resolve(window.JSZip);
        if (_jsZipPromise) return _jsZipPromise;
        _jsZipPromise = cmLoadScript(
            'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
            () => window.JSZip,
            'Falha ao carregar empacotador ZIP'
        ).catch(err => { _jsZipPromise = null; throw err; });
        return _jsZipPromise;
    }

    async function cmGeneratePdfBlob(data) {
        const JsPDF = await cmLoadJsPDF();
        const doc = new JsPDF({ unit: 'mm', format: 'a4' });

        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 20;
        const usableW = pageW - 2 * margin;
        const bottomLimit = pageH - margin - 8; // 8mm pro rodapé
        let y = margin;

        // Título
        doc.setFont('times', 'bold');
        doc.setFontSize(19);
        const titleLines = doc.splitTextToSize(cmPdfSafe(data.title), usableW);
        titleLines.forEach(line => {
            doc.text(line, pageW / 2, y, { align: 'center' });
            y += 8.5;
        });

        // Salmo (itálico, centralizado)
        if (data.salmo) {
            y += 2;
            doc.setFont('times', 'italic');
            doc.setFontSize(13);
            const sLines = doc.splitTextToSize(cmPdfSafe(data.salmo), usableW);
            sLines.forEach(line => {
                doc.text(line, pageW / 2, y, { align: 'center' });
                y += 6.5;
            });
        }

        y += 7;

        // Corpo — recupera blocos formatados do DOM já renderizado
        const bodyEl = document.getElementById('cultoMensalBody');
        // Achata a estrofe: cada verso (<p> dentro de <div.cm-stanza>) vira um
        // bloco próprio, senão o textContent do <div> juntaria os versos numa linha.
        const blocks = [];
        for (const c of (bodyEl ? Array.from(bodyEl.children) : [])) {
            if (c.classList && c.classList.contains('cm-stanza')) blocks.push(...Array.from(c.children));
            else blocks.push(c);
        }
        const lineH = 7;
        const paraGap = 4;

        let prevVerse = false;
        for (const el of blocks) {
            const text = (el.textContent || '').trim();
            if (!text) continue;
            const isQuote = el.tagName === 'BLOCKQUOTE' || el.classList.contains('cm-quote');
            const isAttr = el.classList.contains('cm-attribution');
            const isVerse = el.classList.contains('cm-verse');
            const indent = isQuote ? 8 : 0;

            // Estrofe: respiro só antes do 1º verso, versos coladinhos entre si.
            if (isVerse && !prevVerse) y += paraGap;

            doc.setFont('times', (isQuote || isAttr || isVerse) ? 'italic' : 'normal');
            doc.setFontSize(13);

            const lines = doc.splitTextToSize(cmPdfSafe(text), usableW - indent);
            for (const line of lines) {
                if (y > bottomLimit) {
                    doc.addPage();
                    y = margin;
                }
                if (isVerse) doc.text(line, pageW / 2, y, { align: 'center' });
                else doc.text(line, margin + indent, y);
                y += lineH;
            }
            y += isVerse ? 0.5 : paraGap;
            prevVerse = isVerse;
        }

        // Rodapé com numeração
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFont('times', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(120);
            doc.text(`${i} / ${pageCount}`, pageW / 2, pageH - 10, { align: 'center' });
            doc.setTextColor(0);
        }

        return doc.output('blob');
    }

    function cmTriggerDownload(href, filename) {
        const a = document.createElement('a');
        a.href = href;
        a.download = filename;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    window.downloadCultoMensal = async function () {
        const btn = document.getElementById('btnCultoMensalDownload');
        if (!btn || btn.classList.contains('is-loading')) return;

        const labelEl = btn.querySelector('.cm-dl-label');
        const originalLabel = labelEl ? labelEl.textContent : null;

        btn.classList.add('is-loading');
        btn.setAttribute('aria-busy', 'true');
        if (labelEl) labelEl.textContent = 'Preparando…';

        let zipUrl = null;
        try {
            const data = await fetchContent();
            const base = cmFilenameFor(data.title);

            // Em paralelo: gera PDF, busca MP3 e carrega JSZip
            const [pdfBlob, mp3Buffer, JSZip] = await Promise.all([
                cmGeneratePdfBlob(data),
                fetch(cmAudioUrl()).then(r => {
                    if (!r.ok) throw new Error('Falha ao baixar áudio: ' + r.status);
                    return r.arrayBuffer();
                }),
                cmLoadJsZip()
            ]);

            if (labelEl) labelEl.textContent = 'Empacotando…';

            const zip = new JSZip();
            zip.file(base + '.pdf', pdfBlob);
            // MP3 já é comprimido — STORE evita re-compressão (mais rápido, mesmo tamanho)
            zip.file(base + '.mp3', mp3Buffer, { compression: 'STORE' });

            const zipBlob = await zip.generateAsync({ type: 'blob' });

            zipUrl = URL.createObjectURL(zipBlob);
            cmTriggerDownload(zipUrl, base + '.zip');

            cmTrackAudio('download_zip', {
                title: data.title,
                zip_size_kb: Math.round(zipBlob.size / 1024)
            });
            // Flush imediato — não esperar 10s, usuário pode fechar a aba
            // logo após o download começar (segue padrão do apostila_print).
            if (typeof window.mioshieFlush === 'function') window.mioshieFlush();
        } catch (err) {
            console.error('[culto-mensal] download falhou:', err);
            alert('Não foi possível gerar o download. Verifique sua conexão e tente novamente.');
        } finally {
            setTimeout(() => {
                btn.classList.remove('is-loading');
                btn.removeAttribute('aria-busy');
                if (labelEl && originalLabel != null) labelEl.textContent = originalLabel;
                if (zipUrl) URL.revokeObjectURL(zipUrl);
            }, 700);
        }
    };

    /* --- Menu de presets de impressão --- */

    window.toggleCultoMensalPrintMenu = function (event) {
        if (event) event.stopPropagation();
        const menu = document.getElementById('cultoMensalPrintMenu');
        const btn = document.getElementById('btnCultoMensalPrint');
        if (!menu) return;
        const opening = menu.classList.contains('hidden');
        menu.classList.toggle('hidden');
        if (btn) btn.setAttribute('aria-expanded', String(opening));
        if (opening) {
            // Fecha o menu se clicar fora
            setTimeout(() => document.addEventListener('click', cmPrintMenuOutsideClick), 0);
        } else {
            document.removeEventListener('click', cmPrintMenuOutsideClick);
        }
    };

    function cmPrintMenuOutsideClick(e) {
        const menu = document.getElementById('cultoMensalPrintMenu');
        const wrap = e.target.closest('.cm-print-wrap');
        if (!wrap && menu && !menu.classList.contains('hidden')) {
            menu.classList.add('hidden');
            const btn = document.getElementById('btnCultoMensalPrint');
            if (btn) btn.setAttribute('aria-expanded', 'false');
            document.removeEventListener('click', cmPrintMenuOutsideClick);
        }
    }

    window.printCultoMensal = function (preset) {
        const modal = document.getElementById('cultoMensalModal');
        if (!modal || !modal.classList.contains('is-open')) return;
        if (cmIsSpeaking) cmStopSpeech();

        const html = document.documentElement;
        const presetClasses = ['cm-print-padrao', 'cm-print-confortavel', 'cm-print-ampliado'];
        presetClasses.forEach(c => html.classList.remove(c));
        const chosen = (preset && presetClasses.includes('cm-print-' + preset)) ? preset : 'padrao';
        html.classList.add('cm-print-' + chosen);

        // Fecha o menu antes de chamar print
        const menu = document.getElementById('cultoMensalPrintMenu');
        if (menu) menu.classList.add('hidden');

        window.print();

        // Limpa o preset após a impressão (afterprint event)
        const cleanup = () => {
            presetClasses.forEach(c => html.classList.remove(c));
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
    };

    /* --- Expose internals para testing/debug --- */
    window._cultoMensal = { fetchContent, parseMarkdown, blockToHtml, cmParseMenuDate, checkBadgeStatus };

    /* --- ESC fecha o modal --- */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        const modal = document.getElementById('cultoMensalModal');
        if (modal && modal.classList.contains('is-open')) {
            window.closeCultoMensal();
        }
    });
})();
