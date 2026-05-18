-- ==============================================================================
-- translation_reports_guia — Johrei: Guia para Ministrantes
--
-- Sistema de reporte de erros de tradução pelos usuários (anônimo, sem login).
-- Compartilha o mesmo projeto Supabase do "Caminho da Felicidade" (Mioshie).
--
-- Execute no SQL Editor do Supabase Dashboard:
-- https://supabase.com/dashboard/project/succhmnbajvbpmoqrktq/sql/new
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.translation_reports_guia (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contexto do artigo
  article_id    text NOT NULL,             -- ex: "como-aplicar-johrei-01"
  article_title text,                       -- snapshot pra contexto rápido no painel
  tab           text NOT NULL,              -- ex: "como_aplicar", "fundamentos", "mapa"
  page_url      text,                       -- URL completa com hash/query

  -- Conteúdo do reporte
  selected_text text NOT NULL,              -- trecho grifado pelo usuário (até 2000 chars)
  description   text,                       -- comentário opcional (até 500 chars)

  -- Para futura correção via painel admin (Fase 2)
  pt_before     text,                       -- snapshot do parágrafo no momento da edição
  pt_after      text,                       -- versão corrigida
  status        text NOT NULL DEFAULT 'open',  -- 'open' | 'corrected' | 'verified' | 'dismissed'
  corrected_at  timestamptz,
  verified_at   timestamptz,

  -- Metadados de cliente (ajudam debug, não identificam usuário)
  user_agent    text,
  client_lang   text DEFAULT 'pt',

  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Índices para o painel admin
CREATE INDEX IF NOT EXISTS idx_trg_article
  ON public.translation_reports_guia (article_id);

CREATE INDEX IF NOT EXISTS idx_trg_created_at
  ON public.translation_reports_guia (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trg_status
  ON public.translation_reports_guia (status, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.translation_reports_guia ENABLE ROW LEVEL SECURITY;

-- Qualquer um (anon) pode INSERIR reportes — sem login.
-- Rate-limiting deve ser feito via Edge Function ou Cloudflare se virar problema.
CREATE POLICY "Anyone can submit reports"
ON public.translation_reports_guia
FOR INSERT
TO anon, authenticated
WITH CHECK (
  -- Validações básicas pra evitar lixo óbvio
  char_length(selected_text) BETWEEN 2 AND 2000
  AND char_length(article_id) BETWEEN 1 AND 200
  AND char_length(coalesce(description, '')) <= 500
);

-- Apenas admins (via is_admin() já existente no projeto do Mioshie) podem ler.
-- Se is_admin() ainda não existir, comente esta policy e crie depois.
CREATE POLICY "Admins read all reports"
ON public.translation_reports_guia
FOR SELECT
TO authenticated
USING ( public.is_admin() );

-- Admins podem atualizar (status, pt_before/pt_after) e deletar
CREATE POLICY "Admins update reports"
ON public.translation_reports_guia
FOR UPDATE
TO authenticated
USING ( public.is_admin() )
WITH CHECK ( public.is_admin() );

CREATE POLICY "Admins delete reports"
ON public.translation_reports_guia
FOR DELETE
TO authenticated
USING ( public.is_admin() );

-- ── Comentário descritivo na tabela (aparece no Dashboard) ──────────────────
COMMENT ON TABLE public.translation_reports_guia IS
  'Reportes anônimos de erros de tradução do site guia_johrei. Sem auth no INSERT, leitura restrita a admins.';
