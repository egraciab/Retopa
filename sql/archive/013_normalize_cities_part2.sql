-- ============================================
-- RETOPA — Normalizar ciudades (parte 2)
-- Nombres del MIC que difieren del nombre oficial
-- ============================================

BEGIN;

-- Caacupé
UPDATE businesses SET city = 'Caacupé' WHERE city = 'Caacupe';

-- Capiibary (el MIC dice Capiivary con doble v)
UPDATE businesses SET city = 'Capiibary' WHERE city = 'Capiivary';

-- Capitán Bado
UPDATE businesses SET city = 'Capitán Bado' WHERE city = 'Capitan Bado';

-- Carmen del Paraná
UPDATE businesses SET city = 'Carmen del Paraná' WHERE city = 'Carmen Del Parana';
UPDATE businesses SET city = 'Carmen del Paraná' WHERE city = 'Carmen Del Paraná';

-- Curuguaty (el MIC usa el nombre completo del distrito)
UPDATE businesses SET city = 'Curuguaty' WHERE city = 'Villa San Isidro Curuguaty';

-- Julián Augusto Saldívar (el 011 puso J. Augusto Saldívar)
UPDATE businesses SET city = 'J. Augusto Saldívar' WHERE city = 'J. Augusto Saldivar';
UPDATE cities SET name = 'J. Augusto Saldívar' WHERE name IN ('Julián Augusto Saldívar', 'Julian Augusto Saldivar');

-- Mbocayaty del Guairá
UPDATE businesses SET city = 'Mbocayaty del Guairá' WHERE city IN ('Mbocayaty Del Guaira', 'Mbocayaty Del Guairá', 'Mbocayaty');
UPDATE cities SET name = 'Mbocayaty del Guairá' WHERE name IN ('Mbocayaty', 'Mbocayaty Del Guaira');

-- San Pedro del Ycuamandiyú
UPDATE businesses SET city = 'San Pedro del Ycuamandiyú'
    WHERE city IN ('San Pedro Del Ycuamandyju', 'San Pedro Del Ycuamandiyú', 'San Pedro Del Parana');
UPDATE cities SET name = 'San Pedro del Ycuamandiyú'
    WHERE name IN ('San Pedro de Ycuamandiyú', 'San Pedro Del Ycuamandyju', 'San Pedro');

-- Yabebyry (el MIC escribe Yavevyry)
UPDATE businesses SET city = 'Yabebyry' WHERE city IN ('Yavevyry', 'Yabebiry');

-- Atyrá
UPDATE businesses SET city = 'Atyrá' WHERE city = 'Atyra';

-- Otros que pueden estar mal
UPDATE businesses SET city = 'San Pedro del Paraná' WHERE city = 'San Pedro Del Parana';

COMMIT;

-- Verificar las ciudades que antes tenían 0 y ahora deberían tener empresas
SELECT c.name, COUNT(b.id) as empresas
FROM cities c
LEFT JOIN businesses b ON unaccent(lower(b.city)) = unaccent(lower(c.name))
    AND b.is_active = TRUE
WHERE c.name IN (
    'Atyrá', 'Caacupé', 'Capiibary', 'Capitán Bado',
    'Carmen del Paraná', 'Curuguaty', 'J. Augusto Saldívar',
    'Mbocayaty del Guairá', 'San Pedro del Ycuamandiyú', 'Yabebyry'
)
GROUP BY c.name
ORDER BY c.name;
