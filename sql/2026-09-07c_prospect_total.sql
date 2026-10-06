-- ═══════════════════════════════════════════════════════════════════════════
-- RetoPA — v_prospectos_claim v3
--
-- Cambio: elegibilidad por visitas TOTALES (nadie se escurre de la cola),
-- prioridad por visitas de 30 días (contactás primero al que está caliente).
-- Ambos números viajan al mensaje: {visitas} = total, {visitas_30d} = mes.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO site_config (key, value) VALUES
  ('prospect_min_visitas_total', '20')
ON CONFLICT (key) DO NOTHING;

DROP VIEW IF EXISTS v_prospectos_claim;

CREATE VIEW v_prospectos_claim AS
SELECT
    b.id                              AS business_id,
    b.name                            AS negocio,
    b.slug,
    b.city                            AS ciudad,
    c.name                            AS rubro,
    b.phone                           AS telefono,
    b.claim_token,
    b.claim_expires_at,
    v.total                           AS visitas_total,
    v.mes                             AS visitas_30d,
    v.primera_visita,
    fn_quality_score(b.*)             AS score,
    (SELECT MAX(p.enviado_at) FROM prospect_outreach p
      WHERE p.business_id = b.id)     AS ultimo_contacto
FROM businesses b
LEFT JOIN categories c ON c.id = b.category_id
JOIN LATERAL (
    SELECT COUNT(*)                                                        AS total,
           COUNT(*) FILTER (WHERE bv.viewed_at >= NOW() - INTERVAL '30 days') AS mes,
           MIN(bv.viewed_at)                                               AS primera_visita
      FROM business_views bv
     WHERE bv.business_id = b.id
) v ON TRUE
WHERE b.is_active
  AND (b.data_status IS NULL OR b.data_status = 'published')

  -- ── SIN DUEÑO ───────────────────────────────────────────────────────
  AND NOT EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.business_id = b.id)
  AND b.claim_status IS NULL
  AND b.claimed_by   IS NULL
  AND COALESCE(NULLIF(TRIM(b.plan_type),''), 'basic') = 'basic'
  AND COALESCE(b.verified, FALSE) = FALSE

  -- ── CONTACTABLE ─────────────────────────────────────────────────────
  AND NULLIF(TRIM(b.phone),'') IS NOT NULL
  AND REGEXP_REPLACE(b.phone,'\D','','g') ~ '^0?9[0-9]{8}$'

  -- ── ELEGIBILIDAD: por TOTAL, sin ventana móvil ──────────────────────
  AND v.total >= COALESCE(
        (SELECT NULLIF(TRIM(value),'')::int FROM site_config
          WHERE key='prospect_min_visitas_total'), 20)

  AND NOT EXISTS (
        SELECT 1 FROM prospect_outreach p
         WHERE p.business_id = b.id
           AND p.estado IN ('enviado','respondio','reclamo','no_interesa')
           AND p.enviado_at > NOW() - (COALESCE(
                 (SELECT NULLIF(TRIM(value),'')::int FROM site_config
                   WHERE key='prospect_cooldown_dias'), 60) || ' days')::interval
  );

-- Índice: la vista cuenta visitas de todas las fichas activas en cada carga.
CREATE INDEX IF NOT EXISTS idx_bv_biz_fecha ON business_views (business_id, viewed_at DESC);

COMMIT;

-- ── Ajustar la plantilla a los dos números ──────────────────────────────
UPDATE site_config SET value =
 'Hola! Te escribo de RetoPA, el directorio de empresas de Paraguay. La ficha de {negocio} lleva {visitas} visitas ({visitas_30d} en el último mes) y todavía no tiene dueño asignado. Podés reclamarla gratis acá para editar tus datos, horarios y fotos: {link}'
WHERE key = 'prospect_msg_claim';

-- VERIFICAR:
--   SELECT COUNT(*) FROM v_prospectos_claim;
--   SELECT negocio, visitas_total, visitas_30d FROM v_prospectos_claim
--    ORDER BY visitas_30d DESC LIMIT 10;
