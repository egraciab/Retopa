-- ============================================================
-- RetoPA — Tracking de visitas al sitio (cualquier página)
-- ------------------------------------------------------------
-- Registra visitas a home, directorio, categorías y fichas.
-- Distinto de business_views (que es solo fichas de empresa).
-- Para el contador de "Conexiones" en tiempo real del dashboard.
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS site_visits (
    id         BIGSERIAL PRIMARY KEY,
    ip_hash    VARCHAR(64),
    path       VARCHAR(300),
    visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_site_visits_date ON site_visits(visited_at);
CREATE INDEX IF NOT EXISTS idx_site_visits_iphash_date ON site_visits(ip_hash, visited_at);

-- Limpieza: opcional, mantener solo últimos 90 días para que no crezca infinito.
-- (se puede correr periódicamente; acá solo se documenta)
-- DELETE FROM site_visits WHERE visited_at < NOW() - INTERVAL '90 days';

SELECT 'site_visits OK' AS status;
