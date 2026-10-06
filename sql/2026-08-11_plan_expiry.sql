-- D7.4 — Vencimiento de planes pagos: recordatorios 7/3/0, gracia y reversión.
-- Rastrea qué recordatorios ya se enviaron para no repetirlos (lista de umbrales
-- separados por coma, p.ej. '7,3'). Se resetea al renovar (el confirm ya pone
-- email_sent_at=NULL al extender; acá también limpiamos reminders_sent).
ALTER TABLE plan_grants ADD COLUMN IF NOT EXISTS reminders_sent TEXT NOT NULL DEFAULT '';

-- Las claves de configuración (plan_grace_days, plan_renewal_days) ya se sembraron
-- en 2026-08-10_plan_requests.sql. Por las dudas, garantizamos que existan:
INSERT INTO site_config (key, value) VALUES
  ('plan_grace_days', '7'),
  ('plan_renewal_days', '7,3,0')
ON CONFLICT (key) DO NOTHING;
