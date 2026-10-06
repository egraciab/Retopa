-- ============================================================
-- RetoPA — Archivado de leads
-- ------------------------------------------------------------
-- Campo 'archived' para sacar leads tratados de la vista activa.
-- Un lead se considera archivado si: archived=true O status IN (won,lost,closed).
-- Idempotente.
-- ============================================================

ALTER TABLE service_leads
    ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;

ALTER TABLE service_leads
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_leads_archived ON service_leads(archived);

SELECT 'service_leads.archived OK' AS status;
