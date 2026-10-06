-- ============================================================
-- RetoPA — D3 Kit QR: texto del Kit editable por el dueño (por negocio)
-- ------------------------------------------------------------
-- Override opcional del CTA impreso en el Kit QR. Si es NULL, el kit usa
-- el default global (site_config.qr_kit_cta) o el default hardcodeado.
-- El nombre impreso usa trade_name (nombre comercial), fallback a name.
-- Idempotente.
-- ============================================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS kit_cta VARCHAR(160);

SELECT 'kit_cta listo' AS status;
