
-- ============================================
-- RETOPA CITIES v2.2
-- ============================================

-- Tabla de ciudades
CREATE TABLE IF NOT EXISTS cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    lat DECIMAL(10,8),
    lng DECIMAL(11,8),
    is_active BOOLEAN DEFAULT TRUE,
    search_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cities_department ON cities(department);
CREATE INDEX IF NOT EXISTS idx_cities_name_trgm ON cities USING gin(name gin_trgm_ops);

-- SEED DATA - Ciudades de Paraguay
-- Central (todas las ciudades)
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
('Julián Augusto Saldívar', 'Central', 'julian-augusto-saldivar', -25.4200, -57.4500);

-- Alto Paraná (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Ciudad del Este', 'Alto Paraná', 'ciudad-del-este', -25.5167, -54.6167),
('Presidente Franco', 'Alto Paraná', 'presidente-franco', -25.5333, -54.6167),
('Minga Guazú', 'Alto Paraná', 'minga-guazu', -25.5667, -54.7500),
('Hernandarias', 'Alto Paraná', 'hernandarias', -25.4167, -54.6333);

-- Itapúa (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Encarnación', 'Itapúa', 'encarnacion', -27.3300, -55.8800),
('Coronel Bogado', 'Itapúa', 'coronel-bogado', -27.1667, -56.2500),
('Carmen del Paraná', 'Itapúa', 'carmen-del-parana', -27.2333, -55.9500),
('Obligado', 'Itapúa', 'obligado', -27.3500, -55.6500);

-- Cordillera (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Caacupé', 'Cordillera', 'caacupe', -25.3833, -57.1333),
('Atyrá', 'Cordillera', 'atyra', -25.2833, -57.1667),
('San Bernardino', 'Cordillera', 'san-bernardino', -25.3000, -57.3000),
('Altos', 'Cordillera', 'altos', -25.2500, -57.2500);

-- Concepción (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Concepción', 'Concepción', 'concepcion', -23.4000, -57.4333),
('Horqueta', 'Concepción', 'horqueta', -23.3500, -57.0500),
('Loreto', 'Concepción', 'loreto', -23.2667, -57.1833);

-- Guairá (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Villarrica', 'Guairá', 'villarrica', -25.7500, -56.4333),
('Mbocayaty', 'Guairá', 'mbocayaty', -25.7167, -56.4667);

-- Caaguazú (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Coronel Oviedo', 'Caaguazú', 'coronel-oviedo', -25.4500, -56.4333),
('Caaguazú', 'Caaguazú', 'caaguazu', -25.3833, -56.0000),
('Doctor Juan Manuel Frutos', 'Caaguazú', 'doctor-juan-manuel-frutos', -25.3833, -55.8833);

-- San Pedro (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('San Pedro de Ycuamandiyú', 'San Pedro', 'san-pedro-de-ycuamandiyu', -24.1000, -57.0833),
('San Estanislao', 'San Pedro', 'san-estanislao', -24.9167, -56.4333),
('Capiibary', 'San Pedro', 'capiibary', -24.8000, -56.0333);

-- Misiones (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('San Ignacio', 'Misiones', 'san-ignacio', -26.8833, -57.1333),
('Santa Rosa', 'Misiones', 'santa-rosa', -26.8833, -55.5333),
('Ayolas', 'Misiones', 'ayolas', -27.4000, -56.8333),
('Yabebyry', 'Misiones', 'yabebyry', -27.3667, -57.2833);

-- Ñeembucú (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Pilar', 'Ñeembucú', 'pilar', -26.8667, -58.3000),
('Alberdi', 'Ñeembucú', 'alberdi', -26.1833, -58.1333);

-- Amambay (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Pedro Juan Caballero', 'Amambay', 'pedro-juan-caballero', -22.5333, -55.7500),
('Capitán Bado', 'Amambay', 'capitan-bado', -23.2667, -55.5333);

-- Canindeyú (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Salto del Guairá', 'Canindeyú', 'salto-del-guaira', -24.0667, -54.3000),
('Curuguaty', 'Canindeyú', 'curuguaty', -23.2000, -55.6833);

-- Presidente Hayes (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Villa Hayes', 'Presidente Hayes', 'villa-hayes', -25.1000, -57.5667),
('Benjamín Aceval', 'Presidente Hayes', 'benjamin-aceval', -24.9667, -57.5667);

-- Boquerón (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Filadelfia', 'Boquerón', 'filadelfia', -22.3500, -60.0333),
('Mariscal Estigarribia', 'Boquerón', 'mariscal-estigarribia', -22.0333, -60.6167);

-- Alto Paraguay (emblemáticos)
INSERT INTO cities (name, department, slug, lat, lng) VALUES
('Fuerte Olimpo', 'Alto Paraguay', 'fuerte-olimpo', -21.0333, -57.8667);

-- Actualizar businesses para usar city_id (opcional, para futuro)
-- ALTER TABLE businesses ADD COLUMN IF NOT EXISTS city_id INT REFERENCES cities(id);
