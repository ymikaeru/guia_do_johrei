-- ============================================================
-- translation_reports_guia: adiciona paragraph_index
--
-- Posição do parágrafo (0-indexed) onde o usuário selecionou o
-- trecho reportado. Permite que o admin Preview pule direto pro
-- parágrafo correto mesmo quando o texto PT mudou desde o reporte
-- (que invalida a busca por substring).
--
-- Reportes antigos ficam com NULL → fallback pra busca por texto.
--
-- Execute no SQL Editor:
-- https://supabase.com/dashboard/project/succhmnbajvbpmoqrktq/sql/new
-- ============================================================

ALTER TABLE public.translation_reports_guia
  ADD COLUMN IF NOT EXISTS paragraph_index int;

COMMENT ON COLUMN public.translation_reports_guia.paragraph_index IS
  'Índice 0-based do <p> dentro de #contentPT onde a seleção foi feita. NULL pra reportes antigos.';

-- Verificação:
-- SELECT id, article_id, paragraph_index, selected_text FROM public.translation_reports_guia ORDER BY created_at DESC LIMIT 5;
