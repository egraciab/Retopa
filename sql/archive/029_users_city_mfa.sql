-- Sprint v2.4: ciudad del usuario + asegurar columnas MFA en users
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS city        VARCHAR(120),
    ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN   DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mfa_otp     VARCHAR(10),
    ADD COLUMN IF NOT EXISTS mfa_otp_expires TIMESTAMP;

SELECT 'users city+mfa columns OK' AS status;
