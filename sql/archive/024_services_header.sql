-- ============================================
-- RetoPA — Migración 024: Header sección Servicios
-- Sprint 7: Encabezado editable desde Admin
-- ============================================

INSERT INTO site_config (key, value) VALUES
    ('services_label',    'Soluciones'),
    ('services_title',    'Hacé crecer tu negocio'),
    ('services_desc',     'No solo aparecés en el directorio. Te damos las herramientas digitales para que tu empresa **venda más, atienda mejor y destaque**.')
ON CONFLICT (key) DO NOTHING;

SELECT key, value FROM site_config WHERE key LIKE 'services_%';
