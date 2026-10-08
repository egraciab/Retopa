-- Fusion de rubros duplicados. La taxonomia acumulo tres generaciones
-- (bloque original, 5xx y 7xx) y cada migracion agrego categorias en vez de
-- fusionar, dejando duplicados exactos (Seguros/Seguros, Veterinarias/Veterinarias,
-- Marketing y Publicidad/Publicidad y Marketing).
--
-- Criterio: sobrevive la categoria que tiene las fichas y el padre correcto.
-- Reversible con bkp_20261008_* y el dump retopa-pre-taxonomia-20261008_0938.dump

CREATE TEMP TABLE fusion(vieja int, nueva int) ON COMMIT DROP;
INSERT INTO fusion VALUES
  (714,  18),   -- Veterinarias            -> Veterinarias
  (723,  21),   -- Seguros                 -> Seguros
  ( 48, 544),   -- Marketing y Publicidad  -> Publicidad y Marketing
  ( 13, 531),   -- Alimentos y Bebidas     -> Comida y Bebida
  ( 10, 539),   -- Belleza y Cuidado Pers. -> Belleza y Bienestar
  (247, 539),   -- Wellness y bienestar    -> Belleza y Bienestar
  ( 26,  25),   -- Materiales de Construc. -> Ferreterias y materiales
  (778,  41),   -- Importadoras B2B        -> Importadoras
  (704, 186),   -- Organizadores de event. -> Organizacion de eventos
  ( 82, 542),   -- Tienda de mascotas      -> Mascotas
  (716, 542),   -- Tiendas de mascotas     -> Mascotas
  ( 32, 172),   -- Combustibles y Energia  -> Estaciones de servicio
  ( 29,  30),   -- Transporte              -> Logistica y Transporte
  (748,  40),   -- Quimica e insumos (vacia) -> se conserva la 40, renombrada
  (101, 788),   -- Laboratorios clinicos   -> Laboratorios
  (192, 126),   -- Metalurgia y torneria   -> Herreria y metalurgia
  (140, NULL),  -- Alquileres temporarios  -> se retira (vacia, sin reemplazo)
  (629, NULL);  -- Alquileres              -> se retira (vacia, sin reemplazo)

-- 1) Hijas de una categoria que se va: pasan a la canonica
UPDATE categories c SET parent_id = f.nueva
  FROM fusion f WHERE c.parent_id = f.vieja AND f.nueva IS NOT NULL;

-- 2) Fichas: repuntar la primaria
UPDATE businesses b SET category_id = f.nueva
  FROM fusion f WHERE b.category_id = f.vieja AND f.nueva IS NOT NULL;

-- 3) M2M: primero borrar las que duplicarian una fila ya existente (PK compuesta)
DELETE FROM business_categories bc USING fusion f
 WHERE bc.category_id = f.vieja AND f.nueva IS NOT NULL
   AND EXISTS (SELECT 1 FROM business_categories x
                WHERE x.business_id = bc.business_id AND x.category_id = f.nueva);

-- 4) M2M: repuntar el resto (is_primary no cambia, asi que uq_bc_primary se respeta)
UPDATE business_categories bc SET category_id = f.nueva
  FROM fusion f WHERE bc.category_id = f.vieja AND f.nueva IS NOT NULL;

-- 5) Renombres pedidos
UPDATE categories SET name = 'Logistica y Transporte' WHERE id = 30;
UPDATE categories SET name = 'Quimica e insumos'      WHERE id = 40;

-- 6) Borrar las retiradas (el FK de businesses.category_id es NO ACTION:
--    si quedara alguna ficha apuntando, esto falla y aborta la transaccion)
DELETE FROM categories c USING fusion f WHERE c.id = f.vieja;
