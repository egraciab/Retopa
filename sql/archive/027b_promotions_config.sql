ALTER TABLE promotion_boosts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
INSERT INTO site_config (key, value) VALUES
    ('promo_boost_7d_days',   '7'),
    ('promo_boost_15d_days',  '15'),
    ('promo_boost_home_days', '30'),
    ('promo_boost_7d_url',    ''),
    ('promo_boost_15d_url',   ''),
    ('promo_boost_home_url',  '')
ON CONFLICT (key) DO NOTHING;
