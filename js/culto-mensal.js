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

    const SOURCE_URL = 'data/culto_mensal_atual.md';
    const LAST_SEEN_KEY = 'cultoMensalLastSeen';

    // Cache da última carga (evita 2 fetches: badge check + open modal)
    let cached = null;          // { title, salmo, body }
    let cachedRawFirstLine = null;
    let isLoading = false;

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
            const res = await fetch(SOURCE_URL, { cache: 'no-cache' });
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
        let inQuote = false;
        const html = bodyBlocks.map((block, idx) => {
            const opens = quoteOpens(block);
            const closes = quoteCloses(block);
            const isQuote = inQuote || opens;
            // Atualiza estado para próximo bloco
            if (opens && !closes) inQuote = true;
            else if (closes) inQuote = false;
            // (caso edge: abre e fecha no mesmo bloco — isQuote=true, inQuote=false)
            return blockToHtml(block, isQuote, idx);
        }).join('\n');

        return { title, salmo, body: html };
    }

    function quoteOpens(block) {
        return /^["“”„]/.test(block.trim());
    }

    function quoteCloses(block) {
        // Procura aspa de fechamento perto do final do bloco
        // (permite pontuação trailing como ." ou ".)
        return /["“”]\s*[.,;:!?]*\s*$/.test(block.trim());
    }

    function blockToHtml(block, isQuote, idx) {
        const trimmed = block.trim();
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

        // Remove escapes de markdown (\. \, \! etc.) e processa itálicos *texto* -> <em>
        let inner = escapeHtml(trimmed)
            .replace(/\\([.,!?:;'"()\[\]\\\-])/g, '$1')
            .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

        const fragAttr = (typeof idx === 'number') ? ' data-frag="' + idx + '"' : '';
        return '<' + tag + fragAttr + (cls ? ' class="' + cls + '"' : '') + '>' + inner + '</' + tag + '>';
    }

    function escapeHtml(s) {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /* --- Render no modal --- */

    function render(data) {
        document.getElementById('cultoMensalTitle').textContent = data.title;
        document.getElementById('cultoMensalSalmo').textContent = data.salmo;
        document.getElementById('cultoMensalBody').innerHTML = data.body;
    }

    /* --- Badge (notificação de novidade) --- */

    async function checkBadgeStatus() {
        try {
            const data = await fetchContent();
            const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
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
        if (cachedRawFirstLine) {
            localStorage.setItem(LAST_SEEN_KEY, cachedRawFirstLine);
            const badge = document.getElementById('cultoMensalBadge');
            if (badge) badge.classList.add('hidden');
        }
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
        url.searchParams.set('modal', 'culto-mensal');
        try {
            history.pushState({ cultoMensal: true }, '', url.pathname + url.search + url.hash);
        } catch (_) { /* navegador antigo — ignora */ }
    }

    function cmPopModalUrl() {
        if (!cmOriginalUrl) return;
        const onModal = new URLSearchParams(location.search).get('modal') === 'culto-mensal';
        if (onModal) {
            try { history.pushState({}, '', cmOriginalUrl); } catch (_) {}
        }
        cmOriginalUrl = null;
    }

    function cmHideModal() {
        document.getElementById('cultoMensalModal').classList.remove('is-open');
        document.body.style.overflow = '';
    }

    window.openCultoMensal = async function () {
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
            alert('Não foi possível carregar a Orientação do Culto Mensal.');
        }
    };

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
        const onModalUrl = new URLSearchParams(location.search).get('modal') === 'culto-mensal';
        if (!onModalUrl) {
            cmStopAudio();
            cmFlushAudioStats();
            cmHideModal();
            cmOriginalUrl = null;
        }
    });

    /* --- Áudio do mês (substitui o TTS) --- */
    const CM_AUDIO_URL = 'assets/audio/culto_mensal_atual.mp3';
    const CM_TIMESTAMPS_URL = 'data/culto_mensal_atual.timestamps.json';
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

    function cmTrackAudio(type, extra) {
        if (typeof window.mioshieTrack !== 'function') return;
        const props = Object.assign({
            duration_seconds: cmAudioDuration ? Math.round(cmAudioDuration) : null
        }, extra || {});
        try { window.mioshieTrack(type, props); } catch (_) {}
    }

    function cmOnAudioPlay() {
        if (cmAudioPlaying) return;
        cmAudioPlaying = true;
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
            const res = await fetch(CM_TIMESTAMPS_URL, { cache: 'no-cache' });
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
        const prev = body.querySelector('[data-frag].cm-current');
        if (prev) prev.classList.remove('cm-current');
        const next = body.querySelector('[data-frag="' + idx + '"]');
        if (next) {
            next.classList.add('cm-current');
            if (cmFollowMode) cmScrollToParagraph(next);
        }
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
        content.addEventListener('touchmove', cmDisableFollow, { passive: true });
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
            if (!a.src) a.src = CM_AUDIO_URL + '?v=' + Date.now();
        } else {
            if (!a.paused) a.pause();
            bar.hidden = true;
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
    window._cultoMensal = { fetchContent, parseMarkdown, blockToHtml };

    /* --- ESC fecha o modal --- */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        const modal = document.getElementById('cultoMensalModal');
        if (modal && modal.classList.contains('is-open')) {
            window.closeCultoMensal();
        }
    });
})();
