-- ============================================
-- RETOPA — Formatear RUC con guión
-- Paraguay: últimos dígito va separado por '-'
-- Ej: 800190947 → 80019094-7
-- ============================================

-- Ver cuántos necesitan formateo
SELECT COUNT(*) as sin_formato FROM businesses WHERE ruc NOT LIKE '%-%' AND ruc != '';

-- Aplicar formato: insertar '-' antes del último dígito
UPDATE businesses
SET ruc = LEFT(ruc, LENGTH(ruc) - 1) || '-' || RIGHT(ruc, 1)
WHERE ruc NOT LIKE '%-%'
  AND ruc != ''
  AND ruc IS NOT NULL
  AND LENGTH(ruc) >= 2
  AND ruc ~ '^[0-9]+$';  -- solo si es numérico puro

-- Verificar resultado
SELECT
    COUNT(*) FILTER (WHERE ruc LIKE '%-%') as con_formato,
    COUNT(*) FILTER (WHERE ruc NOT LIKE '%-%' AND ruc != '') as sin_formato,
    COUNT(*) as total
FROM businesses;
