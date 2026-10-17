-- ════════════════════════════════════════════════════════════════════════════
-- RetoPA — 2026-10-13 — Login con WhatsApp o correo · contraseña opcional
--
--  · users.password_set_at — ¿el usuario ELIGIÓ una contraseña? Los dueños que
--    reclamaron por enlace no tienen (entran por link). Con esto Mi Portal los
--    invita a crearla sin pedir "contraseña actual", y el login les sugiere
--    "entrar sin contraseña" en vez de decir "credenciales inválidas".
--    Relleno inicial (UNA sola vez, al crear la columna): se marca a todos los que
--    ya tenían contraseña real; quedan sin marcar los del placeholder de altas y
--    los que reclamaron por enlace (claim_snapshots).
--  · Índice por dígitos del teléfono (login por WhatsApp).
--  · access_requests — "Pedir acceso por WhatsApp": queda registrado para que el
--    admin le mande el link de acceso con un toque (automático cuando esté la API).
--
-- Aditivo e idempotente. Correr DESPUÉS de 2026-10-13_reclamo_e1.sql.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'users' AND column_name = 'password_set_at') THEN
    ALTER TABLE users ADD COLUMN password_set_at timestamp without time zone;
    UPDATE users u
       SET password_set_at = COALESCE(u.updated_at, u.created_at, now())
     WHERE u.password_hash IS NOT NULL
       AND u.password_hash <> '!pending-no-password!'
       AND NOT EXISTS (SELECT 1 FROM claim_snapshots s WHERE s.user_id = u.id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_phone_digits
    ON users ((regexp_replace(COALESCE(phone, ''), '\D', '', 'g')));

CREATE TABLE IF NOT EXISTS access_requests (
    id          bigserial PRIMARY KEY,
    user_id     integer REFERENCES users(id) ON DELETE SET NULL,  -- NULL: no hay cuenta con ese número
    phone       varchar(20) NOT NULL,                             -- +5959XXXXXXXX
    channel     varchar(16) NOT NULL DEFAULT 'whatsapp',
    created_at  timestamp without time zone NOT NULL DEFAULT now(),
    handled_at  timestamp without time zone,
    handled_by  integer
);
CREATE INDEX IF NOT EXISTS idx_access_requests_pending ON access_requests (created_at) WHERE handled_at IS NULL;

COMMIT;
