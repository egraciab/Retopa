-- ═══════════════════════════════════════════════════════════════════════════
-- RetoPA — fix v_prospectos_claim
--
-- La propiedad de una ficha vive en user_businesses (is_owner), NO en
-- claim_status/claimed_by: esos solo se llenan si la ficha pasó por el flujo
-- de reclamo. Las fichas creadas con dueño asignado de origen los tienen NULL.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

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
    v.visitas                         AS visitas_30d,
    fn_quality_score(b.*)             AS score,
    (SELECT MAX(p.enviado_at) FROM prospect_outreach p
      WHERE p.business_id = b.id)     AS ultimo_contacto
FROM businesses b
LEFT JOIN categories c ON c.id = b.category_id
JOIN LATERAL (
    SELECT COUNT(*) AS visitas FROM business_views bv
     WHERE bv.business_id = b.id
       AND bv.viewed_at >= NOW() - INTERVAL '30 days'
) v ON TRUE
WHERE b.is_active
  AND (b.data_status IS NULL OR b.data_status = 'published')

  -- ── SIN DUEÑO ───────────────────────────────────────────────────────
  -- 1. el chequeo autoritativo: nadie vinculado a la ficha
  AND NOT EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.business_id = b.id)
  -- 2. tampoco en trámite ni reclamada
  AND b.claim_status IS NULL
  AND b.claimed_by   IS NULL
  -- 3. si paga un plan, tiene dueño aunque no esté vinculado
  AND COALESCE(NULLIF(TRIM(b.plan_type),''), 'basic') = 'basic'
  -- 4. verificada = alguien la trabajó. Comentá esta línea si querés
  --    incluirlas (ver nota al final).
  AND COALESCE(b.verified, FALSE) = FALSE

  -- ── CONTACTABLE POR WHATSAPP ────────────────────────────────────────
  AND NULLIF(TRIM(b.phone),'') IS NOT NULL
  AND REGEXP_REPLACE(b.phone,'\D','','g') ~ '^0?9[0-9]{8}$'
  AND v.visitas >= COALESCE(
        (SELECT NULLIF(TRIM(value),'')::int FROM site_config
          WHERE key='prospect_min_visitas'), 20)
  AND NOT EXISTS (
        SELECT 1 FROM prospect_outreach p
         WHERE p.business_id = b.id
           AND p.estado IN ('enviado','respondio','reclamo','no_interesa')
           AND p.enviado_at > NOW() - (COALESCE(
                 (SELECT NULLIF(TRIM(value),'')::int FROM site_config
                   WHERE key='prospect_cooldown_dias'), 60) || ' days')::interval
  );

COMMIT;

-- ── DIAGNÓSTICO: cuánto descarta cada condición ─────────────────────────
-- Corré esto para decidir si el filtro `verified` te está costando prospectos:
--
-- SELECT
--   COUNT(*)                                                          AS con_trafico,
--   COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_businesses ub
--                                   WHERE ub.business_id=b.id))       AS con_dueno_vinculado,
--   COUNT(*) FILTER (WHERE b.verified)                                AS verificadas,
--   COUNT(*) FILTER (WHERE COALESCE(NULLIF(TRIM(b.plan_type),''),'basic') <> 'basic') AS con_plan,
--   COUNT(*) FILTER (WHERE b.claim_status IS NOT NULL)                AS con_claim
-- FROM businesses b
-- JOIN LATERAL (SELECT COUNT(*) c FROM business_views v
--               WHERE v.business_id=b.id AND v.viewed_at >= NOW()-INTERVAL '30 days') v ON TRUE
-- WHERE b.is_active AND v.c >= 20
--   AND REGEXP_REPLACE(b.phone,'\D','','g') ~ '^0?9[0-9]{8}$';
--
-- Si `verificadas` es alto y no coincide con `con_dueno_vinculado`, quiere
-- decir que `verified` marca calidad de dato y no propiedad: en ese caso
-- comentá la condición 4 y recreá la vista.
