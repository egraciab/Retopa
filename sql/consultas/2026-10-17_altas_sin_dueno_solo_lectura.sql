-- RetoPA — Altas web cuya ficha quedó SIN DUEÑO (SOLO LECTURA). Correr en PRODUCCIÓN.
--   docker exec -i retopa-db psql -U retopa -d retopa < este_archivo.sql
BEGIN TRANSACTION READ ONLY;

\echo '── 1) El caso "El Empanadero": por qué flujo entró ──'
SELECT b.id, b.name, b.source, b.created_at, b.verified,
       sl.id AS lead, sl.status, sl.created_at AS lead_at,
       CASE WHEN sl.notes IS JSON OBJECT THEN sl.notes::jsonb->>'flow' END   AS flujo,      -- 'alta_una_pantalla' = /registrar nuevo
       CASE WHEN sl.notes IS JSON OBJECT THEN sl.notes::jsonb->>'source' END AS origen,
       sl.contact_email, sl.contact_phone,
       u.id AS cuenta, (u.password_hash = '!pending-no-password!') AS cuenta_pendiente_vieja, u.phone AS wa_cuenta, u.created_at AS cuenta_creada
  FROM businesses b
  JOIN service_leads sl ON sl.business_id = b.id
  LEFT JOIN users u ON lower(u.email) = lower(sl.contact_email)
 WHERE b.name ILIKE '%empanadero%'
 ORDER BY sl.created_at;

\echo '── 2) Altas (180 días) con ficha activa SIN dueño, y la cuenta que la registró si se encuentra ──'
WITH l AS (
  SELECT DISTINCT ON (sl.business_id) sl.*, CASE WHEN sl.notes IS JSON OBJECT THEN sl.notes::jsonb ELSE '{}'::jsonb END AS n
    FROM service_leads sl
   WHERE sl.created_at > NOW() - interval '180 days'
     AND COALESCE(sl.service_type,'') NOT IN ('claim','promo_boost')
   ORDER BY sl.business_id, sl.created_at DESC
)
SELECT b.id, b.name, b.created_at::date AS creada, b.verified, l.status AS lead,
       l.n->>'flow' AS flujo, l.contact_email,
       COALESCE(u1.id, u2.id) AS cuenta_que_la_registro,
       CASE WHEN u1.id IS NOT NULL THEN 'cuenta del alta' WHEN u2.id IS NOT NULL THEN 'correo del formulario' END AS por
  FROM l JOIN businesses b ON b.id = l.business_id AND b.is_active
  LEFT JOIN users u1 ON u1.id = NULLIF(l.n->>'user_id','')::int AND u1.role NOT IN ('admin','godmode')
  LEFT JOIN users u2 ON lower(u2.email) = lower(l.contact_email) AND u2.role NOT IN ('admin','godmode')
 WHERE NOT EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.business_id = b.id AND ub.is_owner)
 ORDER BY b.created_at DESC;

ROLLBACK;
