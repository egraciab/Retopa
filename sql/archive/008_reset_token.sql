-- ============================================
-- RETOPA — Columna reset_token en users
-- Separa el token de reset de mfa_otp (que es VARCHAR(10))
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'reset_token'
    ) THEN
        ALTER TABLE users ADD COLUMN reset_token TEXT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'reset_token_expires'
    ) THEN
        ALTER TABLE users ADD COLUMN reset_token_expires TIMESTAMP;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;

SELECT 'reset_token columns added' AS status;
