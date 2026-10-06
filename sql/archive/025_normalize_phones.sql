-- RetoPA S4.5 — Normalizar teléfonos paraguayos a formato +595XXXXXXXXX
-- Aplica solo a números que empiecen con 0 o sin código de país
-- Preserva números con código de país distinto (+54, +55, etc.)

BEGIN;

-- Función auxiliar de normalización
CREATE OR REPLACE FUNCTION normalize_phone_py(raw TEXT)
RETURNS TEXT AS $$
DECLARE
    digits TEXT;
BEGIN
    IF raw IS NULL OR TRIM(raw) = '' THEN RETURN NULL; END IF;

    -- Limpiar: solo dígitos y el + inicial
    digits := regexp_replace(TRIM(raw), '[^0-9+]', '', 'g');

    -- Ya tiene código de país correcto → devolver normalizado con +
    IF digits LIKE '+595%' THEN
        RETURN '+' || regexp_replace(digits, '[^0-9]', '', 'g');
    END IF;

    -- Solo dígitos desde acá
    digits := regexp_replace(digits, '[^0-9]', '', 'g');

    -- Tiene otro código de país (no 595) → devolver sin tocar
    IF LENGTH(digits) >= 11 AND digits NOT LIKE '595%' AND digits NOT LIKE '0%' THEN
        RETURN raw; -- preservar original
    END IF;

    -- Empieza con 595 → agregar +
    IF digits LIKE '595%' THEN
        RETURN '+' || digits;
    END IF;

    -- Empieza con 0 (ej: 0981123456) → quitar 0, agregar +595
    IF digits LIKE '0%' THEN
        RETURN '+595' || SUBSTRING(digits FROM 2);
    END IF;

    -- Sin código (ej: 981123456, 9 dígitos) → agregar +595
    IF LENGTH(digits) BETWEEN 8 AND 10 THEN
        RETURN '+595' || digits;
    END IF;

    -- Cualquier otro caso → devolver original
    RETURN raw;
END;
$$ LANGUAGE plpgsql;

-- Preview antes de actualizar (ver cuántos cambian)
SELECT
    COUNT(*) FILTER (WHERE phone != normalize_phone_py(phone)) AS phones_to_update,
    COUNT(*) FILTER (WHERE whatsapp != normalize_phone_py(whatsapp)) AS whatsapp_to_update,
    COUNT(*) AS total
FROM businesses WHERE is_active = TRUE;

-- Actualizar phone
UPDATE businesses
SET phone = normalize_phone_py(phone), updated_at = NOW()
WHERE phone IS NOT NULL
  AND TRIM(phone) != ''
  AND phone != normalize_phone_py(phone);

-- Actualizar whatsapp
UPDATE businesses
SET whatsapp = normalize_phone_py(whatsapp), updated_at = NOW()
WHERE whatsapp IS NOT NULL
  AND TRIM(whatsapp) != ''
  AND whatsapp != normalize_phone_py(whatsapp);

-- Estadísticas del resultado
SELECT
    COUNT(*) FILTER (WHERE phone LIKE '+595%') AS phones_normalized,
    COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone NOT LIKE '+595%') AS phones_other,
    COUNT(*) FILTER (WHERE phone IS NULL) AS phones_null
FROM businesses WHERE is_active = TRUE;

COMMIT;
