-- RetoPA — ¿Por qué tantas cuentas sin WhatsApp? (SOLO LECTURA). Correr en PRODUCCIÓN.
--   docker exec -i retopa-db psql -U retopa -d retopa < este_archivo.sql
BEGIN TRANSACTION READ ONLY;

\echo '── 1) Cuentas (no admin): WhatsApp en la cuenta vs. solo en su ficha ──'
WITH u AS (
  SELECT u.*,
         right(regexp_replace(COALESCE(u.phone,''),'\D','','g'), 9) ~ '^9[0-9]{8}$' AS wa_cuenta,
         EXISTS (SELECT 1 FROM user_businesses ub JOIN businesses b ON b.id = ub.business_id
                  WHERE ub.user_id = u.id AND ub.is_owner
                    AND right(regexp_replace(COALESCE(NULLIF(b.whatsapp,''), b.phone, ''),'\D','','g'), 9) ~ '^9[0-9]{8}$') AS wa_ficha
    FROM users u WHERE u.role NOT IN ('admin','godmode')
)
SELECT CASE WHEN wa_cuenta THEN '1) WhatsApp en la cuenta'
            WHEN wa_ficha  THEN '2) sin WhatsApp en la cuenta, pero su ficha tiene celular'
            ELSE '3) sin WhatsApp en ningún lado' END AS situacion,
       count(*) AS cuentas,
       count(*) FILTER (WHERE email_verified) AS correo_confirmado,
       count(*) FILTER (WHERE password_set_at IS NOT NULL) AS con_contrasena
  FROM u GROUP BY 1 ORDER BY 1;

\echo '── 2) Las del grupo 2, por cómo se crearon (pista del flujo que no guardaba el WhatsApp) ──'
SELECT CASE WHEN u.password_hash = '!pending-no-password!' THEN 'alta web vieja (cuenta pendiente)'
            WHEN EXISTS (SELECT 1 FROM service_leads sl JOIN user_businesses ub ON ub.business_id = sl.business_id AND ub.user_id = u.id
                          WHERE sl.service_type = 'claim') THEN 'reclamo (formulario o aprobación)'
            ELSE 'registro con correo / otro' END AS origen,
       count(*) AS cuentas
  FROM users u
 WHERE u.role NOT IN ('admin','godmode')
   AND NOT (right(regexp_replace(COALESCE(u.phone,''),'\D','','g'), 9) ~ '^9[0-9]{8}$')
   AND EXISTS (SELECT 1 FROM user_businesses ub JOIN businesses b ON b.id = ub.business_id
                WHERE ub.user_id = u.id AND ub.is_owner
                  AND right(regexp_replace(COALESCE(NULLIF(b.whatsapp,''), b.phone, ''),'\D','','g'), 9) ~ '^9[0-9]{8}$')
 GROUP BY 1 ORDER BY 2 DESC;

\echo '── 3) Dueños con rol "Usuario" en vez de "Cliente" ──'
SELECT count(DISTINCT u.id) AS duenos_con_rol_usuario
  FROM users u JOIN user_businesses ub ON ub.user_id = u.id AND ub.is_owner
 WHERE u.role = 'user';

ROLLBACK;
