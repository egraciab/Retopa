-- ============================================
-- RETOPA DIRECTORY v2.2 - FIXED
-- Fix: URLs de imagen estables para seed data
-- ============================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Limpiar si existen (para desarrollo/evolutivo)
DROP TABLE IF EXISTS user_businesses CASCADE;
DROP TABLE IF EXISTS service_leads CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS businesses CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Categorías
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    color VARCHAR(20),
    bg_color VARCHAR(20),
    display_order INT DEFAULT 0,
    business_count INT DEFAULT 0,
    search_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Empresas
CREATE TABLE businesses (
    id SERIAL PRIMARY KEY,
    ruc VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE,
    category_id INT REFERENCES categories(id),
    description TEXT,
    address TEXT,
    city VARCHAR(100),
    department VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(100),
    website VARCHAR(200),
    logo_emoji VARCHAR(10) DEFAULT '💼',
    image_url TEXT,
    rating DECIMAL(2,1) DEFAULT 0,
    review_count INT DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    plan_type VARCHAR(20) DEFAULT 'basic',
    hours TEXT,
    tags TEXT[],
    lat DECIMAL(10,8),
    lng DECIMAL(11,8),
    location GEOGRAPHY(POINT, 4326),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reseñas
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    author_name VARCHAR(100),
    author_email VARCHAR(100),
    rating INT CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    is_approved BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usuarios
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    phone VARCHAR(50),
    role VARCHAR(20) DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vínculo usuario-empresa
CREATE TABLE user_businesses (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    is_owner BOOLEAN DEFAULT TRUE,
    can_edit BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, business_id)
);

-- Leads/Solicitudes
CREATE TABLE service_leads (
    id SERIAL PRIMARY KEY,
    business_id INT REFERENCES businesses(id),
    service_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending',
    contact_name VARCHAR(100),
    contact_email VARCHAR(100),
    contact_phone VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices optimizados
CREATE INDEX idx_businesses_category ON businesses(category_id);
CREATE INDEX idx_businesses_plan ON businesses(plan_type);
CREATE INDEX idx_businesses_verified ON businesses(verified);
CREATE INDEX idx_businesses_location ON businesses USING GIST(location);
CREATE INDEX idx_businesses_city ON businesses(city);
CREATE INDEX idx_businesses_department ON businesses(department);
CREATE INDEX idx_businesses_latlng ON businesses(lat, lng);
CREATE INDEX idx_businesses_name_trgm ON businesses USING gin(name gin_trgm_ops);
CREATE INDEX idx_businesses_desc_trgm ON businesses USING gin(description gin_trgm_ops);
CREATE INDEX idx_businesses_search ON businesses USING gin(to_tsvector('spanish', unaccent(name) || ' ' || COALESCE(unaccent(description), '')));
CREATE INDEX idx_categories_name_trgm ON categories USING gin(name gin_trgm_ops);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON businesses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para recalcular rating promedio
CREATE OR REPLACE FUNCTION recalc_business_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE businesses 
    SET rating = (
        SELECT COALESCE(AVG(rating), 0) 
        FROM reviews 
        WHERE business_id = COALESCE(NEW.business_id, OLD.business_id) 
        AND is_approved = TRUE
    ),
    review_count = (
        SELECT COUNT(*) 
        FROM reviews 
        WHERE business_id = COALESCE(NEW.business_id, OLD.business_id) 
        AND is_approved = TRUE
    )
    WHERE id = COALESCE(NEW.business_id, OLD.business_id);
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_business_rating 
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW EXECUTE FUNCTION recalc_business_rating();

-- ============================================
-- SEED DATA - URLs estables (picsum.photos)
-- ============================================

INSERT INTO categories (slug, name, icon, color, bg_color, display_order, business_count, search_count) VALUES
('restaurantes', 'Restaurantes', 'fa-utensils', 'text-orange-500', 'bg-orange-50', 1, 1240, 3500),
('profesionales', 'Profesionales', 'fa-briefcase', 'text-emerald-500', 'bg-emerald-50', 2, 3850, 5200),
('tecnologia', 'Tecnología', 'fa-laptop-code', 'text-violet-500', 'bg-violet-50', 3, 892, 4100),
('salud', 'Salud', 'fa-heartbeat', 'text-rose-500', 'bg-rose-50', 4, 2156, 2800),
('construccion', 'Construcción', 'fa-hard-hat', 'text-amber-600', 'bg-amber-50', 5, 1534, 1900),
('comercios', 'Comercios', 'fa-shopping-bag', 'text-pink-500', 'bg-pink-50', 6, 4230, 3300),
('educacion', 'Educación', 'fa-graduation-cap', 'text-blue-500', 'bg-blue-50', 7, 678, 1500),
('turismo', 'Turismo', 'fa-plane', 'text-cyan-500', 'bg-cyan-50', 8, 445, 2200),
('automotriz', 'Automotriz', 'fa-car', 'text-red-600', 'bg-red-50', 9, 890, 1700),
('belleza', 'Belleza', 'fa-spa', 'text-fuchsia-500', 'bg-fuchsia-50', 10, 1120, 2600);

INSERT INTO businesses (ruc, name, slug, category_id, description, address, city, department, phone, email, website, logo_emoji, image_url, rating, review_count, verified, plan_type, hours, tags, lat, lng, location) VALUES
('80012345-6', 'Soluciones Digitales PY S.A.', 'soluciones-digitales-py', 3, 'Desarrollo de software a medida, consultoría IT y transformación digital para empresas paraguayas.', 'Av. Mariscal López 1234', 'Asunción', 'Asunción', '(021) 234-567', 'hola@solucionesdigitales.com.py', 'https://www.solucionesdigitales.com.py', '💻', 'https://picsum.photos/seed/tech1/800/400', 4.8, 124, TRUE, 'premium', 'Lun - Vie: 8:00 - 17:00', ARRAY['Software', 'Cloud', 'Consultoría'], -25.2637, -57.5759, 'POINT(-57.5759 -25.2637)'),
('80123456-7', 'Café del Centro', 'cafe-del-centro', 1, 'Cafetería gourmet con ambientes para reuniones de negocios y coworking.', 'Palma 456', 'Asunción', 'Asunción', '(021) 987-654', 'hola@cafedelcentro.com.py', 'https://www.cafedelcentro.com.py', '☕', 'https://picsum.photos/seed/cafe1/800/400', 4.9, 312, TRUE, 'featured', 'Lun - Dom: 7:00 - 22:00', ARRAY['Café', 'Coworking', 'Pastelería'], -25.2800, -57.6333, 'POINT(-57.6333 -25.2800)'),
('80234567-8', 'Estudio Jurídico Pérez & Asociados', 'estudio-juridico-perez', 2, 'Asesoría legal corporativa, civil y penal. Más de 20 años de experiencia.', 'Chile 789', 'Asunción', 'Asunción', '(021) 456-789', 'consultas@perezabogados.com.py', 'https://www.perezabogados.com.py', '⚖️', 'https://picsum.photos/seed/law1/800/400', 4.7, 89, TRUE, 'featured', 'Lun - Vie: 8:00 - 18:00', ARRAY['Derecho Civil', 'Corporativo', 'Laboral'], -25.2900, -57.6400, 'POINT(-57.6400 -25.2900)'),
('80345678-9', 'Clínica San Rafael', 'clinica-san-rafael', 4, 'Centro médico integral con especialidades en cardiología, pediatría y laboratorio.', 'Av. España 2345', 'Asunción', 'Asunción', '(021) 345-678', 'citas@clinicasanrafael.com.py', 'https://www.clinicasanrafael.com.py', '🏥', 'https://picsum.photos/seed/health1/800/400', 4.6, 567, TRUE, 'premium', 'Lun - Sab: 7:00 - 20:00', ARRAY['Cardiología', 'Pediatría', 'Laboratorio'], -25.3000, -57.5500, 'POINT(-57.5500 -25.3000)'),
('80456789-0', 'Constructora Guaraní S.A.', 'constructora-guarani', 5, 'Construcción de edificios residenciales, comerciales e industriales.', 'Ruta Mcal. López Km 15', 'Luque', 'Central', '(021) 567-890', 'obras@constructoraguarani.com.py', 'https://www.constructoraguarani.com.py', '🏗️', 'https://picsum.photos/seed/build1/800/400', 4.5, 78, TRUE, 'basic', 'Lun - Sab: 7:00 - 17:00', ARRAY['Residencial', 'Comercial', 'Obras'], -25.2667, -57.4833, 'POINT(-57.4833 -25.2667)'),
('80567890-1', 'TechStore Paraguay', 'techstore-paraguay', 6, 'Venta de equipos tecnológicos, computadoras, celulares y accesorios.', 'Av. Santa Teresa 890', 'Asunción', 'Asunción', '(021) 678-901', 'ventas@techstore.com.py', 'https://www.techstore.com.py', '📱', 'https://picsum.photos/seed/tech2/800/400', 4.4, 203, FALSE, 'basic', 'Lun - Dom: 9:00 - 21:00', ARRAY['Computadoras', 'Celulares', 'Accesorios'], -25.2700, -57.6200, 'POINT(-57.6200 -25.2700)'),
('80678901-2', 'Academia de Idiomas Global', 'academia-idiomas-global', 7, 'Cursos de inglés, portugués, alemán y español. Métodos innovadores.', 'Av. Aviadores 123', 'Asunción', 'Asunción', '(021) 789-012', 'info@academiaglobal.com.py', 'https://www.academiaglobal.com.py', '📚', 'https://picsum.photos/seed/edu1/800/400', 4.8, 156, TRUE, 'featured', 'Lun - Vie: 7:00 - 21:00', ARRAY['Inglés', 'Portugués', 'Alemán'], -25.2500, -57.5800, 'POINT(-57.5800 -25.2500)'),
('80789012-3', 'Hotel Guaraní', 'hotel-guarani', 8, 'Hotel 4 estrellas en el centro de Asunción. Habitaciones modernas, spa y centro de convenciones.', 'Av. Mcal. López 999', 'Asunción', 'Asunción', '(021) 890-123', 'reservas@hotelguarani.com.py', 'https://www.hotelguarani.com.py', '🏨', 'https://picsum.photos/seed/hotel1/800/400', 4.3, 423, TRUE, 'premium', '24 horas', ARRAY['Hospedaje', 'Restaurante', 'Spa'], -25.2600, -57.5700, 'POINT(-57.5700 -25.2600)');

INSERT INTO reviews (business_id, author_name, author_email, rating, comment, is_approved) VALUES
(1, 'Carlos Martínez', 'carlos@email.com', 5, 'Excelente servicio, muy profesionales y atentos.', TRUE),
(1, 'Ana López', 'ana@email.com', 4, 'Muy buena atención, el resultado final valió la pena.', TRUE),
(2, 'Pedro Giménez', 'pedro@email.com', 5, 'El mejor café de Asunción. Ambiente perfecto.', TRUE),
(2, 'María Rojas', 'maria@email.com', 5, 'La pastelería es increíble. Vuelvo todas las semanas.', TRUE),
(3, 'Juan Benítez', 'juan@email.com', 5, 'Resolvieron mi caso laboral en tiempo récord.', TRUE),
(4, 'Laura Fernández', 'laura@email.com', 4, 'Buena atención médica, aunque a veces hay espera.', TRUE);

-- GodMode user (password: password) - bcrypt hash
INSERT INTO users (email, password_hash, name, role) VALUES 
('admin@hepta.com.py', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'HEPTA Admin', 'godmode');
