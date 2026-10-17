-- ═══════════════════════════════════════════════════════════════════════════
-- RetoPA — Reclamo desde la FICHA pública con la misma pantalla que /reclamar
-- (2026-10-14). ADITIVA e idempotente.
--
-- claim_requests: pedidos de reclamo que llegan desde la ficha.
--   kind = 'whatsapp'  → la persona dice que el WhatsApp de la ficha es suyo: le
--                        abrimos el WhatsApp de RetoPA con un CÓDIGO. Que nos escriba
--                        DESDE ese número es la prueba (y para Meta es gratis: lo
--                        inicia el dueño). El admin le manda el link de reclamo.
--   kind = 'revision'  → otro número (o la ficha no tiene celular): queda para
--                        revisar; si el admin lo da por bueno, le manda el link.
-- Dry-run: sed 's/^COMMIT;/ROLLBACK;/' este_archivo.sql | psql …
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE TABLE IF NOT EXISTS claim_requests (
    id           bigserial PRIMARY KEY,
    business_id  integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    kind         varchar(12) NOT NULL CHECK (kind IN ('whatsapp','revision')),
    phone        varchar(20) NOT NULL,          -- 5959XXXXXXXX: de dónde tiene que escribir / a dónde mandar el link
    code         varchar(12),                   -- 'RP-1234' (kind whatsapp)
    name         varchar(100),
    email        varchar(160),
    message      text,
    status       varchar(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','dismissed')),
    ip           varchar(64),
    created_at   timestamp without time zone NOT NULL DEFAULT NOW(),
    handled_at   timestamp without time zone,
    handled_by   integer
);
CREATE INDEX IF NOT EXISTS idx_claim_requests_pending ON claim_requests (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_claim_requests_biz ON claim_requests (business_id);

COMMIT;
