-- ═══════════════════════════════════════════════════════════════════════════
-- RetoPA — MEDICIÓN de fichas duplicadas por altas web (SOLO LECTURA)
-- Correr en PRODUCCIÓN (en dev los contactos están anonimizados) ANTES de
-- aplicar la migración de fusión: no usa nada nuevo. Transacción READ ONLY.
--   docker exec -i retopa-db psql -U retopa -d retopa < este_archivo.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN TRANSACTION READ ONLY;

-- 1) El caso puntual: todo lo que comparte el celular indicado (psql -v cel=9XXXXXXXX).
\echo '── 1) Fichas con el celular indicado (psql -v cel=9XXXXXXXX) (teléfono o WhatsApp) ──'
SELECT b.id, b.name, b.slug, b.is_active, b.created_at::date AS creada, b.plan_type,
       b.claim_status, b.email,
       (SELECT count(*) FROM business_views v WHERE v.business_id = b.id) AS visitas,
       (SELECT count(*) FROM business_gallery g WHERE g.business_id = b.id) AS fotos,
       (SELECT string_agg(u.id || ':' || COALESCE(u.email, 's/correo') || CASE WHEN ub.is_owner THEN ' (dueño)' ELSE '' END, ', ')
          FROM user_businesses ub JOIN users u ON u.id = ub.user_id WHERE ub.business_id = b.id) AS cuentas
  FROM businesses b
 WHERE right(regexp_replace(COALESCE(b.phone, ''), '\D', '', 'g'), 9) = :'cel'
    OR right(regexp_replace(COALESCE(b.whatsapp, ''), '\D', '', 'g'), 9) = :'cel'
 ORDER BY b.created_at;

\echo '── 1b) Leads de esas fichas ──'
SELECT sl.id, sl.business_id, sl.service_type, sl.status, sl.contact_name, sl.contact_email, sl.contact_phone, sl.created_at
  FROM service_leads sl
 WHERE sl.business_id IN (SELECT id FROM businesses
                           WHERE right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 9) = :'cel'
                              OR right(regexp_replace(COALESCE(whatsapp, ''), '\D', '', 'g'), 9) = :'cel')
 ORDER BY sl.created_at;

\echo '── 1c) Cuentas con ese WhatsApp ──'
SELECT u.id, u.name, u.email, u.phone, u.email_verified, (u.password_hash = '!pending-no-password!') AS pendiente,
       u.created_at::date AS creada, u.last_seen_at
  FROM users u WHERE right(regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g'), 9) = :'cel';

-- 2) Tamaño del problema: altas con lead de los últimos 365 días que coinciden con
--    una ficha MÁS VIEJA por celular o correo (la misma regla que el asistente).
\echo '── 2) Altas web que parecen duplicar una ficha existente (365 días) ──'
WITH nuevas AS (
  SELECT DISTINCT ON (b.id) b.id, b.name, b.created_at, sl.contact_email, sl.contact_phone
    FROM service_leads sl JOIN businesses b ON b.id = sl.business_id
   WHERE sl.created_at > NOW() - interval '365 days'
     AND COALESCE(sl.service_type, '') NOT IN ('claim', 'promo_boost')
     AND b.is_active
   ORDER BY b.id, sl.created_at DESC
), nk AS (
  SELECT n.id AS nid, k.kind,
         CASE k.kind WHEN 'cel' THEN CASE WHEN regexp_replace(COALESCE(k.val, ''), '\D', '', 'g') ~ '^(595|0)?9[0-9]{8}$'
                                          THEN right(regexp_replace(k.val, '\D', '', 'g'), 9) END
                     ELSE CASE WHEN position('@' in COALESCE(k.val, '')) > 1 THEN lower(trim(k.val)) END END AS k
    FROM nuevas n JOIN businesses b ON b.id = n.id
    CROSS JOIN LATERAL (VALUES ('cel', b.phone), ('cel', b.whatsapp), ('cel', n.contact_phone),
                               ('mail', b.email), ('mail', n.contact_email)) AS k(kind, val)
), nkv AS (SELECT DISTINCT nid, kind, k FROM nk WHERE k IS NOT NULL),
ok AS (
  SELECT b.id AS oid, 'cel' AS kind, right(regexp_replace(COALESCE(b.phone, ''), '\D', '', 'g'), 9) AS k FROM businesses b WHERE b.is_active
  UNION ALL SELECT b.id, 'cel', right(regexp_replace(COALESCE(b.whatsapp, ''), '\D', '', 'g'), 9) FROM businesses b WHERE b.is_active
  UNION ALL SELECT b.id, 'mail', lower(trim(b.email)) FROM businesses b WHERE b.is_active
  UNION ALL SELECT ub.business_id, 'cel', right(regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g'), 9)
              FROM users u JOIN user_businesses ub ON ub.user_id = u.id AND ub.is_owner
  UNION ALL SELECT ub.business_id, 'mail', lower(trim(u.email))
              FROM users u JOIN user_businesses ub ON ub.user_id = u.id AND ub.is_owner
)
SELECT n.id AS alta_id, n.name AS alta, n.created_at::date AS alta_fecha,
       o.id AS ficha_id, o.name AS ficha, o.created_at::date AS ficha_fecha,
       string_agg(DISTINCT x.kind, '+') AS coincide_por,
       (SELECT count(*) FROM business_views v WHERE v.business_id = o.id) AS visitas_ficha
  FROM nkv x
  JOIN ok ON ok.kind = x.kind AND ok.k = x.k AND ok.oid <> x.nid
  JOIN nuevas n ON n.id = x.nid
  JOIN businesses o ON o.id = ok.oid AND o.is_active AND o.created_at < n.created_at
 GROUP BY n.id, n.name, n.created_at, o.id, o.name, o.created_at
 ORDER BY n.created_at DESC;

ROLLBACK;
