-- ============================================
-- RETOPA — Normalizar tabla cities para que
-- coincida con los nombres en businesses
-- ============================================

UPDATE cities SET name = 'Asunción'            WHERE name IN ('Asuncion', 'ASUNCION');
UPDATE cities SET name = 'Fernando de la Mora' WHERE name IN ('Fernando De La Mora', 'Fernando de la mora');
UPDATE cities SET name = 'Lambaré'             WHERE name IN ('Lambare', 'LAMBARE');
UPDATE cities SET name = 'Capiatá'             WHERE name IN ('Capiata', 'CAPIATA');
UPDATE cities SET name = 'Mariano Roque Alonso' WHERE name IN ('Mariano R. Alonso', 'Mariano Roque Alonso');
UPDATE cities SET name = 'Ñemby'              WHERE name IN ('Nemby', 'NEMBY');
UPDATE cities SET name = 'Areguá'             WHERE name IN ('Aregua', 'AREGUA');
UPDATE cities SET name = 'Itauguá'            WHERE name IN ('Itaugua', 'Itagua', 'ITAUGUA');
UPDATE cities SET name = 'Guarambaré'         WHERE name IN ('Guarambare', 'GUARAMBARE');
UPDATE cities SET name = 'Ypané'              WHERE name IN ('Ypane', 'YPANE');
UPDATE cities SET name = 'Ciudad del Este'    WHERE name IN ('Ciudad Del Este', 'CIUDAD DEL ESTE');
UPDATE cities SET name = 'Minga Guazú'        WHERE name IN ('Minga Guazu', 'MINGA GUAZU');
UPDATE cities SET name = 'Encarnación'        WHERE name IN ('Encarnacion', 'ENCARNACION');
UPDATE cities SET name = 'Concepción'         WHERE name IN ('Concepcion', 'CONCEPCION');
UPDATE cities SET name = 'Caaguazú'           WHERE name IN ('Caaguazu', 'CAAGUAZU');
UPDATE cities SET name = 'Paraguarí'          WHERE name IN ('Paraguari', 'PARAGUARI');
UPDATE cities SET name = 'Pedro Juan Caballero' WHERE name IN ('Pedro J. Caballero', 'Pedro J.  Caballero');
UPDATE cities SET name = 'Salto del Guairá'   WHERE name IN ('Salto Del Guaira', 'Salto Del Guairá');
UPDATE cities SET name = 'Caazapá'            WHERE name IN ('Caazapa', 'CAAZAPA');
UPDATE cities SET name = 'Benjamín Aceval'    WHERE name IN ('Benjamin Aceval');
UPDATE cities SET name = 'Belén'              WHERE name IN ('Belen', 'BELEN');
UPDATE cities SET name = 'Tobatí'             WHERE name IN ('Tobati', 'TOBATI');
UPDATE cities SET name = 'Carapeguá'          WHERE name IN ('Carapegua', 'CARAPEGUA');
UPDATE cities SET name = 'Coronel Oviedo'     WHERE name IN ('Coronel oviedo');
UPDATE cities SET name = 'Itá'                WHERE name = 'Ita';
UPDATE cities SET name = 'Quiindý'            WHERE name = 'Quiindy';
UPDATE cities SET name = 'J. Augusto Saldívar' WHERE name = 'J. Augusto Saldivar';
UPDATE cities SET name = 'San Cosme y Damián' WHERE name = 'San Cosme Y Damian';
UPDATE cities SET name = 'Pirajú'             WHERE name = 'Piraju';

-- Actualizar slugs para que coincidan
UPDATE cities SET slug = lower(regexp_replace(
    translate(name, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU'),
    '[^a-z0-9]+', '-', 'g'
)) WHERE slug != lower(regexp_replace(
    translate(name, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU'),
    '[^a-z0-9]+', '-', 'g'
));

SELECT 'Ciudades normalizadas: ' || COUNT(*) FROM cities;
