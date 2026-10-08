-- La ficha muestra su rubro desde businesses.category_id, pero el buscador filtra
-- por business_categories (la M2M). Las importaciones masivas escribieron
-- category_id y nunca poblaron la M2M, dejando rubros enteros sin una sola ficha
-- visible al filtrar.
--
-- Este bloque cubre SOLO las fichas sin NINGUNA fila en la M2M: al no tener
-- ninguna, no pueden chocar con uq_bc_primary (unico por business_id donde
-- is_primary). El grupo que SI tiene filas pero no incluye su category_id se
-- trata aparte, porque ahi hay que decidir cual de las dos fuentes gana.
--
-- Reversible: DELETE FROM business_categories WHERE created_at >= '<momento>';
INSERT INTO business_categories (business_id, category_id, is_primary, position)
SELECT b.id, b.category_id, true, 0
  FROM businesses b
 WHERE b.category_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM business_categories bc WHERE bc.business_id = b.id);
