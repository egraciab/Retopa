-- ════════════════════════════════════════════════════════════════════════════
-- RetoPA — Verificación de correo (magic link)
--
-- Agrega el token de verificación de email a users. La columna email_verified
-- ya existe (boolean DEFAULT false). El token se usa en el link mágico
--     https://retopa.com.py/?verify=TOKEN
-- que confirma el correo y recién ahí engancha las fichas por correo.
--
-- Idempotente: usa IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_expires timestamptz;

-- Índice parcial para resolver el token rápido (solo filas con token pendiente).
CREATE INDEX IF NOT EXISTS idx_users_verify_token
    ON users (verify_token) WHERE verify_token IS NOT NULL;

COMMIT;
