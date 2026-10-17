-- ════════════════════════════════════════════════════════════════════════════
-- RetoPA — 2026-10-13 — E1: reclamo en una pantalla, sin contraseña
--
--  · businesses.claim_method / claim_reviewed_at — reclamo automático por token
--    (provisorio hasta que el admin lo confirma o lo revierte).
--  · claim_snapshots — la ficha COMPLETA antes del reclamo (+ sus rubros): es el
--    "valor anterior", lo único irrecuperable después del UPDATE. Lo usa Revertir.
--  · owner_change_requests — cambios sensibles del dueño (nombre, teléfono,
--    WhatsApp, correo) mientras el reclamo no esté revisado: van a revisión con
--    su valor anterior en vez de aplicarse.
--  · users: email opcional (identidad = WhatsApp y/o correo), phone_verified_at,
--    link de acceso de un solo uso (se guarda solo el hash).
--  · prospect_wa_outreach: nuevo estado 'no_es' ("No es suyo").
--  · v_claim_embudo: cuenta también los aprobados automáticos.
--
-- Aditivo e idempotente. Correr ANTES de levantar el backend nuevo.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS claim_method      varchar(16);  -- token | ficha | admin
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS claim_reviewed_at timestamp without time zone;
CREATE INDEX IF NOT EXISTS idx_businesses_claim_review
    ON businesses (claim_status, claim_method) WHERE claim_reviewed_at IS NULL AND claim_method = 'token';

CREATE TABLE IF NOT EXISTS claim_snapshots (
    id           bigserial PRIMARY KEY,
    business_id  integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id      integer REFERENCES users(id) ON DELETE SET NULL,   -- quién reclamó
    snapshot     jsonb   NOT NULL,                                  -- to_jsonb(businesses) previo
    categories   jsonb   NOT NULL DEFAULT '[]'::jsonb,              -- filas previas de business_categories
    created_at   timestamp without time zone NOT NULL DEFAULT now(),
    reverted_at  timestamp without time zone,
    reverted_by  integer
);
CREATE INDEX IF NOT EXISTS idx_claim_snapshots_biz ON claim_snapshots (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS owner_change_requests (
    id           bigserial PRIMARY KEY,
    business_id  integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id      integer REFERENCES users(id) ON DELETE SET NULL,
    field        varchar(32) NOT NULL,          -- name | trade_name | phone | whatsapp | email
    old_value    text,
    new_value    text,
    status       varchar(16) NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
    created_at   timestamp without time zone NOT NULL DEFAULT now(),
    decided_at   timestamp without time zone,
    decided_by   integer,
    CONSTRAINT chk_ocr_status CHECK (status IN ('pending','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_ocr_pending ON owner_change_requests (business_id) WHERE status = 'pending';

-- Identidad: WhatsApp y/o correo. El correo deja de ser obligatorio (UNIQUE admite
-- varios NULL). El login por contraseña sigue siendo por correo.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at    timestamp without time zone;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_token_hash    varchar(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_token_expires timestamp without time zone;
CREATE INDEX IF NOT EXISTS idx_users_access_token ON users (access_token_hash) WHERE access_token_hash IS NOT NULL;

-- Prospectos: "No es suyo" (respondió desde el link que la ficha no es de él).
ALTER TABLE prospect_wa_outreach DROP CONSTRAINT IF EXISTS chk_prospect_wa_estado;
ALTER TABLE prospect_wa_outreach ADD CONSTRAINT chk_prospect_wa_estado
    CHECK (estado IN ('pendiente','enviado','respondio','reclamo','rechazo','no_es'));

-- Embudo: los aprobados automáticos cuentan como aprobados.
CREATE OR REPLACE VIEW v_claim_embudo AS
WITH e AS (
    SELECT * FROM claim_events WHERE created_at > now() - interval '30 days'
), origen AS (
    SELECT DISTINCT ON (business_id) business_id, source
      FROM claim_events
     WHERE event = 'link_opened' AND business_id IS NOT NULL AND source IS NOT NULL
     ORDER BY business_id, created_at
), x AS (
    SELECT e.*,
           COALESCE(o.source, e.source,
                    CASE WHEN e.canal = 'ficha' THEN 'boton_ficha' ELSE '(sin origen)' END) AS origen
      FROM e LEFT JOIN origen o ON o.business_id = e.business_id
)
SELECT COALESCE(origen, 'TOTAL')                                                       AS origen,
       count(DISTINCT visit)       FILTER (WHERE event = 'link_opened')                AS visitas,
       count(DISTINCT business_id) FILTER (WHERE event = 'link_opened')                AS fichas_vistas,
       count(*)                    FILTER (WHERE event IN ('link_invalid','link_expired')) AS links_muertos,
       count(DISTINCT business_id) FILTER (WHERE event = 'form_started')               AS iniciaron_form,
       count(DISTINCT business_id) FILTER (WHERE event = 'form_error')                 AS frenados_validacion,
       count(DISTINCT business_id) FILTER (WHERE event = 'submit_ok')                  AS enviaron,
       count(DISTINCT business_id) FILTER (WHERE event IN ('approved','access_granted','auto_approved')) AS aprobados,
       count(DISTINCT business_id) FILTER (
           WHERE event IN ('submit_ok','approved','access_granted','auto_approved') AND EXISTS (
               SELECT 1 FROM user_businesses ub JOIN users u ON u.id = ub.user_id
                WHERE ub.business_id = x.business_id AND ub.is_owner
                  AND u.last_seen_at >= x.created_at))                                  AS dueno_entro
  FROM x
 GROUP BY ROLLUP (origen)
 ORDER BY (origen IS NULL), fichas_vistas DESC;

COMMIT;
