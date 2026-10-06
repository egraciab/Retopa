-- ============================================
-- RetoPA — Migración 030: Campo source
-- Origen/fuente del registro (manual, MIC, import, etc.)
-- Aplicar: docker exec -i retopa-db psql -U retopa -d retopa < sql/030_source_column.sql
-- ============================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual';

-- Marcar registros existentes como 'manual'
UPDATE businesses SET source = 'manual' WHERE source IS NULL;

SELECT 'source column added — ' || COUNT(*) || ' registros marcados como manual' AS status
FROM businesses WHERE source = 'manual';
