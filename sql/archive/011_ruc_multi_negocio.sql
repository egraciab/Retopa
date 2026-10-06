-- RetoPA v2.6 — Migration: permitir múltiples negocios bajo el mismo RUC
-- Un RUC puede tener varias marcas (HEPTA GROUP, HEPTA STORE, HEPTANET, etc.)
-- El identificador único sigue siendo el slug.

BEGIN;

-- 1. Eliminar el constraint UNIQUE de RUC
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_ruc_key;

-- 2. Crear índice no-único para búsquedas por RUC (mantener performance)
CREATE INDEX IF NOT EXISTS idx_businesses_ruc ON businesses(ruc)
    WHERE ruc IS NOT NULL;

-- 3. Agregar columna ruc_parent para agrupar negocios del mismo RUC
--    (opcional pero útil para el panel admin y futuras vistas agrupadas)
ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS ruc_parent VARCHAR(50);

-- 4. Poblar ruc_parent con el mismo valor de ruc para los registros existentes
UPDATE businesses SET ruc_parent = ruc WHERE ruc IS NOT NULL AND ruc_parent IS NULL;

COMMIT;
