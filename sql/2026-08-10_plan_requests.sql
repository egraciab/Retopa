-- D7.1 — Contratación de planes RetoPA con Tpago (pasarela v1).
-- Solicitudes de plan (espejo de promotion_boosts). El precio (amount_gs) se congela
-- desde plans.price al momento de solicitar (única fuente de verdad de precios).
CREATE TABLE IF NOT EXISTS plan_requests (
    id           BIGSERIAL PRIMARY KEY,
    business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id      INTEGER,
    plan         VARCHAR(20) NOT NULL,                     -- 'featured' | 'premium'
    amount_gs    INTEGER NOT NULL DEFAULT 0,               -- congelado desde plans.price
    status       VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending | confirmed | cancelled
    tpago_link   TEXT,
    reference_id VARCHAR(60),                              -- RetoPAPlanFeatured / RetoPAPlanPremium
    confirmed_by INTEGER,
    confirmed_at TIMESTAMP WITHOUT TIME ZONE,
    notes        TEXT,
    created_at   TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Idempotencia: un solo pending por negocio.
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_requests_pending
    ON plan_requests (business_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_plan_requests_status
    ON plan_requests (status, created_at);

-- Config del cobro por plan (editable desde el admin). Links vacíos = el CTA cae al
-- flujo de lead actual (upgrade-lead) → se puede activar/desactivar sin deploy.
INSERT INTO site_config (key, value) VALUES
    ('tpago_link_featured', ''),
    ('tpago_link_premium',  ''),
    ('plan_grace_days',     '7'),        -- días de gracia tras el vencimiento antes de revertir a basic
    ('plan_renewal_days',   '7,3,0')     -- días ANTES del vencimiento para recordatorios de renovación
ON CONFLICT (key) DO NOTHING;
