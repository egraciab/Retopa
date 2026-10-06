-- ============================================================
-- RetoPA — FIX 034: Reparar workflow de Claims
-- ------------------------------------------------------------
-- PROBLEMA: 022_claim_workflow.sql envuelve todo en BEGIN..COMMIT.
-- Dentro crea las columnas claim_* y LUEGO la vista v_claims_pending
-- que referencia b.notify_count y b.notified_at. Esas columnas no
-- existen hasta 031_notify_columns.sql (posterior) → el CREATE VIEW
-- falla → ROLLBACK de TODA la transacción → las columnas claim_*
-- NUNCA quedan creadas. Todo el módulo de reclamación queda muerto
-- en cualquier instalación que siga el orden del repo.
--
-- Este fix es IDEMPOTENTE y reconstruye lo que el rollback dejó sin crear.
-- ============================================================
BEGIN;

-- 1. Columnas de claim en businesses (las que el rollback de 022 dejó sin crear)
ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS claim_token      VARCHAR(64) UNIQUE,
    ADD COLUMN IF NOT EXISTS claim_token_at   TIMESTAMP,
    ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS claim_status     VARCHAR(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS claimed_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS claimed_at       TIMESTAMP;

-- 2. Columnas de notificación que la vista necesita (de 031; las garantizamos aquí)
ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS notified_at  TIMESTAMP,
    ADD COLUMN IF NOT EXISTS notify_count INTEGER DEFAULT 0;

-- 3. Índice de token
CREATE INDEX IF NOT EXISTS idx_businesses_claim_token
    ON businesses(claim_token) WHERE claim_token IS NOT NULL;

-- 4. Recrear la vista (ahora todas las columnas existen sí o sí)
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

SELECT 'Fix 034 OK — columnas claim: ' ||
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='businesses'
       AND column_name IN ('claim_status','claim_token','claimed_by','claimed_at',
                           'claim_token_at','claim_expires_at')) || '/6' AS status;
