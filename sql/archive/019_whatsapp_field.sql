-- ============================================
-- RETOPA — Campo WhatsApp en empresas
-- Separado del teléfono de contacto
-- ============================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(100);

-- Inicializar con el teléfono existente donde no haya whatsapp
UPDATE businesses SET whatsapp = phone WHERE whatsapp IS NULL AND phone IS NOT NULL;

SELECT 'whatsapp column added to ' || COUNT(*) || ' businesses' AS status
FROM businesses WHERE whatsapp IS NOT NULL;
