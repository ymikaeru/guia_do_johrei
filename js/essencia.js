// js/essencia.js — renderiza o card "Essência" no topo do site.
// Estado em STATE.essencia (objeto Supabase) e STATE.essenciaCollapsed (bool).

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

    function findHostElement() {
        // Inserir antes da tab bar; fallback: antes do main content.
        return document.getElementById('tabBar')
            || document.querySelector('nav')
            || document.querySelector('main')
            || document.body.firstElementChild;
    }

    function ensureCardElement() {
        let card = document.getElementById('essenciaCard');
        if (card) return card;
        card = document.createElement('section');
        card.id = 'essenciaCard';
        card.setAttribute('aria-label', 'Ensinamento em destaque');
        const host = findHostElement();
        if (host && host.parentNode) {
            host.parentNode.insertBefore(card, host);
        } else {
            document.body.insertBefore(card, document.body.firstChild);
        }
        return card;
    }

    function removeCard() {
        const card = document.getElementById('essenciaCard');
        if (card) card.remove();
    }

    function resolveItem() {
        const e = STATE.essencia;
        if (!e || !e.article_id) return null;
        if (!STATE.globalData) return null;
        return STATE.globalData[e.article_id] || null;
    }

    function buildHtml(item, excerpt, collapsed) {
        const cleanT = typeof cleanTitle === 'function' ? cleanTitle : (s => s);
        const title = escapeHtml(cleanT(item.title_pt || item.title || ''));
        const exc = escapeHtml(excerpt || '');
        const expanded = `
            <div class="essencia-label">Essência</div>
            <h2 class="essencia-title">${title}</h2>
            <div class="essencia-excerpt">${exc}</div>
            <div class="essencia-actions">
                <button type="button" class="essencia-cta" data-essencia-action="open">Ler completo →</button>
            </div>
            <button type="button" class="essencia-toggle" data-essencia-action="collapse" aria-label="Encolher">—</button>
        `;
        const collapsedRow = `
            <div class="essencia-collapsed-row">
                <span class="label">Essência:</span>
                <span class="title" data-essencia-action="open">${title}</span>
            </div>
            <button type="button" class="essencia-toggle" data-essencia-action="expand" aria-label="Expandir">+</button>
        `;
        return collapsed ? collapsedRow : expanded;
    }

    function attachHandlers(card, item) {
        card.addEventListener('click', function (ev) {
            const target = ev.target.closest('[data-essencia-action]');
            if (!target) return;
            const action = target.getAttribute('data-essencia-action');
            if (action === 'open') {
                openEssenciaItem(item);
            } else if (action === 'collapse') {
                STATE.essenciaCollapsed = true;
                renderEssencia();
            } else if (action === 'expand') {
                STATE.essenciaCollapsed = false;
                renderEssencia();
            }
        });
    }

    function openEssenciaItem(item) {
        if (!item || typeof openModal !== 'function') return;
        // openModal aceita (-1, item) pra abrir item fora da lista filtrada
        const idx = (STATE.list || []).findIndex(i => i.id === item.id);
        if (idx >= 0) {
            openModal(idx);
        } else {
            openModal(-1, item);
        }
    }

    window.renderEssencia = function renderEssencia() {
        const item = resolveItem();
        if (!item) {
            removeCard();
            return;
        }
        const card = ensureCardElement();
        const collapsed = !!STATE.essenciaCollapsed;
        card.classList.toggle('collapsed', collapsed);
        const excerpt = (STATE.essencia && STATE.essencia.excerpt_pt) || '';
        // Substituir HTML inteiro evita acumular handlers
        const fresh = card.cloneNode(false);
        fresh.classList.toggle('collapsed', collapsed);
        fresh.innerHTML = buildHtml(item, excerpt, collapsed);
        card.parentNode.replaceChild(fresh, card);
        attachHandlers(fresh, item);
    };
})();
