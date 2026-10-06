-- ============================================================
-- RetoPA — Fase 2A: Autoasignación de fichas
-- 2026-06-14_ambassador_fase2a.sql
-- ============================================================

BEGIN;

-- 1. Tipo de asignación en ambassador_businesses
--    'created'  = embajador creó la ficha desde cero
--    'assigned' = embajador tomó una ficha existente para completar
ALTER TABLE ambassador_businesses
  ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(20) DEFAULT 'created';

-- Las filas existentes son todas 'created'
UPDATE ambassador_businesses SET assignment_type = 'created' WHERE assignment_type IS NULL;

-- 2. Vista de fichas disponibles para autoasignación
--    Criterios: activa, no verificada, no reclamada, no en flujo embajador,
--    sin embajador asignado, score < 65 (hay mejora posible)
CREATE OR REPLACE VIEW v_ambassador_available AS
  SELECT
    b.id, b.name, b.trade_name, b.slug,
    b.city, b.department,
    b.phone, b.whatsapp, b.email, b.website,
    b.image_url, b.logo_emoji,
    b.lat, b.lng,
    b.description, b.address,
    b.source, b.created_at,
    fn_quality_score(b.*) AS quality_score,
    -- Qué falta (para mostrar al embajador)
    (NULLIF(TRIM(b.whatsapp), '') IS NULL)                          AS falta_whatsapp,
    (NULLIF(TRIM(b.phone),    '') IS NULL)                          AS falta_phone,
    (NULLIF(TRIM(b.image_url),'') IS NULL)                          AS falta_logo,
    (NULLIF(TRIM(b.description),'') IS NULL)                        AS falta_descripcion,
    (b.lat IS NULL OR b.lng IS NULL)                                AS falta_ubicacion,
    (b.hours_json IS NULL OR
     NOT jsonb_path_exists(b.hours_json,'$.* ? (@.closed == false)')) AS falta_horario,
    -- Categoría primaria
    (SELECT c.name FROM categories c
       JOIN business_categories bc ON bc.category_id = c.id
      WHERE bc.business_id = b.id AND bc.is_primary = TRUE
      LIMIT 1) AS category_name,
    (SELECT c.id FROM categories c
       JOIN business_categories bc ON bc.category_id = c.id
      WHERE bc.business_id = b.id AND bc.is_primary = TRUE
      LIMIT 1) AS category_id,
    (SELECT c.parent_id FROM categories c
       JOIN business_categories bc ON bc.category_id = c.id
      WHERE bc.business_id = b.id AND bc.is_primary = TRUE
      LIMIT 1) AS category_parent_id
  FROM businesses b
  WHERE b.is_active = TRUE
    AND b.verified = FALSE
    AND b.claimed_by IS NULL
    AND b.data_status IS NULL
    AND fn_quality_score(b.*) < 65
    AND NOT EXISTS (
      SELECT 1 FROM ambassador_businesses ab WHERE ab.business_id = b.id
    )
  ORDER BY fn_quality_score(b.*) ASC, b.created_at DESC;

-- 3. Índice para acelerar la búsqueda de fichas disponibles
CREATE INDEX IF NOT EXISTS idx_businesses_available
  ON businesses(is_active, verified, claimed_by, data_status)
  WHERE is_active = TRUE
    AND verified = FALSE
    AND claimed_by IS NULL
    AND data_status IS NULL;

COMMIT;

SELECT 'Fase 2A lista' AS status,
       COUNT(*) AS fichas_disponibles
FROM v_ambassador_available;
