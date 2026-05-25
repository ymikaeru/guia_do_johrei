// ============================================================
// Supabase Storage helper — Guia do Johrei (público)
//
// Single source of truth pra onde os JSONs/MDs do conteúdo vivem.
// Não importa o SDK do Supabase — leitura é via fetch direto da
// URL pública do bucket (mais leve, sem dependências).
//
// O bucket `guia-data` é público; admin escreve via painel CdF
// (admin-supabase.html) usando o SDK + service auth.
// ============================================================

(function () {
  'use strict';

  // Mesmo projeto Supabase do "Caminho da Felicidade" (compartilhado).
  const SUPABASE_URL = 'https://succhmnbajvbpmoqrktq.supabase.co';
  const BUCKET = 'guia-data';

  const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;

  // Devolve a URL completa pra um arquivo do bucket, com cache-buster.
  // Ex: guiaDataUrl('tab_fundamentos.json')
  //   → https://.../guia-data/tab_fundamentos.json?t=1735...
  function guiaDataUrl(filename) {
    return `${STORAGE_BASE}/${filename}?t=${Date.now()}`;
  }

  // Expostos globalmente (scripts do site rodam em escopo global, não ESM)
  window.SUPABASE_URL = SUPABASE_URL;
  window.GUIA_DATA_BASE = STORAGE_BASE;
  window.guiaDataUrl = guiaDataUrl;
})();
