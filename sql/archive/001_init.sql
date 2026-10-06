CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    department VARCHAR(120),
    country VARCHAR(120) DEFAULT 'Paraguay',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    slug VARCHAR(140) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS businesses (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(220),
    description TEXT,
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(150),
    website VARCHAR(255),
    city_id INTEGER REFERENCES cities(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    source VARCHAR(50) DEFAULT 'manual',
    claimed BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    geom geometry(Point, 4326),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_businesses_city_id ON businesses(city_id);
CREATE INDEX IF NOT EXISTS idx_businesses_category_id ON businesses(category_id);
CREATE INDEX IF NOT EXISTS idx_businesses_source ON businesses(source);
CREATE INDEX IF NOT EXISTS idx_businesses_claimed ON businesses(claimed);
CREATE INDEX IF NOT EXISTS idx_businesses_geom ON businesses USING GIST (geom);
