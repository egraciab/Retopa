-- ============================================
-- RETOPA — Tabla de Planes (gestionable desde admin)
-- ============================================

CREATE TABLE IF NOT EXISTS plans (
    id VARCHAR(20) PRIMARY KEY,          -- 'basic', 'featured', 'premium'
    name VARCHAR(100) NOT NULL,
    subtitle VARCHAR(200),
    price INTEGER NOT NULL DEFAULT 0,    -- en Guaraníes
    features JSONB NOT NULL DEFAULT '[]',
    is_featured BOOLEAN DEFAULT FALSE,   -- resaltado como "más popular"
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    button_label VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed con los planes actuales del sitio
INSERT INTO plans (id, name, subtitle, price, features, is_featured, display_order, button_label) VALUES
(
    'basic',
    'Ficha Básica',
    'Para empezar a aparecer',
    0,
    '["Ficha en el directorio","Datos de contacto","1 categoría","Sin sitio web","Sin CRM ni ERP","Posición estándar"]',
    FALSE, 1,
    'Registrar gratis'
),
(
    'featured',
    'Negocio Digital',
    'Todo lo que necesitás para vender',
    299000,
    '["Ficha destacada","Sitio web profesional","CRM básico (50 clientes)","Email empresarial (2 cuentas)","Badge Destacado dorado","Prioridad en búsquedas"]',
    TRUE, 2,
    'Empezar ahora'
),
(
    'premium',
    'Empresa Pro',
    'Suite completa sin límites',
    599000,
    '["Todo lo de Negocio Digital","ERP completo (facturación SIFEN)","CRM ilimitado","Email empresarial (10 cuentas)","Posición TOP en búsquedas","Soporte prioritario 24/7"]',
    FALSE, 3,
    'Contactar ventas'
)
ON CONFLICT (id) DO NOTHING;

-- Trigger updated_at
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

SELECT 'Tabla plans creada con ' || COUNT(*) || ' planes' as status FROM plans;
