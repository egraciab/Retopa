/**
 * RetoPA — promotions.routes.js
 * S6.1 — Sistema de Promociones
 */

const express    = require('express');
const pool       = require('../db');
const jwt        = require('jsonwebtoken');
const JWT_SECRET = require('../config/jwt');

function requireAuth(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Token requerido' });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); }
    catch(e) { res.status(401).json({ success: false, error: 'Token inválido' }); }
}
function requireAdmin(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Token requerido' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!['admin','godmode'].includes(decoded.role))
            return res.status(403).json({ success: false, error: 'Acceso denegado' });
        req.user = decoded; next();
    } catch(e) { res.status(401).json({ success: false, error: 'Token inválido' }); }
}

const ACTIVE_WHERE = `p.is_active = TRUE AND p.expires_at > NOW() AND (p.starts_at IS NULL OR p.starts_at <= NOW())`;

async function getBoostConfig() {
    const r = await pool.query(
        "SELECT key, value FROM site_config WHERE key LIKE 'promo_boost_%' OR key='promo_buy_url'"
    ).catch(() => ({ rows: [] }));
    const cfg = {};
    r.rows.forEach(row => { cfg[row.key] = row.value; });
    // Descripciones por defecto (orientadas a conversión) — editables desde el admin
    const DEF_DESC = {
        boost_7d:  'Tu promo aparece destacada en su categoría durante 7 días. Ideal para probar y dar un empujón rápido.',
        boost_15d: 'El doble de tiempo destacada en tu categoría. Más días visible = más clientes que te encuentran.',
        boost_home_30d: 'Máxima exposición: tu promo aparece en la portada de RetoPA por 30 días, vista por todos los visitantes. El que más vende.',
    };
    return {
        boost_7d:       { days: parseInt(cfg.promo_boost_7d_days)||7,    price: parseInt(cfg.promo_boost_7d_price)||20000,   url: cfg.promo_boost_7d_url||cfg.promo_buy_url||'',   desc: cfg.promo_boost_7d_desc  || DEF_DESC.boost_7d },
        boost_15d:      { days: parseInt(cfg.promo_boost_15d_days)||15,  price: parseInt(cfg.promo_boost_15d_price)||50000,  url: cfg.promo_boost_15d_url||cfg.promo_buy_url||'',  desc: cfg.promo_boost_15d_desc || DEF_DESC.boost_15d },
        boost_home_30d: { days: parseInt(cfg.promo_boost_home_days)||30, price: parseInt(cfg.promo_boost_home_price)||100000, url: cfg.promo_boost_home_url||cfg.promo_buy_url||'', desc: cfg.promo_boost_home_desc || DEF_DESC.boost_home_30d },
    };
}

// Mantener compatibilidad con código que usa getBoostPrices
async function getBoostPrices() {
    const c = await getBoostConfig();
    return { boost_7d: c.boost_7d.price, boost_15d: c.boost_15d.price, boost_home_30d: c.boost_home_30d.price };
}

// ═══════════════════════════════════════════════════════════════
// ROUTER PÚBLICO — montado en /api/v2/promotions
// ═══════════════════════════════════════════════════════════════
const publicRouter = express.Router();

publicRouter.get('/home', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const promos = await pool.query(`
            SELECT p.id, p.title, p.description, p.image_url,
                   p.original_price, p.promo_price, p.discount_pct, p.price_label,
                   p.expires_at, p.boost_type, p.cta_label, p.cta_url,
                   b.name AS business_name, b.trade_name, b.slug AS business_slug,
                   b.image_url AS business_logo, b.city, b.verified,
                   b.whatsapp, b.phone,
                   p.description,
                   c.name AS category_name, c.slug AS category_slug
            FROM promotions p
            JOIN businesses b ON b.id = p.business_id
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE ${ACTIVE_WHERE} AND p.show_in_home = TRUE
            ORDER BY p.created_at DESC LIMIT $1
        `, [parseInt(limit)]);
        res.json({ success: true, data: promos.rows });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

publicRouter.get('/', async (req, res) => {
    try {
        const { category, city, limit = 20, offset = 0, business } = req.query;
        let where = [ACTIVE_WHERE];
        const params = [];
        let idx = 1;
        if (category) { where.push(`c.slug = $${idx++}`);      params.push(category); }
        if (city)     { where.push(`unaccent(b.city) ILIKE unaccent($${idx++})`);   params.push(`%${city}%`); }
        if (business) { where.push(`b.slug = $${idx++}`);      params.push(business); }

        const promos = await pool.query(`
            SELECT p.id, p.title, p.description, p.image_url,
                   p.original_price, p.promo_price, p.discount_pct, p.price_label,
                   p.expires_at, p.boost_type, p.show_in_home, p.cta_label, p.cta_url,
                   b.name AS business_name, b.trade_name, b.slug AS business_slug,
                   b.image_url AS business_logo, b.city, b.verified,
                   b.whatsapp, b.phone,
                   c.name AS category_name, c.slug AS category_slug
            FROM promotions p
            JOIN businesses b ON b.id = p.business_id
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE ${where.join(' AND ')}
            ORDER BY
                p.boost_type = 'boost_home_30d' DESC,
                p.boost_type = 'boost_15d' DESC,
                p.boost_type = 'boost_7d' DESC,
                p.created_at DESC
            LIMIT $${idx} OFFSET $${idx+1}
        `, [...params, parseInt(limit), parseInt(offset)]);
        res.json({ success: true, data: promos.rows });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

publicRouter.post('/:id/click', async (req, res) => {
    try {
        await pool.query('UPDATE promotions SET clicks=clicks+1 WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /:id — Una promo individual con datos de empresa (para compartir / SSR preview)
publicRouter.get('/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id, p.title, p.description, p.image_url,
                   p.original_price, p.promo_price, p.discount_pct, p.price_label,
                   p.starts_at, p.expires_at, p.is_active, p.boost_type, p.cta_label, p.cta_url,
                   b.name AS business_name, b.trade_name, b.slug AS business_slug,
                   b.image_url AS business_logo, b.city, b.verified,
                   b.whatsapp, b.phone,
                   c.name AS category_name, c.slug AS category_slug,
                   (p.is_active = TRUE AND p.expires_at > NOW()) AS vigente
            FROM promotions p
            JOIN businesses b ON b.id = p.business_id
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE p.id = $1
        `, [parseInt(req.params.id)]);
        if (!result.rows.length) return res.status(404).json({ success: false, error: 'Promoción no encontrada' });
        res.json({ success: true, data: result.rows[0] });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ROUTER CLIENTE — montado en /api/v2/client/promotions
// ═══════════════════════════════════════════════════════════════
const clientRouter = express.Router();
clientRouter.use(requireAuth);

// GET / — listar mis promos + estado de mis boosts
clientRouter.get('/', async (req, res) => {
    try {
        const promos = await pool.query(`
            SELECT p.*, b.name AS business_name, b.trade_name, b.slug AS business_slug,
                   b.plan_type,
                   EXTRACT(EPOCH FROM (p.expires_at - NOW())) AS seconds_left
            FROM promotions p
            JOIN businesses b ON b.id = p.business_id
            JOIN user_businesses ub ON ub.business_id = b.id
            WHERE ub.user_id = $1 AND ub.is_owner = TRUE
            ORDER BY p.created_at DESC
        `, [req.user.id]);

        const boosts = await pool.query(`
            SELECT pb.id, pb.boost_type, pb.price_gs, pb.status,
                   pb.created_at, pb.expires_at, pb.promotion_id,
                   b.name AS business_name, b.trade_name, b.slug AS business_slug
            FROM promotion_boosts pb
            JOIN businesses b ON b.id = pb.business_id
            JOIN user_businesses ub ON ub.business_id = b.id
            WHERE ub.user_id = $1 AND ub.is_owner = TRUE
            ORDER BY pb.created_at DESC
        `, [req.user.id]);

        const config   = await getBoostConfig();
        const prices   = await getBoostPrices();
        const cfgBuy   = await pool.query("SELECT value FROM site_config WHERE key='promo_buy_url'").catch(()=>({rows:[]}));
        const buyUrl   = cfgBuy.rows[0]?.value || '';

        // Para cada empresa del usuario, verificar si usó la promo del plan este mes calendario
        // Resetea el 1ro de cada mes, sin importar cuándo se activó el plan
        const planPromoCheck = await pool.query(`
            SELECT b.slug, COUNT(p.id) AS used
            FROM businesses b
            JOIN user_businesses ub ON ub.business_id = b.id
            LEFT JOIN promotions p ON p.business_id = b.id
                AND p.boost_type = 'plan'
                AND DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', NOW())
            WHERE ub.user_id = $1
            GROUP BY b.slug
        `, [req.user.id]).catch(()=>({rows:[]}));

        // Mapa { slug -> bool }
        const planPromoUsedMap = {};
        planPromoCheck.rows.forEach(r => {
            planPromoUsedMap[r.slug] = parseInt(r.used) > 0;
        });

        res.json({
            success: true,
            data: promos.rows,
            boosts: boosts.rows,
            boost_prices: prices,
            boost_config: config,
            buy_url: buyUrl,
            plan_promo_used: planPromoUsedMap,
        });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST / — crear promo (desde plan Pro o desde boost aprobado)
clientRouter.post('/', async (req, res) => {
    try {
        const { business_slug, title, description, image_url,
                original_price, promo_price, discount_pct, price_label,
                expires_at, category_id, city,
                cta_label, cta_url,
                boost_id } = req.body; // boost_id: si viene de un boost aprobado

        if (!business_slug || !title || !expires_at)
            return res.status(400).json({ success: false, error: 'business_slug, title y expires_at son requeridos' });

        const biz = await pool.query(`
            SELECT b.id, b.plan_type,
                   COALESCE(pl.max_promotions, 0) AS max_promotions
            FROM businesses b
            LEFT JOIN plans pl ON pl.id = b.plan_type
            JOIN user_businesses ub ON ub.business_id = b.id
            WHERE b.slug = $1 AND ub.user_id = $2 AND ub.is_owner = TRUE
        `, [business_slug, req.user.id]);

        if (!biz.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso' });
        const { id: bizId, plan_type, max_promotions } = biz.rows[0];

        let boost_type  = 'plan';
        let show_home   = false;
        let show_cat    = false;
        let finalExpiry = expires_at;

        if (boost_id) {
            // Viene de un boost comprado y aprobado
            const boostRow = await pool.query(`
                SELECT pb.* FROM promotion_boosts pb
                WHERE pb.id = $1 AND pb.business_id = $2 AND pb.status = 'paid'
            `, [boost_id, bizId]);

            if (!boostRow.rows.length)
                return res.status(403).json({ success: false, error: 'Boost no encontrado o no aprobado' });

            const b = boostRow.rows[0];
            boost_type  = b.boost_type;
            show_home   = b.boost_type === 'boost_home_30d';
            show_cat    = true;
            finalExpiry = b.expires_at; // usar la fecha que fijó el admin al aprobar

            // Verificar que no hay promo activa asociada a este boost
            const existingPromo = await pool.query(
                `SELECT id FROM promotions WHERE business_id=$1 AND boost_type=$2 AND is_active=TRUE AND expires_at > NOW() AND created_at >= $3`,
                [bizId, boost_type, b.created_at]
            );
            if (existingPromo.rows.length)
                return res.status(400).json({ success: false, error: 'Ya existe una promoción activa para este boost' });

        } else {
            // Viene del plan Pro (boost incluido)
            if (parseInt(max_promotions) === 0)
                return res.status(403).json({ success: false, error: 'Tu plan no incluye promociones. Comprá un boost para publicar.' });

            // Verificar que no usó la promo del plan este mes (incluyendo eliminadas)
            const monthCheck = await pool.query(
                `SELECT COUNT(*) FROM promotions WHERE business_id=$1 AND boost_type='plan'
                 AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
                [bizId]
            );
            if (parseInt(monthCheck.rows[0].count) > 0)
                return res.status(400).json({ success: false, error: 'Ya usaste tu promoción mensual del Plan Pro. Se renueva el 1° de cada mes.' });

            // Plan Pro: siempre 7 días fijos independiente de lo que mande el cliente
            finalExpiry = new Date(Date.now() + 7 * 86400000);
        }

        // CTA personalizado: solo disponible para plan Pro (premium)
        const ctaLabel = (plan_type === 'premium' && cta_label) ? String(cta_label).slice(0, 40) : null;
        const ctaUrl   = (plan_type === 'premium' && cta_url)   ? String(cta_url).slice(0, 500)  : null;

        const result = await pool.query(`
            INSERT INTO promotions
            (business_id, title, description, image_url, original_price, promo_price,
             discount_pct, price_label, boost_type, expires_at, category_id, city,
             show_in_home, show_in_category, cta_label, cta_url)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            RETURNING *
        `, [bizId, title, description||null, image_url||null,
            original_price||null, promo_price||null, discount_pct||null,
            price_label||'Gs.', boost_type, finalExpiry,
            category_id||null, city||null, show_home, show_cat, ctaLabel, ctaUrl]);

        const newPromoId = result.rows[0].id;

        // Si vino de un boost, vincular la promo creada al boost
        if (boost_id) {
            await pool.query(
                `UPDATE promotion_boosts SET promotion_id = $1 WHERE id = $2`,
                [newPromoId, boost_id]
            ).catch(() => {});
        }

        res.json({ success: true, data: result.rows[0] });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /:id — editar promo
clientRouter.put('/:id', async (req, res) => {
    try {
        const check = await pool.query(`
            SELECT p.id, b.plan_type FROM promotions p
            JOIN businesses b ON b.id = p.business_id
            JOIN user_businesses ub ON ub.business_id = b.id
            WHERE p.id = $1 AND ub.user_id = $2
        `, [req.params.id, req.user.id]);
        if (!check.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso' });
        const isPremium = check.rows[0].plan_type === 'premium';

        const body = req.body;
        const sets = [];
        const vals = [];
        let   idx  = 1;

        // Solo actualizar los campos que vienen en el body (PATCH semántico)
        const allowed = ['title','description','image_url','original_price','promo_price',
                         'discount_pct','price_label','expires_at','is_active','category_id','city'];
        // CTA solo editable por plan Pro
        if (isPremium) allowed.push('cta_label','cta_url');

        allowed.forEach(field => {
            if (field in body) {
                sets.push(`${field}=$${idx++}`);
                if (field === 'is_active') vals.push(body[field] !== false && body[field] !== 'false');
                else if (field === 'cta_label') vals.push(body[field] ? String(body[field]).slice(0,40) : null);
                else if (field === 'cta_url')   vals.push(body[field] ? String(body[field]).slice(0,500) : null);
                else vals.push(body[field] || null);
            }
        });

        if (!sets.length) return res.json({ success: true }); // nada que actualizar

        sets.push(`updated_at=NOW()`);
        vals.push(req.params.id);

        await pool.query(
            `UPDATE promotions SET ${sets.join(', ')} WHERE id=$${idx}`,
            vals
        );

        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /:id — eliminar promo
clientRouter.delete('/:id', async (req, res) => {
    try {
        const check = await pool.query(`
            SELECT p.id FROM promotions p
            JOIN businesses b ON b.id = p.business_id
            JOIN user_businesses ub ON ub.business_id = b.id
            WHERE p.id = $1 AND ub.user_id = $2
        `, [req.params.id, req.user.id]);
        if (!check.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso' });

        const promoId = parseInt(req.params.id);

        // Marcar el boost asociado como cancelado — el boost fue consumido, no se reutiliza
        await pool.query(
            `UPDATE promotion_boosts SET status='cancelled', promotion_id=NULL, updated_at=NOW()
             WHERE promotion_id=$1 AND status='paid'`,
            [promoId]
        ).catch(() => {});

        await pool.query('DELETE FROM promotions WHERE id=$1', [promoId]);
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /boost-request — solicitar boost de pago
clientRouter.post('/boost-request', async (req, res) => {
    try {
        const { promotion_id, business_slug, boost_type } = req.body;
        if (!boost_type || !['boost_7d','boost_15d','boost_home_30d'].includes(boost_type))
            return res.status(400).json({ success: false, error: 'boost_type inválido' });

        const prices = await getBoostPrices();
        const price  = prices[boost_type];

        let bizId   = null;
        let bizName = '';
        if (promotion_id) {
            const check = await pool.query(`
                SELECT b.id, b.name, b.trade_name FROM promotions p JOIN businesses b ON b.id=p.business_id
                JOIN user_businesses ub ON ub.business_id=b.id
                WHERE p.id=$1 AND ub.user_id=$2
            `, [promotion_id, req.user.id]);
            if (!check.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso' });
            bizId   = check.rows[0].id;
            bizName = check.rows[0].trade_name || check.rows[0].name || '';
        } else if (business_slug) {
            const biz = await pool.query(`
                SELECT b.id, b.name, b.trade_name FROM businesses b JOIN user_businesses ub ON ub.business_id=b.id
                WHERE b.slug=$1 AND ub.user_id=$2
            `, [business_slug, req.user.id]);
            if (!biz.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso' });
            bizId   = biz.rows[0].id;
            bizName = biz.rows[0].trade_name || biz.rows[0].name || business_slug;
        }

        // Idempotencia: verificar si ya existe un pending del mismo tipo para esta empresa
        const existing = await pool.query(
            `SELECT id FROM promotion_boosts WHERE business_id=$1 AND boost_type=$2 AND status='pending'`,
            [bizId, boost_type]
        );
        if (existing.rows.length) {
            return res.status(409).json({
                success: false,
                error: 'Ya tenés una solicitud pendiente de este tipo de boost. Esperá la aprobación antes de solicitar otro.'
            });
        }

        const boost = await pool.query(`
            INSERT INTO promotion_boosts (promotion_id, business_id, boost_type, price_gs, status)
            VALUES ($1,$2,$3,$4,'pending') RETURNING *
        `, [promotion_id||null, bizId, boost_type, price]);

        const boostId = boost.rows[0].id;

        // Crear lead vinculado al boost_id específico
        await pool.query(`
            INSERT INTO service_leads
            (business_id, service_type, status, contact_name, contact_email, notes, created_at)
            VALUES ($1, 'promo_boost', 'new', $2, $3, $4, NOW())
        `, [
            bizId,
            req.user.name || req.user.email,
            req.user.email,
            `boost_id:${boostId}|tipo:${boost_type}|precio:${price}|empresa:${bizName}`
        ]).catch(e => console.warn('[Boost Lead]', e.message));

        // Notificar a buzones de leads (como los otros leads del sistema)
        const { sendEmail } = require('../config/mail');
        const cfgRes = await pool.query(
            "SELECT key, value FROM site_config WHERE key IN ('leads_emails','site_name','site_url')"
        ).catch(()=>({rows:[]}));
        const cfg = {};
        cfgRes.rows.forEach(r => { cfg[r.key] = r.value; });
        const siteName  = cfg.site_name || 'RetoPA';
        const siteUrl   = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
        const rawEmails = cfg.leads_emails || '';
        const recipients = rawEmails.split(',').map(e=>e.trim()).filter(Boolean);

        // Notificar a buzones de leads
        const mailer = require('../config/mail');
        const adminSubject = `🔥 Nuevo boost — ${bizName} (${boost_type})`;
        for (const recipient of recipients) {
            mailer.sendRawEmail(recipient, adminSubject, `
                <p><strong>Empresa:</strong> ${bizName}<br>
                <strong>Tipo:</strong> ${boost_type}<br>
                <strong>Precio:</strong> Gs. ${price.toLocaleString('es-PY')}<br>
                <strong>Solicitante:</strong> ${req.user.email}</p>
                <p><a href="${siteUrl}/admin#leads" style="background:#1B3A6B;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Ver en Panel Admin →</a></p>
            `).catch(()=>{});
        }
        mailer.sendRawEmail(req.user.email,
            `✅ Recibimos tu solicitud de boost — ${bizName}`,
            `<p>Hola,</p><p>Recibimos tu solicitud de boost <strong>${boost_type}</strong> para <strong>${bizName}</strong>.</p>
            <p>Precio: <strong>Gs. ${price.toLocaleString('es-PY')}</strong>. El equipo de RetoPA lo activará tras confirmar el pago.</p>`
        ).catch(()=>{});

        res.json({
            success: true,
            data: boost.rows[0],
            message: `Solicitud registrada. El equipo de RetoPA lo activará tras confirmar el pago de Gs. ${price.toLocaleString('es-PY')}.`
        });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ROUTER ADMIN — montado en /api/v2/admin/promotions
// ═══════════════════════════════════════════════════════════════
const adminRouter = express.Router();
adminRouter.use(requireAdmin);

adminRouter.get('/', async (req, res) => {
    try {
        const { status = 'all', limit = 50, offset = 0 } = req.query;
        let where = ['1=1'];
        if (status === 'active')  where.push(`p.is_active=TRUE AND p.expires_at > NOW()`);
        if (status === 'expired') where.push(`p.expires_at <= NOW()`);
        if (status === 'pending') where.push(`p.is_active=FALSE`);

        const promos = await pool.query(`
            SELECT p.*, b.name AS business_name, b.trade_name, b.slug AS business_slug,
                   b.plan_type, c.name AS category_name
            FROM promotions p JOIN businesses b ON b.id=p.business_id
            LEFT JOIN categories c ON c.id=p.category_id
            WHERE ${where.join(' AND ')}
            ORDER BY p.created_at DESC LIMIT $1 OFFSET $2
        `, [parseInt(limit), parseInt(offset)]);
        res.json({ success: true, data: promos.rows });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

adminRouter.get('/boosts', async (req, res) => {
    try {
        const boosts = await pool.query(`
            SELECT pb.*, b.name AS business_name, b.slug AS business_slug,
                   p.title AS promo_title, u.name AS paid_by_name
            FROM promotion_boosts pb JOIN businesses b ON b.id=pb.business_id
            LEFT JOIN promotions p ON p.id=pb.promotion_id
            LEFT JOIN users u ON u.id=pb.paid_by
            ORDER BY pb.created_at DESC LIMIT 100
        `);
        const prices = await getBoostPrices();
        res.json({ success: true, data: boosts.rows, prices });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// endpoint viejo de approve eliminado — usar /admin/promotions/boosts/:id/approve

adminRouter.get('/prices', async (req, res) => {
    try {
        const cfg = await getBoostConfig();
        res.json({ success: true, prices: cfg });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

adminRouter.put('/prices', async (req, res) => {
    try {
        const {
            boost_7d_price, boost_7d_days, boost_7d_url, boost_7d_desc,
            boost_15d_price, boost_15d_days, boost_15d_url, boost_15d_desc,
            boost_home_30d, boost_home_days, boost_home_url, boost_home_desc,
        } = req.body;
        const updates = [
            ['promo_boost_7d_price',    boost_7d_price],
            ['promo_boost_7d_days',     boost_7d_days],
            ['promo_boost_7d_url',      boost_7d_url],
            ['promo_boost_7d_desc',     boost_7d_desc],
            ['promo_boost_15d_price',   boost_15d_price],
            ['promo_boost_15d_days',    boost_15d_days],
            ['promo_boost_15d_url',     boost_15d_url],
            ['promo_boost_15d_desc',    boost_15d_desc],
            ['promo_boost_home_price',  boost_home_30d],
            ['promo_boost_home_days',   boost_home_days],
            ['promo_boost_home_url',    boost_home_url],
            ['promo_boost_home_desc',   boost_home_desc],
        ];
        for (const [key, val] of updates) {
            if (val !== undefined) {
                await pool.query(
                    `INSERT INTO site_config(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2`,
                    [key, String(val)]
                );
            }
        }
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = { publicRouter, clientRouter, adminRouter };

// ═══════════════════════════════════════════════════════════════
// ENDPOINTS ADICIONALES ADMIN — menú dedicado Promociones
// ═══════════════════════════════════════════════════════════════

// GET /admin/promotions/dashboard — KPIs del menú
adminRouter.get('/dashboard', async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE p.is_active AND p.expires_at > NOW()) AS activas,
                COUNT(*) FILTER (WHERE NOT p.is_active OR p.expires_at <= NOW()) AS expiradas,
                COUNT(*) FILTER (WHERE p.boost_type = 'plan') AS tipo_plan,
                COUNT(*) FILTER (WHERE p.boost_type != 'plan') AS tipo_boost,
                COALESCE(SUM(p.clicks), 0) AS total_clicks
            FROM promotions p
        `);
        const boostStats = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') AS pendientes,
                COUNT(*) FILTER (WHERE status = 'paid')    AS aprobados,
                COALESCE(SUM(price_gs) FILTER (WHERE status = 'paid'), 0) AS ingresos_gs
            FROM promotion_boosts
        `);
        res.json({
            success: true,
            promos:  stats.rows[0],
            boosts:  boostStats.rows[0],
        });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /admin/promotions/pending — Solicitudes pendientes de boost
adminRouter.get('/pending', async (req, res) => {
    try {
        const boosts = await pool.query(`
            SELECT pb.id, pb.boost_type, pb.price_gs, pb.status, pb.created_at, pb.expires_at,
                   b.id AS business_id, b.name AS business_name, b.trade_name, b.slug AS business_slug,
                   b.plan_type,
                   u.name AS user_name, u.email AS user_email,
                   sl.id AS lead_id, sl.notes AS lead_notes
            FROM promotion_boosts pb
            JOIN businesses b ON b.id = pb.business_id
            LEFT JOIN user_businesses ub ON ub.business_id = b.id AND ub.is_owner = TRUE
            LEFT JOIN users u ON u.id = ub.user_id
            LEFT JOIN service_leads sl ON sl.notes LIKE '%boost_id:' || pb.id || '%'
            WHERE pb.status = 'pending'
            ORDER BY pb.created_at ASC
        `);
        res.json({ success: true, data: boosts.rows });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /admin/promotions/boosts/:id/approve — Aprobar boost ──────────────
adminRouter.post('/boosts/:id/approve', async (req, res) => {
    try {
        const boostId = parseInt(req.params.id);
        const boost   = await pool.query('SELECT * FROM promotion_boosts WHERE id=$1', [boostId]);
        if (!boost.rows.length)
            return res.status(404).json({ success: false, error: 'Boost no encontrado' });

        const b = boost.rows[0];
        if (b.status === 'paid')
            return res.status(400).json({ success: false, error: 'Este boost ya fue aprobado' });

        // Leer días configurados
        const daysCfg = await pool.query(
            `SELECT key, value FROM site_config WHERE key IN ('promo_boost_7d_days','promo_boost_15d_days','promo_boost_home_days')`
        ).catch(()=>({rows:[]}));
        const daysMap = { boost_7d:7, boost_15d:15, boost_home_30d:30 };
        daysCfg.rows.forEach(r => {
            if (r.key === 'promo_boost_7d_days')    daysMap.boost_7d = parseInt(r.value);
            if (r.key === 'promo_boost_15d_days')   daysMap.boost_15d = parseInt(r.value);
            if (r.key === 'promo_boost_home_days')  daysMap.boost_home_30d = parseInt(r.value);
        });

        const days      = daysMap[b.boost_type] || 7;
        const inHome    = b.boost_type === 'boost_home_30d';
        const expiresAt = new Date(Date.now() + days * 86400000);

        // Marcar boost como pagado con expires_at
        await pool.query(
            `UPDATE promotion_boosts SET status='paid', paid_at=NOW(), expires_at=$1, paid_by=$2 WHERE id=$3`,
            [expiresAt, req.user.id, boostId]
        );

        // Si el boost tiene una promo asociada, actualizarla
        if (b.promotion_id) {
            await pool.query(
                `UPDATE promotions SET boost_type=$1, show_in_home=$2, expires_at=$3, is_active=TRUE, updated_at=NOW() WHERE id=$4`,
                [b.boost_type, inHome, expiresAt, b.promotion_id]
            ).catch(()=>{});
        }

        // Marcar el lead relacionado como 'won' SIN tocar la empresa
        await pool.query(
            `UPDATE service_leads SET status='won', updated_at=NOW()
             WHERE notes LIKE $1 AND service_type='promo_boost' AND status='new'`,
            [`%boost_id:${boostId}%`]
        ).catch(()=>{});

        // Notificar al cliente
        const bizInfo = await pool.query(
            `SELECT b.name, b.trade_name, u.email
             FROM businesses b
             LEFT JOIN user_businesses ub ON ub.business_id=b.id AND ub.is_owner=TRUE
             LEFT JOIN users u ON u.id=ub.user_id
             WHERE b.id=$1 LIMIT 1`, [b.business_id]
        ).catch(()=>({rows:[]}));

        if (bizInfo.rows[0]?.email) {
            const mailer  = require('../config/mail');
            const siteUrl = (await pool.query("SELECT value FROM site_config WHERE key='site_url'").catch(()=>({rows:[]}))).rows[0]?.value || 'https://retopa.com.py';
            const bizName = bizInfo.rows[0].trade_name || bizInfo.rows[0].name;
            const boostLabel = { boost_7d: `${days} días`, boost_15d: `${days} días`, boost_home_30d: `${days} días + Home` }[b.boost_type] || b.boost_type;
            mailer.sendRawEmail(
                bizInfo.rows[0].email,
                `✅ Tu boost fue aprobado — ${bizName}`,
                `<p>Hola,</p>
                 <p>Tu boost <strong>${boostLabel}</strong> para <strong>${bizName}</strong> fue aprobado y está activo.</p>
                 <p>Vence el <strong>${expiresAt.toLocaleDateString('es-PY')}</strong>.</p>
                 <p>Ingresá al panel para crear tu promoción: <a href="${siteUrl}/cliente#promotions">${siteUrl}/cliente</a></p>`
            ).catch(()=>{});
        }

        res.json({
            success: true,
            message: `Boost aprobado — vence ${expiresAt.toLocaleDateString('es-PY')}`,
            expires_at: expiresAt,
        });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /admin/promotions/boosts/:id/reject — Rechazar boost ──────────────
adminRouter.post('/boosts/:id/reject', async (req, res) => {
    try {
        const { reason } = req.body;
        const boostId = parseInt(req.params.id);
        await pool.query(
            `UPDATE promotion_boosts SET status='cancelled', updated_at=NOW() WHERE id=$1`,
            [boostId]
        );
        await pool.query(
            `UPDATE service_leads SET status='lost', notes=CONCAT(notes, $1), updated_at=NOW()
             WHERE notes LIKE $2 AND service_type='promo_boost'`,
            [`\n[RECHAZADO: ${reason||'Sin motivo'}]`, `%boost_id:${boostId}%`]
        ).catch(()=>{});

        // Notificar al cliente
        const boost   = await pool.query('SELECT * FROM promotion_boosts WHERE id=$1', [boostId]).catch(()=>({rows:[]}));
        const b = boost.rows[0];
        if (b) {
            const bizInfo = await pool.query(
                `SELECT b.trade_name, b.name, u.email FROM businesses b
                 LEFT JOIN user_businesses ub ON ub.business_id=b.id AND ub.is_owner=TRUE
                 LEFT JOIN users u ON u.id=ub.user_id WHERE b.id=$1 LIMIT 1`, [b.business_id]
            ).catch(()=>({rows:[]}));
            if (bizInfo.rows[0]?.email) {
                const mailer = require('../config/mail');
                const bizName = bizInfo.rows[0].trade_name || bizInfo.rows[0].name;
                mailer.sendRawEmail(
                    bizInfo.rows[0].email,
                    `ℹ️ Actualización sobre tu boost — ${bizName}`,
                    `<p>Hola,</p><p>Tu solicitud de boost para <strong>${bizName}</strong> no pudo ser procesada${reason ? ': '+reason : ''}.</p><p>Contactanos para más información.</p>`
                ).catch(()=>{});
            }
        }
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /admin/promotions/history — Historial completo paginado ──────────────
adminRouter.get('/history', async (req, res) => {
    try {
        const { status, boost_type, business, limit=50, offset=0 } = req.query;
        let where = ['1=1'];
        const params = [];
        let idx = 1;
        if (status)     { where.push(`p.is_active = $${idx++}`);                params.push(status === 'active'); }
        if (boost_type) { where.push(`p.boost_type = $${idx++}`);               params.push(boost_type); }
        if (business)   { where.push(`b.slug = $${idx++}`);                     params.push(business); }

        const promos = await pool.query(`
            SELECT p.id, p.title, p.boost_type, p.is_active, p.starts_at, p.expires_at,
                   p.clicks, p.show_in_home, p.show_in_category,
                   p.original_price, p.promo_price, p.discount_pct, p.price_label,
                   b.name AS business_name, b.trade_name, b.slug AS business_slug, b.plan_type,
                   pb.price_gs AS boost_price_gs, pb.paid_at, pb.status AS boost_status,
                   u.name AS owner_name, u.email AS owner_email
            FROM promotions p
            JOIN businesses b ON b.id = p.business_id
            LEFT JOIN promotion_boosts pb ON pb.promotion_id = p.id AND pb.status = 'paid'
            LEFT JOIN user_businesses ub ON ub.business_id = b.id AND ub.is_owner = TRUE
            LEFT JOIN users u ON u.id = ub.user_id
            WHERE ${where.join(' AND ')}
            ORDER BY p.created_at DESC
            LIMIT $${idx} OFFSET $${idx+1}
        `, [...params, parseInt(limit), parseInt(offset)]);

        const total = await pool.query(
            `SELECT COUNT(*) FROM promotions p JOIN businesses b ON b.id=p.business_id WHERE ${where.join(' AND ')}`,
            params
        );

        res.json({ success: true, data: promos.rows, total: parseInt(total.rows[0].count) });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});
