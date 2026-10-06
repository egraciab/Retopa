-- ============================================================
-- RetoPA — Medición del banner de captación "Registrá tu negocio"
-- Eventos del embudo: impression → cta (→ registro, en otro flujo).
-- Anónimo: session_id del visitante (localStorage) + ip_hash. Sin PII.
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS reg_banner_events (
  id            BIGSERIAL PRIMARY KEY,
  event         TEXT NOT NULL,          -- impression | cta | dismiss | never | login
  session_id    TEXT,                   -- id anónimo del visitante
  business_slug TEXT,                   -- ficha donde apareció el banner
  ip_hash       TEXT,
  referrer      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_banner_events_created ON reg_banner_events (created_at);
CREATE INDEX IF NOT EXISTS idx_reg_banner_events_event   ON reg_banner_events (event);

SELECT 'reg_banner_events creada OK' AS status;
