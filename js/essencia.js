// js/essencia.js — modal de boas-vindas com ensinamento curado pelo admin.
// Aparece a cada page load. Layout minimalista: título, fonte, texto limpo
// de glosas em kanji/romaji, botão de fechar.

(function () {
    'use strict';

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Remove glosas em kanji e parentéticos romaji+kanji do texto. Trata
    // brackets com ou sem escape markdown (\[…\] ou […]) e desfaz escapes
    // remanescentes (\! → !, \. → ., etc).
    // Ex: "tóxicos (Dokuketsu \\[毒結\\])"  → "tóxicos"
    //     "(Ekiri \\[疫痢\\])"               → ""
    //     "Talismã \\[御守\\]"                → "Talismã"
    //     "compreenderão \"é isto\\!\""      → "compreenderão \"é isto!\""
    function cleanKanji(text) {
        if (!text) return '';
        const CJK = '\\u3000-\\u9FFF\\u4E00-\\u9FFF\\u3040-\\u309F\\u30A0-\\u30FF';
        // Parentético com bracketed CJK (escape \[ opcional): " (Kaso \[火素\])" → ""
        text = text.replace(new RegExp(`\\s*\\([^)]*\\\\?\\[[${CJK}]+\\\\?\\][^)]*\\)`, 'g'), '');
        // Bracketed CJK standalone (escape opcional): " \[御守\]" → ""
        text = text.replace(new RegExp(`\\s*\\\\?\\[[${CJK}]+\\\\?\\]`, 'g'), '');
        // Defensivo: brackets vazios remanescentes
        text = text.replace(/\s*\\?\[\s*\\?\]/g, '');
        // Defensivo: parentético com brackets vazios "(Ekiri [])" → ""
        text = text.replace(/\s*\([^()]*\\?\[\s*\\?\][^()]*\)/g, '');
        // Resíduo de CJK soltos
        text = text.replace(new RegExp(`[${CJK}]`, 'g'), '');
        // Markdown escapes: \! → !, \. → ., \* → *, \[ → [, etc.
        text = text.replace(/\\([!.*?+\-(){}[\]\\])/g, '$1');
        // Parentéticos vazios remanescentes
        text = text.replace(/\s*\(\s*\)/g, '');
        // Pontuação com espaço estranho
        text = text.replace(/\s+([,.;:!?])/g, '$1');
        // Múltiplos espaços
        text = text.replace(/  +/g, ' ');
        return text;
    }

    function formatContent(text) {
        const cleaned = cleanKanji(text);
        return cleaned.split(/\n\n+/).map(p => {
            const escaped = escapeHtml(p.trim());
            const withBold = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            return `<p>${withBold.replace(/\n/g, '<br>')}</p>`;
        }).join('');
    }

    function escListener(ev) {
        if (ev.key === 'Escape') closeWelcome();
    }

    function closeWelcome() {
        const overlay = document.getElementById('essenciaWelcomeOverlay');
        if (overlay) overlay.remove();
        document.body.style.overflow = '';
        document.removeEventListener('keydown', escListener);
    }

    function openWelcome(item) {
        if (document.getElementById('essenciaWelcomeOverlay')) return;
        const cleanT = typeof cleanTitle === 'function' ? cleanTitle : (s => s);
        const title = escapeHtml(cleanT(item.title_pt || item.title || ''));
        const source = escapeHtml(item.source || '');
        const content = formatContent(item.content_pt || item.content || '');
        const sourceLine = source
            ? `<div class="ess-source">${source}</div>` : '';
        const logoSvg = '<svg class="ess-logo" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Emblema da Comunidade Messiânica Universal"><circle cx="100" cy="100" r="98" fill="#b8860b"/><circle cx="100" cy="100" r="92" fill="#fff"/><rect x="80" y="8" width="40" height="184" fill="#006400"/><rect x="8" y="80" width="184" height="40" fill="#006400"/><circle cx="100" cy="100" r="42" fill="#cc0000"/><circle cx="100" cy="100" r="28" fill="#b8860b"/></svg>';
        const html = `
            <div id="essenciaWelcomeOverlay" role="dialog" aria-modal="true" aria-label="Ensinamento em destaque">
                <div id="essenciaWelcomeCard">
                    <button type="button" class="ess-close" aria-label="Fechar">×</button>
                    ${logoSvg}
                    <h1 class="ess-title">${title}</h1>
                    ${sourceLine}
                    <div class="ess-content">${content}</div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        document.body.style.overflow = 'hidden';
        const overlay = document.getElementById('essenciaWelcomeOverlay');
        overlay.querySelector('.ess-close').addEventListener('click', closeWelcome);
        document.addEventListener('keydown', escListener);
    }

    window.showEssenciaWelcome = function () {
        if (!STATE.essencia || !STATE.essencia.article_id) return;
        if (!STATE.globalData) return;
        const item = STATE.globalData[STATE.essencia.article_id];
        if (!item) return;
        openWelcome(item);
    };
})();
