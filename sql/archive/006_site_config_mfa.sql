-- ============================================
-- RETOPA — site_config + MFA para usuarios admin
-- ============================================

-- Tabla key-value para configuración del sitio
CREATE TABLE IF NOT EXISTS site_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed con valores del .env (se actualizan desde el panel admin)
INSERT INTO site_config (key, value) VALUES
    ('site_name',        'RetoPA'),
    ('site_url',         'https://retopa.com.py'),
    ('contact_phone',    ''),
    ('contact_email',    ''),
    ('social_facebook',  ''),
    ('social_instagram', ''),
    ('social_linkedin',  ''),
    ('social_whatsapp',  ''),
    ('smtp_host',        ''),
    ('smtp_port',        '587'),
    ('smtp_secure',      'false'),
    ('smtp_user',        ''),
    ('smtp_pass',        ''),
    ('smtp_from',        ''),
    ('smtp_from_name',   'RetoPA')
ON CONFLICT (key) DO NOTHING;

-- Columnas MFA para usuarios (2FA por email)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'mfa_enabled'
    ) THEN
        ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'mfa_otp'
    ) THEN
        ALTER TABLE users ADD COLUMN mfa_otp VARCHAR(10);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'mfa_otp_expires'
    ) THEN
        ALTER TABLE users ADD COLUMN mfa_otp_expires TIMESTAMP;
    END IF;
END $$;

SELECT 'site_config y MFA listo' AS status;
