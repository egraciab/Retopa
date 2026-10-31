-- ROLLBACK de 2026-10-29_prospectos_embudo_fechas.sql: vuelve v_prospectos_embudo
-- a la definición del 2026-10-26 (respondieron = solo estado 'respondio').
-- Las 4 fechas restauradas no se revierten: la fecha anterior era la errónea
-- y queda escrita en la nota de cada fila.
BEGIN;
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
COMMENT ON VIEW v_prospectos_embudo IS NULL;
COMMIT;
