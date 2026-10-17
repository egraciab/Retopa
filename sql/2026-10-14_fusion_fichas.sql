-- ═══════════════════════════════════════════════════════════════════════════
-- RetoPA — Fusión de fichas duplicadas (2026-10-14)
-- Caso que la originó: un dueño con ficha ya reclamada (visitas, clics) volvió
-- a darse de alta desde la web y entró como Lead nuevo.
--
-- ADITIVA e idempotente:
--   · businesses.merged_into / merged_at  → la ficha fusionada queda INACTIVA
--     (nunca se borra) y su link redirige a la que sobrevive.
--   · business_merges → registro de cada decisión: estado, autor, evidencia y
--     los VALORES ANTERIORES de las dos fichas + qué filas se movieron
--     (para revertir exacto).
--   · service_leads: estado nuevo 'fusionado' (se agrega al CHECK existente).
-- Dry-run: sed 's/^COMMIT;/ROLLBACK;/' este_archivo.sql | psql …
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS merged_into integer;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS merged_at   timestamp without time zone;
CREATE INDEX IF NOT EXISTS idx_businesses_merged_into ON businesses (merged_into) WHERE merged_into IS NOT NULL;

-- Índices para que el asistente busque por celular/correo sin recorrer todo
-- (misma expresión que helpers/fichaMerge.js → PH9).
CREATE INDEX IF NOT EXISTS idx_businesses_phone9
    ON businesses ((right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 9)));
CREATE INDEX IF NOT EXISTS idx_businesses_whatsapp9
    ON businesses ((right(regexp_replace(COALESCE(whatsapp, ''), '\D', '', 'g'), 9)));
CREATE INDEX IF NOT EXISTS idx_businesses_email_lower
    ON businesses ((lower(trim(email))));

CREATE TABLE IF NOT EXISTS business_merges (
    id               serial PRIMARY KEY,
    survivor_id      integer NOT NULL,             -- la que queda (historial, visitas, link)
    duplicate_id     integer NOT NULL,             -- la que se desactiva
    lead_id          integer,                      -- el alta (service_lead) que la originó
    status           varchar(20) NOT NULL DEFAULT 'aplicada'
                     CHECK (status IN ('aplicada','revertida','descartada')),
    evidence         jsonb NOT NULL DEFAULT '[]',  -- coincidencias con su FUENTE
    fields_taken     jsonb NOT NULL DEFAULT '[]',  -- columnas que se trajeron de la duplicada
    survivor_before  jsonb,                        -- foto previa de la que queda (sin location)
    survivor_cats    jsonb,                        -- sus rubros previos
    duplicate_before jsonb,                        -- foto previa de la duplicada
    moved            jsonb NOT NULL DEFAULT '{}',  -- ids movidos por tabla (para volverlos)
    note             text,
    created_by       integer,
    created_at       timestamp without time zone NOT NULL DEFAULT NOW(),
    reverted_by      integer,
    reverted_at      timestamp without time zone
);
CREATE INDEX IF NOT EXISTS idx_business_merges_pair ON business_merges (survivor_id, duplicate_id);
CREATE INDEX IF NOT EXISTS idx_business_merges_dup  ON business_merges (duplicate_id);

-- Estado 'fusionado' para el lead del alta duplicada: se agrega a la lista que
-- YA tiene el CHECK (sea cual sea), sin reescribirla a mano.
DO $$
DECLARE def text; nuevo text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint WHERE conname = 'chk_lead_status' AND conrelid = 'service_leads'::regclass;
  IF def IS NULL THEN
    RAISE NOTICE 'service_leads sin chk_lead_status: nada que ampliar';
  ELSIF def NOT LIKE '%''fusionado''%' THEN
    nuevo := regexp_replace(def, '\]\)', ', ''fusionado''::character varying])', '');
    IF nuevo = def OR nuevo NOT LIKE '%''fusionado''%' THEN
      RAISE EXCEPTION 'No pude ampliar chk_lead_status (definición inesperada): %', def;
    END IF;
    EXECUTE 'ALTER TABLE service_leads DROP CONSTRAINT chk_lead_status';
    EXECUTE 'ALTER TABLE service_leads ADD CONSTRAINT chk_lead_status ' || nuevo;
  END IF;
END $$;

COMMIT;
