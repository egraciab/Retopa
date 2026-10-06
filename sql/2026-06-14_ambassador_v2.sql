-- ============================================================
-- RetoPA — Sprint Embajador v2
-- 2026-06-14_ambassador_v2.sql
-- ============================================================

BEGIN;

-- 1. Flag is_ambassador en users (independiente del role)
--    Permite que un cliente/usuario normal también sea embajador
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_ambassador BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_is_ambassador
  ON users(is_ambassador) WHERE is_ambassador = TRUE;

-- 2. Agregar estado 'draft' a data_status
--    draft = guardado por el embajador, aún no enviado a revisión
DO $$
BEGIN
  ALTER TABLE businesses DROP CONSTRAINT IF EXISTS chk_data_status;
  ALTER TABLE businesses
    ADD CONSTRAINT chk_data_status
    CHECK (data_status IS NULL OR data_status IN ('draft', 'pending_review', 'published', 'rejected'));
END$$;

-- 3. Campo RUC ya existe en businesses — no requiere migración

-- 4. Actualizar vista para incluir drafts y estado
CREATE OR REPLACE VIEW v_ambassador_pending AS
  SELECT
    b.id, b.name, b.trade_name, b.slug,
    b.city, b.phone, b.whatsapp, b.email,
    b.image_url, b.logo_emoji,
    b.data_status, b.review_note,
    b.created_at,
    u.id   AS ambassador_id,
    u.name AS ambassador_name,
    u.email AS ambassador_email,
    (SELECT name FROM categories c
       JOIN business_categories bc ON bc.category_id = c.id
      WHERE bc.business_id = b.id AND bc.is_primary = TRUE
      LIMIT 1) AS category_name
  FROM businesses b
  JOIN ambassador_businesses ab ON ab.business_id = b.id
  JOIN users u ON u.id = ab.ambassador_id
  WHERE b.data_status = 'pending_review'
  ORDER BY b.created_at ASC;

COMMIT;
