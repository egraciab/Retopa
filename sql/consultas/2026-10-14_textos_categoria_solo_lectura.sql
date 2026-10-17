-- ═══════════════════════════════════════════════════════════════════════════
-- RetoPA — "Categorías" que quedan en TEXTOS GUARDADOS EN LA BASE (SOLO LECTURA)
-- El código ya dice "Rubros"; esto lista lo que vive en site_config, planes y
-- servicios (lo editás desde el Admin: Configuración / Planes / Servicios).
-- No cambia nada: READ ONLY + ROLLBACK.
--   docker exec -i retopa-db psql -U retopa -d retopa < este_archivo.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN TRANSACTION READ ONLY;

\echo '── site_config (textos del sitio, plantillas tpl_*, footer) ──'
SELECT key, left(regexp_replace(value, '\s+', ' ', 'g'), 140) AS texto
  FROM site_config WHERE value ~* 'categor(í|i|&iacute;)a' ORDER BY key;

\echo '── Planes (features, subtítulo) ──'
SELECT id, name, subtitle, features
  FROM plans WHERE features::text ~* 'categor(í|i)a' OR COALESCE(subtitle, '') ~* 'categor(í|i)a' ORDER BY display_order;

\echo '── Servicios ──'
SELECT id, title, left(COALESCE(description, ''), 120) AS descripcion
  FROM services WHERE COALESCE(title, '') || ' ' || COALESCE(description, '') || ' ' || COALESCE(features::text, '') ~* 'categor(í|i)a';

ROLLBACK;
