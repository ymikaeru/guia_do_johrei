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
        const html = bodyBlocks.map(block => {
            const opens = quoteOpens(block);
            const closes = quoteCloses(block);
            const isQuote = inQuote || opens;
            // Atualiza estado para próximo bloco
            if (opens && !closes) inQuote = true;
            else if (closes) inQuote = false;
            // (caso edge: abre e fecha no mesmo bloco — isQuote=true, inQuote=false)
            return blockToHtml(block, isQuote);
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

    function blockToHtml(block, isQuote) {
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

        return '<' + tag + (cls ? ' class="' + cls + '"' : '') + '>' + inner + '</' + tag + '>';
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
            // Falha silenciosa: badge fica escondida
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

    window.openCultoMensal = async function () {
        try {
            const data = await fetchContent();
            render(data);
            document.getElementById('cultoMensalModal').classList.add('is-open');
            document.body.style.overflow = 'hidden';
            markAsSeen();
        } catch (err) {
            console.error('[culto-mensal] erro:', err);
            alert('Não foi possível carregar a Orientação do Culto Mensal.');
        }
    };

    window.closeCultoMensal = function () {
        cmStopAudio();
        document.getElementById('cultoMensalModal').classList.remove('is-open');
        document.body.style.overflow = '';
    };

    /* --- Áudio do mês (substitui o TTS) --- */
    const CM_AUDIO_URL = 'assets/audio/culto_mensal_atual.mp3';
    let cmAudioBound = false;

    function cmBindAudio() {
        if (cmAudioBound) return document.getElementById('cultoMensalAudioEl');
        const a = document.getElementById('cultoMensalAudioEl');
        if (!a) return null;
        const btn = () => document.getElementById('btnCultoMensalAudio');
        a.addEventListener('play', () => { const b = btn(); if (b) b.classList.add('is-speaking'); });
        a.addEventListener('pause', () => { const b = btn(); if (b) b.classList.remove('is-speaking'); });
        a.addEventListener('ended', () => { const b = btn(); if (b) b.classList.remove('is-speaking'); });
        a.addEventListener('error', () => {
            const bar = document.getElementById('cultoMensalAudioBar');
            if (bar) bar.hidden = true;
            const b = btn(); if (b) b.classList.remove('is-speaking');
            alert('Áudio do mês ainda não disponível.');
        });
        cmAudioBound = true;
        return a;
    }

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
