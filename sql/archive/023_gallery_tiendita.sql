-- RetoPA S4.1/S4.2 — Galería tiendita + focal point
BEGIN;

-- 1. Precio en business_gallery
ALTER TABLE business_gallery
    ADD COLUMN IF NOT EXISTS price         NUMERIC(12,0),   -- precio en Gs
    ADD COLUMN IF NOT EXISTS price_label   VARCHAR(50),     -- "Gs.", "USD", "Consultar"
    ADD COLUMN IF NOT EXISTS description   TEXT,            -- descripción del producto
    ADD COLUMN IF NOT EXISTS is_available  BOOLEAN DEFAULT TRUE;

-- 2. Focal point en businesses (para portada)
ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS cover_focal_x SMALLINT DEFAULT 50,  -- 0-100%
    ADD COLUMN IF NOT EXISTS cover_focal_y SMALLINT DEFAULT 50;  -- 0-100%

COMMIT;
