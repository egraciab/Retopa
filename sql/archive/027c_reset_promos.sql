-- OPCIONAL: Limpiar datos de prueba de boosts y promos
-- Ejecutar SOLO si querés resetear los datos de prueba
-- TRUNCATE promotion_boosts RESTART IDENTITY CASCADE;
-- TRUNCATE promotions RESTART IDENTITY CASCADE;

-- Asegurar columna expires_at en promotion_boosts
ALTER TABLE promotion_boosts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
