-- ============================================
-- RetoPA — Migración 023: Tabla de Servicios
-- Sprint 6: CRUD de Servicios desde Admin
-- ============================================

CREATE TABLE IF NOT EXISTS services (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(100)  NOT NULL,
    description  TEXT,
    icon         VARCHAR(50)   DEFAULT 'fa-star',
    icon_color   VARCHAR(20)   DEFAULT 'text-brand-600',
    icon_bg      VARCHAR(20)   DEFAULT 'bg-brand-100',
    features     JSONB         DEFAULT '[]',
    display_order INT          DEFAULT 0,
    is_active    BOOLEAN       DEFAULT TRUE,
    created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_services_updated_at
    BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed con los 4 servicios actuales
INSERT INTO services (title, description, icon, icon_color, icon_bg, features, display_order) VALUES
(
    'Sitio Web Profesional',
    'Tu empresa en internet con diseño moderno, responsive y optimizado para Google.',
    'fa-globe', 'text-brand-600', 'bg-brand-100',
    '["Dominio propio","Hosting incluido","SEO básico"]',
    1
),
(
    'CRM Inteligente',
    'Gestión de clientes, seguimiento de leads, recordatorios automáticos y reportes.',
    'fa-users-cog', 'text-purple-600', 'bg-purple-100',
    '["Pipeline de ventas","Automatizaciones","App móvil"]',
    2
),
(
    'ERP Completo',
    'Facturación electrónica, inventario, compras, contabilidad y reportes en un solo lugar.',
    'fa-chart-line', 'text-green-600', 'bg-green-100',
    '["Facturación SIFEN","Control de stock","Reportes tributarios"]',
    3
),
(
    'Email Empresarial',
    'Correos @tunegocio.com.py con almacenamiento, calendario y sincronización.',
    'fa-envelope', 'text-yellow-600', 'bg-yellow-100',
    '["10 GB por cuenta","Anti-spam","Webmail + apps"]',
    4
)
ON CONFLICT DO NOTHING;

SELECT 'Tabla services creada con ' || COUNT(*) || ' servicios' AS status FROM services;
