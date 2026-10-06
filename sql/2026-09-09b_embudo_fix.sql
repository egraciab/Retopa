-- ═══════════════════════════════════════════════════════════════════════════
-- RetoPA — v_prospectos_embudo: sacar los números inválidos del conteo
--
-- Un número que no existe no es un contacto: no debe contar como "enviado"
-- ni figurar en el denominador de la conversión, porque la hunde sin motivo.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW v_prospectos_embudo AS
SELECT
    COUNT(*) FILTER (WHERE estado <> 'invalido')    AS contactados,
    COUNT(*) FILTER (WHERE estado = 'respondio')    AS respondieron,
    COUNT(*) FILTER (WHERE estado = 'reclamo')      AS reclamaron,
    COUNT(*) FILTER (WHERE estado = 'no_interesa')  AS no_interesa,
    COUNT(*) FILTER (WHERE estado = 'invalido')     AS numero_malo,
    -- conversión sobre contactos reales, no sobre números que no existen
    ROUND(COUNT(*) FILTER (WHERE estado = 'reclamo')::numeric
          / NULLIF(COUNT(*) FILTER (WHERE estado <> 'invalido'), 0) * 100, 1)
                                                    AS tasa_claim_pct,
    COUNT(*) FILTER (WHERE enviado_at > NOW() - INTERVAL '7 days'
                       AND estado <> 'invalido')    AS enviados_7d
FROM prospect_outreach;

COMMIT;

-- SELECT * FROM v_prospectos_embudo;
