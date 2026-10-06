-- RetoPA S4.4 — Parametrización de límites por plan
-- Agrega columnas de límites a la tabla plans
-- Todo configurable desde el Panel Admin

BEGIN;

ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS max_categories   SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS max_gallery      SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_social       SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_tags         SMALLINT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS has_whatsapp     BOOLEAN  NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS has_hours        BOOLEAN  NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS has_gallery      BOOLEAN  NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS has_map          BOOLEAN  NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS has_social       BOOLEAN  NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS has_reviews_reply BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS priority_boost   SMALLINT NOT NULL DEFAULT 0; -- 0-10, suma al order de búsqueda

-- Poblar valores actuales
UPDATE plans SET
    max_categories    = 1,
    max_gallery       = 0,
    max_social        = 0,
    max_tags          = 5,
    has_whatsapp      = TRUE,
    has_hours         = FALSE,
    has_gallery       = FALSE,
    has_map           = FALSE,
    has_social        = FALSE,
    has_reviews_reply = FALSE,
    priority_boost    = 0
WHERE id = 'basic';

UPDATE plans SET
    max_categories    = 2,
    max_gallery       = 5,
    max_social        = 2,
    max_tags          = 10,
    has_whatsapp      = TRUE,
    has_hours         = TRUE,
    has_gallery       = TRUE,
    has_map           = TRUE,
    has_social        = TRUE,
    has_reviews_reply = FALSE,
    priority_boost    = 3
WHERE id = 'featured';

UPDATE plans SET
    max_categories    = 5,
    max_gallery       = 10,
    max_social        = 6,
    max_tags          = 20,
    has_whatsapp      = TRUE,
    has_hours         = TRUE,
    has_gallery       = TRUE,
    has_map           = TRUE,
    has_social        = TRUE,
    has_reviews_reply = TRUE,
    priority_boost    = 6
WHERE id = 'premium';

COMMIT;
