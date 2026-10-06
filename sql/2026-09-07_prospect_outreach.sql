-- ═══════════════════════════════════════════════════════════════════════════
-- RetoPA — Cola de contacto a prospectos (fichas SIN reclamar)
-- Migración: 2026-09-07_prospect_outreach
--
-- Complementa sales_signals, que solo actúa sobre claim_status='approved'.
-- Acá viven las fichas que todavía no tienen dueño pero YA reciben tráfico.
-- Objetivo del contacto: que reclamen la ficha (gratis). El claim enciende
-- sales_signals y de ahí en adelante el motor existente hace el resto.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS prospect_outreach (
    id             BIGSERIAL PRIMARY KEY,
    business_id    INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    canal          VARCHAR(20)  NOT NULL DEFAULT 'whatsapp',
    telefono       VARCHAR(30)  NOT NULL,
    visitas_30d    INTEGER      NOT NULL DEFAULT 0,
    mensaje        TEXT,
    estado         VARCHAR(20)  NOT NULL DEFAULT 'enviado',
        -- enviado | respondio | reclamo | no_interesa | invalido
    enviado_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    enviado_por    VARCHAR(80),
    cerrado_at     TIMESTAMPTZ,
    notas          TEXT,
    CONSTRAINT chk_prospect_estado CHECK (estado IN
        ('enviado','respondio','reclamo','no_interesa','invalido'))
);

CREATE INDEX IF NOT EXISTS idx_prospect_biz    ON prospect_outreach (business_id);
CREATE INDEX IF NOT EXISTS idx_prospect_estado ON prospect_outreach (estado, enviado_at DESC);

-- Config editable desde el admin (mismo patrón que signal_*)
INSERT INTO site_config (key, value) VALUES
  ('prospect_min_visitas',  '20'),   -- piso para entrar a la cola
  ('prospect_cooldown_dias','60'),   -- no recontactar antes de N días
  ('prospect_msg_claim',
   'Hola! Te escribo de RetoPA, el directorio de empresas de Paraguay. La ficha de {negocio} tuvo {visitas} visitas este mes y todavía no tiene dueño asignado. Podés reclamarla gratis acá para editar tus datos, horarios y fotos: {link}')
ON CONFLICT (key) DO NOTHING;


-- ── Cola de prospectos ──────────────────────────────────────────────────
-- Sin reclamar + teléfono válido + visitas reales + fuera de cooldown.
CREATE OR REPLACE VIEW v_prospectos_claim AS
SELECT
    b.id                              AS business_id,
    b.name                            AS negocio,
    b.slug,
    b.city                            AS ciudad,
    c.name                            AS rubro,
    b.phone                           AS telefono,
    b.phone_raw,
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
  AND b.claim_status IS DISTINCT FROM 'approved'
  AND NULLIF(TRIM(b.phone),'') IS NOT NULL
  -- solo móviles: WhatsApp no sirve en un fijo
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


-- ── Embudo: mide conversión real, no intuición ──────────────────────────
CREATE OR REPLACE VIEW v_prospectos_embudo AS
SELECT
    COUNT(*)                                        AS contactados,
    COUNT(*) FILTER (WHERE estado='respondio')      AS respondieron,
    COUNT(*) FILTER (WHERE estado='reclamo')        AS reclamaron,
    COUNT(*) FILTER (WHERE estado='no_interesa')    AS no_interesa,
    COUNT(*) FILTER (WHERE estado='invalido')       AS numero_malo,
    ROUND(COUNT(*) FILTER (WHERE estado='reclamo')::numeric
          / NULLIF(COUNT(*),0) * 100, 1)            AS tasa_claim_pct,
    COUNT(*) FILTER (WHERE enviado_at > NOW() - INTERVAL '7 days') AS enviados_7d
FROM prospect_outreach;

COMMIT;

-- VERIFICAR:
--   SELECT COUNT(*) FROM v_prospectos_claim;
--   SELECT * FROM v_prospectos_embudo;
