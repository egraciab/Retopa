-- ============================================================
-- RetoPA — Sprint Embajador
-- 2026-06-14_ambassador.sql
-- ============================================================

BEGIN;

-- 1. Estado interno de revisión (solo fichas de embajadores)
--    NULL = comportamiento actual (15.055 fichas no se tocan)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS data_status  VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS review_note  TEXT        DEFAULT NULL;

-- Constraint de valores válidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_data_status'
  ) THEN
    ALTER TABLE businesses
      ADD CONSTRAINT chk_data_status
      CHECK (data_status IS NULL OR data_status IN ('pending_review', 'published', 'rejected'));
  END IF;
END$$;

-- 2. Tabla de atribución embajador → negocio
CREATE TABLE IF NOT EXISTS ambassador_businesses (
  id             SERIAL PRIMARY KEY,
  ambassador_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  business_id    INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(business_id)  -- un negocio tiene un único embajador de origen
);

CREATE INDEX IF NOT EXISTS idx_ambassador_businesses_ambassador
  ON ambassador_businesses(ambassador_id);

CREATE INDEX IF NOT EXISTS idx_ambassador_businesses_business
  ON ambassador_businesses(business_id);

-- 3. Índice para cola de revisión
CREATE INDEX IF NOT EXISTS idx_businesses_data_status
  ON businesses(data_status) WHERE data_status IS NOT NULL;

-- 4. Vista para cola de revisión del admin
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
      WHERE bc.business_id = b.id AND bc.is_primary = true
      LIMIT 1) AS category_name
  FROM businesses b
  JOIN ambassador_businesses ab ON ab.business_id = b.id
  JOIN users u ON u.id = ab.ambassador_id
  WHERE b.data_status = 'pending_review'
  ORDER BY b.created_at ASC;

COMMIT;
