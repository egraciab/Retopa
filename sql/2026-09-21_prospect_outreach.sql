-- ════════════════════════════════════════════════════════════════════════════
-- RetoPA — Panel de Prospectos: seguimiento de contacto por WhatsApp
--
-- Registra el estado de contacto POR NÚMERO de WhatsApp (no por business_id),
-- porque varias fichas de prospección comparten un mismo número (cadenas con
-- sucursales). Así se contacta una sola vez a cada persona/grupo.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE TABLE IF NOT EXISTS prospect_outreach (
    id             serial PRIMARY KEY,
    whatsapp       varchar(30) NOT NULL UNIQUE,   -- clave del grupo (595XXXXXXXXX)
    estado         varchar(20) NOT NULL DEFAULT 'pendiente',
    fecha_contacto timestamptz,
    notas          text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_prospect_estado CHECK (estado IN
        ('pendiente','enviado','respondio','reclamo','rechazo'))
);

CREATE INDEX IF NOT EXISTS idx_prospect_outreach_whatsapp ON prospect_outreach(whatsapp);
CREATE INDEX IF NOT EXISTS idx_prospect_outreach_estado   ON prospect_outreach(estado);

COMMIT;
