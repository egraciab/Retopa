-- ════════════════════════════════════════════════════════════════════════════
-- RetoPA — 2026-10-26 — Prospectos: reclamos reales, índices de respuesta y
--                       marca automática de "reclamo"
--
-- Contexto (docs/informe_tandas_wa_2026-10-26.md): las 103 filas de
-- prospect_wa_outreach y las 62 de prospect_outreach seguían en 'enviado',
-- aunque 18 fichas de la Tanda 1 (y 1 de la Tanda 0) ya tenían dueño. El panel
-- y v_prospectos_embudo daban 0 % de reclamo.
--
--   1) fn_wa_key(): clave del número = phoneToWa() (utils/phone.js) y la que usa
--      el panel (prospects.routes.js). Solo dígitos, con 595.
--   2) Backfill: los números/fichas CONTACTADOS cuya ficha hoy tiene dueño
--      pasan a 'reclamo', con nota de trazabilidad. No toca fecha_contacto.
--   3) Trigger en user_businesses: cuando una ficha contactada recibe dueño
--      (por cualquiera de los caminos: token, botón de ficha, admin, alta…),
--      su contacto pasa a 'reclamo'. Nunca bloquea la asignación del dueño.
--   4) v_prospectos_embudo: mismas columnas que antes (digest diario y
--      Admin → resumen), ahora sobre los DOS canales; + respuesta total y tasa.
--   5) v_prospectos_tandas: embudo real por tanda (contactadas → respondieron →
--      reclamaron → aprobados → entraron al portal → completaron → compraron).
--
-- "Respondió" = marcado respondio / rechazo / no_es / no_interesa, o reclamó
-- (reclamar es una respuesta). Idempotente: se puede correr dos veces.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1) Clave del número ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_wa_key(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN d = '' THEN NULL
        WHEN d LIKE '595%' AND length(d) BETWEEN 11 AND 13 THEN d
        WHEN d LIKE '0%'   AND length(d) BETWEEN 9  AND 11 THEN '595' || substr(d, 2)
        WHEN length(d) BETWEEN 7 AND 10 THEN '595' || d
        ELSE d END
      FROM (SELECT regexp_replace(COALESCE(raw, ''), '\D', '', 'g') AS d) x
$$;
COMMENT ON FUNCTION fn_wa_key(text) IS
  'Clave de WhatsApp = phoneToWa() de utils/phone.js. Si cambia una, cambiar la otra.';

-- ── 2) Backfill de reclamos reales ──────────────────────────────────────────
-- 2a) Panel WA (Tanda 1/2): por número. La fecha del reclamo es la del dueño.
WITH dueno AS (
    SELECT DISTINCT ON (fn_wa_key(b.whatsapp))
           fn_wa_key(b.whatsapp)                         AS k,
           COALESCE(NULLIF(b.trade_name, ''), b.name)    AS ficha,
           COALESCE(b.claimed_at, ub.created_at)         AS fecha
      FROM businesses b
      JOIN user_businesses ub ON ub.business_id = b.id AND ub.is_owner
     WHERE fn_wa_key(b.whatsapp) IS NOT NULL
     ORDER BY fn_wa_key(b.whatsapp), COALESCE(b.claimed_at, ub.created_at)
)
UPDATE prospect_wa_outreach po
   SET estado     = 'reclamo',
       notas      = TRIM(BOTH ' ' FROM COALESCE(po.notas, '') || ' [Reclamó: ' || d.ficha
                    || ' · ' || to_char(d.fecha, 'YYYY-MM-DD') || ' · marcado 2026-10-26]'),
       updated_at = NOW()
  FROM dueno d
 WHERE po.whatsapp = d.k
   AND po.estado IN ('enviado', 'respondio');

-- 2b) Tabla vieja (Tanda 0): por ficha, solo si el dueño llegó DESPUÉS del envío.
UPDATE prospect_outreach p
   SET estado     = 'reclamo',
       cerrado_at = COALESCE(p.cerrado_at, x.fecha::timestamptz),
       notas      = TRIM(BOTH ' ' FROM COALESCE(p.notas, '') || ' [Reclamó '
                    || to_char(x.fecha, 'YYYY-MM-DD') || ' · marcado 2026-10-26]')
  FROM (SELECT b.id, MIN(COALESCE(b.claimed_at, ub.created_at)) AS fecha
          FROM businesses b
          JOIN user_businesses ub ON ub.business_id = b.id AND ub.is_owner
         GROUP BY b.id) x
 WHERE p.business_id = x.id
   AND p.estado IN ('enviado', 'respondio')
   AND x.fecha >= p.enviado_at;

-- ── 3) Marca automática a futuro ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_prospect_marca_reclamo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE k text; f text;
BEGIN
    IF NEW.is_owner IS NOT TRUE OR NEW.business_id IS NULL THEN RETURN NEW; END IF;
    BEGIN
        SELECT fn_wa_key(b.whatsapp), COALESCE(NULLIF(b.trade_name, ''), b.name)
          INTO k, f FROM businesses b WHERE b.id = NEW.business_id;
        IF k IS NOT NULL THEN
            UPDATE prospect_wa_outreach
               SET estado = 'reclamo', updated_at = NOW(),
                   notas  = TRIM(BOTH ' ' FROM COALESCE(notas, '') || ' [Reclamó: ' || f
                            || ' · ' || to_char(NOW(), 'YYYY-MM-DD') || ']')
             WHERE whatsapp = k AND estado IN ('enviado', 'respondio');
        END IF;
        UPDATE prospect_outreach
           SET estado = 'reclamo', cerrado_at = COALESCE(cerrado_at, NOW())
         WHERE business_id = NEW.business_id AND estado IN ('enviado', 'respondio');
    EXCEPTION WHEN OTHERS THEN
        -- Prospectos es secundario: jamás impedir que la ficha tenga dueño.
        RAISE WARNING 'fn_prospect_marca_reclamo(%): %', NEW.business_id, SQLERRM;
    END;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prospect_marca_reclamo ON user_businesses;
CREATE TRIGGER trg_prospect_marca_reclamo
    AFTER INSERT OR UPDATE OF is_owner ON user_businesses
    FOR EACH ROW EXECUTE FUNCTION fn_prospect_marca_reclamo();

-- ── 4) Embudo general (digest y Admin → resumen): ambos canales ─────────────
-- Unidad = un contacto (una fila de seguimiento). Columnas originales en el
-- mismo orden; las nuevas van al final.
CREATE OR REPLACE VIEW v_prospectos_embudo AS
WITH c AS (
    SELECT estado, enviado_at AS enviado FROM prospect_outreach
    UNION ALL
    SELECT CASE estado WHEN 'rechazo' THEN 'no_interesa' WHEN 'no_es' THEN 'invalido' ELSE estado END,
           COALESCE(fecha_contacto, created_at)
      FROM prospect_wa_outreach WHERE estado <> 'pendiente'
)
SELECT
    count(*)                                                    AS contactados,
    count(*) FILTER (WHERE estado = 'respondio')                AS respondieron,
    count(*) FILTER (WHERE estado = 'reclamo')                  AS reclamaron,
    count(*) FILTER (WHERE estado = 'no_interesa')              AS no_interesa,
    count(*) FILTER (WHERE estado = 'invalido')                 AS numero_malo,
    round(count(*) FILTER (WHERE estado = 'reclamo')::numeric
          / NULLIF(count(*) FILTER (WHERE estado <> 'invalido'), 0) * 100, 1) AS tasa_claim_pct,
    count(*) FILTER (WHERE enviado > now() - interval '7 days' AND estado <> 'invalido') AS enviados_7d,
    count(*) FILTER (WHERE estado <> 'enviado')                 AS respuestas_total,
    round(count(*) FILTER (WHERE estado <> 'enviado')::numeric
          / NULLIF(count(*), 0) * 100, 1)                       AS tasa_respuesta_pct
FROM c;

-- ── 5) Embudo real por tanda (fichas) ───────────────────────────────────────
CREATE OR REPLACE VIEW v_prospectos_tandas AS
WITH f AS (
    -- T1/T2…: fichas del panel, por origen. Contactada = su número está marcado.
    SELECT b.source AS tanda, b.id, po.estado,
           (po.estado IS NOT NULL AND po.estado <> 'pendiente') AS contactada
      FROM businesses b
      LEFT JOIN prospect_wa_outreach po ON po.whatsapp = fn_wa_key(b.whatsapp)
     WHERE b.is_active AND b.source LIKE 'prospeccion%'
    UNION ALL
    -- T0: tabla vieja, por ficha.
    SELECT 'T0 (prospect_outreach)', p.business_id, p.estado, TRUE
      FROM prospect_outreach p
), x AS (
    SELECT f.*,
           ow.user_id IS NOT NULL                                        AS reclamo,
           (ow.user_id IS NOT NULL OR b.claim_status = 'approved')
             AND COALESCE(b.claim_status, 'approved') = 'approved'       AS aprobado,
           u.last_seen_at IS NOT NULL                                    AS entro,
           (fn_profile_completion(b.*)->>'completion')::int >= 60        AS completo,
           EXISTS (SELECT 1 FROM plan_requests r WHERE r.business_id = b.id
                     AND r.status = 'confirmed')
           OR EXISTS (SELECT 1 FROM promotion_boosts pb WHERE pb.business_id = b.id
                     AND pb.status = 'paid')                             AS compro
      FROM f
      JOIN businesses b ON b.id = f.id
      LEFT JOIN LATERAL (SELECT ub.user_id FROM user_businesses ub
                          WHERE ub.business_id = b.id AND ub.is_owner
                          ORDER BY ub.created_at LIMIT 1) ow ON TRUE
      LEFT JOIN users u ON u.id = ow.user_id
)
SELECT tanda,
       count(*)                                                    AS fichas,
       count(*) FILTER (WHERE contactada)                          AS contactadas,
       count(*) FILTER (WHERE contactada AND (estado IN ('respondio','reclamo','rechazo','no_es','no_interesa') OR reclamo)) AS respondieron,
       count(*) FILTER (WHERE contactada AND reclamo)              AS reclamaron,
       count(*) FILTER (WHERE contactada AND reclamo AND aprobado) AS aprobados,
       count(*) FILTER (WHERE contactada AND reclamo AND entro)    AS entraron_portal,
       count(*) FILTER (WHERE contactada AND reclamo AND completo) AS completaron,
       count(*) FILTER (WHERE contactada AND reclamo AND compro)   AS compraron,
       round(count(*) FILTER (WHERE contactada AND (estado IN ('respondio','reclamo','rechazo','no_es','no_interesa') OR reclamo))::numeric
             / NULLIF(count(*) FILTER (WHERE contactada), 0) * 100, 1) AS tasa_respuesta_pct,
       round(count(*) FILTER (WHERE contactada AND reclamo)::numeric
             / NULLIF(count(*) FILTER (WHERE contactada), 0) * 100, 1) AS tasa_reclamo_pct,
       round(count(*) FILTER (WHERE contactada AND reclamo AND entro)::numeric
             / NULLIF(count(*) FILTER (WHERE contactada AND reclamo), 0) * 100, 1) AS tasa_activacion_pct
  FROM x
 GROUP BY tanda
 ORDER BY tanda;

COMMENT ON VIEW v_prospectos_tandas IS
  'Embudo real por tanda. Reclamo = la ficha tiene dueño (user_businesses), no el estado manual. Entró al portal = last_seen_at (puede subestimar).';

COMMIT;

-- VERIFICAR:
--   SELECT estado, count(*) FROM prospect_wa_outreach GROUP BY 1;   -- 18 reclamo
--   SELECT estado, count(*) FROM prospect_outreach GROUP BY 1;      -- 1 reclamo
--   SELECT * FROM v_prospectos_embudo;
--   SELECT * FROM v_prospectos_tandas;
