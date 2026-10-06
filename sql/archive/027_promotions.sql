-- RetoPA S6.1 — Sistema de Promociones
BEGIN;

CREATE TABLE IF NOT EXISTS promotions (
    id              SERIAL PRIMARY KEY,
    business_id     INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    title           VARCHAR(120) NOT NULL,
    description     TEXT,
    image_url       VARCHAR(500),
    original_price  NUMERIC(14,0),
    promo_price     NUMERIC(14,0),
    discount_pct    SMALLINT CHECK (discount_pct BETWEEN 1 AND 99),
    price_label     VARCHAR(20) DEFAULT 'Gs.',
    boost_type      VARCHAR(20) NOT NULL DEFAULT 'plan'
                    CHECK (boost_type IN ('plan','boost_7d','boost_15d','boost_home_30d')),
    starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    show_in_home    BOOLEAN NOT NULL DEFAULT FALSE,
    show_in_category BOOLEAN NOT NULL DEFAULT TRUE,
    category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    city            VARCHAR(100),
    clicks          INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_business   ON promotions(business_id);
CREATE INDEX IF NOT EXISTS idx_promotions_active     ON promotions(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_promotions_home       ON promotions(show_in_home, is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_promotions_category   ON promotions(category_id, is_active);

-- Tabla de órdenes de pago para boosts
CREATE TABLE IF NOT EXISTS promotion_boosts (
    id            SERIAL PRIMARY KEY,
    promotion_id  INTEGER REFERENCES promotions(id) ON DELETE SET NULL,
    business_id   INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    boost_type    VARCHAR(20) NOT NULL
                  CHECK (boost_type IN ('boost_7d','boost_15d','boost_home_30d')),
    price_gs      NUMERIC(14,0) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','cancelled')),
    paid_at       TIMESTAMPTZ,
    paid_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Precios de boosts en site_config (configurables desde Admin)
INSERT INTO site_config (key, value) VALUES
    ('promo_boost_7d_price',    '20000'),
    ('promo_boost_15d_price',   '50000'),
    ('promo_boost_home_price',  '100000')
ON CONFLICT (key) DO NOTHING;

-- Agregar max_promotions a la tabla plans
ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS max_promotions SMALLINT NOT NULL DEFAULT 0;

-- Básico: 0, Destacado: 0 (solo pago), Pro: 1
UPDATE plans SET max_promotions = 0 WHERE id = 'basic';
UPDATE plans SET max_promotions = 0 WHERE id = 'featured';
UPDATE plans SET max_promotions = 1 WHERE id = 'premium';

COMMIT;

-- Agregar promo_boost al constraint de service_leads
ALTER TABLE service_leads DROP CONSTRAINT IF EXISTS chk_lead_status;
ALTER TABLE service_leads ADD CONSTRAINT chk_lead_status
    CHECK (status IN ('new','pending','contacted','negotiating','won','lost',
                      'rejected','completed','claim','follow_up'));

ALTER TABLE service_leads DROP CONSTRAINT IF EXISTS chk_service_type;

-- Agregar campos de días y links por boost en site_config
INSERT INTO site_config (key, value) VALUES
    ('promo_boost_7d_days',       '7'),
    ('promo_boost_15d_days',      '15'),
    ('promo_boost_home_days',     '30'),
    ('promo_boost_7d_url',        ''),
    ('promo_boost_15d_url',       ''),
    ('promo_boost_home_url',      '')
ON CONFLICT (key) DO NOTHING;
