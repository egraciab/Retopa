-- ============================================================
-- RetoPA — fn_profile_completion: completitud AUTOCOMPLETABLE del perfil
-- ------------------------------------------------------------
-- Separado de fn_quality_score (que incluye 'verified' y se usa para ranking).
-- Este mide SOLO lo que el dueño puede completar por sí mismo, normalizado a 100.
-- 'verified' se devuelve aparte como sello — NO suma al %.
--
-- ÚNICA fuente de verdad del desglose: el frontend solo mapea copy
-- (labels/tips/íconos) por 'key'. El 'done' lo decide siempre el backend.
--
-- Pesos (suman 100): phone 20, description 20, image 15, location 15,
--                    email 10, website 10, hours 10.
-- Idempotente: CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_profile_completion(b businesses)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  WITH it AS (
    SELECT * FROM (VALUES
      (1, 'phone',       (NULLIF(TRIM(COALESCE(b.phone, b.whatsapp)), '') IS NOT NULL), 20),
      (2, 'description', (NULLIF(TRIM(b.description), '') IS NOT NULL),                  20),
      (3, 'image',       (NULLIF(TRIM(b.image_url), '') IS NOT NULL),                   15),
      (4, 'location',    (b.lat IS NOT NULL AND b.lng IS NOT NULL),                     15),
      (5, 'email',       (NULLIF(TRIM(b.email), '') IS NOT NULL),                       10),
      (6, 'website',     (NULLIF(TRIM(b.website), '') IS NOT NULL),                     10),
      (7, 'hours',       (b.hours_json IS NOT NULL
                          AND jsonb_path_exists(b.hours_json, '$.* ? (@.closed == false)')), 10)
    ) AS t(ord, key, done, weight)
  )
  SELECT jsonb_build_object(
    'completion', COALESCE((SELECT SUM(weight) FROM it WHERE done), 0),
    'verified',   COALESCE(b.verified, false),
    'items',      (SELECT jsonb_agg(
                     jsonb_build_object('key', key, 'done', done, 'weight', weight)
                     ORDER BY ord) FROM it)
  );
$$;

SELECT 'fn_profile_completion creada OK' AS status;
