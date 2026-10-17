-- La ficha muestra su categoria desde businesses.category_id, pero el buscador
-- filtra por business_categories (la M2M). Las importaciones masivas del padron
-- escribieron category_id y nunca poblaron la M2M, dejando categorias enteras
-- sin una sola ficha visible (Estaciones de servicio: 820 fichas, 0 visibles).
--
-- Solo el grupo sin NINGUNA fila M2M: no pueden chocar con uq_bc_primary.
-- Reversible: DELETE FROM business_categories WHERE created_at >= '<momento>'.
INSERT INTO business_categories (business_id, category_id, is_primary, position)
SELECT b.id, b.category_id, true, 0
  FROM businesses b
 WHERE b.category_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM business_categories bc WHERE bc.business_id = b.id);
