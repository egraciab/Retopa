-- ============================================
-- RETOPA — Likes de empresas + campo claim en leads
-- ============================================

-- Tabla de likes: un usuario/IP = un like por empresa
CREATE TABLE IF NOT EXISTS business_likes (
    id           SERIAL PRIMARY KEY,
    business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip_hash      VARCHAR(64),  -- hash de IP para usuarios anónimos
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(business_id, user_id),          -- un like por usuario logueado
    UNIQUE(business_id, ip_hash)           -- un like por IP anónima
);

CREATE INDEX IF NOT EXISTS idx_likes_business ON business_likes(business_id);
CREATE INDEX IF NOT EXISTS idx_likes_user     ON business_likes(user_id);

-- Columna like_count en businesses para performance (actualizado por trigger)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name='businesses' AND column_name='like_count')
    THEN ALTER TABLE businesses ADD COLUMN like_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Trigger para mantener like_count actualizado
CREATE OR REPLACE FUNCTION update_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE businesses SET like_count = like_count + 1 WHERE id = NEW.business_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE businesses SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.business_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_like_count ON business_likes;
CREATE TRIGGER trigger_like_count
AFTER INSERT OR DELETE ON business_likes
FOR EACH ROW EXECUTE FUNCTION update_like_count();

-- Sincronizar like_count con datos existentes
UPDATE businesses b SET like_count = (
    SELECT COUNT(*) FROM business_likes bl WHERE bl.business_id = b.id
);

-- Agregar tipo 'claim' al campo service_type de leads (ya existe, solo documentamos)
-- service_type puede ser: 'general', 'premium', 'featured', 'claim', 'contact'

SELECT 'business_likes creado con ' || COUNT(*) || ' registros' AS status FROM business_likes;
