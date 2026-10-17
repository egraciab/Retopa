-- ════════════════════════════════════════════════════════════════════════════
-- RetoPA — 2026-10-12 — Instrumentación del embudo de reclamo de fichas
--
-- Para medir DÓNDE se cae el dueño (antes de rediseñar el flujo):
--   1) claim_events      — un registro por paso (sin datos personales).
--   2) users.first_seen_at — primer ingreso real a un panel (last_seen_at se pisa).
--   3) v_claim_embudo    — embudo de los últimos 30 días, por origen (wa/notify/…).
--   4) v_duenos_activacion — cuentas de los últimos 90 días: ¿entraron alguna vez?
--
-- Aditivo e idempotente: no modifica ni borra datos existentes. Se puede correr
-- dos veces sin efecto. Correr ANTES de levantar el backend nuevo.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE TABLE IF NOT EXISTS claim_events (
    id          bigserial PRIMARY KEY,
    event       varchar(32) NOT NULL,          -- link_opened, form_started, submit_ok, approved…
    business_id integer REFERENCES businesses(id) ON DELETE SET NULL,
    user_id     integer REFERENCES users(id)      ON DELETE SET NULL, -- cuenta del DUEÑO (no del admin)
    canal       varchar(16),                   -- token | ficha | admin
    source      varchar(24),                   -- utm_source del link (wa, notify, …)
    visit       varchar(32),                   -- id aleatorio por carga de página (deduplica)
    reason      varchar(32),                   -- motivo de error (lista blanca en el código)
    created_at  timestamp without time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claim_events_created ON claim_events (created_at);
CREATE INDEX IF NOT EXISTS idx_claim_events_biz     ON claim_events (business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_claim_events_event   ON claim_events (event, created_at);

COMMENT ON TABLE claim_events IS
  'Embudo de reclamo de fichas. Sin PII (ni IP, ni UA, ni email/teléfono). Ver utils/claimEvents.js';

-- Primer ingreso real (mismo tipo que last_seen_at). No se puede reconstruir hacia
-- atrás: queda NULL para los que ya entraron antes de esta migración.
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_seen_at timestamp without time zone;

-- ── Embudo de los últimos 30 días, por origen ───────────────────────────────
-- El origen de una ficha es el utm_source de su PRIMER link abierto, así los
-- pasos posteriores (enviado, aprobado) quedan atribuidos al canal que la trajo.
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
       count(DISTINCT business_id) FILTER (WHERE event IN ('approved','access_granted')) AS aprobados,
       count(DISTINCT business_id) FILTER (
           WHERE event IN ('submit_ok','approved','access_granted') AND EXISTS (
               SELECT 1 FROM user_businesses ub JOIN users u ON u.id = ub.user_id
                WHERE ub.business_id = x.business_id AND ub.is_owner
                  AND u.last_seen_at >= x.created_at))                                  AS dueno_entro
  FROM x
 GROUP BY ROLLUP (origen)
 ORDER BY (origen IS NULL), fichas_vistas DESC;

-- ── Cuentas de dueños de los últimos 90 días: ¿entraron alguna vez? ─────────
CREATE OR REPLACE VIEW v_duenos_activacion AS
SELECT count(*)                                                        AS total,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_businesses ub
                                       WHERE ub.user_id = u.id))       AS con_ficha,
       count(*) FILTER (WHERE u.last_seen_at IS NOT NULL)              AS entraron_alguna_vez,
       count(*) FILTER (WHERE u.email_verified)                        AS correo_verificado,
       count(*) FILTER (WHERE u.password_hash = '!pending-no-password!') AS alta_sin_activar,
       count(*) FILTER (WHERE u.verify_token_expires < now()
                           OR u.reset_token_expires  < now())          AS link_activacion_vencido
  FROM users u
 WHERE u.created_at > now() - interval '90 days'
   AND u.role NOT IN ('admin', 'godmode');

COMMIT;
