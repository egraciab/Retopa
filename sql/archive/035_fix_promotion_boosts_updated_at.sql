-- ============================================================
-- RetoPA — FIX 035: Agregar promotion_boosts.updated_at
-- ------------------------------------------------------------
-- PROBLEMA: promotions.routes.js actualiza promotion_boosts con
-- "SET status=..., updated_at=NOW()" en 3 lugares (delete promo,
-- reject boost, cancel). La columna updated_at NUNCA se creó en
-- ninguna migración. Como esos UPDATE van con .catch(()=>{}), el
-- error se traga en silencio y el boost NO se cancela/actualiza.
--
-- CONFIRMADO faltante en el dump de producción del 2026-06-09.
-- ============================================================
BEGIN;

ALTER TABLE promotion_boosts
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill: filas existentes toman created_at como updated_at inicial
UPDATE promotion_boosts SET updated_at = created_at WHERE updated_at IS NULL;

COMMIT;

SELECT 'Fix 035 OK — promotion_boosts.updated_at: ' ||
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='promotion_boosts' AND column_name='updated_at') || '/1' AS status;
