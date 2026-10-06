-- Cinta/etiqueta de texto libre para las tarjetas de planes (Oferta!, Nuevo, etc.)
ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS ribbon VARCHAR(30) DEFAULT NULL;

-- Nota: el orden de las tarjetas usa la columna display_order ya existente.
