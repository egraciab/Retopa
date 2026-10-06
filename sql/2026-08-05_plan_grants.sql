-- D6 — "Destacado Fundador": otorgamientos de plan con vencimiento.
-- Un grant activo = reverted_at IS NULL AND expires_at > NOW().
-- Al vencer, el job diario revierte businesses.plan_type a prev_plan_type y avisa por email.
CREATE TABLE IF NOT EXISTS plan_grants (
    id             BIGSERIAL PRIMARY KEY,
    business_id    INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    plan_type      VARCHAR(20) NOT NULL DEFAULT 'featured',   -- plan otorgado
    prev_plan_type VARCHAR(20),                                -- a qué plan volver al vencer
    reason         VARCHAR(40) NOT NULL DEFAULT 'founder',     -- tipo de grant (founder, etc.)
    granted_by     INTEGER,                                    -- admin que lo otorgó
    granted_at     TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at     TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    reverted_at    TIMESTAMP WITHOUT TIME ZONE,                -- cuándo se revirtió (job o admin)
    reverted_by    INTEGER,                                    -- admin que lo quitó a mano (NULL si fue el job)
    email_sent_at  TIMESTAMP WITHOUT TIME ZONE                 -- cuándo se envió el email de vencimiento
);

-- Un solo grant activo por negocio (índice parcial): evita duplicados de founder activo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_grants_active
    ON plan_grants (business_id) WHERE reverted_at IS NULL;

-- El job diario busca por vencimiento entre los activos.
CREATE INDEX IF NOT EXISTS idx_plan_grants_expiry
    ON plan_grants (expires_at) WHERE reverted_at IS NULL;
