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
        document.getElementById('cultoMensalContent').innerHTML = data.body;
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
        cmStopSpeech();
        document.getElementById('cultoMensalModal').classList.remove('is-open');
        document.body.style.overflow = '';
    };

    /* --- Stubs para Tasks 7–9 --- */

    /* --- TTS dedicado (não compartilha estado com readModal) --- */
    let cmSpeechBlocks = [];
    let cmSpeechIndex = 0;
    let cmIsSpeaking = false;

    function cmCollectBlocks() {
        const container = document.getElementById('cultoMensalContent');
        if (!container) return [];
        return Array.from(container.querySelectorAll('p, blockquote'))
            .filter(el => (el.innerText || '').trim().length > 0);
    }

    function cmGetRate() {
        const raw = parseFloat(localStorage.getItem('johrei_speech_rate'));
        return isNaN(raw) ? 0.9 : raw;
    }

    function cmSpeakNext() {
        if (cmSpeechIndex >= cmSpeechBlocks.length) {
            cmStopSpeech();
            return;
        }
        const el = cmSpeechBlocks[cmSpeechIndex];
        const text = (el.innerText || el.textContent || '').trim();
        if (!text) {
            cmSpeechIndex++;
            cmSpeakNext();
            return;
        }
        const utt = new SpeechSynthesisUtterance(text);
        const voice = (typeof window.getBestVoice === 'function') ? window.getBestVoice() : null;
        if (voice) utt.voice = voice;
        utt.lang = 'pt-BR';
        utt.rate = cmGetRate();

        utt.onstart = function () {
            el.classList.add('cm-highlight-speaking');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        utt.onend = function () {
            el.classList.remove('cm-highlight-speaking');
            cmSpeechIndex++;
            cmSpeakNext();
        };
        utt.onerror = function (e) {
            if (e.error === 'interrupted' || e.error === 'canceled') return;
            console.error('[culto-mensal] speech error:', e);
            el.classList.remove('cm-highlight-speaking');
            cmStopSpeech();
        };
        window.speechSynthesis.speak(utt);
    }

    function cmStopSpeech() {
        window.speechSynthesis.cancel();
        cmSpeechBlocks.forEach(el => el.classList.remove('cm-highlight-speaking'));
        cmSpeechBlocks = [];
        cmSpeechIndex = 0;
        cmIsSpeaking = false;
        const btn = document.getElementById('btnCultoMensalSpeech');
        if (btn) btn.classList.remove('is-speaking');
    }

    window.toggleCultoMensalSpeech = async function () {
        if (cmIsSpeaking) {
            cmStopSpeech();
            return;
        }
        if (window.speechSynthesis.getVoices().length === 0) {
            await new Promise(resolve => {
                const t = setTimeout(resolve, 500);
                window.speechSynthesis.onvoiceschanged = () => {
                    clearTimeout(t);
                    resolve();
                };
            });
        }
        cmSpeechBlocks = cmCollectBlocks();
        if (cmSpeechBlocks.length === 0) return;
        cmSpeechIndex = 0;
        cmIsSpeaking = true;
        const btn = document.getElementById('btnCultoMensalSpeech');
        if (btn) btn.classList.add('is-speaking');
        cmSpeakNext();
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
