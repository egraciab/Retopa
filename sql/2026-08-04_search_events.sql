-- D5.1 — Registro de búsquedas internas (sin PII) para el semáforo de ventas.
-- Guarda término + categoría (resuelta) + ciudad + timestamp. NO guarda IP ni usuario.
CREATE TABLE IF NOT EXISTS search_events (
    id          BIGSERIAL PRIMARY KEY,
    term        VARCHAR(160),
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    city        VARCHAR(100),
    created_at  TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para el semáforo (agregados por mes y por categoría×ciudad) y el Top de términos.
CREATE INDEX IF NOT EXISTS idx_search_events_created          ON search_events (created_at);
CREATE INDEX IF NOT EXISTS idx_search_events_cat_city_created ON search_events (category_id, city, created_at);
