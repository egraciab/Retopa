-- ============================================
-- RetoPA — Migración 031: Columnas de notificación
-- Para el panel "Notificar empresas" del admin
-- Aplicar: docker exec -i retopa-db psql -U retopa -d retopa < sql/031_notify_columns.sql
-- ============================================

ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS notified_at   TIMESTAMP,
    ADD COLUMN IF NOT EXISTS notify_count  INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_businesses_notified ON businesses(notified_at);

SELECT 'Columnas notified_at y notify_count agregadas correctamente' AS status;
