-- ============================================
-- RETOPA — Log de emails enviados
-- ============================================
CREATE TABLE IF NOT EXISTS email_log (
    id          SERIAL PRIMARY KEY,
    to_email    VARCHAR(200) NOT NULL,
    subject     VARCHAR(300) NOT NULL,
    type        VARCHAR(50)  NOT NULL DEFAULT 'general',  -- welcome, reset, mfa, test, etc.
    status      VARCHAR(20)  NOT NULL DEFAULT 'sent',     -- sent, failed
    error       TEXT,
    metadata    JSONB,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_type    ON email_log(type);
CREATE INDEX IF NOT EXISTS idx_email_log_status  ON email_log(status);

SELECT 'email_log creado' AS status;
