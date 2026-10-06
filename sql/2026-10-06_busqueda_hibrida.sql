-- Búsqueda híbrida: vector (bge-m3 + pgvector) + trigram, fusionados con RRF.
-- Idempotente. Requiere la imagen retopa-pg:16-vec-gis (pgvector + PostGIS).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS business_embedding (
  business_id  INTEGER PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  embedding    vector(1024) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  model_ver    VARCHAR(32) NOT NULL DEFAULT 'bge-m3',
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bemb_hnsw ON business_embedding
  USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);

-- Sin este índice, el OR del bloque trigram cae a Seq Scan (126ms -> 12ms).
CREATE INDEX IF NOT EXISTS idx_businesses_trade_trgm
  ON businesses USING gin (trade_name gin_trgm_ops);

-- Telemetría: score del mejor resultado, modo que atendió, cantidad devuelta.
ALTER TABLE search_events
  ADD COLUMN IF NOT EXISTS vec_sim    numeric(5,4),
  ADD COLUMN IF NOT EXISTS modo       varchar(20),
  ADD COLUMN IF NOT EXISTS resultados integer;

CREATE OR REPLACE FUNCTION public.buscar_negocios_hibrido(p_query text, p_embedding vector DEFAULT NULL::vector, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_category_slug text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_department text DEFAULT NULL::text, p_plan_type text DEFAULT NULL::text, p_verified boolean DEFAULT NULL::boolean, p_min_rating numeric DEFAULT NULL::numeric, p_pool integer DEFAULT 300, p_k integer DEFAULT 60, p_plan_estricto boolean DEFAULT true, p_w_premium double precision DEFAULT 0.35, p_w_featured double precision DEFAULT 0.20, p_w_quality double precision DEFAULT 0.15, p_w_boost double precision DEFAULT 0.10, p_w_exacto double precision DEFAULT 0.50, p_min_sim double precision DEFAULT 0.51)
 RETURNS TABLE(id integer, name character varying, slug character varying, city character varying, department character varying, category_id integer, plan_type character varying, rating numeric, review_count integer, quality_score integer, score double precision, rel_norm double precision, rank_vec bigint, rank_trg bigint, vec_sim double precision)
 LANGUAGE plpgsql
 STABLE
 SET jit TO 'off'
AS $function$
DECLARE
  v_f    text := 'b.is_active';
  v_q    text := coalesce(trim(p_query), '');
  v_pat  text;
  v_sql  text;
  v_vec  text;
  v_trg  text;
  v_cats int[];
  v_extra text := '';
  v_best double precision;
  v_rmax double precision := 2.0 / (p_k + 1);
BEGIN
  v_pat := '%' || v_q || '%';

  IF p_category_slug IS NOT NULL THEN
    v_f := v_f || format(' AND EXISTS (SELECT 1 FROM business_categories bc JOIN categories c ON c.id=bc.category_id WHERE bc.business_id=b.id AND c.slug=%L)', p_category_slug);
  END IF;
  IF p_city       IS NOT NULL THEN v_f := v_f || format(' AND unaccent(b.city) ILIKE unaccent(%L)', '%'||p_city||'%'); END IF;
  IF p_department IS NOT NULL THEN v_f := v_f || format(' AND b.department = %L', p_department); END IF;
  IF p_plan_type  IS NOT NULL THEN v_f := v_f || format(' AND b.plan_type = %L', p_plan_type); END IF;
  IF p_verified   IS NOT NULL THEN v_f := v_f || format(' AND b.verified = %L', p_verified); END IF;
  IF p_min_rating IS NOT NULL THEN v_f := v_f || format(' AND b.rating >= %L', p_min_rating); END IF;

  IF p_embedding IS NOT NULL THEN
    EXECUTE format($p$ SELECT 1 - (e.embedding <=> %1$L::vector(1024))
                       FROM business_embedding e JOIN businesses b ON b.id = e.business_id
                       WHERE %2$s ORDER BY e.embedding <=> %1$L::vector(1024) LIMIT 1 $p$,
                   p_embedding::text, v_f) INTO v_best;
  END IF;

  IF p_embedding IS NULL OR coalesce(v_best, 0) < p_min_sim THEN
    v_vec := 'SELECT NULL::int AS id, NULL::bigint AS rnk, NULL::double precision AS sim WHERE false';
  ELSE
    v_vec := format($q$
      SELECT s.id, row_number() OVER (ORDER BY s.d) AS rnk, (1 - s.d)::double precision AS sim FROM (
        SELECT b.id, e.embedding <=> %L::vector(1024) AS d
        FROM business_embedding e JOIN businesses b ON b.id = e.business_id
        WHERE %s ORDER BY 2 LIMIT %s
      ) s $q$, p_embedding::text, v_f, p_pool);
  END IF;

  IF v_q = '' THEN
    v_trg := 'SELECT NULL::int AS id, NULL::bigint AS rnk WHERE false';
  ELSE
    -- Categorias resueltas APARTE: 314 filas, y deja el OR indexable.
    SELECT array_agg(c.id) INTO v_cats
    FROM categories c
    WHERE c.name ILIKE v_pat OR c.name % v_q;

    IF v_cats IS NOT NULL THEN
      v_extra := v_extra || format(' OR b.category_id = ANY(%L::int[])', v_cats);
    END IF;
    IF translate(v_q, '.- ', '') ~ '^[0-9]+$' THEN
      v_extra := v_extra || format(' OR b.ruc LIKE %L', translate(v_q, '.- ', '') || '%');
    END IF;

    v_trg := format($q$
      SELECT s.id, row_number() OVER (ORDER BY s.sim DESC) AS rnk FROM (
        SELECT b.id, GREATEST(
                 similarity(b.name, %1$L),
                 similarity(coalesce(b.trade_name,''), %1$L),
                 similarity(coalesce(b.description,''), %1$L) * 0.8
               ) AS sim
        FROM businesses b
        WHERE %2$s AND (
              b.name %% %1$L OR b.trade_name %% %1$L OR b.description %% %1$L
           OR b.name ILIKE %3$L
           %5$s)
        ORDER BY 2 DESC LIMIT %4$s
      ) s $q$, v_q, v_f, v_pat, p_pool, v_extra);
  END IF;

  v_sql := format($q$
    WITH vec AS (%12$s), trg AS (%13$s),
    cand AS (SELECT id FROM vec UNION SELECT id FROM trg)
    SELECT b.id, b.name, b.slug, b.city, b.department, b.category_id, b.plan_type,
           b.rating, b.review_count,
           fn_quality_score(b.*) AS quality_score,
           ( (coalesce(1.0/(%2$s + v.rnk),0) + coalesce(1.0/(%2$s + t.rnk),0)) / %3$s
             + CASE b.plan_type WHEN 'premium' THEN %4$s WHEN 'featured' THEN %5$s ELSE 0 END
             + fn_quality_score(b.*) / 100.0 * %6$s
             + CASE WHEN b.boost_until > now() THEN %7$s ELSE 0 END
             + CASE WHEN lower(unaccent(b.name)) = lower(unaccent(%1$L)) THEN %8$s
                    WHEN lower(unaccent(b.name)) LIKE lower(unaccent(%1$L))||'%%' THEN %8$s/2 ELSE 0 END
           )::double precision AS score,
           ((coalesce(1.0/(%2$s + v.rnk),0) + coalesce(1.0/(%2$s + t.rnk),0)) / %3$s)::double precision AS rel_norm,
           v.rnk, t.rnk, v.sim
    FROM cand
    JOIN businesses b ON b.id = cand.id
    LEFT JOIN vec v ON v.id = cand.id
    LEFT JOIN trg t ON t.id = cand.id
    ORDER BY %9$s score DESC, b.rating DESC NULLS LAST, b.review_count DESC, b.id
    LIMIT %10$s OFFSET %11$s $q$,
    v_q, p_k, v_rmax, p_w_premium, p_w_featured, p_w_quality, p_w_boost, p_w_exacto,
    CASE WHEN p_plan_estricto
         THEN $o$CASE b.plan_type WHEN 'premium' THEN 1 WHEN 'featured' THEN 2 ELSE 3 END,
                 CASE WHEN b.boost_until > now() THEN 0 ELSE 1 END,$o$
         ELSE '' END,
    p_limit, p_offset, v_vec, v_trg);

  RETURN QUERY EXECUTE v_sql;
END $function$
;
