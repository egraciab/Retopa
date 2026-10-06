-- ============================================
-- RetoPA — Migración 021: Soporte de distancia
-- Sprint 2: Ordenamiento por proximidad
-- Aplicar: docker exec -i retopa-db psql -U retopa -d retopa < sql/021_distance_support.sql
-- ============================================

-- 1. Columna que distingue coord real (verificada) vs coord de ciudad (default)
ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS coord_is_real BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Índice GIST ya existe (idx_businesses_location), confirmamos
CREATE INDEX IF NOT EXISTS idx_businesses_location
    ON businesses USING GIST(location);

-- 3. Índice de soporte para ORDER híbrido (plan + rating)
CREATE INDEX IF NOT EXISTS idx_businesses_plan_rating
    ON businesses (plan_type, rating DESC);

-- Verificación
SELECT
    COUNT(*)                                              AS total_empresas,
    COUNT(location)                                       AS con_location,
    COUNT(lat)                                            AS con_lat_lng,
    COUNT(CASE WHEN coord_is_real THEN 1 END)             AS coord_real
FROM businesses;
