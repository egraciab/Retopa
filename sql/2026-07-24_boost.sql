-- ============================================================
-- RetoPA — S30 gamificación soft: empujón de visibilidad temporal
-- ------------------------------------------------------------
-- Se activa al guardar una ficha que llegó al 100% de completitud
-- (fn_profile_completion). Mientras boost_until > NOW(), la ficha sube
-- DENTRO de su tier de plan en el feed principal del directorio.
-- Idempotente.
-- ============================================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS boost_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_businesses_boost_until
  ON businesses (boost_until) WHERE boost_until IS NOT NULL;

SELECT 'boost_until listo' AS status;
