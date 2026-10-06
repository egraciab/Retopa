-- ============================================
-- RETOPA — Nombre Comercial + Delegación
-- ============================================

-- 1. Agregar nombre comercial a businesses
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name='businesses' AND column_name='trade_name')
    THEN
        ALTER TABLE businesses ADD COLUMN trade_name VARCHAR(255);
        COMMENT ON COLUMN businesses.trade_name IS 'Nombre comercial / Marca (lo que ve el público)';
        COMMENT ON COLUMN businesses.name IS 'Razón Social o nombre legal completo';
    END IF;
END $$;

-- Para las empresas existentes, copiar name como trade_name si no tienen
-- (se puede ajustar manualmente después)
UPDATE businesses SET trade_name = name WHERE trade_name IS NULL;

-- 2. Mejorar tabla user_businesses con más info de delegación
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name='user_businesses' AND column_name='delegated_at')
    THEN
        ALTER TABLE user_businesses ADD COLUMN delegated_at TIMESTAMP DEFAULT NOW();
        ALTER TABLE user_businesses ADD COLUMN delegated_by INTEGER REFERENCES users(id);
        ALTER TABLE user_businesses ADD COLUMN notes TEXT;
    END IF;
END $$;

SELECT
    'trade_name agregado a ' || COUNT(*) || ' empresas' AS status
FROM businesses WHERE trade_name IS NOT NULL;
