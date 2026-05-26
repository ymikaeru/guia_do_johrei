// ============================================================
// Translation Report — Johrei: Guia para Ministrantes
//
// Modal para reportar erros de tradução de citações de Meishu-Sama.
// Anônimo (sem login). Grava em Supabase translation_reports_guia.
//
// API pública: window.openTranslationReport(text, context)
//   context: { articleId, articleTitle, tab, pageUrl }
//
// Adaptado de caminho_da_felicidade/js/translation-report.js
// ============================================================

(function () {
  'use strict';

  // ── Estado ───────────────────────────────────────────────────
  let _modalEl = null;
  let _toastEl = null;
  let _pendingReport = null;

  // Reusa o mesmo projeto Supabase do "Caminho da Felicidade".
  // Chave anon é pública por design (RLS protege os dados).
  const SUPABASE_URL = 'https://succhmnbajvbpmoqrktq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1Y2NobW5iYWp2YnBtb3Fya3RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NjY3MDgsImV4cCI6MjA5MjA0MjcwOH0.humCcLYpnnnapkLtLOeb9ZVo5EZWoWw6ItNo0WVY3DY';

  // ── Submissão ────────────────────────────────────────────────
  async function _insertReport(payload) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/translation_reports_guia`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      return { error: err || `HTTP ${res.status}` };
    }
    return { error: null };
  }

  // ── Modal ────────────────────────────────────────────────────
  function _buildModal() {
    if (document.getElementById('translationReportModal')) return;

    const modal = document.createElement('div');
    modal.id = 'translationReportModal';
    modal.className = 'tr-modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'trModalTitle');

    modal.innerHTML = `
      <div class="tr-modal-panel">
        <div class="tr-modal-header">
          <span class="tr-modal-icon" aria-hidden="true">⚠</span>
          <h2 id="trModalTitle" class="tr-modal-title">Reportar Erro de Tradução</h2>
          <button class="tr-modal-close" id="trModalClose" aria-label="Fechar">✕</button>
        </div>

        <div class="tr-modal-body">
          <div class="tr-label">Trecho selecionado</div>
          <div class="tr-selected-text" id="trSelectedText" aria-readonly="true"></div>

          <label class="tr-label" for="trDescription">O que parece errado? (opcional)</label>
          <textarea
            class="tr-textarea"
            id="trDescription"
            rows="3"
            placeholder="Ex: A palavra X soa estranha nesse contexto, talvez fosse melhor Y..."
            maxlength="500"
          ></textarea>
          <div class="tr-char-count"><span id="trCharCount">0</span>/500</div>
        </div>

        <div class="tr-modal-footer">
          <button class="tr-btn-cancel" id="trBtnCancel">Cancelar</button>
          <button class="tr-btn-submit" id="trBtnSubmit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Enviar Reporte
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    _modalEl = modal;

    modal.querySelector('#trModalClose').addEventListener('click', _closeModal);
    modal.querySelector('#trBtnCancel').addEventListener('click', _closeModal);
    modal.querySelector('#trBtnSubmit').addEventListener('click', _handleSubmit);
    modal.addEventListener('click', (e) => { if (e.target === modal) _closeModal(); });

    const textarea = modal.querySelector('#trDescription');
    textarea.addEventListener('input', () => {
      document.getElementById('trCharCount').textContent = textarea.value.length;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _modalEl?.classList.contains('tr-open')) _closeModal();
    });
  }

  function _openModal(text, context) {
    _buildModal();
    _pendingReport = context || {};
    _pendingReport.text = text || '';

    const textEl = document.getElementById('trSelectedText');
    const descEl = document.getElementById('trDescription');
    const countEl = document.getElementById('trCharCount');

    if (textEl) textEl.textContent = _pendingReport.text;
    if (descEl) descEl.value = '';
    if (countEl) countEl.textContent = '0';

    _modalEl.classList.add('tr-open');
    setTimeout(() => { document.getElementById('trDescription')?.focus(); }, 50);
  }

  function _closeModal() {
    if (_modalEl) _modalEl.classList.remove('tr-open');
    _pendingReport = null;
  }

  async function _handleSubmit() {
    const btn = document.getElementById('trBtnSubmit');
    if (!btn || btn.disabled) return;

    const description = document.getElementById('trDescription')?.value.trim() || '';
    const ctx = _pendingReport || {};

    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.textContent = 'Enviando...';

    const payload = {
      article_id: (ctx.articleId || 'unknown').toString().substring(0, 200),
      article_title: (ctx.articleTitle || '').substring(0, 500) || null,
      tab: (ctx.tab || 'unknown').toString().substring(0, 50),
      page_url: (ctx.pageUrl || window.location.href).substring(0, 1000),
      selected_text: (ctx.text || '').substring(0, 2000),
      description: description || null,
      user_agent: (navigator.userAgent || '').substring(0, 500),
      client_lang: 'pt',
      // Posição do parágrafo (0-based) dentro do artigo — permite que o admin
      // pule direto pro ¶ correto mesmo quando o texto PT mudou desde o reporte.
      paragraph_index: (typeof ctx.paragraphIndex === 'number') ? ctx.paragraphIndex : null,
    };

    const { error } = await _insertReport(payload);

    if (error) {
      console.error('[translation-report] submit failed:', error);
      _showToast('Falha ao enviar. Tente novamente.', 'error');
    } else {
      _closeModal();
      _showToast('Reporte enviado! Obrigado pela contribuição. 🙏', 'success');
    }

    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }

  // ── Toast ────────────────────────────────────────────────────
  function _showToast(message, type) {
    if (_toastEl) _toastEl.remove();
    const toast = document.createElement('div');
    toast.className = `tr-toast tr-toast--${type || 'success'}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    _toastEl = toast;

    requestAnimationFrame(() => toast.classList.add('tr-toast--visible'));
    setTimeout(() => {
      toast.classList.remove('tr-toast--visible');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  // ── CSS injection ────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('tr-report-styles')) return;
    const style = document.createElement('style');
    style.id = 'tr-report-styles';
    style.textContent = `
      /* ── Selection tooltip button (used by selection-tooltip.js) ── */
      .tr-report-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: #fff;
        border: 1px solid #e6a23c;
        border-radius: 8px;
        color: #8a4a00;
        font-size: 12.5px;
        font-family: 'Outfit', sans-serif;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.1);
        transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
      }
      .tr-report-btn:hover {
        background: #fff7e6;
        border-color: #d68910;
        transform: translateY(-1px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.12);
      }
      .tr-report-btn:active { transform: translateY(0); }
      .tr-report-btn svg { flex-shrink: 0; color: #d68910; }
      .dark .tr-report-btn {
        background: #2a2a2a;
        border-color: #d68910;
        color: #f0c177;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.25);
      }
      .dark .tr-report-btn:hover {
        background: #333;
        border-color: #f0c177;
      }
      .dark .tr-report-btn svg { color: #f0c177; }

      /* Floating selection tooltip wrapper (desktop) */
      .tr-selection-tooltip {
        position: fixed;
        z-index: 9700;
        opacity: 0;
        transform: translateY(4px);
        pointer-events: none;
        transition: opacity 0.18s ease, transform 0.18s ease;
      }
      .tr-selection-tooltip.tr-visible {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }

      /* Mobile fixed bottom bar (mobile + tablet, evita conflito com
         o menu nativo de seleção do iOS que aparece junto à seleção) */
      .tr-selection-bar {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9700;
        padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px));
        background: rgba(255, 255, 255, 0.96);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-top: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.12);
        transform: translateY(100%);
        transition: transform 0.22s ease;
        pointer-events: none;
      }
      .tr-selection-bar.tr-visible {
        transform: translateY(0);
        pointer-events: auto;
      }
      .tr-selection-bar .tr-report-btn {
        width: 100%;
        justify-content: center;
        padding: 12px 16px;
        font-size: 14px;
        border-radius: 10px;
      }
      .dark .tr-selection-bar {
        background: rgba(20, 20, 20, 0.96);
        border-top-color: rgba(255, 255, 255, 0.08);
        box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.45);
      }

      /* ── Modal overlay ─────────────────────────────────────────── */
      .tr-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 9800;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0);
        backdrop-filter: blur(0px);
        pointer-events: none;
        transition: background 0.22s ease, backdrop-filter 0.22s ease;
      }
      .tr-modal-overlay.tr-open {
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        pointer-events: all;
      }

      /* ── Modal panel ───────────────────────────────────────────── */
      .tr-modal-panel {
        background: #fff;
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: 14px;
        box-shadow: 0 24px 64px rgba(0,0,0,0.22);
        width: min(480px, 92vw);
        max-height: 85vh;
        overflow-y: auto;
        opacity: 0;
        transform: translateY(12px) scale(0.97);
        transition: opacity 0.22s ease, transform 0.22s ease;
      }
      .tr-modal-overlay.tr-open .tr-modal-panel {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .dark .tr-modal-panel {
        background: #1a1a1a;
        border-color: rgba(255,255,255,0.08);
        color: #e5e5e5;
        box-shadow: 0 24px 64px rgba(0,0,0,0.6);
      }

      /* ── Header ────────────────────────────────────────────────── */
      .tr-modal-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 18px 20px 14px;
        border-bottom: 1px solid rgba(0,0,0,0.08);
      }
      .dark .tr-modal-header { border-color: rgba(255,255,255,0.08); }
      .tr-modal-icon { font-size: 18px; opacity: 0.75; }
      .tr-modal-title {
        flex: 1;
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        font-family: 'Outfit', sans-serif;
        color: #1a1a1a;
      }
      .dark .tr-modal-title { color: #f0f0f0; }
      .tr-modal-close {
        background: none;
        border: none;
        padding: 4px 8px;
        cursor: pointer;
        color: #888;
        font-size: 14px;
        border-radius: 6px;
        transition: color 0.15s, background 0.15s;
      }
      .tr-modal-close:hover {
        color: #1a1a1a;
        background: rgba(0,0,0,0.05);
      }
      .dark .tr-modal-close:hover { color: #fff; background: rgba(255,255,255,0.08); }

      /* ── Body ──────────────────────────────────────────────────── */
      .tr-modal-body {
        padding: 18px 20px 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .tr-label {
        display: block;
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #999;
        margin-bottom: 4px;
        font-family: 'Outfit', sans-serif;
      }
      .dark .tr-label { color: #888; }
      .tr-selected-text {
        padding: 11px 14px;
        background: rgba(0,0,0,0.04);
        border-left: 3px solid rgba(255, 160, 0, 0.55);
        border-radius: 0 6px 6px 0;
        font-family: 'Crimson Pro', 'Noto Serif JP', serif;
        font-size: 14px;
        line-height: 1.6;
        color: #333;
        max-height: 120px;
        overflow-y: auto;
        word-break: break-word;
        white-space: pre-wrap;
        font-style: italic;
      }
      .dark .tr-selected-text {
        background: rgba(255,255,255,0.05);
        color: #d0d0d0;
      }
      .tr-textarea {
        width: 100%;
        resize: vertical;
        padding: 10px 12px;
        background: #fff;
        border: 1px solid rgba(0,0,0,0.14);
        border-radius: 8px;
        font-family: 'Outfit', sans-serif;
        font-size: 13.5px;
        line-height: 1.5;
        color: #1a1a1a;
        box-sizing: border-box;
        transition: border-color 0.15s, box-shadow 0.15s;
        outline: none;
        min-height: 80px;
      }
      .tr-textarea:focus {
        border-color: rgba(255, 160, 0, 0.6);
        box-shadow: 0 0 0 3px rgba(255, 160, 0, 0.12);
      }
      .dark .tr-textarea {
        background: rgba(255,255,255,0.04);
        border-color: rgba(255,255,255,0.12);
        color: #e5e5e5;
      }
      .tr-char-count {
        text-align: right;
        font-size: 11px;
        color: #bbb;
        font-family: 'Outfit', sans-serif;
      }

      /* ── Footer ────────────────────────────────────────────────── */
      .tr-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 20px 18px;
        border-top: 1px solid rgba(0,0,0,0.06);
      }
      .dark .tr-modal-footer { border-color: rgba(255,255,255,0.08); }
      .tr-btn-cancel, .tr-btn-submit {
        padding: 8px 16px;
        border-radius: 8px;
        font-family: 'Outfit', sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid transparent;
        transition: background 0.15s, opacity 0.15s, transform 0.15s;
      }
      .tr-btn-cancel {
        background: transparent;
        border-color: rgba(0,0,0,0.14);
        color: #777;
      }
      .tr-btn-cancel:hover {
        background: rgba(0,0,0,0.05);
        color: #1a1a1a;
      }
      .dark .tr-btn-cancel {
        border-color: rgba(255,255,255,0.14);
        color: #aaa;
      }
      .dark .tr-btn-cancel:hover {
        background: rgba(255,255,255,0.06);
        color: #fff;
      }
      .tr-btn-submit {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #1a1a1a;
        color: #fff;
        border-color: #1a1a1a;
      }
      .tr-btn-submit:hover:not(:disabled) {
        background: #000;
        transform: translateY(-1px);
      }
      .tr-btn-submit:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        transform: none;
      }
      .dark .tr-btn-submit {
        background: #f0f0f0;
        color: #1a1a1a;
        border-color: #f0f0f0;
      }
      .dark .tr-btn-submit:hover:not(:disabled) { background: #fff; }

      /* ── Toast ─────────────────────────────────────────────────── */
      .tr-toast {
        position: fixed;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%) translateY(16px);
        z-index: 9900;
        padding: 10px 20px;
        border-radius: 24px;
        font-family: 'Outfit', sans-serif;
        font-size: 13.5px;
        font-weight: 500;
        box-shadow: 0 8px 24px rgba(0,0,0,0.22);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s ease;
        white-space: nowrap;
        max-width: 90vw;
      }
      .tr-toast--success { background: #1a1a1a; color: #fff; }
      .tr-toast--error   { background: #c0392b; color: #fff; }
      .tr-toast--visible { opacity: 1; transform: translateX(-50%) translateY(0); }

      /* ── Reduced motion ────────────────────────────────────────── */
      @media (prefers-reduced-motion: reduce) {
        .tr-modal-panel,
        .tr-modal-overlay,
        .tr-selection-tooltip,
        .tr-toast { transition: none; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Public API ───────────────────────────────────────────────
  window.openTranslationReport = function (text, context) {
    _openModal(text, context);
  };

  // ── Init ─────────────────────────────────────────────────────
  function _init() {
    _injectStyles();
    _buildModal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
