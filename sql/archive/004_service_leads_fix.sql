-- ============================================
-- RETOPA - Fix service_leads columnas faltantes
-- Agrega business_name y updated_at que el backend usa
-- ============================================

-- Agregar business_name si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'service_leads' AND column_name = 'business_name'
    ) THEN
        ALTER TABLE service_leads ADD COLUMN business_name VARCHAR(200);
    END IF;
END $$;

-- Agregar updated_at si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'service_leads' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE service_leads ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Agregar cover_url a businesses (portada/banner)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'businesses' AND column_name = 'cover_url'
    ) THEN
        ALTER TABLE businesses ADD COLUMN cover_url TEXT;
    END IF;
END $$;

-- Actualizar business_name con datos de businesses existentes donde esté vacío
UPDATE service_leads sl
SET business_name = b.name
FROM businesses b
WHERE sl.business_id = b.id
  AND (sl.business_name IS NULL OR sl.business_name = '');

-- Índices para service_leads
CREATE INDEX IF NOT EXISTS idx_service_leads_business_name ON service_leads(business_name);
CREATE INDEX IF NOT EXISTS idx_service_leads_status ON service_leads(status);
CREATE INDEX IF NOT EXISTS idx_service_leads_business_id ON service_leads(business_id);

SELECT 'Fix service_leads + cover_url completado' as status;
