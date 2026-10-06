-- ============================================================
-- RetoPA — Función consolidada de quality score
-- ------------------------------------------------------------
-- Unifica las 8 copias idénticas del cálculo (client.js + directory.js)
-- en una sola fuente de verdad. Da EXACTAMENTE el mismo número que
-- las copias actuales (verificado contra los pesos vigentes).
--
-- NOTA: admin.notify.routes.js usa una fórmula DISTINTA a propósito
-- (mide aptitud de contacto, no completitud de perfil) y NO usa esta función.
--
-- Pesos: verified 35, email 15, phone 15, website 10, description 10,
--        image 5, geo (lat+lng) 5, horario (con día abierto) 5  = 100
-- Idempotente: CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_quality_score(b businesses)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT (
        CASE WHEN b.verified = TRUE THEN 35 ELSE 0 END
      + CASE WHEN NULLIF(TRIM(b.email),       '') IS NOT NULL THEN 15 ELSE 0 END
      + CASE WHEN NULLIF(TRIM(b.phone),       '') IS NOT NULL THEN 15 ELSE 0 END
      + CASE WHEN NULLIF(TRIM(b.website),     '') IS NOT NULL THEN 10 ELSE 0 END
      + CASE WHEN NULLIF(TRIM(b.description), '') IS NOT NULL THEN 10 ELSE 0 END
      + CASE WHEN NULLIF(TRIM(b.image_url),   '') IS NOT NULL THEN  5 ELSE 0 END
      + CASE WHEN b.lat IS NOT NULL AND b.lng IS NOT NULL THEN  5 ELSE 0 END
      + CASE WHEN b.hours_json IS NOT NULL
             AND jsonb_path_exists(b.hours_json, '$.* ? (@.closed == false)') THEN  5 ELSE 0 END
    );
$$;

SELECT 'fn_quality_score creada OK' AS status;
