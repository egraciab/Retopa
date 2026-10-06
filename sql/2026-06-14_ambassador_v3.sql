-- ============================================================
-- RetoPA — Sprint Embajador v3 fixes
-- 2026-06-14_ambassador_v3.sql
-- ============================================================

BEGIN;

-- 1. Fichas de embajador en draft o pending_review NO deben aparecer
--    en el directorio público. El campo is_active ya controla esto,
--    pero para fichas ambassador usamos data_status.
--    La lógica de directory.js ya filtra por is_active=true — solo
--    necesitamos asegurar que draft y pending tengan is_active=false.

-- Asegurar que fichas existentes en draft/pending no sean visibles
UPDATE businesses
SET is_active = FALSE
WHERE data_status IN ('draft', 'pending_review')
  AND source = 'ambassador';

-- 2. Trigger: cuando data_status cambia a pending_review, is_active=false
--    Cuando admin aprueba (data_status=NULL), is_active=true
--    Esto lo maneja el backend en el approve endpoint — confirmar con índice

-- 3. Estado 'archived' para fichas rechazadas que el embajador quiere ocultar
DO $$
BEGIN
  ALTER TABLE businesses DROP CONSTRAINT IF EXISTS chk_data_status;
  ALTER TABLE businesses
    ADD CONSTRAINT chk_data_status
    CHECK (data_status IS NULL OR data_status IN ('draft', 'pending_review', 'published', 'rejected', 'archived'));
END$$;

COMMIT;
