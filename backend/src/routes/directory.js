const express = require('express');
const router = express.Router();
const pool = require('../db');
const redisClient = require('../config/redis');
const { getPlanLimits } = require('../utils/plan-limits');
const { sendEmail } = require('../config/mail');
const { getPwaIcon } = require('../utils/pwa-icon');
const { provisionFichaOwnerActivation } = require('../helpers/fichaActivation');

// ── Íconos PWA dinámicos (desde site_config.logo_url; fallback bundleado) ──
router.get(['/pwa-icon-192.png', '/pwa-icon-512.png', '/pwa-icon-180.png'], async (req, res) => {
  try {
    const size = req.path.includes('512') ? 512 : req.path.includes('180') ? 180 : 192;
    let logoUrl = '';
    try { const r = await pool.query("SELECT value FROM site_config WHERE key='logo_url'"); logoUrl = r.rows[0]?.value || ''; } catch (e) {}
    const png = await getPwaIcon(size, logoUrl);
    if (!png) return res.status(404).end();
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(png);
  } catch (e) {
    console.error('[pwa-icon]', e.message);
    res.status(500).end();
  }
});

const CACHE_TTL = 300;

async function getCache(key) {
    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (e) { return null; }
}

async function setCache(key, data, ttl = CACHE_TTL) {
    try {
        await redisClient.setEx(key, ttl, JSON.stringify(data));
    } catch (e) {}
}

async function invalidateCache(pattern) {
    try {
        const keys = await redisClient.keys(pattern);
        if (keys.length) await redisClient.del(keys);
    } catch (e) {}
}

// ── POST /track/pageview ── Registrar visita al sitio (cualquier página) ──────
// Llamado por el SSR en cada página servida (fire & forget). Sin auth.
router.post('/track/pageview', async (req, res) => {
    // Responder de inmediato para no bloquear nada
    res.json({ success: true });
    try {
        const crypto = require('crypto');
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
        if (!ip) return;
        const ipHash = crypto.createHash('sha256').update(ip + (process.env.JWT_SECRET || '')).digest('hex').slice(0, 32);
        const path = (req.body && req.body.path ? String(req.body.path) : '').slice(0, 300);
        await pool.query(
            'INSERT INTO site_visits (ip_hash, path) VALUES ($1, $2)',
            [ipHash, path || null]
        );
    } catch (e) { /* silencioso, no afecta al usuario */ }
});

// ============================================
// CATEGORÍAS
// ============================================
router.get('/categories', async (req, res) => {
    try {
        const cacheKey = 'dir:categories:all';
        let data = await getCache(cacheKey);
        if (!data) {
            const result = await pool.query(`
                WITH counts AS (
                    SELECT bc.category_id, COUNT(DISTINCT b.id) AS cnt
                    FROM business_categories bc
                    JOIN businesses b ON b.id = bc.business_id AND b.is_active = TRUE
                    GROUP BY bc.category_id
                )
                SELECT c.id, c.slug, c.name, c.icon, c.color,
                       c.bg_color     AS "bgColor",
                       c.display_order AS "displayOrder",
                       c.search_count  AS "searchCount",
                       c.parent_id     AS "parentId",
                       COALESCE(cn.cnt, 0)::int AS "ownCount"
                FROM categories c
                LEFT JOIN counts cn ON cn.category_id = c.id
                ORDER BY c.display_order ASC, c.name ASC
            `);

            // Sumar los conteos de los hijos a cada padre
            const flat = result.rows.map(r => ({ ...r, businessCount: r.ownCount }));
            const byParent = new Map();
            for (const c of flat) {
                if (c.parentId) {
                    const arr = byParent.get(c.parentId) || [];
                    arr.push(c);
                    byParent.set(c.parentId, arr);
                }
            }
            for (const c of flat) {
                if (!c.parentId) {
                    const kids = byParent.get(c.id) || [];
                    c.businessCount += kids.reduce((s, k) => s + (k.businessCount || 0), 0);
                    c.childrenCount = kids.length;
                } else {
                    c.childrenCount = 0;
                }
            }

            data = flat;
            await setCache(cacheKey, data, 300); // 5 min — se invalida al importar
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// BÚSQUEDA AVANZADA DE EMPRESAS
// ============================================

// ── Parseo "humanizado" de la consulta libre ────────────────────────────────
// Separa el RUBRO de la CIUDAD y limpia conectores, para que "ferretería en
// luque" se resuelva como { q:'ferretería', city:'Luque' } en vez de exigir que
// todo el string matchee el nombre de una ficha. Preserva acentos/mayúsculas del
// rubro (el matcher usa ILIKE/​similarity sensibles a acento).
const _SEARCH_CONNECTORS = new Set(['en', 'de', 'del', 'la', 'el', 'los', 'las', 'por', 'cerca', 'zona', 'barrio', 'ciudad', 'a']);
function _normText(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
let _cityCache = { at: 0, list: [] };
async function getCityIndex() {
    if (_cityCache.list.length && (Date.now() - _cityCache.at) < 600000) return _cityCache.list;
    try {
        const r = await pool.query('SELECT name FROM cities WHERE is_active = TRUE');
        _cityCache = { at: Date.now(), list: r.rows.map(x => ({ name: x.name, words: _normText(x.name).split(' ').filter(Boolean) })).filter(c => c.words.length) };
    } catch (e) { /* mantiene cache previa si la query falla */ }
    return _cityCache.list;
}
// Devuelve { q, city } — city sólo si detecta una ciudad conocida en el texto.
async function parseSearchQuery(rawQ) {
    const original = String(rawQ || '').trim();
    if (!original) return { q: '', city: null };
    const origToks = original.split(/\s+/);
    const normToks = origToks.map(_normText);
    const cities = await getCityIndex();
    // Ciudad más larga (más palabras) que aparezca como secuencia de tokens.
    let match = null, matchIdx = [];
    for (const c of cities) {
        const cw = c.words;
        for (let i = 0; i + cw.length <= normToks.length; i++) {
            let ok = true;
            for (let k = 0; k < cw.length; k++) if (normToks[i + k] !== cw[k]) { ok = false; break; }
            if (ok && (!match || cw.length > match.words.length)) { match = c; matchIdx = Array.from({ length: cw.length }, (_, k) => i + k); }
        }
    }
    let city = null;
    let keep = origToks.map((_, i) => i);
    if (match) {
        city = match.name;
        const cityset = new Set(matchIdx);
        keep = keep.filter(i => !cityset.has(i))          // saca los tokens de la ciudad
                   .filter(i => !_SEARCH_CONNECTORS.has(normToks[i])); // y los conectores sueltos
    }
    const q = keep.map(i => origToks[i]).join(' ').trim();
    return { q, city };
}

router.get('/businesses', async (req, res) => {
    try {
        const { q, category, city, department, verified, plan, minRating, featured_only, sort = 'relevance', limit = 20, offset = 0, lat, lng } = req.query;

        const qClean = q ? q.trim() : '';

        // Parseo humanizado: si el usuario escribió el rubro y la ciudad juntos
        // ("ferretería en luque") y NO eligió una ciudad en el filtro, separamos
        // rubro/ciudad. qEff/cityEff son los efectivos que usa la búsqueda.
        let qEff = qClean;
        let cityEff = (city && String(city).trim()) ? String(city).trim() : null;
        if (qClean && !cityEff) {
            try {
                const parsed = await parseSearchQuery(qClean);
                if (parsed.city) { cityEff = parsed.city; qEff = parsed.q; }
            } catch (e) { /* si falla el parseo, seguimos con la búsqueda cruda */ }
        }

        const userLat = lat ? parseFloat(lat) : null;
        const userLng = lng ? parseFloat(lng) : null;
        const hasLocation = userLat !== null && userLng !== null
            && !isNaN(userLat) && !isNaN(userLng)
            && userLat >= -90 && userLat <= 90 && userLng >= -180 && userLng <= 180;

        const cacheKey = hasLocation ? null : `dir:biz:${Buffer.from(JSON.stringify(req.query)).toString('base64')}`;
        let data = cacheKey ? await getCache(cacheKey) : null;

        // D5.1 — Registro de la búsqueda interna para el semáforo (sin PII).
        // IMPORTANTE: va ANTES del branch de caché, así se registra SIEMPRE que
        // haya término — también cuando los resultados se sirven desde Redis
        // (si no, las búsquedas repetidas —la mayoría— no se contarían nunca).
        // Solo primera página (offset 0); fire-and-forget; loguea si falla.
        if (qEff && (parseInt(offset) || 0) === 0) {
            const term = qEff.toLowerCase().replace(/\s+/g, ' ').slice(0, 160);
            if (term.length >= 2) {
                const cityLog = cityEff ? String(cityEff).trim().slice(0, 100) : null;
                pool.query(
                    `INSERT INTO search_events (term, category_id, city)
                     VALUES ($1,
                             COALESCE(
                               (SELECT id FROM categories WHERE slug = $2 LIMIT 1),
                               (SELECT id FROM categories WHERE name ILIKE $3 OR slug ILIKE $3 ORDER BY business_count DESC NULLS LAST LIMIT 1)
                             ),
                             $4)`,
                    [term, category || null, `%${term}%`, cityLog]
                ).catch(e => console.error('[search_events] insert falló:', e.message));
            }
        }

        if (!data) {
            let where = ['b.is_active = TRUE'];
            let whereForCount = ['b.is_active = TRUE'];
            let params = [];
            let whereParams = [];
            let idx = 1;
            let wIdx = 1;
            let orderBy = '';
            let distanceSelect = '';

            if (hasLocation) {
                params.push(userLng, userLat);
                const pLng = idx, pLat = idx + 1;
                idx += 2;
                distanceSelect = `,
                       ST_DistanceSphere(
                           COALESCE(b.location, ST_MakePoint(b.lng::float, b.lat::float))::geometry,
                           ST_MakePoint($${pLng},$${pLat})::geometry
                       ) AS distance_m,
                       COALESCE(b.coord_is_real, FALSE) AS "coordIsReal",
                       CASE
                           WHEN b.lat IS NULL THEN 3
                           WHEN ST_DistanceSphere(COALESCE(b.location,ST_MakePoint(b.lng::float,b.lat::float))::geometry,ST_MakePoint($${pLng},$${pLat})::geometry) <= 2000  THEN 0
                           WHEN ST_DistanceSphere(COALESCE(b.location,ST_MakePoint(b.lng::float,b.lat::float))::geometry,ST_MakePoint($${pLng},$${pLat})::geometry) <= 10000 THEN 1
                           ELSE 2
                       END AS distance_bucket`;
                orderBy = `ORDER BY
                    CASE WHEN b.lat IS NULL THEN 3
                         WHEN ST_DistanceSphere(COALESCE(b.location,ST_MakePoint(b.lng::float,b.lat::float))::geometry,ST_MakePoint($${pLng},$${pLat})::geometry) <= 2000  THEN 0
                         WHEN ST_DistanceSphere(COALESCE(b.location,ST_MakePoint(b.lng::float,b.lat::float))::geometry,ST_MakePoint($${pLng},$${pLat})::geometry) <= 10000 THEN 1
                         ELSE 2 END ASC,
                    CASE b.plan_type WHEN 'premium' THEN 1 WHEN 'featured' THEN 2 ELSE 3 END ASC,
                    ST_DistanceSphere(COALESCE(b.location,ST_MakePoint(b.lng::float,b.lat::float))::geometry,ST_MakePoint($${pLng},$${pLat})::geometry) ASC NULLS LAST,
                    b.rating DESC,
                    fn_quality_score(b.*) DESC`;
            }

            if (qEff) {
                const qWhere = `(
                    b.name ILIKE $IDX OR COALESCE(b.trade_name,'') ILIKE $IDX OR b.ruc ILIKE $IDX
                    OR similarity(COALESCE(b.trade_name,b.name),$IDX1) > 0.3
                    OR similarity(b.name,$IDX1) > 0.3
                    OR similarity(COALESCE(b.description,''),$IDX1) > 0.2
                    OR to_tsvector('spanish', unaccent(b.name)||' '||COALESCE(unaccent(b.description),'')) @@ plainto_tsquery('spanish', unaccent($IDX2))
                    OR EXISTS (SELECT 1 FROM categories c2 WHERE c2.id = b.category_id AND (c2.name ILIKE $IDX OR similarity(c2.name,$IDX1) > 0.3))
                    OR EXISTS (SELECT 1 FROM unnest(b.tags) AS t WHERE t ILIKE $IDX)
                )`;
                where.push(qWhere.replace(/\$IDX2/g,`$${idx+2}`).replace(/\$IDX1/g,`$${idx+1}`).replace(/\$IDX/g,`$${idx}`));
                whereForCount.push(qWhere.replace(/\$IDX2/g,`$${wIdx+2}`).replace(/\$IDX1/g,`$${wIdx+1}`).replace(/\$IDX/g,`$${wIdx}`));
                params.push(`%${qEff}%`, qEff, qEff);
                whereParams.push(`%${qEff}%`, qEff, qEff);
                idx += 3; wIdx += 3;
                pool.query('UPDATE categories SET search_count = search_count + 1 WHERE name ILIKE $1 OR slug ILIKE $1',[`%${qEff}%`]).catch(()=>{});
                try { await redisClient.del('dir:popular'); } catch(e) {}
            }
            if (category) {
                const cWhere = `EXISTS (SELECT 1 FROM business_categories bc2 JOIN categories cc ON cc.id=bc2.category_id WHERE bc2.business_id=b.id AND (cc.slug=$IDX OR cc.parent_id=(SELECT id FROM categories WHERE slug=$IDX) OR cc.name ILIKE $IDX1))`;
                where.push(cWhere.replace(/\$IDX1/g,`$${idx+1}`).replace(/\$IDX/g,`$${idx}`));
                whereForCount.push(cWhere.replace(/\$IDX1/g,`$${wIdx+1}`).replace(/\$IDX/g,`$${wIdx}`));
                params.push(category, `%${category}%`); whereParams.push(category, `%${category}%`);
                idx += 2; wIdx += 2;
            }
            if (cityEff)    { where.push(`unaccent(b.city) ILIKE unaccent($${idx})`);    whereForCount.push(`unaccent(b.city) ILIKE unaccent($${wIdx})`);    params.push(`%${cityEff}%`);      whereParams.push(`%${cityEff}%`);      idx++; wIdx++; }
            if (department) { where.push(`b.department = $${idx}`);                       whereForCount.push(`b.department = $${wIdx}`);                       params.push(department);           whereParams.push(department);           idx++; wIdx++; }
            if (verified === 'true') { where.push('b.verified = TRUE'); whereForCount.push('b.verified = TRUE'); }
            if (featured_only === 'true') { where.push("b.plan_type IN ('featured','premium')"); whereForCount.push("b.plan_type IN ('featured','premium')"); }
            if (plan)       { where.push(`b.plan_type = $${idx}`);                        whereForCount.push(`b.plan_type = $${wIdx}`);                        params.push(plan);                 whereParams.push(plan);                 idx++; wIdx++; }
            if (minRating)  { where.push(`b.rating >= $${idx}`);                          whereForCount.push(`b.rating >= $${wIdx}`);                          params.push(parseFloat(minRating)); whereParams.push(parseFloat(minRating)); idx++; wIdx++; }

            if (!hasLocation) {
                switch(sort) {
                    case 'rating':  orderBy = `ORDER BY b.rating DESC, b.review_count DESC, CASE b.plan_type WHEN 'premium' THEN 1 WHEN 'featured' THEN 2 ELSE 3 END, fn_quality_score(b.*) DESC`; break;
                    case 'recent':  orderBy = `ORDER BY b.created_at DESC, fn_quality_score(b.*) DESC`; break;
                    default:
                        if (qEff) {
                            // Param dedicado para el "boost por match exacto de nombre".
                            // (Antes se reusaba idx-2, frágil cuando había category+city.)
                            params.push(qEff);
                            const pQ = idx; idx++;
                            orderBy = `ORDER BY
                                CASE WHEN lower(unaccent(b.name))=lower(unaccent($${pQ})) THEN 0
                                     WHEN lower(unaccent(b.name)) LIKE lower(unaccent($${pQ}))||'%' THEN 1
                                     ELSE 2 END,
                                CASE b.plan_type WHEN 'premium' THEN 0 WHEN 'featured' THEN 1 ELSE 2 END,
                                b.rating DESC, b.review_count DESC,
                                fn_quality_score(b.*) DESC`;
                        } else {
                            // S30 — empujón de visibilidad: dentro de cada tier de plan, las fichas
                            // con boost activo suben. No altera el orden entre planes (pagos primero).
                            orderBy = `ORDER BY CASE b.plan_type WHEN 'premium' THEN 1 WHEN 'featured' THEN 2 ELSE 3 END, CASE WHEN b.boost_until > NOW() THEN 0 ELSE 1 END, b.rating DESC, b.review_count DESC, fn_quality_score(b.*) DESC, b.created_at DESC`;
                        }
                }
            }

            const query = `
                SELECT b.id, b.ruc, b.name, b.trade_name as "tradeName", b.slug, b.description, b.address, b.city, b.department,
                       b.phone, b.whatsapp, b.email, b.website, b.logo_emoji as "logoEmoji",
                       b.image_url as "imageUrl", b.cover_url as "coverUrl",
                       fn_quality_score(b.*) AS "qualityScore",
                       fn_profile_completion(b.*) AS completion,
                       b.rating, b.review_count as "reviewCount", b.verified, b.plan_type as "planType",
                       b.hours, b.hours_json as "hoursJson", b.tags, b.lat, b.lng,
                       COALESCE(b.like_count, 0) as "likeCount",
                       c.id as "categoryId", c.name as "categoryName", c.slug as "categorySlug",
                       c.color as "categoryColor", c.bg_color as "categoryBg",
                       (SELECT COALESCE(json_agg(json_build_object('id',cx.id,'slug',cx.slug,'name',cx.name,'icon',cx.icon,'color',cx.color,'bgColor',cx.bg_color,'isPrimary',bcx.is_primary) ORDER BY bcx.is_primary DESC, bcx.position),'[]'::json)
                        FROM business_categories bcx JOIN categories cx ON cx.id=bcx.category_id WHERE bcx.business_id=b.id) AS categories${distanceSelect}
                FROM businesses b JOIN categories c ON b.category_id = c.id
                WHERE ${where.join(' AND ')}
                ${orderBy}
                LIMIT $${idx} OFFSET $${idx+1}
            `;
            params.push(parseInt(limit), parseInt(offset));

            const result = await pool.query(query, params);
            data = result.rows;

            const countQuery = `SELECT COUNT(*) FROM businesses b JOIN categories c ON b.category_id = c.id WHERE ${whereForCount.join(' AND ')}`;
            const countResult = await pool.query(countQuery, whereParams);
            const total = parseInt(countResult.rows[0].count);

            if (cacheKey) await setCache(cacheKey, { data, total }, 120);
            return res.json({ success: true, count: data.length, total, data });
        }
        const total = data.total || data.length || 0;
        const rows  = data.data || data;
        res.json({ success: true, count: rows.length, total, data: rows });
    } catch (err) {
        console.error('Businesses error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Límite de empresas para usuarios sin plan pago ──────────────────────
// Un usuario sin ninguna empresa con plan pago (featured/premium) puede tener
// SOLO una empresa. Para agregar más, debe mejorar el plan de su empresa.
async function ownerFreeLimitReached(user_id) {
    if (!user_id) return false;
    const { rows } = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE ub.is_owner) AS total,
                COUNT(*) FILTER (WHERE ub.is_owner AND b.plan_type IN ('featured','premium')) AS paid
           FROM user_businesses ub
           JOIN businesses b ON b.id = ub.business_id
          WHERE ub.user_id = $1`,
        [user_id]
    );
    const total = parseInt(rows[0].total) || 0;
    const paid  = parseInt(rows[0].paid)  || 0;
    return total >= 1 && paid === 0;
}
const FREE_LIMIT_MSG = 'Con el plan gratuito podés registrar una sola empresa. Mejorá el plan de tu empresa actual para poder agregar más.';

// ============================================
// CREAR EMPRESA DIRECTAMENTE (FIX PRINCIPAL)
// ============================================
router.post('/businesses', async (req, res) => {
    const client = await pool.connect();
    try {
        const { normalizePhone } = require('../utils/phone');
        const {
            name, trade_name, ruc, category_id, category_ids, description, address, city, department,
            phone: rawPhone, email, website, image_url, plan_type = 'basic',
            hours, tags, lat, lng, user_id
        } = req.body;

        const phone = normalizePhone(rawPhone) || rawPhone;

        if (!name && !trade_name || !phone || !email) {
            return res.status(400).json({ success: false, error: 'Nombre, teléfono y email son requeridos' });
        }

        // Límite de 1 empresa para usuarios sin plan pago
        if (await ownerFreeLimitReached(user_id)) {
            return res.status(403).json({ success: false, code: 'FREE_LIMIT', error: FREE_LIMIT_MSG });
        }

        // Resolver categorías: aceptar array nuevo o id legacy
        let catIds = Array.isArray(category_ids) && category_ids.length
            ? category_ids.map(n => parseInt(n)).filter(Number.isFinite)
            : (category_id ? [parseInt(category_id)] : []);
        catIds = Array.from(new Set(catIds));

        // Validar tope del plan
        const limits = await getPlanLimits(plan_type);
        if (catIds.length > limits.max_categories) {
            return res.status(400).json({
                success: false,
                error: `El plan ${plan_type} permite hasta ${limits.max_categories} categoría(s); enviaste ${catIds.length}`,
                code: 'CATEGORY_LIMIT_EXCEEDED'
            });
        }

        // El nombre visible es trade_name, fallback a name
        const displayName = trade_name || name;
        const legalName   = name || trade_name;

        // Generar slug desde el nombre comercial
        let slug = displayName.toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        // Verificar slug único
        let slugExists = true;
        let slugSuffix = '';
        let counter = 1;
        while (slugExists) {
            const check = await pool.query('SELECT id FROM businesses WHERE slug = $1', [slug + slugSuffix]);
            if (check.rows.length === 0) {
                slugExists = false;
            } else {
                slugSuffix = '-' + counter;
                counter++;
            }
        }
        slug = slug + slugSuffix;

        // Construir location si hay lat/lng
        let location = null;
        if (lat && lng) {
            location = `POINT(${lng} ${lat})`;
        }

        const primaryCatId = catIds.length ? catIds[0] : null;

        await client.query('BEGIN');

        const result = await client.query(`
            INSERT INTO businesses (
                ruc, ruc_parent, name, trade_name, slug, category_id, description, address, city, department,
                phone, whatsapp, email, website, image_url, plan_type, hours, tags, lat, lng, location,
                verified, is_active, created_at
            ) VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, FALSE, TRUE, NOW())
            RETURNING *
        `, [
            ruc || null, legalName, displayName, slug, primaryCatId, description || null, address || null,
            city || null, department || null, phone, req.body.whatsapp || phone, email, website || null,
            image_url || null, plan_type, hours || null,
            tags && tags.length ? tags : null,
            lat || null, lng || null, location
        ]);

        const business = result.rows[0];

        // Poblar pivot business_categories
        for (let i = 0; i < catIds.length; i++) {
            await client.query(
                `INSERT INTO business_categories (business_id, category_id, is_primary, position)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (business_id, category_id) DO NOTHING`,
                [business.id, catIds[i], i === 0, i]
            );
        }

        // Vincular al usuario si se proporcionó
        if (user_id) {
            await client.query(`
                INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit)
                VALUES ($1, $2, TRUE, TRUE)
            `, [user_id, business.id]);
        }

        // Lead interno para seguimiento
        await client.query(`
            INSERT INTO service_leads (business_id, service_type, status, contact_name, contact_email, contact_phone, notes)
            VALUES ($1, $2, 'pending', $3, $4, $5, $6)
        `, [
            business.id, plan_type, name, email, phone,
            JSON.stringify({ source: 'web_register', ruc, address, website })
        ]);

        await client.query('COMMIT');

        // Invalidar cachés relacionadas
        await invalidateCache('dir:biz:*');
        await invalidateCache('dir:stats');
        await invalidateCache('dir:categories:all');

        res.status(201).json({ success: true, data: business });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('Create business error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// ── GET /gallery/:id ── Un producto/item de galería con datos de empresa ──────
// Para compartir productos con preview propio (SSR /producto/:id)
router.get('/gallery/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id) return res.status(404).json({ success: false, error: 'No encontrado' });
        const result = await pool.query(`
            SELECT g.id, g.image_url, g.link_url, g.link_label, g.caption, g.position,
                   g.price, g.price_label, g.description, g.is_available,
                   b.name AS business_name, b.trade_name, b.slug AS business_slug,
                   b.image_url AS business_logo, b.city, b.verified,
                   b.whatsapp, b.phone,
                   c.name AS category_name, c.slug AS category_slug
            FROM business_gallery g
            JOIN businesses b ON b.id = g.business_id
            LEFT JOIN categories c ON c.id = b.category_id
            WHERE g.id = $1
        `, [id]);
        if (!result.rows.length) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// PERFIL DE EMPRESA (con reviews)
// ============================================
router.get('/businesses/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const cacheKey = `dir:biz:${slug}`;
        let data = await getCache(cacheKey);

        if (!data) {
            const BIZ_QUERY = `
                SELECT b.id, b.ruc, b.name, b.trade_name as "tradeName", b.slug, b.description, b.address, b.city, b.department,
                       b.phone, b.whatsapp, b.email, b.website, b.hours,
                       b.hours_json as "hoursJson", b.tags, b.lat, b.lng, b.verified,
                       b.claimed_by as "claimedBy", b.claim_status as "claimStatus",
                       EXISTS (
                         SELECT 1 FROM user_businesses ub
                         WHERE ub.business_id = b.id AND ub.is_owner = TRUE
                       ) AS "hasOwner",
                       b.logo_emoji as "logoEmoji",
                       b.image_url as "imageUrl",
                       b.cover_url as "coverUrl", b.cover_focal_x as "coverFocalX", b.cover_focal_y as "coverFocalY",
                       b.plan_type as "planType",
                       b.rating, b.review_count as "reviewCount",
                       fn_quality_score(b.*) AS "qualityScore",
                       fn_profile_completion(b.*) AS completion,
                       b.social_instagram as "socialInstagram",
                       b.social_facebook  as "socialFacebook",
                       b.social_tiktok    as "socialTiktok",
                       b.social_linkedin  as "socialLinkedin",
                       b.social_twitter   as "socialTwitter",
                       b.social_youtube   as "socialYoutube",
                       c.name as "categoryName", c.slug as "categorySlug",
                       c.color as "categoryColor", c.bg_color as "categoryBg",
                       (
                         SELECT COALESCE(json_agg(json_build_object(
                             'id', cx.id, 'slug', cx.slug, 'name', cx.name,
                             'icon', cx.icon, 'color', cx.color, 'bgColor', cx.bg_color,
                             'isPrimary', bcx.is_primary
                         ) ORDER BY bcx.is_primary DESC, bcx.position), '[]'::json)
                         FROM business_categories bcx
                         JOIN categories cx ON cx.id = bcx.category_id
                         WHERE bcx.business_id = b.id
                       ) AS categories
                FROM businesses b JOIN categories c ON b.category_id = c.id
                WHERE b.slug = $1 AND b.is_active = TRUE`;
            let result = await pool.query(BIZ_QUERY, [slug]);
            if (result.rows.length === 0) {
                // El slug pedido puede ser el de un DUPLICADO desactivado (ej. una
                // re-importación creó un row nuevo y desactivó el viejo, ambos con el
                // mismo RUC). Mapear por RUC al ÚNICO negocio activo con ese RUC.
                // Seguro: nunca cae en otro negocio (RUC distinto) y si hay ambigüedad
                // (0 ó >1 activos con ese RUC) no resuelve.
                const prev = await pool.query('SELECT ruc FROM businesses WHERE slug = $1 LIMIT 1', [slug]);
                const ruc = prev.rows[0] && prev.rows[0].ruc;
                if (ruc) {
                    const act = await pool.query('SELECT slug FROM businesses WHERE ruc = $1 AND is_active = TRUE', [ruc]);
                    if (act.rows.length === 1) result = await pool.query(BIZ_QUERY, [act.rows[0].slug]);
                }
            }
            if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });

            const reviews = await pool.query(`
                SELECT id, author_name as "authorName", author_email as "authorEmail", 
                       rating, comment, is_approved as "isApproved", created_at as "createdAt",
                       owner_reply as "ownerReply", owner_replied_at as "ownerRepliedAt"
                FROM reviews 
                WHERE business_id = $1 AND is_approved = TRUE
                ORDER BY created_at DESC LIMIT 20
            `, [result.rows[0].id]);

            // Galería — solo para planes featured y premium
            const bizData = result.rows[0];
            let gallery = [];
            if (['featured','premium'].includes(bizData.planType)) {
                const galleryResult = await pool.query(
                    `SELECT id, image_url, link_url, link_label, caption, position,
                            description, price, price_label, is_available
                     FROM business_gallery WHERE business_id=$1 ORDER BY position`,
                    [bizData.id]
                );
                gallery = galleryResult.rows;
            }

            data = { ...bizData, reviews: reviews.rows, gallery };
            await setCache(cacheKey, data, 60); // 60s — balance entre performance y sincronía
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// SUGERENCIAS DE BÚSQUEDA
// ============================================
router.get('/search/suggestions', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json({ success: true, data: [] });

        const result = await pool.query(`
            SELECT b.slug, b.name, b.city, b.ruc,
                   c.name as category_name, c.slug as category_slug
            FROM businesses b
            JOIN categories c ON b.category_id = c.id
            WHERE b.is_active = TRUE
              AND (
                b.name ILIKE $1
                OR b.ruc ILIKE $1
                OR similarity(b.name, $2) > 0.35
              )
            ORDER BY
                CASE WHEN b.name ILIKE $1 THEN 0 ELSE 1 END,
                CASE b.plan_type WHEN 'premium' THEN 0 WHEN 'featured' THEN 1 ELSE 2 END,
                similarity(b.name, $2) DESC
            LIMIT 8
        `, [`%${q}%`, q]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// BÚSQUEDA POPULAR (trending)
// ============================================
router.get('/search/popular', async (req, res) => {
    try {
        const cacheKey = 'dir:popular';
        let data = await getCache(cacheKey);
        if (!data) {
            // Primero intentar por search_count (búsquedas reales)
            const bySearch = await pool.query(`
                SELECT slug, name, icon, color, bg_color as "bgColor", search_count as "searchCount"
                FROM categories
                WHERE search_count > 0
                ORDER BY search_count DESC
                LIMIT 5
            `);

            if (bySearch.rows.length >= 3) {
                data = bySearch.rows;
            } else {
                // Fallback: top por cantidad de empresas
                const byCount = await pool.query(`
                    SELECT c.slug, c.name, c.icon, c.color, c.bg_color as "bgColor",
                           COUNT(b.id) as "searchCount"
                    FROM categories c
                    LEFT JOIN businesses b ON b.category_id = c.id AND b.is_active = TRUE
                    GROUP BY c.id, c.slug, c.name, c.icon, c.color, c.bg_color
                    HAVING COUNT(b.id) > 0
                    ORDER BY COUNT(b.id) DESC
                    LIMIT 5
                `);
                data = byCount.rows;
            }
            await setCache(cacheKey, data, 120); // 2 min — se actualiza rápido
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// STATS
// ============================================
router.get('/stats', async (req, res) => {
    try {
        const cacheKey = 'dir:stats';
        let data = await getCache(cacheKey);
        if (!data) {
            const result = await pool.query(`
                SELECT 
                    (SELECT COUNT(*) FROM businesses WHERE is_active) as businesses,
                    (SELECT COUNT(*) FROM categories) as categories,
                    (SELECT COUNT(*) FROM businesses WHERE plan_type IN ('featured', 'premium')) as professionals,
                    (SELECT COUNT(*) FROM reviews WHERE is_approved) as reviews
            `);
            data = result.rows[0];
            await setCache(cacheKey, data, 300);
        }
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// CREAR RESEÑA
// ============================================
router.post('/businesses/:slug/reviews', async (req, res, next) => {
    // Rate limit: máx 10 reseñas por IP cada 15 minutos
    const limiter = req.app.locals.writeLimiter;
    if (limiter) return limiter(req, res, next);
    next();
}, async (req, res) => {
    try {
        const { slug } = req.params;
        const { authorName, authorEmail, rating, comment } = req.body;

        if (!authorName || !rating || !comment) {
            return res.status(400).json({ success: false, error: 'Nombre, rating y comentario son requeridos' });
        }
        if (rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, error: 'Rating debe ser entre 1 y 5' });
        }
        if (String(authorName).length > 100) {
            return res.status(400).json({ success: false, error: 'Nombre demasiado largo' });
        }
        if (String(comment).length > 1000) {
            return res.status(400).json({ success: false, error: 'Comentario demasiado largo (máx 1000 caracteres)' });
        }

        const bizResult = await pool.query('SELECT id FROM businesses WHERE slug = $1', [slug]);
        if (bizResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Empresa no encontrada' });
        }
        const businessId = bizResult.rows[0].id;

        const result = await pool.query(`
            INSERT INTO reviews (business_id, author_name, author_email, rating, comment, is_approved)
            VALUES ($1, $2, $3, $4, $5, TRUE)
            RETURNING id, author_name as "authorName", author_email as "authorEmail", 
                      rating, comment, is_approved as "isApproved", created_at as "createdAt"
        `, [businessId, authorName, authorEmail || null, rating, comment]);

        await invalidateCache(`dir:biz:${slug}`);
        await invalidateCache('dir:stats');

        // Notificar al dueño si tiene cuenta — asíncrono, no bloquea
        ;(async () => {
            const { notifyOwner } = require('../helpers/notifyOwner');
            await notifyOwner(businessId, 'newReview', {
                rating:     rating,
                comment:    comment || '',
                authorName: authorName,
            });
        })().catch(() => {});

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// LEADS / REGISTRO DE EMPRESA (LEGACY - mantiene compatibilidad)
// Ahora redirige a POST /businesses
// ============================================
router.post('/leads', async (req, res) => {
    try {
        const { plan_type, name, ruc, category_id, description, phone, email, address, city, website, contact_name, contact_email, image_url, user_id } = req.body;
        if (!name || !phone || !email || !contact_name || !contact_email) {
            return res.status(400).json({ success: false, error: 'Campos requeridos faltantes' });
        }

        // Límite de 1 empresa para usuarios sin plan pago
        if (await ownerFreeLimitReached(user_id)) {
            return res.status(403).json({ success: false, code: 'FREE_LIMIT', error: FREE_LIMIT_MSG });
        }

        // D7.3d — el auto-registro NUNCA activa un plan pago gratis:
        // la ficha nace en 'basic' y el plan pago deseado queda como Lead
        // (service_leads) para contratarse luego vía Tpago desde el portal.
        const desiredPlan  = ['featured', 'premium'].includes(plan_type) ? plan_type : 'basic';
        const effectivePlan = 'basic';

        // Crear empresa directamente (FIX PRINCIPAL)
        const businessData = {
            name, ruc, category_id, description, phone, email, address, website,
            image_url, plan_type: effectivePlan, user_id
        };

        // Hacer la creación internamente
        let slug = name.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        let slugExists = true;
        let slugSuffix = '';
        let counter = 1;
        while (slugExists) {
            const check = await pool.query('SELECT id FROM businesses WHERE slug = $1', [slug + slugSuffix]);
            if (check.rows.length === 0) {
                slugExists = false;
            } else {
                slugSuffix = '-' + counter;
                counter++;
            }
        }
        slug = slug + slugSuffix;

        const result = await pool.query(`
            INSERT INTO businesses (
                ruc, name, slug, category_id, description, address, city, department,
                phone, email, website, image_url, plan_type, verified, is_active, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, FALSE, TRUE, NOW())
            RETURNING *
        `, [
            ruc || null, name, slug, category_id || null, description || null, address || null,
            city || null, null, phone, email, website || null, image_url || null, effectivePlan
        ]);

        const business = result.rows[0];

        if (user_id) {
            try {
                await pool.query(`
                    INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit)
                    VALUES ($1, $2, TRUE, TRUE)
                `, [user_id, business.id]);
            } catch (e) {}
        }

        // Crear lead de seguimiento con TODOS los datos de empresa en notes
        const notesData = {
            name: name,
            business_name: name,
            company_name: name,
            ruc: ruc || '',
            category_id: category_id || null,
            description: description || '',
            phone: phone || '',
            business_phone: phone || '',
            email: email || '',
            business_email: email || '',
            address: address || '',
            city: city || '',
            website: website || '',
            image_url: image_url || '',
            user_id: user_id || null,
            source: 'web_registration',
            desired_plan: desiredPlan,
            plan_intent: desiredPlan !== 'basic' ? `Quiere contratar plan ${desiredPlan} (registro landing) — pendiente de pago vía Tpago` : null,
            registered_at: new Date().toISOString()
        };

        await pool.query(`
            INSERT INTO service_leads (business_id, business_name, service_type, status, contact_name, contact_email, contact_phone, notes, created_at, updated_at)
            VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
            business.id, name, desiredPlan, contact_name, contact_email, phone,
            JSON.stringify(notesData)
        ]);

        // Enviar email de aviso — destinatarios desde site_config (fire & forget)
        ;(async () => {
            try {
                const cfgRow = await pool.query("SELECT value FROM site_config WHERE key='leads_emails'");
                const rawEmails = cfgRow.rows[0]?.value || 'leads@retopa.com.py';
                const recipients = rawEmails.split(',').map(e => e.trim()).filter(Boolean);
                const emailData = {
                    contactName:   contact_name,
                    contactEmail:  contact_email,
                    contactPhone:  phone,
                    businessName:  name,
                    businessPhone: phone,
                    serviceType:   plan_type || 'basic',
                    businessUrl:   `https://retopa.com.py/empresa/${business.slug || ''}`,
                    notes:         notesData.description || '',
                };
                for (const recipient of recipients) {
                    await sendEmail(recipient, 'newLead', emailData)
                        .catch(err => console.error(`[Lead email → ${recipient}]`, err.message));
                }
            } catch (e) { console.error('[Lead email]', e.message); }
        })();

        // Config del sitio (para correos)
        let siteName = 'RetoPA', siteUrl = 'https://retopa.com.py';
        try {
            const cfgRow = await pool.query("SELECT key, value FROM site_config WHERE key IN ('site_name','site_url')");
            cfgRow.rows.forEach(r => { if (r.key === 'site_name' && r.value) siteName = r.value; if (r.key === 'site_url' && r.value) siteUrl = r.value; });
        } catch (e) {}
        const bizPublicUrl = `${String(siteUrl).replace(/\/$/, '')}/empresa/${business.slug || ''}`;

        // ACTIVACIÓN DE CUENTA: si el alta fue SIN sesión, provisionamos cuenta
        // pendiente para el dueño y le mandamos el correo de activación (confirmá
        // tu correo creando tu contraseña). Si ya tenía cuenta verificada, se
        // engancha en el acto y se le manda el 'welcome' normal.
        let activationSent = false;
        if (!user_id) {
            try {
                const r = await provisionFichaOwnerActivation({
                    pool, sendEmail,
                    email: contact_email, name: contact_name,
                    businessId: business.id, businessName: name,
                    siteName, siteUrl, businessUrl: bizPublicUrl,
                });
                activationSent = !!(r && r.sentActivation);
            } catch (e) { console.error('[Ficha activation]', e.message); }
        }

        // Email de bienvenida al dueño — solo si NO mandamos el de activación.
        if (!activationSent) {
            ;(async () => {
                try {
                    const planLabel = { basic: 'Ficha Básica', featured: 'Negocio Digital', premium: 'Empresa Pro' }[plan_type || 'basic'] || 'Ficha Básica';
                    await sendEmail(contact_email, 'welcome', {
                        name:         contact_name,
                        businessName: name,
                        email:        contact_email,
                        planType:     planLabel,
                        siteUrl:      siteUrl,
                        siteName:     siteName,
                    }).catch(err => console.error('[Welcome email biz]', err.message));
                } catch(e) { console.error('[Welcome email biz]', e.message); }
            })();
        }

        await invalidateCache('dir:biz:*');
        await invalidateCache('dir:stats');

        res.status(201).json({ success: true, data: { business, message: 'Empresa registrada. Aparecerá como "No verificada" hasta revisión.' } });
    } catch (err) {
        console.error('Lead error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// SITE CONFIG — público (solo datos seguros, sin SMTP)
// ============================================
router.get('/site-config', async (req, res) => {
  try {
    const cacheKey = 'dir:site-config';
    const cached = await getCache(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    const result = await pool.query(
      `SELECT key, value FROM site_config WHERE key IN
       ('site_name','site_url','contact_phone','contact_email',
        'seo_min_quality_score',
        'site_title','site_tagline',
        'social_facebook','social_instagram','social_linkedin','social_whatsapp',
        'whatsapp_url','whatsapp_message','google_maps_key',
        'services_label','services_title','services_desc',
        'hero_title','hero_subtitle','hero_description','hero_cta_text','hero_cta_link',
        'hero_bg_from','hero_bg_to',
        'plans_label','plans_title','plans_desc',
        'footer_tagline','footer_copyright',
        'footer_col2_title','footer_col2_links',
        'footer_col3_title','footer_col3_links',
        'footer_col4_title','footer_col4_links',
        'logo_url',
        'section_planes_enabled','section_servicios_enabled','section_promos_enabled',
        'reg_banner_enabled','reg_banner_delay_s','reg_banner_cooldown_days',
        'reg_banner_title','reg_banner_subtitle','reg_banner_cta','reg_banner_note',
        'achievements_config')`
    );
    const config = {};
    result.rows.forEach(r => { config[r.key] = r.value || ''; });

    await setCache(cacheKey, config, 300);
    res.json({ success: true, data: config });
  } catch (e) {
    // Fallback si la tabla no existe
    res.json({ success: true, data: {
      site_name: process.env.SITE_NAME || 'RetoPA',
      contact_phone: process.env.CONTACT_PHONE || '',
      contact_email: process.env.CONTACT_EMAIL || '',
      social_facebook: '', social_instagram: '', social_linkedin: '', social_whatsapp: '',
    }});
  }
});

// ============================================
// TRACKING — Banner de captación (público, fire & forget)
// POST /track/reg-banner  { event, slug, sid }
// Eventos válidos: impression | cta | dismiss | never | login
// ============================================
const REG_BANNER_EVENTS = ['impression', 'cta', 'dismiss', 'never', 'login'];
router.post('/track/reg-banner', async (req, res) => {
  // Responder ya: el cliente no espera nada (sendBeacon).
  res.status(204).end();
  try {
    const body = req.body || {};
    const event = String(body.event || '').slice(0, 20);
    if (!REG_BANNER_EVENTS.includes(event)) return;
    const sid  = body.sid  ? String(body.sid).slice(0, 64)  : null;
    const slug = body.slug ? String(body.slug).slice(0, 200) : null;
    const crypto = require('crypto');
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';
    const ipHash = crypto.createHash('sha256').update(ip + (process.env.JWT_SECRET || '')).digest('hex').slice(0, 32);
    const referrer = (req.headers['referer'] || req.headers['referrer'] || '').slice(0, 300) || null;
    await pool.query(
      'INSERT INTO reg_banner_events (event, session_id, business_slug, ip_hash, referrer) VALUES ($1,$2,$3,$4,$5)',
      [event, sid, slug, ipHash, referrer]
    );
  } catch (e) { /* nunca romper por telemetría */ }
});

// ============================================
// PLANES — público, con cache Redis
// ============================================
router.get('/plans', async (req, res) => {
  try {
    const cacheKey = 'dir:plans';
    const cached = await getCache(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    const result = await pool.query(
      'SELECT id, name, subtitle, price, features, is_featured, button_label, display_order, ribbon FROM plans WHERE is_active = TRUE ORDER BY display_order ASC'
    );
    const plans = result.rows.map(p => ({
      ...p,
      features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
    }));

    await setCache(cacheKey, plans, 600); // 10 min de cache
    res.json({ success: true, data: plans });
  } catch (err) {
    // Si la tabla no existe aún, devolver datos por defecto
    res.json({ success: true, data: [
      { id: 'basic',    name: 'Ficha Básica',    subtitle: 'Para empezar a aparecer',          price: 0,      is_featured: false, button_label: 'Registrar gratis', features: ['Ficha en el directorio','Datos de contacto','1 categoría'] },
      { id: 'featured', name: 'Negocio Digital', subtitle: 'Todo lo que necesitás para vender', price: 299000, is_featured: true,  button_label: 'Empezar ahora',    features: ['Ficha destacada','Sitio web profesional','CRM básico'] },
      { id: 'premium',  name: 'Empresa Pro',     subtitle: 'Suite completa sin límites',        price: 599000, is_featured: false, button_label: 'Contactar ventas', features: ['Todo lo de Negocio Digital','ERP completo','CRM ilimitado'] },
    ]});
  }
});

// ============================================
// LIKES — toggle like en empresa
// ============================================
router.post('/businesses/:slug/like', async (req, res) => {
    try {
        const { slug } = req.params;
        const bizResult = await pool.query('SELECT id, like_count FROM businesses WHERE slug=$1', [slug]);
        if (!bizResult.rows.length) return res.status(404).json({ success: false, error: 'Empresa no encontrada' });
        const biz = bizResult.rows[0];

        // Identificar usuario: por JWT o por IP hash
        let userId = null;
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
            } catch(e) {}
        }

        const crypto = require('crypto');
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';
        const ipHash = crypto.createHash('sha256').update(ip + process.env.JWT_SECRET).digest('hex').slice(0, 64);

        // Verificar si ya le dio like
        const existing = userId
            ? await pool.query('SELECT id FROM business_likes WHERE business_id=$1 AND user_id=$2', [biz.id, userId])
            : await pool.query('SELECT id FROM business_likes WHERE business_id=$1 AND ip_hash=$2', [biz.id, ipHash]);

        let liked;
        if (existing.rows.length) {
            // Ya tiene like → remover (toggle)
            if (userId) {
                await pool.query('DELETE FROM business_likes WHERE business_id=$1 AND user_id=$2', [biz.id, userId]);
            } else {
                await pool.query('DELETE FROM business_likes WHERE business_id=$1 AND ip_hash=$2', [biz.id, ipHash]);
            }
            liked = false;
        } else {
            // Agregar like
            if (userId) {
                await pool.query('INSERT INTO business_likes (business_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [biz.id, userId]);
            } else {
                await pool.query('INSERT INTO business_likes (business_id, ip_hash) VALUES ($1,$2) ON CONFLICT DO NOTHING', [biz.id, ipHash]);
            }
            liked = true;
        }

        // Obtener nuevo count
        const countResult = await pool.query('SELECT like_count FROM businesses WHERE id=$1', [biz.id]);
        const likeCount = countResult.rows[0]?.like_count || 0;

        // Invalidar cache de la empresa
        try { await redisClient.del(`dir:biz:${slug}`); } catch(e) {}

        // Notificar al dueño si alcanzó un hito de likes — asíncrono
        if (liked) {
            ;(async () => {
                const { notifyOwner, LIKE_MILESTONES } = require('../helpers/notifyOwner');
                if (LIKE_MILESTONES.has(likeCount)) {
                    await notifyOwner(biz.id, 'likeMilestone', { likeCount });
                }
            })().catch(() => {});
        }

        res.json({ success: true, liked, likeCount });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET — estado del like para un usuario/IP
router.get('/businesses/:slug/like', async (req, res) => {
    try {
        const { slug } = req.params;
        const bizResult = await pool.query('SELECT id, like_count FROM businesses WHERE slug=$1', [slug]);
        if (!bizResult.rows.length) return res.status(404).json({ success: false });
        const biz = bizResult.rows[0];

        let userId = null;
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
            } catch(e) {}
        }

        const crypto = require('crypto');
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';
        const ipHash = crypto.createHash('sha256').update(ip + process.env.JWT_SECRET).digest('hex').slice(0, 64);

        const existing = userId
            ? await pool.query('SELECT id FROM business_likes WHERE business_id=$1 AND user_id=$2', [biz.id, userId])
            : await pool.query('SELECT id FROM business_likes WHERE business_id=$1 AND ip_hash=$2', [biz.id, ipHash]);

        res.json({ success: true, liked: existing.rows.length > 0, likeCount: biz.like_count || 0 });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================
// CLAIM — reclamar una empresa no verificada
// ============================================
router.post('/businesses/:slug/claim', async (req, res) => {
    try {
        const { slug } = req.params;
        const { contact_name, contact_email, contact_phone, message, evidence_url } = req.body;

        if (!contact_name || !contact_email) {
            return res.status(400).json({ success: false, error: 'Nombre y email son requeridos' });
        }

        const bizResult = await pool.query(
            'SELECT id, name, verified, claim_status FROM businesses WHERE slug=$1', [slug]
        );
        if (!bizResult.rows.length) return res.status(404).json({ success: false, error: 'Empresa no encontrada' });
        const biz = bizResult.rows[0];

        if (biz.verified) {
            return res.status(400).json({ success: false, error: 'Esta empresa ya fue verificada' });
        }
        if (biz.claim_status === 'approved') {
            return res.status(409).json({ success: false, error: 'Esta empresa ya fue reclamada.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Marcar la ficha como claim_pending → aparece en el panel Claims
            // (igual que el flujo por token). Sin cuenta vinculada: el admin verifica
            // manualmente y contacta con los datos del lead.
            await client.query(
                `UPDATE businesses SET claim_status='pending', claimed_at=NOW(), updated_at=NOW()
                 WHERE id=$1 AND claim_status IS DISTINCT FROM 'approved'`, [biz.id]
            );
            // Lead espejo de tipo 'claim' con mensaje/evidencia (lo lee el panel Claims).
            await client.query(`
                INSERT INTO service_leads
                    (business_id, business_name, service_type, status, contact_name, contact_email, contact_phone, notes)
                VALUES ($1, $2, 'claim', 'pending', $3, $4, $5, $6)
            `, [
                biz.id, biz.name, contact_name, contact_email,
                contact_phone || null,
                JSON.stringify({ source: 'claim_form', message: message || '', evidence_url: evidence_url || '', claimed_at: new Date().toISOString() })
            ]);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        try { await invalidateCache('dir:biz:*'); } catch (e) {}

        // Avisos por email — MISMO flujo que los leads y que el claim por token:
        // 1) confirmación al que reclama, 2) alerta a los buzones de leads_emails.
        // fire & forget: nunca bloquea ni rompe la respuesta.
        ;(async () => {
            try {
                const cfgRes = await pool.query(
                    "SELECT key, value FROM site_config WHERE key IN ('site_name','site_url','leads_emails')"
                );
                const cfg = {};
                cfgRes.rows.forEach(r => { cfg[r.key] = r.value; });
                const siteName   = cfg.site_name || 'RetoPA';
                const siteUrl    = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
                const recipients = (cfg.leads_emails || '').split(',').map(e => e.trim()).filter(Boolean);

                sendEmail(contact_email, 'claimReceived', {
                    name: contact_name, businessName: biz.name, email: contact_email, siteName, siteUrl,
                }).catch(e => console.warn('[Claim form] email recepción:', e.message));

                for (const recipient of recipients) {
                    sendEmail(recipient, 'claimAdminAlert', {
                        businessName: biz.name,
                        userName:     contact_name,
                        userEmail:    contact_email,
                        userPhone:    contact_phone || null,
                        city:         null,
                        adminUrl:     `${siteUrl}/admin`,
                        siteName, siteUrl,
                    }).catch(e => console.warn(`[Claim form] email admin → ${recipient}:`, e.message));
                }
            } catch (e) { console.warn('[Claim form] avisos email:', e.message); }
        })();

        res.json({ success: true, message: 'Tu solicitud fue enviada. Te contactaremos en 24-48hs para verificar y transferir la empresa.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /services — público ───────────────────────────────────────────────
router.get('/services', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM services WHERE is_active = TRUE ORDER BY display_order ASC, id ASC'
    );
    const data = result.rows.map(s => ({
      ...s,
      features: Array.isArray(s.features) ? s.features : JSON.parse(s.features || '[]')
    }));
    res.json({ success: true, data });
  } catch (err) {
    // Fallback si la tabla no existe aún
    res.json({ success: true, data: [] });
  }
});

module.exports = router;
