-- ============================================
-- RETOPA Sprint C — Galería de empresas
-- 3 imágenes para Negocio Digital (featured)
-- 5 imágenes para Pro (premium)
-- ============================================

CREATE TABLE IF NOT EXISTS business_gallery (
    id          SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    image_url   TEXT NOT NULL,
    link_url    TEXT,                    -- link opcional (tienda, whatsapp, etc)
    link_label  VARCHAR(100),            -- texto del botón (ej: "Ver tienda")
    caption     VARCHAR(200),            -- caption opcional
    position    SMALLINT DEFAULT 0,      -- orden de aparición
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gallery_business ON business_gallery(business_id, position);

-- Límites por plan
-- featured (Negocio Digital): 3 imágenes
-- premium  (Pro):             5 imágenes
-- basic:                      0 imágenes

SELECT 'business_gallery creado' AS status;
