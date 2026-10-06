-- ============================================================================
-- RetoPA — PLAN DE SANEAMIENTO DE CATEGORÍAS
-- ============================================================================
-- Este archivo es un PLAN para revisar. NO lo corras entero de una.
-- Ejecutá FASE por FASE, revisando el SELECT de control antes de cada DELETE.
-- Regla de oro: nunca borrar una categoría con empresas sin reasignarlas antes.
--
-- Al final de TODO, correr:
--   docker exec retopa-redis redis-cli FLUSHDB
-- para que el sitio refleje los cambios.
-- ============================================================================


-- ████████████████████████████████████████████████████████████████████████
-- FASE 0 — BACKUP DE SEGURIDAD (CORRER SÍ O SÍ ANTES DE EMPEZAR)
-- ████████████████████████████████████████████████████████████████████████
-- Snapshot de la tabla categories por si algo sale mal. Restaurable.
CREATE TABLE IF NOT EXISTS _backup_categories_20260611 AS
  SELECT * FROM categories;
-- Para restaurar todo (SOLO en emergencia):
--   TRUNCATE categories; INSERT INTO categories SELECT * FROM _backup_categories_20260611;


-- ████████████████████████████████████████████████████████████████████████
-- FASE 1 — DUPLICADOS EXACTOS (subcategorías, 0 empresas) — RIESGO NULO
-- ████████████████████████████████████████████████████████████████████████
-- Cinco pares de subcategorías idénticas. Todas con 0 empresas.
-- Se borra el ID sobrante de cada par (el más alto, agregado después).
--
--   Laboratorios clínicos:   mantener 101, borrar 597
--   Instrumentos musicales:  mantener  87, borrar 585
--   Institutos terciarios:   mantener 210, borrar 677
--   Billeteras electrónicas: mantener 116, borrar 725
--   Préstamos personales:    mantener 117, borrar 727

-- 1.1 — CONTROL: confirmar que los 5 a borrar tienen 0 empresas
SELECT id, name, parent_id,
  (SELECT COUNT(*) FROM businesses b WHERE b.category_id = c.id) AS empresas
FROM categories c
WHERE id IN (597, 585, 677, 725, 727)
ORDER BY id;
-- ⛔ Si alguno tiene empresas > 0, NO continúes con el DELETE de abajo.

-- 1.2 — EJECUTAR (solo si todos dieron 0)
DELETE FROM categories WHERE id IN (597, 585, 677, 725, 727);


-- ████████████████████████████████████████████████████████████████████████
-- FASE 2 — FUSIÓN DE PADRES SOLAPADOS — RIESGO MEDIO
-- ████████████████████████████████████████████████████████████████████████
-- Cada bloque: (1) mover subcategorías al padre que se queda,
--              (2) reasignar empresas del padre viejo (si tuviera),
--              (3) borrar el padre viejo ya vacío.
-- Los padres a eliminar tienen 0 empresas directas, pero igual reasignamos
-- por defensa, por si entraron empresas nuevas desde el análisis.

-- ────────────────────────────────────────────────────────────────────────
-- 2A — COMIDA: "Gastronomía"(50, 0 emp) → "Comida y Bebida"(531, 60 emp)
-- ────────────────────────────────────────────────────────────────────────
-- CONTROL: ver subs y empresas de Gastronomía
SELECT id, name, parent_id,
  (SELECT COUNT(*) FROM businesses b WHERE b.category_id = c.id) AS emp
FROM categories c WHERE parent_id = 50 OR id = 50 ORDER BY parent_id NULLS FIRST;

-- (1) Mover subcategorías de Gastronomía a Comida y Bebida
UPDATE categories SET parent_id = 531 WHERE parent_id = 50;
-- (2) Reasignar empresas directas del padre viejo (defensivo)
UPDATE businesses SET category_id = 531 WHERE category_id = 50;
-- (3) Borrar el padre viejo
DELETE FROM categories WHERE id = 50;

-- ────────────────────────────────────────────────────────────────────────
-- 2B — TRANSPORTE: "Transporte y Automotriz"(53, 0) → "Transporte y Autos"(536, 22)
-- ────────────────────────────────────────────────────────────────────────
-- CONTROL: ver subs de Transporte y Automotriz (incluye Automotriz=22emp)
SELECT id, name, parent_id,
  (SELECT COUNT(*) FROM businesses b WHERE b.category_id = c.id) AS emp
FROM categories c WHERE parent_id = 53 OR id = 53 ORDER BY parent_id NULLS FIRST;

-- (1) Mover subcategorías (sus empresas viajan con ellas, no se tocan)
UPDATE categories SET parent_id = 536 WHERE parent_id = 53;
-- (2) Reasignar empresas directas del padre viejo (defensivo)
UPDATE businesses SET category_id = 536 WHERE category_id = 53;
-- (3) Borrar el padre viejo
DELETE FROM categories WHERE id = 53;
-- ⚠️ POST-FUSIÓN: revisar posible duplicado de subcategorías:
--    'Repuestos automotores'(167) vs 'Repuestos y accesorios'(644) — ver FASE 3.

-- ────────────────────────────────────────────────────────────────────────
-- 2C — BELLEZA: "Belleza, Deporte y Lifestyle"(54, 0) → "Belleza y Bienestar"(539, 42)
-- ────────────────────────────────────────────────────────────────────────
-- CONTROL: ver subs de 54 (Belleza y Cuidado=5emp, Estética y spa, Maquillaje)
SELECT id, name, parent_id,
  (SELECT COUNT(*) FROM businesses b WHERE b.category_id = c.id) AS emp
FROM categories c WHERE parent_id = 54 OR id = 54 ORDER BY parent_id NULLS FIRST;

-- (1) Mover subcategorías a Belleza y Bienestar
UPDATE categories SET parent_id = 539 WHERE parent_id = 54;
-- (2) Reasignar empresas directas del padre viejo (defensivo)
UPDATE businesses SET category_id = 539 WHERE category_id = 54;
-- (3) Borrar el padre viejo
DELETE FROM categories WHERE id = 54;
-- ⚠️ POST-FUSIÓN: quedan duplicados a resolver en FASE 3:
--    'Estética y spa'(231) vs 'Estéticas y spa'(685)
--    'Maquillaje profesional'(236) vs 'Maquillaje profesional'(690)

-- ────────────────────────────────────────────────────────────────────────
-- 2D — MEDIOS: "Medios y Comunicación"(55, 0) → "Publicidad y Marketing"(544, 32)
-- ────────────────────────────────────────────────────────────────────────
-- CONTROL: ver subs de 55
SELECT id, name, parent_id,
  (SELECT COUNT(*) FROM businesses b WHERE b.category_id = c.id) AS emp
FROM categories c WHERE parent_id = 55 OR id = 55 ORDER BY parent_id NULLS FIRST;

-- (1) Mover subcategorías a Publicidad y Marketing
UPDATE categories SET parent_id = 544 WHERE parent_id = 55;
-- (2) Reasignar empresas directas del padre viejo (defensivo)
UPDATE businesses SET category_id = 544 WHERE category_id = 55;
-- (3) Borrar el padre viejo
DELETE FROM categories WHERE id = 55;
-- ⚠️ POST-FUSIÓN: revisar 'Marketing y Publicidad'(48) vs 'Marketing digital'(264) — FASE 3.


-- ████████████████████████████████████████████████████████████████████████
-- FASE 3 — DUPLICADOS QUE APARECEN TRAS LAS FUSIONES — RIESGO MEDIO
-- ████████████████████████████████████████████████████████████████████████
-- Después de la FASE 2, algunas subcategorías quedan repetidas bajo el mismo
-- padre. Acá se fusionan: mover empresas a la que se queda, borrar la otra.
-- CONTROL general primero: ver los grupos sospechosos juntos
SELECT id, name, slug, parent_id,
  (SELECT COUNT(*) FROM businesses b WHERE b.category_id = c.id) AS emp
FROM categories c
WHERE id IN (167, 644, 231, 685, 236, 690, 48, 264)
ORDER BY name;

-- 3A — Estética y spa: mantener 685 ("Estéticas y spa"), fusionar 231
UPDATE businesses SET category_id = 685 WHERE category_id = 231;
DELETE FROM categories WHERE id = 231;

-- 3B — Maquillaje profesional: mantener 690, fusionar 236
UPDATE businesses SET category_id = 690 WHERE category_id = 236;
DELETE FROM categories WHERE id = 236;

-- 3C — Repuestos: mantener 644 ("Repuestos y accesorios"), fusionar 167
--      (decisión: el nombre genérico 644 es mejor; ambos con 0 emp)
UPDATE businesses SET category_id = 644 WHERE category_id = 167;
DELETE FROM categories WHERE id = 167;

-- 3D — Marketing: NO fusionar automáticamente.
--      'Marketing y Publicidad'(48) y 'Marketing digital'(264) NO son lo mismo
--      (uno es general, otro es digital). Se recomienda DEJARLOS separados.
--      Si querés unificar: descomentá las 2 líneas siguientes.
-- UPDATE businesses SET category_id = 264 WHERE category_id = 48;
-- DELETE FROM categories WHERE id = 48;


-- ████████████████████████████████████████████████████████████████████████
-- FASE 4 — VETERINARIAS (decisión pendiente) — RIESGO MEDIO (43 empresas)
-- ████████████████████████████████████████████████████████████████████████
-- Veterinarias aparece 2 veces:
--   [18]  en "Salud y Medicina"  → 43 empresas
--   [714] en "Mascotas"          → 0 empresas
-- OPCIÓN A (recomendada): mover la de Salud a Mascotas y borrar la vacía.
-- OPCIÓN B: dejar todo como está (veterinarias en Salud).
--
-- >>> Esta fase está COMENTADA. Descomentá solo si elegís la OPCIÓN A. <<<

-- CONTROL:
-- SELECT id, name, parent_id,
--   (SELECT COUNT(*) FROM businesses b WHERE b.category_id = c.id) AS emp
-- FROM categories c WHERE id IN (18, 714);

-- OPCIÓN A:
-- (1) Mover la veterinaria con empresas (18) al padre Mascotas (542)
-- UPDATE categories SET parent_id = 542 WHERE id = 18;
-- (2) Borrar la veterinaria vacía (714)
-- DELETE FROM categories WHERE id = 714;


-- ████████████████████████████████████████████████████████████████████████
-- FASE 5 — VERIFICACIÓN FINAL
-- ████████████████████████████████████████████████████████████████████████
-- 5.1 — Que no queden empresas huérfanas (category_id que ya no existe)
SELECT COUNT(*) AS empresas_huerfanas
FROM businesses b
WHERE b.category_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = b.category_id);
-- Debe dar 0.

-- 5.2 — Que no queden subcategorías huérfanas (parent_id que ya no existe)
SELECT id, name, parent_id FROM categories c
WHERE parent_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM categories p WHERE p.id = c.parent_id);
-- Debe dar 0 filas.

-- 5.3 — Listado final de padres (deberían quedar ~19 en vez de 24)
SELECT id, name,
  (SELECT COUNT(*) FROM categories s WHERE s.parent_id = c.id) AS subs,
  (SELECT COUNT(*) FROM businesses b WHERE b.category_id = c.id) AS emp_directas
FROM categories c WHERE parent_id IS NULL ORDER BY name;

-- ============================================================================
-- FIN. Recordá: docker exec retopa-redis redis-cli FLUSHDB
-- ============================================================================
