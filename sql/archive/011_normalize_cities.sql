-- ============================================
-- RETOPA — Normalizar nombres de ciudades
-- Problema: importación desde MIC usó Python .title()
-- que no agrega tildes (Asuncion → Asunción, etc.)
-- ============================================

BEGIN;

-- Asunción y alrededores
UPDATE businesses SET city = 'Asunción'           WHERE city = 'Asuncion';
UPDATE businesses SET city = 'Fernando de la Mora' WHERE city = 'Fernando De La Mora';
UPDATE businesses SET city = 'Lambaré'             WHERE city = 'Lambare';
UPDATE businesses SET city = 'Capiatá'             WHERE city = 'Capiata';
UPDATE businesses SET city = 'Mariano Roque Alonso' WHERE city = 'Mariano R. Alonso';
UPDATE businesses SET city = 'Ñemby'               WHERE city = 'Nemby';
UPDATE businesses SET city = 'Areguá'              WHERE city = 'Aregua';
UPDATE businesses SET city = 'Itauguá'             WHERE city = 'Itaugua';
UPDATE businesses SET city = 'Itauguá'             WHERE city = 'Itagua';
UPDATE businesses SET city = 'J. Augusto Saldívar' WHERE city = 'J. Augusto Saldivar';
UPDATE businesses SET city = 'Guarambaré'          WHERE city = 'Guarambare';
UPDATE businesses SET city = 'Ypané'               WHERE city = 'Ypane';
UPDATE businesses SET city = 'Itá'                 WHERE city = 'Ita';
UPDATE businesses SET city = 'Carapeguá'           WHERE city = 'Carapegua';
UPDATE businesses SET city = 'Tobatí'              WHERE city = 'Tobati';

-- Ciudad del Este y Alto Paraná
UPDATE businesses SET city = 'Ciudad del Este'     WHERE city = 'Ciudad Del Este';
UPDATE businesses SET city = 'Minga Guazú'         WHERE city = 'Minga Guazu';
UPDATE businesses SET city = 'Presidente Franco'   WHERE city = 'Presidente Franco'; -- ya correcto

-- Encarnación e Itapúa
UPDATE businesses SET city = 'Encarnación'         WHERE city = 'Encarnacion';
UPDATE businesses SET city = 'Obligado'            WHERE city = 'Obligado'; -- ya correcto
UPDATE businesses SET city = 'Hohenau'             WHERE city = 'Hohenau'; -- ya correcto
UPDATE businesses SET city = 'San Cosme y Damián'  WHERE city = 'San Cosme Y Damian';

-- Concepción
UPDATE businesses SET city = 'Concepción'          WHERE city = 'Concepcion';
UPDATE businesses SET city = 'Belén'               WHERE city = 'Belen';

-- Caaguazú
UPDATE businesses SET city = 'Caaguazú'            WHERE city = 'Caaguazu';
UPDATE businesses SET city = 'Coronel Oviedo'      WHERE city = 'Coronel Oviedo'; -- ya correcto

-- Paraguarí
UPDATE businesses SET city = 'Paraguarí'           WHERE city = 'Paraguari';
UPDATE businesses SET city = 'Caazapá'             WHERE city = 'Caazapa';
UPDATE businesses SET city = 'Quiindý'             WHERE city = 'Quiindy';
UPDATE businesses SET city = 'Mbuyapey'            WHERE city = 'Mbuyapey'; -- ya correcto

-- Amambay
UPDATE businesses SET city = 'Pedro Juan Caballero' WHERE city = 'Pedro J.  Caballero';
UPDATE businesses SET city = 'Pedro Juan Caballero' WHERE city = 'Pedro J. Caballero';

-- Canindeyú
UPDATE businesses SET city = 'Salto del Guairá'    WHERE city = 'Salto Del Guaira';
UPDATE businesses SET city = 'Salto del Guairá'    WHERE city = 'Salto Del Guairá';

-- Presidente Hayes / Boquerón
UPDATE businesses SET city = 'Villa Hayes'         WHERE city = 'Villa Hayes'; -- ya correcto
UPDATE businesses SET city = 'Benjamín Aceval'     WHERE city = 'Benjamin Aceval';
UPDATE businesses SET city = 'Dr. Juan E. Estigarribia' WHERE city = 'Doctor Juan E. Estigarribia';
UPDATE businesses SET city = 'Ituzaingó'           WHERE city = 'Ituzaingo';

-- Misiones / Ñeembucú
UPDATE businesses SET city = 'Pirajú'              WHERE city = 'Piraju';
UPDATE businesses SET city = 'San Juan Bautista'   WHERE city = 'San Juan Bautista'; -- ya correcto

-- Guairá
UPDATE businesses SET city = 'Villarrica'          WHERE city = 'Villarrica'; -- ya correcto
UPDATE businesses SET city = 'Colonia Independencia' WHERE city = 'Colonia Independencia'; -- ya correcto

COMMIT;

-- Verificar resultados
SELECT city, COUNT(*) as empresas
FROM businesses
WHERE city IS NOT NULL AND city != ''
GROUP BY city
ORDER BY COUNT(*) DESC
LIMIT 30;
