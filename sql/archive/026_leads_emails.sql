INSERT INTO site_config (key, value)
VALUES ('leads_emails', 'leads@retopa.com.py')
ON CONFLICT (key) DO NOTHING;
SELECT key, value FROM site_config WHERE key = 'leads_emails';
