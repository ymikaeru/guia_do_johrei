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

        const html = bodyBlocks.map(blockToHtml).join('\n');

        return { title, salmo, body: html };
    }

    function blockToHtml(block) {
        const trimmed = block.trim();
        // Detecta citação: começa com aspas tipográficas ou retas
        const startsWithQuote = /^[“”„""]/.test(trimmed);
        // Detecta atribuição curta ("Meishu Sama diz:", "Meishu-Sama expressou assim:" etc.)
        const isAttribution =
            /^[A-Za-zÀ-ÿ\-\s]{0,40}(diz|expressou|fala|explica|alertava)[A-Za-zÀ-ÿ\s,]*[:.]?\s*$/i
                .test(trimmed) && trimmed.length < 80;

        let cls = '';
        let tag = 'p';
        if (startsWithQuote) {
            tag = 'blockquote';
            cls = 'cm-quote';
        } else if (isAttribution) {
            cls = 'cm-attribution';
        }

        // Itálicos inline: *texto* -> <em>texto</em>
        let inner = escapeHtml(trimmed).replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

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

    /* --- Abrir/fechar --- */

    window.openCultoMensal = async function () {
        try {
            const data = await fetchContent();
            render(data);
            document.getElementById('cultoMensalModal').classList.add('is-open');
            document.body.style.overflow = 'hidden';
        } catch (err) {
            console.error('[culto-mensal] erro:', err);
            alert('Não foi possível carregar a Orientação do Culto Mensal.');
        }
    };

    window.closeCultoMensal = function () {
        document.getElementById('cultoMensalModal').classList.remove('is-open');
        document.body.style.overflow = '';
    };

    /* --- Stubs para Tasks 7–9 --- */

    window.toggleCultoMensalSpeech = function () {
        console.log('[culto-mensal] TTS ainda não implementado');
    };

    window.printCultoMensal = function () {
        console.log('[culto-mensal] print ainda não implementado');
    };

    /* --- Expose internals para testing/debug --- */
    window._cultoMensal = { fetchContent, parseMarkdown, blockToHtml };
})();
