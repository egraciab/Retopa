-- Sprint v2.2: respuesta del dueño a reseñas + trazabilidad de galería

-- 1) Respuesta del dueño en reseñas (solo Premium)
ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS owner_reply       TEXT,
    ADD COLUMN IF NOT EXISTS owner_replied_at  TIMESTAMP;

-- 2) Trazabilidad de clicks en galería (solo Premium)
CREATE TABLE IF NOT EXISTS gallery_clicks (
    id          SERIAL PRIMARY KEY,
    gallery_id  INTEGER NOT NULL REFERENCES business_gallery(id) ON DELETE CASCADE,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    ip_hash     VARCHAR(64),
    clicked_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gallery_clicks_business ON gallery_clicks(business_id, clicked_at);
CREATE INDEX IF NOT EXISTS idx_gallery_clicks_gallery  ON gallery_clicks(gallery_id);

SELECT 'reviews reply + gallery_clicks OK' AS status;
