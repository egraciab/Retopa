-- ============================================================
-- OPCIONAL — Eliminar tabla admin_users (fósil de v1, 0 filas)
-- ------------------------------------------------------------
-- Verificado el 2026-06-09: admin_users tiene 0 registros.
-- Los admins reales viven en la tabla `users` con role godmode/admin.
-- DESCOMENTÁ la línea de abajo SOLO cuando estés seguro.
-- Es irreversible (aunque la tabla está vacía).
-- ============================================================

-- DROP TABLE IF EXISTS public.admin_users CASCADE;

SELECT 'admin_users tiene ' || COUNT(*) || ' filas (esperado: 0)' AS check_previo FROM admin_users;
