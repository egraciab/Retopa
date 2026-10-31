-- ════════════════════════════════════════════════════════════════════════════
-- RetoPA — 2026-10-29 — Prospectos: "respondieron" coherente entre vistas y
--                       fechas de contacto pisadas al guardar notas
--
--   1) v_prospectos_embudo.respondieron contaba solo el estado 'respondio'
--      (nadie lo usa: daba 0 con 20 reclamos), mientras v_prospectos_tandas
--      llama "respondieron" a todo el que contestó, reclamo incluido. Ahora
--      ambas usan el mismo criterio: todo lo que no quedó en 'enviado'.
--      Mismas columnas, mismo orden (digest diario y Admin → resumen).
--   2) Hasta hoy, guardar notas de una fila 'enviado' (el onblur salta aunque
--      no se escriba nada) reiniciaba fecha_contacto. El 2026-10-19 00:41 eso
--      movió 4 contactos de T1 que ya habían reclamado. Se restaura la fecha del
--      primer envío (= created_at: la fila se crea al marcar 'enviado') con nota
--      de trazabilidad. Solo filas de esa ventana, con created_at anterior; en
--      una base sin esas filas no hace nada. El arreglo del origen va en
--      prospects.routes.js / admin/js/prospects.js del mismo paquete.
--
-- Idempotente: se puede correr dos veces.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1) Embudo general ───────────────────────────────────────────────────────
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
    count(*) FILTER (WHERE estado <> 'enviado')                 AS respondieron,
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

COMMENT ON VIEW v_prospectos_embudo IS
  'Embudo por contacto (fila de seguimiento), ambos canales. respondieron = todo lo que no quedó en enviado (reclamo incluido), igual que v_prospectos_tandas. respuestas_total se mantiene por compatibilidad.';

-- ── 2) Fechas de contacto pisadas el 2026-10-19 ─────────────────────────────
UPDATE prospect_wa_outreach
   SET notas          = TRIM(BOTH ' ' FROM COALESCE(notas, '') || ' [fecha_contacto restaurada al primer envío; '
                        || 'estaba en ' || to_char(fecha_contacto AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
                        || ' UTC por guardar notas · 2026-10-29]'),
       fecha_contacto = created_at,
       updated_at     = NOW()
 WHERE fecha_contacto >= '2026-10-19 00:41:00+00'
   AND fecha_contacto <  '2026-10-19 00:42:00+00'
   AND created_at     <  '2026-10-19 00:00:00+00';

COMMIT;

-- VERIFICAR:
--   SELECT * FROM v_prospectos_embudo;          -- respondieron = respuestas_total
--   SELECT id, created_at, fecha_contacto FROM prospect_wa_outreach
--    WHERE notas LIKE '%restaurada al primer envío%';   -- prod: ids 13, 56, 89, 90
