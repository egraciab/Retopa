-- ═══════════════════════════════════════════════════════════════════════════
-- RetoPA — recuperar teléfonos desde tu propia base, cruzando por RUC
--
-- Las fichas source='manual' vinieron de un padrón sin datos de contacto, pero
-- el 99,95% tiene RUC. Cuando ese mismo RUC existe en otra ficha (DNCP, MIC,
-- import_*) que SÍ tiene teléfono, el dato ya es tuyo.
--
-- Escribe a enrichment_candidates: pasa por la misma revisión y el mismo
-- rollback que el resto. No toca businesses.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO enrichment_runs (filtro_categoria, cuota_maxima, scraper_version, motivo_fin)
VALUES ('cruce_ruc_interno', 100000, 'ruc-1.0', 'completo');

WITH corrida AS (
    SELECT MAX(id) AS id FROM enrichment_runs WHERE filtro_categoria = 'cruce_ruc_interno'
),
donantes AS (
    -- Por cada RUC, el mejor teléfono disponible en la base.
    -- Se prefieren las fuentes oficiales y los números ya normalizados.
    SELECT DISTINCT ON (TRIM(d.ruc))
           TRIM(d.ruc)                        AS ruc,
           REGEXP_REPLACE(d.phone,'\D','','g') AS digitos,
           d.phone                            AS telefono,
           d.source                           AS fuente_origen,
           d.id                               AS donante_id
    FROM businesses d
    WHERE NULLIF(TRIM(d.ruc),'')   IS NOT NULL
      AND NULLIF(TRIM(d.phone),'') IS NOT NULL
      AND REGEXP_REPLACE(d.phone,'\D','','g') ~ '^0?[2-9][0-9]{7,8}$'
    ORDER BY TRIM(d.ruc),
             CASE d.source WHEN 'DNCP-SIPE' THEN 1 WHEN 'DNCP' THEN 2
                           WHEN 'import_mic' THEN 3 ELSE 4 END,
             d.updated_at DESC NULLS LAST
),
receptoras AS (
    SELECT b.id, TRIM(b.ruc) AS ruc
    FROM businesses b
    WHERE b.is_active
      AND NULLIF(TRIM(b.ruc),'')   IS NOT NULL
      AND NULLIF(TRIM(b.phone),'') IS NULL
)
INSERT INTO enrichment_candidates
  (run_id, business_id, campo, valor_actual, valor_propuesto,
   valor_normalizado, fuente, fuente_url, confianza, corroboraciones)
SELECT (SELECT id FROM corrida), r.id, 'phone', NULL, d.telefono,
       '0' || REGEXP_REPLACE(d.digitos, '^0', ''),
       'manual',
       'cruce interno por RUC · ficha ' || d.donante_id || ' (' || d.fuente_origen || ')',
       0.90,   -- mismo RUC = misma empresa. Alta, pero no auto-aplicable sola.
       1
FROM receptoras r
JOIN donantes  d ON d.ruc = r.ruc
WHERE r.id <> d.donante_id
ON CONFLICT (business_id, campo, valor_normalizado) DO NOTHING;

UPDATE enrichment_runs
   SET finalizada_at = NOW(),
       candidatos_creados = (SELECT COUNT(*) FROM enrichment_candidates
                              WHERE run_id = (SELECT MAX(id) FROM enrichment_runs
                                               WHERE filtro_categoria='cruce_ruc_interno'))
 WHERE id = (SELECT MAX(id) FROM enrichment_runs WHERE filtro_categoria='cruce_ruc_interno');

COMMIT;

-- Cuántos entraron:
--   SELECT COUNT(*) FROM enrichment_candidates
--    WHERE estado='pendiente' AND fuente_url LIKE 'cruce interno%';
--
-- OJO — esto también destapa DUPLICADOS: si dos fichas activas comparten RUC,
-- son la misma empresa cargada dos veces y están compitiendo entre sí en Google.
-- Para verlos:
--   SELECT TRIM(ruc) AS ruc, COUNT(*) AS fichas,
--          STRING_AGG(id || ':' || name || ' [' || source || ']', ' | ') AS detalle
--   FROM businesses
--   WHERE is_active AND NULLIF(TRIM(ruc),'') IS NOT NULL
--   GROUP BY TRIM(ruc) HAVING COUNT(*) > 1
--   ORDER BY fichas DESC LIMIT 30;
