-- RetoPA v2.6 S3.2 — Claim workflow
-- Token único por empresa para reclamar desde el email

BEGIN;

-- 1. Columnas en businesses
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS claim_token      VARCHAR(64)  UNIQUE,
  ADD COLUMN IF NOT EXISTS claim_token_at   TIMESTAMP,   -- cuándo se generó
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMP,   -- expira a los 30 días
  ADD COLUMN IF NOT EXISTS claim_status     VARCHAR(20)  DEFAULT NULL,
  -- valores: NULL | 'pending' | 'approved' | 'rejected'
  ADD COLUMN IF NOT EXISTS claimed_by       INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at       TIMESTAMP;

-- 2. Índice para búsqueda rápida por token
CREATE INDEX IF NOT EXISTS idx_businesses_claim_token
  ON businesses(claim_token) WHERE claim_token IS NOT NULL;

-- 3. Vista de claims pendientes para el panel admin
CREATE OR REPLACE VIEW v_claims_pending AS
SELECT
  b.id, b.name, b.trade_name, b.slug, b.email, b.phone,
  b.city, b.department, b.category_id,
  b.claim_token, b.claim_token_at, b.claim_expires_at,
  b.claim_status, b.claimed_at,
  b.verified, b.notify_count, b.notified_at,
  u.id   AS user_id,
  u.name AS user_name,
  u.email AS user_email
FROM businesses b
LEFT JOIN users u ON u.id = b.claimed_by
WHERE b.claim_status = 'pending'
ORDER BY b.claimed_at DESC;

COMMIT;

-- Fix: ampliar el CHECK constraint de status en service_leads para incluir 'claim'
-- (el constraint chk_lead_status solo permitía ciertos valores)
BEGIN;
ALTER TABLE service_leads DROP CONSTRAINT IF EXISTS chk_lead_status;
ALTER TABLE service_leads ADD CONSTRAINT chk_lead_status
    CHECK (status IN ('new','pending','contacted','won','lost','rejected','completed','claim'));
COMMIT;
