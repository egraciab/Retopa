-- ============================================
-- RetoPA — Migración 023b: CTA en Servicios
-- Agrega cta_text y cta_url a la tabla services
-- ============================================

ALTER TABLE services
    ADD COLUMN IF NOT EXISTS cta_text VARCHAR(100) DEFAULT 'Más información',
    ADD COLUMN IF NOT EXISTS cta_url  VARCHAR(500);

-- Actualizar seed con CTAs de ejemplo
UPDATE services SET cta_text = 'Quiero mi sitio web', cta_url = '/contacto?servicio=web'       WHERE title ILIKE '%Sitio Web%';
UPDATE services SET cta_text = 'Quiero el CRM',       cta_url = '/contacto?servicio=crm'       WHERE title ILIKE '%CRM%';
UPDATE services SET cta_text = 'Quiero el ERP',       cta_url = '/contacto?servicio=erp'       WHERE title ILIKE '%ERP%';
UPDATE services SET cta_text = 'Quiero mi email',     cta_url = '/contacto?servicio=email'     WHERE title ILIKE '%Email%';

SELECT id, title, cta_text, cta_url FROM services ORDER BY display_order;
