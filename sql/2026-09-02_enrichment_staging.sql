-- ═══════════════════════════════════════════════════════════════════════════
-- RetoPA — Staging de enriquecimiento de fichas
-- Migración: 2026-09-02_enrichment_staging
--
-- Alimenta el embudo AGUAS ARRIBA del motor de señales (D9.x):
--   enriquecer → cruza fn_quality_score ≥ seo_min_quality_score → indexa
--   → visitas → el dueño reclama → claim_status='approved'
--   → sales_signals toma el control (T1/T2/T6)
--
-- El agente propone acá. Nada toca businesses sin auto-aprobación estricta
-- o revisión de Steve.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ---------------------------------------------------------------------
-- 0. HELPERS — leen la config real, nada hardcodeado
-- ---------------------------------------------------------------------

-- Umbral de indexación vigente (site_config.seo_min_quality_score, default 15)
CREATE OR REPLACE FUNCTION fn_seo_min_score()
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT NULLIF(TRIM(value),'')::int FROM site_config
      WHERE key = 'seo_min_quality_score'), 15);
$$;

-- Puntos que aporta cada campo en fn_quality_score.
-- ESPEJO EXACTO de sql/2026-06-10_fn_quality_score.sql — si ese cambia,
-- este cambia. Es la única duplicación de lógica en todo el sistema.
CREATE OR REPLACE FUNCTION fn_puntos_campo(p_campo text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_campo
    WHEN 'verified'    THEN 35
    WHEN 'email'       THEN 15
    WHEN 'phone'       THEN 15
    WHEN 'website'     THEN 10
    WHEN 'description' THEN 10
    WHEN 'image_url'   THEN  5
    WHEN 'geo'         THEN  5   -- lat + lng juntos; por separado no suman
    WHEN 'hours_json'  THEN  5
    ELSE 0
  END;
$$;


-- ---------------------------------------------------------------------
-- 1. FUENTES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrichment_sources (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(50)  NOT NULL UNIQUE,
    peso            NUMERIC(3,2) NOT NULL DEFAULT 0.50,
    activa          BOOLEAN      NOT NULL DEFAULT TRUE,
    notas           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO enrichment_sources (nombre, peso, notas) VALUES
    ('dncp',       0.90, 'Oficial. Contacto declarado por la empresa.'),
    ('mic',        0.85, 'Registro oficial MIC.'),
    ('facebook',   0.60, 'Alta cobertura PYME PY. Validar coincidencia de nombre.'),
    ('buscoinfo',  0.50, 'Competidor. Puede estar desactualizado.'),
    ('duckduckgo', 0.35, 'Búsqueda abierta. Riesgo de falso positivo.'),
    ('manual',     1.00, 'Cargado o corregido por Steve.')
ON CONFLICT (nombre) DO NOTHING;


-- ---------------------------------------------------------------------
-- 2. CORRIDAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrichment_runs (
    id                  SERIAL PRIMARY KEY,
    iniciada_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalizada_at       TIMESTAMPTZ,
    filtro_categoria    VARCHAR(120),
    filtro_ciudad       VARCHAR(120),
    fichas_evaluadas    INTEGER NOT NULL DEFAULT 0,
    candidatos_creados  INTEGER NOT NULL DEFAULT 0,
    auto_aprobados      INTEGER NOT NULL DEFAULT 0,
    cuota_maxima        INTEGER NOT NULL DEFAULT 200,
    motivo_fin          VARCHAR(30),   -- completo | cuota | circuit_breaker | error
    error_detalle       TEXT,
    scraper_version     VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_enr_runs_fecha ON enrichment_runs (iniciada_at DESC);


-- ---------------------------------------------------------------------
-- 3. CANDIDATOS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrichment_candidates (
    id                  BIGSERIAL PRIMARY KEY,
    run_id              INTEGER NOT NULL REFERENCES enrichment_runs(id) ON DELETE CASCADE,
    business_id         INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    campo               VARCHAR(20) NOT NULL,   -- phone|email|website|description|image_url|geo|hours_json
    valor_actual        TEXT,                   -- snapshot previo = valor de rollback
    valor_propuesto     TEXT NOT NULL,
    valor_normalizado   TEXT NOT NULL,          -- +595XXXXXXXXX, https://..., 'lat,lng'

    fuente              VARCHAR(50) NOT NULL REFERENCES enrichment_sources(nombre),
    fuente_url          TEXT,
    confianza           NUMERIC(3,2) NOT NULL,
    corroboraciones     SMALLINT NOT NULL DEFAULT 1,

    estado              VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    revisado_por        VARCHAR(80),
    revisado_at         TIMESTAMPTZ,
    motivo_rechazo      VARCHAR(60),
    aplicado_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_enr_estado CHECK (estado IN
        ('pendiente','aprobado','rechazado','aplicado','descartado')),
    CONSTRAINT chk_enr_campo CHECK (campo IN
        ('phone','email','website','description','image_url','geo','hours_json')),
    CONSTRAINT chk_enr_confianza CHECK (confianza >= 0 AND confianza <= 1)
);

-- Un rechazo tuyo es permanente: el agente no vuelve a proponer ese valor.
CREATE UNIQUE INDEX IF NOT EXISTS uq_enr_candidato
    ON enrichment_candidates (business_id, campo, valor_normalizado);

CREATE INDEX IF NOT EXISTS idx_enr_estado   ON enrichment_candidates (estado);
CREATE INDEX IF NOT EXISTS idx_enr_business ON enrichment_candidates (business_id);
CREATE INDEX IF NOT EXISTS idx_enr_run      ON enrichment_candidates (run_id);


-- ---------------------------------------------------------------------
-- 4. VISTA — COLA OBJETIVO: qué fichas atacar
--    Sub-umbral, sin teléfono, no reclamadas. Este es el pozo real.
--    El scraper lee de acá, con ORDER BY y LIMIT según el foco del día.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_objetivo_enriquecimiento AS
SELECT
    b.id                       AS business_id,
    b.name                     AS negocio,
    b.city                     AS ciudad,
    c.name                     AS rubro,
    c.slug                     AS rubro_slug,
    b.ruc,
    fn_quality_score(b.*)      AS score_actual,
    fn_seo_min_score()         AS umbral,
    (b.phone       IS NULL OR TRIM(b.phone) = '')       AS falta_phone,
    (b.email       IS NULL OR TRIM(b.email) = '')       AS falta_email,
    (b.website     IS NULL OR TRIM(b.website) = '')     AS falta_website,
    (b.description IS NULL OR TRIM(b.description) = '') AS falta_description,
    (b.lat IS NULL OR b.lng IS NULL)                    AS falta_geo
FROM businesses b
LEFT JOIN categories c ON c.id = b.category_id
WHERE b.is_active = TRUE
  AND (b.data_status IS NULL OR b.data_status = 'published')
  AND b.claim_status IS DISTINCT FROM 'approved'   -- las reclamadas ya las cubre sales_signals
  AND fn_quality_score(b.*) < fn_seo_min_score()
  -- no re-trabajar lo que ya está en cola o fue rechazado
  AND NOT EXISTS (
        SELECT 1 FROM enrichment_candidates ec
        WHERE ec.business_id = b.id
          AND ec.estado IN ('pendiente','aprobado','aplicado')
  );


-- ---------------------------------------------------------------------
-- 5. VISTA — COLA DE REVISIÓN DIARIA (tus 5 minutos)
--    cruza_umbral se CALCULA acá, en vivo. El scraper no lo estima.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_revision_diaria AS
SELECT
    e.id,
    e.business_id,
    b.name                                          AS negocio,
    b.city                                          AS ciudad,
    e.campo,
    e.valor_actual,
    e.valor_propuesto,
    e.fuente,
    e.fuente_url,
    e.confianza,
    e.corroboraciones,
    fn_quality_score(b.*)                           AS score_actual,
    fn_puntos_campo(e.campo)                        AS puntos,
    (fn_quality_score(b.*) < fn_seo_min_score()
     AND fn_quality_score(b.*) + fn_puntos_campo(e.campo) >= fn_seo_min_score())
                                                    AS cruza_umbral,
    e.created_at
FROM enrichment_candidates e
JOIN businesses b ON b.id = e.business_id
WHERE e.estado = 'pendiente'
ORDER BY
    (fn_quality_score(b.*) < fn_seo_min_score()
     AND fn_quality_score(b.*) + fn_puntos_campo(e.campo) >= fn_seo_min_score()) DESC,
    e.corroboraciones DESC,
    e.confianza DESC;


-- ---------------------------------------------------------------------
-- 6. VISTA — AUTO-APROBABLES
--    Dos fuentes independientes + peso alto + campo vacío. Sin excepciones.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_auto_aprobables AS
SELECT e.*
FROM enrichment_candidates e
JOIN enrichment_sources s ON s.nombre = e.fuente
WHERE e.estado = 'pendiente'
  AND s.activa = TRUE
  AND e.corroboraciones >= 2
  AND (e.confianza * s.peso) >= 0.75
  AND e.valor_actual IS NULL;   -- pisar un dato existente SIEMPRE se revisa a mano


-- ---------------------------------------------------------------------
-- 7. VISTA — MUESTREO DE AUDITORÍA (5 al azar de lo auto-aplicado hoy)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_muestreo_auditoria AS
SELECT e.id, e.business_id, b.name AS negocio, b.city AS ciudad,
       e.campo, e.valor_propuesto, e.fuente, e.fuente_url,
       e.confianza, e.aplicado_at
FROM enrichment_candidates e
JOIN businesses b ON b.id = e.business_id
WHERE e.estado = 'aplicado'
  AND e.revisado_por IS NULL
  AND e.aplicado_at > NOW() - INTERVAL '24 hours'
ORDER BY RANDOM()
LIMIT 5;


-- ---------------------------------------------------------------------
-- 8. VISTA — SALUD DE FUENTES
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_salud_fuentes AS
SELECT
    s.nombre, s.peso, s.activa,
    COUNT(e.id) FILTER (WHERE e.created_at > NOW() - INTERVAL '7 days') AS propuestos_7d,
    COUNT(e.id) FILTER (WHERE e.estado = 'rechazado'
                          AND e.revisado_at > NOW() - INTERVAL '7 days') AS rechazados_7d,
    ROUND(
      COUNT(e.id) FILTER (WHERE e.estado='rechazado'
                            AND e.revisado_at > NOW() - INTERVAL '7 days')::numeric
      / NULLIF(COUNT(e.id) FILTER (WHERE e.estado IN ('rechazado','aprobado','aplicado')
                            AND e.revisado_at > NOW() - INTERVAL '7 days'), 0) * 100
    , 1) AS tasa_rechazo_pct
FROM enrichment_sources s
LEFT JOIN enrichment_candidates e ON e.fuente = s.nombre
GROUP BY s.nombre, s.peso, s.activa
ORDER BY tasa_rechazo_pct DESC NULLS LAST;


-- ---------------------------------------------------------------------
-- 9. CIRCUIT BREAKER — llamar al inicio de cada corrida
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_enrichment_circuit_breaker(umbral_pct numeric DEFAULT 35.0)
RETURNS TABLE (fuente_cortada varchar, tasa numeric)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    UPDATE enrichment_sources s
    SET activa = FALSE,
        notas  = COALESCE(s.notas,'') || ' [auto-desactivada ' || CURRENT_DATE || ']',
        updated_at = NOW()
    FROM v_salud_fuentes v
    WHERE v.nombre = s.nombre
      AND s.activa = TRUE
      AND v.propuestos_7d >= 20
      AND v.tasa_rechazo_pct > umbral_pct
    RETURNING s.nombre, v.tasa_rechazo_pct;
END;
$$;


-- ---------------------------------------------------------------------
-- 10. APLICAR — mueve lo aprobado a businesses (un campo por vez)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_aplicar_candidato(p_id bigint, p_revisor text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
    c enrichment_candidates%ROWTYPE;
BEGIN
    SELECT * INTO c FROM enrichment_candidates WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR c.estado NOT IN ('pendiente','aprobado') THEN
        RETURN FALSE;
    END IF;

    CASE c.campo
        WHEN 'phone'       THEN UPDATE businesses SET phone       = c.valor_normalizado WHERE id = c.business_id;
        WHEN 'email'       THEN UPDATE businesses SET email       = c.valor_normalizado WHERE id = c.business_id;
        WHEN 'website'     THEN UPDATE businesses SET website     = c.valor_normalizado WHERE id = c.business_id;
        WHEN 'description' THEN UPDATE businesses SET description = c.valor_propuesto   WHERE id = c.business_id;
        WHEN 'image_url'   THEN UPDATE businesses SET image_url   = c.valor_normalizado WHERE id = c.business_id;
        WHEN 'geo'         THEN UPDATE businesses
                                 SET lat = SPLIT_PART(c.valor_normalizado, ',', 1)::numeric,
                                     lng = SPLIT_PART(c.valor_normalizado, ',', 2)::numeric
                                 WHERE id = c.business_id;
        WHEN 'hours_json'  THEN UPDATE businesses SET hours_json  = c.valor_normalizado::jsonb WHERE id = c.business_id;
        ELSE RETURN FALSE;
    END CASE;

    UPDATE enrichment_candidates
    SET estado = 'aplicado',
        aplicado_at = NOW(),
        revisado_por = p_revisor,
        revisado_at = CASE WHEN p_revisor IS NOT NULL THEN NOW() ELSE revisado_at END
    WHERE id = p_id;

    RETURN TRUE;
END;
$$;


-- ---------------------------------------------------------------------
-- 11. ROLLBACK DE UNA CORRIDA — el seguro de vida
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_revertir_corrida(p_run_id integer)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
    v_total integer := 0;
    r enrichment_candidates%ROWTYPE;
BEGIN
    FOR r IN SELECT * FROM enrichment_candidates
             WHERE run_id = p_run_id AND estado = 'aplicado'
    LOOP
        CASE r.campo
            WHEN 'phone'       THEN UPDATE businesses SET phone       = r.valor_actual WHERE id = r.business_id;
            WHEN 'email'       THEN UPDATE businesses SET email       = r.valor_actual WHERE id = r.business_id;
            WHEN 'website'     THEN UPDATE businesses SET website     = r.valor_actual WHERE id = r.business_id;
            WHEN 'description' THEN UPDATE businesses SET description = r.valor_actual WHERE id = r.business_id;
            WHEN 'image_url'   THEN UPDATE businesses SET image_url   = r.valor_actual WHERE id = r.business_id;
            WHEN 'geo'         THEN UPDATE businesses SET lat = NULL, lng = NULL WHERE id = r.business_id;
            WHEN 'hours_json'  THEN UPDATE businesses SET hours_json  = r.valor_actual::jsonb WHERE id = r.business_id;
            ELSE NULL;
        END CASE;
        v_total := v_total + 1;
    END LOOP;

    UPDATE enrichment_candidates
    SET estado = 'descartado', motivo_rechazo = 'rollback_corrida'
    WHERE run_id = p_run_id AND estado = 'aplicado';

    RETURN v_total;
END;
$$;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT fn_seo_min_score();                        -- debe dar 15
-- SELECT COUNT(*) FROM v_objetivo_enriquecimiento;  -- tamaño real del pozo
--
-- Distribución del objetivo por rubro y ciudad (elegir foco del piloto):
--   SELECT rubro, ciudad, COUNT(*) AS fichas
--   FROM v_objetivo_enriquecimiento
--   WHERE falta_phone
--   GROUP BY rubro, ciudad
--   ORDER BY fichas DESC
--   LIMIT 25;
--
-- CICLO DEL CRON:
--   1. SELECT fn_enrichment_circuit_breaker();
--   2. INSERT INTO enrichment_runs (filtro_categoria, filtro_ciudad, cuota_maxima) ...
--   3. scraper lee v_objetivo_enriquecimiento → INSERT candidatos (ON CONFLICT DO NOTHING)
--   4. SELECT fn_aplicar_candidato(id) FROM v_auto_aprobables;   -- APAGADO en piloto
--   5. UPDATE enrichment_runs SET finalizada_at, motivo_fin, totales
--
-- PILOTO: NO ejecutar el paso 4. Revisar el 100% desde v_revision_diaria
-- durante los primeros 3 días para calibrar enrichment_sources.peso.
