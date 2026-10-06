-- ============================================
-- RETOPA Sprint B — Panel del Cliente
-- Estadísticas de visitas y acciones por empresa
-- ============================================

-- Tabla de visitas a fichas (para el dashboard del cliente)
CREATE TABLE IF NOT EXISTS business_views (
    id          SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    ip_hash     VARCHAR(64),
    referrer    VARCHAR(500),
    viewed_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_views_business ON business_views(business_id);
CREATE INDEX IF NOT EXISTS idx_views_date     ON business_views(viewed_at);

-- Tabla de clics en WhatsApp/teléfono (conversiones)
CREATE TABLE IF NOT EXISTS business_clicks (
    id          SERIAL PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    click_type  VARCHAR(20) DEFAULT 'whatsapp', -- whatsapp, phone, website
    ip_hash     VARCHAR(64),
    clicked_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_clicks_business ON business_clicks(business_id);

-- Vista materializada de stats por empresa (actualizar con trigger o cron)
-- Para el panel del cliente: vistas 30d, likes, reviews, clics
CREATE OR REPLACE VIEW business_stats_view AS
SELECT
    b.id,
    b.slug,
    b.name,
    b.plan_type,
    b.verified,
    b.rating,
    b.review_count,
    COALESCE(b.like_count, 0) as like_count,
    COUNT(DISTINCT bv.id) FILTER (WHERE bv.viewed_at >= NOW() - INTERVAL '30 days') as views_30d,
    COUNT(DISTINCT bv.id) FILTER (WHERE bv.viewed_at >= NOW() - INTERVAL '7 days')  as views_7d,
    COUNT(DISTINCT bc.id) FILTER (WHERE bc.clicked_at >= NOW() - INTERVAL '30 days' AND bc.click_type = 'whatsapp') as whatsapp_clicks_30d,
    COUNT(DISTINCT bc.id) FILTER (WHERE bc.clicked_at >= NOW() - INTERVAL '30 days' AND bc.click_type = 'phone')    as phone_clicks_30d
FROM businesses b
LEFT JOIN business_views  bv ON bv.business_id = b.id
LEFT JOIN business_clicks bc ON bc.business_id = b.id
WHERE b.is_active = TRUE
GROUP BY b.id, b.slug, b.name, b.plan_type, b.verified, b.rating, b.review_count, b.like_count;

SELECT 'Sprint B — tablas de stats creadas' AS status;
