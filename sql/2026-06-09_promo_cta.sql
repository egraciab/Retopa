-- ============================================================
-- RetoPA — CTA personalizado en promociones (solo plan Pro)
-- ------------------------------------------------------------
-- Agrega un botón opcional configurable por el cliente:
--   cta_label → texto del botón (ej: "Comprar ahora")
--   cta_url   → enlace destino
-- Convive con el botón de WhatsApp en el drawer público.
-- Idempotente: seguro de correr en producción.
-- ============================================================
BEGIN;

ALTER TABLE promotions
    ADD COLUMN IF NOT EXISTS cta_label VARCHAR(40),
    ADD COLUMN IF NOT EXISTS cta_url   VARCHAR(500);

COMMIT;

SELECT 'CTA promo OK — columnas: ' ||
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='promotions' AND column_name IN ('cta_label','cta_url')) || '/2' AS status;
