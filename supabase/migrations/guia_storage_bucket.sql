-- ==============================================================================
-- guia_storage_bucket — Bucket pra conteúdo editável do guia_johrei.
--
-- Move os data/*.json do repo pra Storage, permitindo que admin edite via
-- painel (admin-supabase.html, seção Johrei Guia) e o site reflita na hora.
--
-- Reusa o mesmo projeto Supabase do Mioshie (succhmnbajvbpmoqrktq) e o
-- helper public.is_admin() já existente (restore_admin_and_rls.sql).
--
-- ⚠ ATENÇÃO: ESTE ARQUIVO TEM 2 PARTES
-- 1. SQL Editor (executável aqui) — cria o bucket
-- 2. Storage UI (manual no Dashboard) — cria a policy
--    (storage.objects agora é owned por supabase_storage_admin no Supabase
--     hospedado, então policies precisam ser criadas pela UI da Storage)
--
-- Execute parte 1 em: https://supabase.com/dashboard/project/succhmnbajvbpmoqrktq/sql/new
-- ==============================================================================

-- ── PARTE 1 (SQL Editor): criar bucket público ──────────────────────────────
-- public=true → URLs /storage/v1/object/public/guia-data/X.json funcionam
-- sem auth (anon read). Escrita continua protegida pela policy da PARTE 2.

INSERT INTO storage.buckets (id, name, public)
VALUES ('guia-data', 'guia-data', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Verificação rápida:
-- SELECT id, name, public FROM storage.buckets WHERE id = 'guia-data';


-- ============================================================================
-- ── PARTE 2 (Dashboard UI): criar policy de escrita pra admins ──────────────
-- ============================================================================
--
-- 1. Dashboard → Storage → bucket "guia-data" → aba "Policies" → New Policy
--    https://supabase.com/dashboard/project/succhmnbajvbpmoqrktq/storage/buckets/guia-data
--
-- 2. Escolha "For full customization"
--
-- 3. Preencha:
--      Policy name:    Admins manage guia-data
--      Allowed ops:    [x] SELECT  [x] INSERT  [x] UPDATE  [x] DELETE
--      Target roles:   authenticated
--      USING expr:     bucket_id = 'guia-data' AND public.is_admin()
--      WITH CHECK:     bucket_id = 'guia-data' AND public.is_admin()
--
-- 4. Salvar.
--
-- (Não precisa de policy de SELECT pública — o bucket marcado como public=true
--  já permite leitura anônima via URL /storage/v1/object/public/...)
--
-- ============================================================================
