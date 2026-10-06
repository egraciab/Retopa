-- ════════════════════════════════════════════════════════════════════════════
-- RetoPA — Fix: ampliar chk_lead_status para incluir los estados de CAPTACIÓN
-- ('verificado', 'descartado') y 'closed'.
--
-- CONTEXTO
-- El panel de Leads se reetiquetó a Captación (Nuevo → Verificado/Descartado) y
-- el flujo "Verificar ficha" (helpers/verifyFicha.js) hace:
--     UPDATE service_leads SET status='verificado' ...
-- pero el CHECK constraint chk_lead_status en producción nunca se amplió, así que
-- rechaza el valor con:
--     new row for relation "service_leads" violates check constraint "chk_lead_status"
--
-- Este migration deja el constraint como SUPERSET de todos los estados que el
-- código escribe hoy en service_leads.status:
--   INSERT: 'new', 'pending', 'claim'
--   Ventas: 'contacted','negotiating','won','lost','rejected','completed','follow_up'
--   Cierre manual: 'closed'
--   Captación: 'verificado','descartado'
--
-- Es idempotente y sólo AMPLÍA (ninguna fila existente puede violarlo).
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE service_leads DROP CONSTRAINT IF EXISTS chk_lead_status;

ALTER TABLE service_leads ADD CONSTRAINT chk_lead_status
    CHECK (status IN (
        'new', 'pending', 'contacted', 'negotiating', 'won', 'lost',
        'rejected', 'completed', 'closed', 'claim', 'follow_up',
        'verificado', 'descartado'
    ));

COMMIT;
