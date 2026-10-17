-- RetoPA — medición (SOLO LECTURA) para: reclamo de fichas verificadas sin dueño,
-- rubros de las pastillas y orden de búsqueda. Correr en PRODUCCIÓN.
--   docker exec -i retopa-db psql -U retopa -d retopa < este_archivo.sql
BEGIN TRANSACTION READ ONLY;

\echo '── 1) Fichas activas: verificada × tiene dueño ──'
SELECT b.verified,
       EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.business_id = b.id AND ub.is_owner) AS tiene_dueno,
       count(*) AS fichas,
       count(*) FILTER (WHERE right(regexp_replace(COALESCE(b.whatsapp, b.phone, ''), '\D', '', 'g'), 9) ~ '^9[0-9]{8}$') AS con_celular
  FROM businesses b WHERE b.is_active
 GROUP BY 1, 2 ORDER BY 1, 2;

\echo '── 2) Reclamos por formulario rechazados por "ya fue verificada" no quedan registrados; pendientes hoy: ──'
SELECT count(*) AS reclamos_formulario_pendientes FROM service_leads WHERE service_type = 'claim' AND status = 'pending';

\echo '── 3) Rubros candidatos para cada pastilla (similitud de nombre) ──'
SELECT p.pastilla, c.id, c.name, c.slug, c.parent_id,
       round(similarity(lower(unaccent(c.name)), lower(unaccent(p.pastilla)))::numeric, 2) AS sim,
       (SELECT count(*) FROM business_categories bc WHERE bc.category_id = c.id) AS fichas
  FROM (VALUES ('Cerrajería'), ('Taller mecánico'), ('Veterinaria'), ('Farmacia'), ('Plomería'), ('Electricista')) p(pastilla)
  JOIN categories c ON similarity(lower(unaccent(c.name)), lower(unaccent(p.pastilla))) > 0.3
 ORDER BY p.pastilla, sim DESC;

ROLLBACK;
