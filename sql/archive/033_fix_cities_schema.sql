-- ============================================================
-- RetoPA — FIX 033: Reparar esquema de tabla `cities`
-- ------------------------------------------------------------
-- PROBLEMA: 001_init.sql crea cities(id,name,department,country)
-- SIN slug/lat/lng. Luego 004_cities.sql usa CREATE TABLE IF NOT
-- EXISTS (no-op porque ya existe) y todos sus INSERT con slug/lat/lng
-- fallan en instalación limpia → directorio sin ciudades ni geo.
--
-- Este fix es IDEMPOTENTE: seguro de correr en producción.
-- No borra datos; solo agrega columnas faltantes y completa el seed.
-- ============================================================
BEGIN;

-- 1. Agregar columnas faltantes (no-op si ya existen)
ALTER TABLE cities
    ADD COLUMN IF NOT EXISTS slug         VARCHAR(100),
    ADD COLUMN IF NOT EXISTS lat          DECIMAL(10,8),
    ADD COLUMN IF NOT EXISTS lng          DECIMAL(11,8),
    ADD COLUMN IF NOT EXISTS is_active    BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS search_count INT     DEFAULT 0;

-- 2. Índice único sobre slug (total, para que ON CONFLICT (slug) lo use como árbitro)
--    Nota: un índice PARCIAL (WHERE slug IS NOT NULL) NO sirve como árbitro de ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS cities_slug_key ON cities(slug);

-- 3. Seed idempotente de ciudades de Paraguay (del 004_cities.sql original)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Asunción', 'Asunción', 'asuncion', -25.2637, -57.5759),
('Luque', 'Central', 'luque', -25.2700, -57.4833),
('San Lorenzo', 'Central', 'san-lorenzo', -25.3400, -57.5200),
('Fernando de la Mora', 'Central', 'fernando-de-la-mora', -25.3200, -57.5800),
('Lambaré', 'Central', 'lambaré', -25.3400, -57.6200),
('Capiatá', 'Central', 'capiata', -25.3500, -57.4200),
('Areguá', 'Central', 'aregua', -25.3000, -57.4200),
('Itauguá', 'Central', 'itaugua', -25.3800, -57.3300),
('Mariano Roque Alonso', 'Central', 'mariano-roque-alonso', -25.2200, -57.5300),
('Limpio', 'Central', 'limpio', -25.1600, -57.5800),
('Nemby', 'Central', 'nemby', -25.3900, -57.5400),
('Villa Elisa', 'Central', 'villa-elisa', -25.3700, -57.5700),
('Itá', 'Central', 'ita', -25.4000, -57.4200),
('Ypané', 'Central', 'ypane', -25.4500, -57.5200),
('Guarambaré', 'Central', 'guarambare', -25.4800, -57.4700),
('Ñemby', 'Central', 'nemby-2', -25.3900, -57.5400),
('Julián Augusto Saldívar', 'Central', 'julian-augusto-saldivar', -25.4200, -57.4500)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Ciudad del Este', 'Alto Paraná', 'ciudad-del-este', -25.5167, -54.6167),
('Presidente Franco', 'Alto Paraná', 'presidente-franco', -25.5333, -54.6167),
('Minga Guazú', 'Alto Paraná', 'minga-guazu', -25.5667, -54.7500),
('Hernandarias', 'Alto Paraná', 'hernandarias', -25.4167, -54.6333)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Encarnación', 'Itapúa', 'encarnacion', -27.3300, -55.8800),
('Coronel Bogado', 'Itapúa', 'coronel-bogado', -27.1667, -56.2500),
('Carmen del Paraná', 'Itapúa', 'carmen-del-parana', -27.2333, -55.9500),
('Obligado', 'Itapúa', 'obligado', -27.3500, -55.6500)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Caacupé', 'Cordillera', 'caacupe', -25.3833, -57.1333),
('Atyrá', 'Cordillera', 'atyra', -25.2833, -57.1667),
('San Bernardino', 'Cordillera', 'san-bernardino', -25.3000, -57.3000),
('Altos', 'Cordillera', 'altos', -25.2500, -57.2500)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Concepción', 'Concepción', 'concepcion', -23.4000, -57.4333),
('Horqueta', 'Concepción', 'horqueta', -23.3500, -57.0500),
('Loreto', 'Concepción', 'loreto', -23.2667, -57.1833)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Villarrica', 'Guairá', 'villarrica', -25.7500, -56.4333),
('Mbocayaty', 'Guairá', 'mbocayaty', -25.7167, -56.4667)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Coronel Oviedo', 'Caaguazú', 'coronel-oviedo', -25.4500, -56.4333),
('Caaguazú', 'Caaguazú', 'caaguazu', -25.3833, -56.0000),
('Doctor Juan Manuel Frutos', 'Caaguazú', 'doctor-juan-manuel-frutos', -25.3833, -55.8833)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('San Pedro de Ycuamandiyú', 'San Pedro', 'san-pedro-de-ycuamandiyu', -24.1000, -57.0833),
('San Estanislao', 'San Pedro', 'san-estanislao', -24.9167, -56.4333),
('Capiibary', 'San Pedro', 'capiibary', -24.8000, -56.0333)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('San Ignacio', 'Misiones', 'san-ignacio', -26.8833, -57.1333),
('Santa Rosa', 'Misiones', 'santa-rosa', -26.8833, -55.5333),
('Ayolas', 'Misiones', 'ayolas', -27.4000, -56.8333),
('Yabebyry', 'Misiones', 'yabebyry', -27.3667, -57.2833)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Pilar', 'Ñeembucú', 'pilar', -26.8667, -58.3000),
('Alberdi', 'Ñeembucú', 'alberdi', -26.1833, -58.1333)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Pedro Juan Caballero', 'Amambay', 'pedro-juan-caballero', -22.5333, -55.7500),
('Capitán Bado', 'Amambay', 'capitan-bado', -23.2667, -55.5333)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Salto del Guairá', 'Canindeyú', 'salto-del-guaira', -24.0667, -54.3000),
('Curuguaty', 'Canindeyú', 'curuguaty', -23.2000, -55.6833)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Villa Hayes', 'Presidente Hayes', 'villa-hayes', -25.1000, -57.5667),
('Benjamín Aceval', 'Presidente Hayes', 'benjamin-aceval', -24.9667, -57.5667)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Filadelfia', 'Boquerón', 'filadelfia', -22.3500, -60.0333),
('Mariscal Estigarribia', 'Boquerón', 'mariscal-estigarribia', -22.0333, -60.6167)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Fuerte Olimpo', 'Alto Paraguay', 'fuerte-olimpo', -21.0333, -57.8667)
ON CONFLICT (slug) DO NOTHING;

COMMIT;

SELECT 'Fix 033 OK — cities tiene ' || COUNT(*) || ' ciudades' AS status FROM cities WHERE slug IS NOT NULL;
