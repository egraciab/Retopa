-- Grupo C: businesses.category_id y la M2M dicen rubros distintos (751 fichas
-- activas tras la fusion de duplicados). Ninguna de las dos es una decision
-- humana: las dos las puso un importador.
--
-- Los pares muestran que en la mayoria la M2M es MAS ESPECIFICA y category_id
-- quedo con un cajon de sastre (Tiendas y Comercios <- Exportadoras, Servicios
-- Profesionales <- Seguros). O sea, alguien sobreescribio category_id con el
-- padre y aplasto asignaciones buenas que sobrevivieron en la M2M.
--
-- Regla: decide la ESPECIFICIDAD, no la fuente. Y cuando las dos estan al mismo
-- nivel no se elige: se conservan ambas y lo resuelve la recategorizacion
-- asistida, que va a tener mejor criterio del que tenemos hoy.

CREATE TEMP TABLE c_div ON COMMIT DROP AS
SELECT b.id AS biz, b.category_id AS cid, bc.category_id AS mid,
       (cc.parent_id IS NULL) AS cid_raiz, (cm.parent_id IS NULL) AS mid_raiz
  FROM businesses b
  JOIN business_categories bc ON bc.business_id = b.id AND bc.is_primary
  JOIN categories cc ON cc.id = b.category_id
  JOIN categories cm ON cm.id = bc.category_id
 WHERE b.category_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM business_categories x
                    WHERE x.business_id = b.id AND x.category_id = b.category_id);

-- CASO 1 — la M2M es mas especifica: la ficha pasa a mostrar el rubro bueno
UPDATE businesses b SET category_id = d.mid
  FROM c_div d WHERE b.id = d.biz AND d.cid_raiz AND NOT d.mid_raiz;

-- CASO 2 — category_id es mas especifica: degradar la primaria actual...
UPDATE business_categories bc SET is_primary = false
  FROM c_div d
 WHERE bc.business_id = d.biz AND bc.category_id = d.mid
   AND d.mid_raiz AND NOT d.cid_raiz;

-- ...y promover la especifica (el orden importa: uq_bc_primary es unico por
-- business_id donde is_primary, y no es diferible)
INSERT INTO business_categories (business_id, category_id, is_primary, position)
SELECT d.biz, d.cid, true, 0 FROM c_div d
 WHERE d.mid_raiz AND NOT d.cid_raiz
ON CONFLICT DO NOTHING;

-- CASO 3 — mismo nivel: se agregan ambas, la primaria no se toca
INSERT INTO business_categories (business_id, category_id, is_primary, position)
SELECT d.biz, d.cid, false, 1 FROM c_div d
 WHERE d.cid_raiz = d.mid_raiz
ON CONFLICT DO NOTHING;
