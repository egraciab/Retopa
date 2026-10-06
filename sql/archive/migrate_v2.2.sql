-- ============================================
-- RETOPA MIGRACIÓN SUAVE v2.1 → v2.2
-- No borra datos existentes
-- ============================================

-- 1. Verificar extensiones (idempotente)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Agregar columnas faltantes a businesses (si no existen)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'lat') THEN
        ALTER TABLE businesses ADD COLUMN lat DECIMAL(10,8);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'lng') THEN
        ALTER TABLE businesses ADD COLUMN lng DECIMAL(11,8);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'updated_at') THEN
        ALTER TABLE businesses ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- 3. Agregar columnas faltantes a users (si no existen)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'updated_at') THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
        ALTER TABLE users ADD COLUMN phone VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verified') THEN
        ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 4. Agregar columnas faltantes a categories (si no existen)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'search_count') THEN
        ALTER TABLE categories ADD COLUMN search_count INT DEFAULT 0;
    END IF;
END $$;

-- 5. Agregar columnas faltantes a reviews (si no existen)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'author_email') THEN
        ALTER TABLE reviews ADD COLUMN author_email VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'is_approved') THEN
        ALTER TABLE reviews ADD COLUMN is_approved BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

-- 6. Crear tablas nuevas si no existen

-- user_businesses (vínculo usuario-empresa)
CREATE TABLE IF NOT EXISTS user_businesses (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    business_id INT REFERENCES businesses(id) ON DELETE CASCADE,
    is_owner BOOLEAN DEFAULT TRUE,
    can_edit BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, business_id)
);

-- service_leads (si no existe)
CREATE TABLE IF NOT EXISTS service_leads (
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

-- 7. Crear índices faltantes
CREATE INDEX IF NOT EXISTS idx_businesses_latlng ON businesses(lat, lng);
CREATE INDEX IF NOT EXISTS idx_businesses_name_trgm ON businesses USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_businesses_desc_trgm ON businesses USING gin(description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_categories_name_trgm ON categories USING gin(name gin_trgm_ops);

-- 8. Crear triggers si no existen
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para businesses
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_businesses_updated_at') THEN
        CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON businesses
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Trigger para users
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- 9. Función y trigger para recalcular rating
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

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_business_rating') THEN
        CREATE TRIGGER update_business_rating 
            AFTER INSERT OR UPDATE OR DELETE ON reviews
            FOR EACH ROW EXECUTE FUNCTION recalc_business_rating();
    END IF;
END $$;

-- 10. Actualizar URLs de imagen de seed (solo las de Unsplash)
UPDATE businesses SET image_url = 'https://picsum.photos/seed/tech1/800/400' 
WHERE image_url LIKE '%unsplash.com%' AND slug = 'soluciones-digitales-py';

UPDATE businesses SET image_url = 'https://picsum.photos/seed/cafe1/800/400' 
WHERE image_url LIKE '%unsplash.com%' AND slug = 'cafe-del-centro';

UPDATE businesses SET image_url = 'https://picsum.photos/seed/law1/800/400' 
WHERE image_url LIKE '%unsplash.com%' AND slug = 'estudio-juridico-perez';

UPDATE businesses SET image_url = 'https://picsum.photos/seed/health1/800/400' 
WHERE image_url LIKE '%unsplash.com%' AND slug = 'clinica-san-rafael';

UPDATE businesses SET image_url = 'https://picsum.photos/seed/build1/800/400' 
WHERE image_url LIKE '%unsplash.com%' AND slug = 'constructora-guarani';

UPDATE businesses SET image_url = 'https://picsum.photos/seed/tech2/800/400' 
WHERE image_url LIKE '%unsplash.com%' AND slug = 'techstore-paraguay';

UPDATE businesses SET image_url = 'https://picsum.photos/seed/edu1/800/400' 
WHERE image_url LIKE '%unsplash.com%' AND slug = 'academia-idiomas-global';

UPDATE businesses SET image_url = 'https://picsum.photos/seed/hotel1/800/400' 
WHERE image_url LIKE '%unsplash.com%' AND slug = 'hotel-guarani';

-- 11. Actualizar lat/lng de seed si son NULL
UPDATE businesses SET lat = -25.2637, lng = -57.5759 WHERE slug = 'soluciones-digitales-py' AND lat IS NULL;
UPDATE businesses SET lat = -25.2800, lng = -57.6333 WHERE slug = 'cafe-del-centro' AND lat IS NULL;
UPDATE businesses SET lat = -25.2900, lng = -57.6400 WHERE slug = 'estudio-juridico-perez' AND lat IS NULL;
UPDATE businesses SET lat = -25.3000, lng = -57.5500 WHERE slug = 'clinica-san-rafael' AND lat IS NULL;
UPDATE businesses SET lat = -25.2667, lng = -57.4833 WHERE slug = 'constructora-guarani' AND lat IS NULL;
UPDATE businesses SET lat = -25.2700, lng = -57.6200 WHERE slug = 'techstore-paraguay' AND lat IS NULL;
UPDATE businesses SET lat = -25.2500, lng = -57.5800 WHERE slug = 'academia-idiomas-global' AND lat IS NULL;
UPDATE businesses SET lat = -25.2600, lng = -57.5700 WHERE slug = 'hotel-guarani' AND lat IS NULL;

-- 12. Asegurar que GodMode user exista (no sobreescribe si ya existe)
INSERT INTO users (email, password_hash, name, role) 
VALUES ('admin@hepta.com.py', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'HEPTA Admin', 'godmode')
ON CONFLICT (email) DO NOTHING;

-- 13. Verificar migración
SELECT 'Migración completada exitosamente' as status;
