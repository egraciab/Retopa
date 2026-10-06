-- ============================================
-- RetoPA — Migración 025: Hero + Planes header + Footer config
-- Sprint 8: Secciones editables desde Panel Admin
-- ============================================

INSERT INTO site_config (key, value) VALUES
-- Hero
('hero_title',        'Todo el Paraguay'),
('hero_subtitle',     'en un solo lugar'),
('hero_description',  'Encontrá empresas, negocios y profesionales por **RUC**, categoría, nombre o ubicación. Y si tenés un negocio, **hacelo crecer** con nuestros servicios digitales.'),
('hero_cta_text',     'Registrar mi empresa'),
('hero_cta_link',     '#registro'),
('hero_bg_from',      '#0f2554'),
('hero_bg_to',        '#1B3A6B'),
-- Planes header
('plans_label',       'Precios'),
('plans_title',       'Planes para cada negocio'),
('plans_desc',        'Desde la ficha básica hasta la presencia digital completa. **Sin contratos**, cancelá cuando quieras.'),
-- Footer col 1
('footer_tagline',    'El directorio empresarial más completo de Paraguay.'),
('footer_copyright',  '© 2026 HEPTA GROUP. Todos los derechos reservados.'),
-- Footer col 2
('footer_col2_title', 'Directorio'),
('footer_col2_links', '[{"label":"Buscar empresas","url":"#directorio"},{"label":"Categorías","url":"#categorias"},{"label":"Registrar empresa","url":"#registro"}]'),
-- Footer col 3
('footer_col3_title', 'Servicios'),
('footer_col3_links', '[{"label":"Sitios Web","url":"#"},{"label":"CRM","url":"#"},{"label":"ERP","url":"#"},{"label":"Email Empresarial","url":"#"}]'),
-- Footer col 4
('footer_col4_title', 'Empresa'),
('footer_col4_links', '[{"label":"HEPTA GROUP","url":"https://www.hepta.com.py/"},{"label":"Planes y precios","url":"#planes"},{"label":"Contacto","url":"#contacto"}]')
ON CONFLICT (key) DO NOTHING;

SELECT key FROM site_config WHERE key LIKE 'hero_%' OR key LIKE 'plans_%' OR key LIKE 'footer_%' ORDER BY key;
