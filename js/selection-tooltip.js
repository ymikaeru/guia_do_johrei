// ============================================================
// Selection Tooltip — Johrei: Guia para Ministrantes
//
// Detecta seleção de texto dentro de #contentPT (citações de
// Meishu-Sama no modal de leitura). Mostra botão flutuante
// "Reportar erro de tradução" — clica → abre o modal de reporte.
//
// Versão simplificada do highlights.js do "Caminho da Felicidade":
// sem cores de marca-texto, sem persistência, só o botão de report.
//
// Depende de: window.openTranslationReport (translation-report.js)
// ============================================================

(function () {
  'use strict';

  const SCOPE_SELECTOR = '#contentPT';   // só dentro do modal de leitura
  const MIN_LENGTH = 3;                  // ignora seleções triviais
  const HIDE_DELAY_MS = 80;              // pequeno delay pra evitar flicker

  let _tooltipEl = null;        // desktop floating tooltip
  let _mobileBarEl = null;      // mobile fixed bottom bar
  let _currentSelection = null;
  let _hideTimer = null;
  let _lastTouchTime = 0;       // timestamp do último touchend (pra suprimir mouseup sintético do iOS)

  // Não precisamos mais detectar "is mobile" — o TIPO do evento que dispara
  // a função decide qual UI usar: touchend → barra de rodapé, mouseup →
  // tooltip flutuante. Isso funciona certo em laptop com touchscreen,
  // iPad com mouse, etc.

  function _isInsideScope(node) {
    if (!node) return false;
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !!(el && el.closest(SCOPE_SELECTOR));
  }

  function _getArticleContext() {
    // currentModalItem é setado por js/modal.js quando o modal abre
    const item = window.currentModalItem || null;
    const tab = (window.STATE && window.STATE.activeTab) || 'unknown';

    if (!item) {
      return {
        articleId: 'unknown',
        articleTitle: '',
        tab: tab,
        pageUrl: window.location.href
      };
    }

    const title = item.title_pt || item.titulo || item.title || item.id || '';
    return {
      articleId: item.id || 'unknown',
      articleTitle: title,
      tab: item._cat || tab,
      pageUrl: window.location.href
    };
  }

  // ── Tooltip / Bar HTML ───────────────────────────────────────
  const BUTTON_HTML = `
    <button type="button" class="tr-report-btn" aria-label="Reportar erro de tradução">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span>Reportar erro de tradução</span>
    </button>`;

  function _wireBtn(el) {
    // Evita que interações dentro do widget limpem a seleção
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    const btn = el.querySelector('.tr-report-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _handleReportClick();
    });
    return el;
  }

  function _createTooltip() {
    const el = document.createElement('div');
    el.className = 'tr-selection-tooltip';
    el.setAttribute('role', 'toolbar');
    el.innerHTML = BUTTON_HTML;
    document.body.appendChild(el);
    return _wireBtn(el);
  }

  function _createMobileBar() {
    const el = document.createElement('div');
    el.className = 'tr-selection-bar';
    el.setAttribute('role', 'toolbar');
    el.innerHTML = BUTTON_HTML;
    document.body.appendChild(el);
    return _wireBtn(el);
  }

  function _positionTooltip(range) {
    if (!_tooltipEl) return;

    const rect = range.getBoundingClientRect();
    const ttRect = _tooltipEl.getBoundingClientRect();
    const margin = 8;

    // Position uses fixed coords (viewport), works inside modals com scroll interno
    let left = rect.left + (rect.width / 2) - (ttRect.width / 2);
    let top = rect.top - ttRect.height - 10;

    // Constrain horizontally
    if (left < margin) left = margin;
    if (left + ttRect.width > window.innerWidth - margin) {
      left = window.innerWidth - ttRect.width - margin;
    }

    // If no room above, flip below
    if (top < margin) {
      top = rect.bottom + 10;
    }

    // If still off-screen vertically, anchor to bottom of viewport
    if (top + ttRect.height > window.innerHeight - margin) {
      top = window.innerHeight - ttRect.height - margin;
    }

    _tooltipEl.style.left = `${Math.round(left)}px`;
    _tooltipEl.style.top = `${Math.round(top)}px`;
  }

  function _showTooltip(range, text) {
    if (!_tooltipEl) _tooltipEl = _createTooltip();
    _currentSelection = { text, context: _getArticleContext() };

    // Render off-screen first to measure
    _tooltipEl.style.left = '-9999px';
    _tooltipEl.style.top = '-9999px';
    _tooltipEl.classList.add('tr-visible');

    // Now measure and position
    requestAnimationFrame(() => _positionTooltip(range));
  }

  function _showMobileBar(text) {
    if (!_mobileBarEl) _mobileBarEl = _createMobileBar();
    _currentSelection = { text, context: _getArticleContext() };
    _mobileBarEl.classList.add('tr-visible');
  }

  function _hideTooltip() {
    if (_tooltipEl) _tooltipEl.classList.remove('tr-visible');
    if (_mobileBarEl) _mobileBarEl.classList.remove('tr-visible');
    _currentSelection = null;
  }

  function _scheduleHide() {
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(_hideTooltip, HIDE_DELAY_MS);
  }

  function _cancelHide() {
    clearTimeout(_hideTimer);
  }

  // ── Handlers ─────────────────────────────────────────────────
  // Apenas esconde quando a seleção colapsa. Mostrar fica a cargo dos
  // handlers de evento concreto (mouseup/touchend), que sabem o tipo
  // de interação e portanto qual UI usar.
  function _handleSelectionChange() {
    _cancelHide();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      _scheduleHide();
    }
  }

  // Captura o trecho válido se houver — retorna null caso contrário.
  function _captureValidSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!_isInsideScope(range.startContainer) || !_isInsideScope(range.endContainer)) return null;
    const text = sel.toString().trim();
    if (text.length < MIN_LENGTH) return null;
    return { sel, range, text };
  }

  function _handleMouseUp(e) {
    if (e.target && e.target.closest('.tr-selection-tooltip, .tr-selection-bar')) return;

    // iOS Safari dispara mouseup sintético ~10-100ms após touchend.
    // Se houve touch recente, é interação touch — já foi tratada pelo touchend.
    if (Date.now() - _lastTouchTime < 600) return;

    setTimeout(() => {
      const cap = _captureValidSelection();
      if (!cap) return;
      _showTooltip(cap.range, cap.text);
    }, 10);
  }

  function _handleTouchEnd(e) {
    _lastTouchTime = Date.now();

    if (e.target && e.target.closest('.tr-selection-tooltip, .tr-selection-bar')) return;

    setTimeout(() => {
      const cap = _captureValidSelection();
      if (!cap) return;
      // Touch SEMPRE usa barra de rodapé — evita conflito com menu nativo iOS
      _showMobileBar(cap.text);
    }, 80); // delay pra esperar o menu nativo do iOS aparecer
  }

  function _handleScroll() {
    // Mobile bar (fixa no viewport): só esconde se seleção sumiu
    if (_mobileBarEl && _mobileBarEl.classList.contains('tr-visible')) {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) _hideTooltip();
    }

    // Desktop tooltip: reposiciona enquanto rola
    if (_tooltipEl && _tooltipEl.classList.contains('tr-visible')) {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        _hideTooltip();
      } else {
        _positionTooltip(sel.getRangeAt(0));
      }
    }
  }

  function _handleReportClick() {
    const sel = _currentSelection;
    if (!sel || typeof window.openTranslationReport !== 'function') return;

    const text = sel.text;
    const context = sel.context;

    _hideTooltip();
    // Limpa seleção pra evitar tooltip reaparecer atrás do modal
    window.getSelection()?.removeAllRanges();

    window.openTranslationReport(text, context);
  }

  // ── Init ─────────────────────────────────────────────────────
  function _init() {
    document.addEventListener('selectionchange', _handleSelectionChange);
    document.addEventListener('mouseup', _handleMouseUp);
    document.addEventListener('touchend', _handleTouchEnd, { passive: true });

    // Reposiciona em scroll/resize (modal tem scroll interno + viewport scroll)
    window.addEventListener('scroll', _handleScroll, true); // capture pra pegar scroll do modal
    window.addEventListener('resize', _handleScroll);

    // Esconde quando o modal de reporte abre ou fecha (cleanup)
    document.addEventListener('click', (e) => {
      if (e.target && e.target.closest('.tr-modal-overlay')) _hideTooltip();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
