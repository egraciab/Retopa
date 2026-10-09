const express = require('express');
const router = express.Router();
const pool = require('../db');
const { getEmbedding } = require('../helpers/embed');

const MAX_CANDIDATOS = 100;  // tope de resultados semánticos; nadie pagina más allá

// Mismo SELECT que /businesses, para que la respuesta sea idéntica.
const SELECT_BIZ = `
  SELECT b.id, b.ruc, b.name, b.trade_name as "tradeName", b.slug, b.description,
         b.address, b.city, b.department,
         b.phone, b.whatsapp, b.email, b.website, b.logo_emoji as "logoEmoji",
         b.image_url as "imageUrl", b.cover_url as "coverUrl",
         fn_quality_score(b.*) AS "qualityScore",
         fn_profile_completion(b.*) AS completion,
         b.rating, b.review_count as "reviewCount", b.verified, b.plan_type as "planType",
         b.hours, b.hours_json as "hoursJson", b.tags, b.lat, b.lng,
         COALESCE(b.like_count, 0) as "likeCount",
         c.id as "categoryId", c.name as "categoryName", c.slug as "categorySlug",
         c.color as "categoryColor", c.bg_color as "categoryBg",
         (SELECT COALESCE(json_agg(json_build_object('id',cx.id,'slug',cx.slug,'name',cx.name,
                 'icon',cx.icon,'color',cx.color,'bgColor',cx.bg_color,'isPrimary',bcx.is_primary)
                 ORDER BY bcx.is_primary DESC, bcx.position),'[]'::json)
          FROM business_categories bcx JOIN categories cx ON cx.id=bcx.category_id
          WHERE bcx.business_id=b.id) AS categories
  FROM businesses b LEFT JOIN categories c ON b.category_id = c.id
  WHERE b.id = ANY($1::int[])
  ORDER BY array_position($1::int[], b.id)
`;

router.get('/businesses/semantica', async (req, res) => {
  try {
    const { q, category, city, department, verified, plan, minRating,
            limit = 20, offset = 0, estricto = '1' } = req.query;

    const qEff = q ? String(q).trim() : '';
    if (!qEff) return res.json({ success: true, count: 0, total: 0, data: [] });

    const emb = await getEmbedding(qEff);   // null si ai-embed no responde

    const { rows: hits } = await pool.query(
      `SELECT id, score, vec_sim, rank_vec, rank_trg
         FROM buscar_negocios_hibrido($1, $2::vector, $3, 0, $4, $5, $6, $7, $8, $9, 300, 60, $10)`,
      [qEff, emb, MAX_CANDIDATOS,
       category || null, city || null, department || null, plan || null,
       verified === 'true' ? true : null,
       minRating ? parseFloat(minRating) : null,
       estricto !== '0']
    );

    const total = hits.length;
    const off = parseInt(offset) || 0;
    const lim = Math.min(parseInt(limit) || 20, 50);
    const pagina = hits.slice(off, off + lim);
    const ids = pagina.map(h => h.id);

    let data = [];
    if (ids.length) {
      const { rows } = await pool.query(SELECT_BIZ, [ids]);
      const porId = new Map(rows.map(r => [r.id, r]));
      data = ids.map(id => porId.get(id)).filter(Boolean);
    }

    // Telemetría: término, score del mejor y cuántos devolvió.
    if (off === 0) {
      const term = qEff.toLowerCase().replace(/\s+/g, ' ').slice(0, 160);
      if (term.length >= 2) {
        pool.query(
          `INSERT INTO search_events (term, city, vec_sim, modo, resultados)
           VALUES ($1, $2, $3, $4, $5)`,
          [term, city ? String(city).slice(0,100) : null,
           hits[0]?.vec_sim ?? null,
           emb ? 'hibrido' : 'trigram-fallback',
           total]
        ).catch(e => console.error('[search_events] insert falló:', e.message));
      }
    }

    res.json({ success: true, count: data.length, total, data });
  } catch (err) {
    console.error('[search-hibrido]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
