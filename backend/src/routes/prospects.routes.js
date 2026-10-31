/**
 * RetoPA — routes/prospects.routes.js
 * Panel de Prospectos (admin): contactar por WhatsApp a fichas cargadas por
 * prospección. Montado en /api/v2/admin/prospects (ver app.js).
 *
 * Reglas clave:
 *  - Filtra por businesses.source (dropdown en el front; acá NO se hardcodea).
 *  - AGRUPA por número de WhatsApp: una fila por número, con sus fichas. El
 *    estado de contacto se guarda por número en prospect_wa_outreach.
 *  - Fichas sin WhatsApp se devuelven igual (whatsapp = null), como filas
 *    individuales marcadas "sin WhatsApp" (sin estado persistible).
 *  - Envío manual, uno a uno, desde el WhatsApp del operador (no masivo).
 */
const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const pool    = require('../db');
const JWT_SECRET = require('../config/jwt');

const ROLE_LEVEL = { godmode: 4, admin: 3, client: 2, user: 1 };
function requireAdmin(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Token requerido', code: 'NO_TOKEN' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if ((ROLE_LEVEL[decoded.role] || 0) < ROLE_LEVEL.admin) {
            return res.status(403).json({ success: false, error: 'Sin permisos', code: 'FORBIDDEN' });
        }
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ success: false, error: 'Token inválido o expirado', code: 'INVALID_TOKEN' });
    }
}
router.use(requireAdmin);

const ESTADOS = ['pendiente', 'enviado', 'respondio', 'reclamo', 'rechazo', 'no_es'];

// Clave de WhatsApp de la ficha = la misma que phoneToWa() (utils/phone.js): solo
// dígitos, con 595. prospect_wa_outreach guarda esa forma; businesses.whatsapp puede
// estar como '595…' o '+595…' (el portal normaliza al guardar). Comparar el texto
// crudo hacía que las fichas editadas por su dueño volvieran solas a "pendiente".
const WA_KEY_SQL = `(
    SELECT CASE
        WHEN d = '' THEN NULL
        WHEN d LIKE '595%' AND length(d) BETWEEN 11 AND 13 THEN d
        WHEN d LIKE '0%'   AND length(d) BETWEEN 9  AND 11 THEN '595' || substr(d, 2)
        WHEN length(d) BETWEEN 7 AND 10 THEN '595' || d
        ELSE d END
      FROM (SELECT regexp_replace(COALESCE(b.whatsapp, ''), '\\D', '', 'g') AS d) x)`;

async function getSiteUrl() {
    try {
        const r = await pool.query("SELECT value FROM site_config WHERE key='site_url'");
        const v = (r.rows[0] && r.rows[0].value) || '';
        return (v || process.env.SITE_URL || 'https://retopa.com.py').replace(/\/$/, '');
    } catch (e) {
        return (process.env.SITE_URL || 'https://retopa.com.py').replace(/\/$/, '');
    }
}

// ── POST /claim-link/:businessId — E1: {link_reclamo} de la plantilla ─────────
// Devuelve el enlace de reclamo con token de la ficha: reusa el vigente o genera
// uno nuevo SIN vencimiento (vale mientras la ficha no esté reclamada). Se llama
// al tocar "WhatsApp", así no se emiten tokens para fichas que nadie contacta.
router.post('/claim-link/:businessId', async (req, res) => {
    const id = parseInt(req.params.businessId, 10);
    if (!id) return res.status(400).json({ success: false, error: 'businessId inválido' });
    try {
        const b = await pool.query(
            `SELECT b.id, b.slug, b.claim_token, b.claim_expires_at, b.claim_status,
                    EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.business_id = b.id AND ub.is_owner) AS has_owner
               FROM businesses b WHERE b.id = $1 AND b.is_active = TRUE`, [id]);
        if (!b.rows.length) return res.status(404).json({ success: false, error: 'Ficha no encontrada' });
        const biz = b.rows[0];
        const siteUrl = await getSiteUrl();
        if (biz.claim_status === 'approved' || biz.has_owner) {
            // Ya tiene dueño: no tiene sentido un reclamo → se manda la ficha.
            return res.json({ success: true, claimed: true, url: `${siteUrl}/negocio/${biz.slug}` });
        }
        let token = biz.claim_token;
        const vigente = token && (!biz.claim_expires_at || new Date(biz.claim_expires_at) > new Date());
        if (!vigente) {
            token = require('crypto').randomBytes(32).toString('hex');
            await pool.query(
                `UPDATE businesses SET claim_token = $2, claim_token_at = NOW(), claim_expires_at = NULL WHERE id = $1`,
                [id, token]);
        }
        res.json({ success: true, claimed: false, url: `${siteUrl}/reclamar/?token=${token}&utm_source=wa&utm_campaign=prospectos` });
    } catch (err) {
        console.error('[prospects/claim-link]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /sources — orígenes distintos con conteo (para el dropdown) ──────────
router.get('/sources', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT COALESCE(source, 'manual') AS source, COUNT(*)::int AS count
            FROM businesses
            WHERE is_active = TRUE
            GROUP BY COALESCE(source, 'manual')
            ORDER BY count DESC, source ASC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('[prospects/sources]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET / — fichas del origen, AGRUPADAS por WhatsApp, con estado de outreach ──
// Query: source (obligatorio), rubro (slug), ciudad, estado, q (nombre)
router.get('/', async (req, res) => {
    try {
        const source = (req.query.source || '').trim();
        if (!source) return res.status(400).json({ success: false, error: 'source requerido' });
        const rubro  = (req.query.rubro  || '').trim();
        const ciudad = (req.query.ciudad || '').trim();
        const estadoF = (req.query.estado || '').trim();
        const q      = (req.query.q || '').trim();

        const params = [source];
        let where = 'b.is_active = TRUE AND b.source = $1';
        if (ciudad) { params.push(ciudad); where += ` AND lower(b.city) = lower($${params.length})`; }
        if (q)      { params.push('%' + q + '%'); where += ` AND (b.name ILIKE $${params.length} OR b.trade_name ILIKE $${params.length})`; }

        // Rubro primario por ficha vía LATERAL (business_categories.is_primary).
        const sql = `
            SELECT b.id, b.name, b.trade_name, b.slug, wk.whatsapp, b.city,
                   pc.name AS rubro, pc.slug AS rubro_slug,
                   po.estado, po.fecha_contacto, po.notas
            FROM businesses b
            LEFT JOIN LATERAL (
                SELECT c.name, c.slug
                FROM business_categories bc
                JOIN categories c ON c.id = bc.category_id
                WHERE bc.business_id = b.id
                ORDER BY bc.is_primary DESC, bc.position ASC
                LIMIT 1
            ) pc ON TRUE
            CROSS JOIN LATERAL (SELECT ${WA_KEY_SQL} AS whatsapp) wk
            LEFT JOIN prospect_wa_outreach po ON po.whatsapp = wk.whatsapp
            WHERE ${where}
            ORDER BY b.name ASC`;
        const { rows } = await pool.query(sql, params);

        const siteUrl = await getSiteUrl();
        const fichaUrl = slug => (slug ? `${siteUrl}/negocio/${slug}` : null);

        // Filtro por rubro (slug) — post-query para no complicar el WHERE del LATERAL.
        let filtered = rubro ? rows.filter(r => r.rubro_slug === rubro) : rows;

        // Agrupar por WhatsApp. Las fichas SIN whatsapp van como filas individuales.
        const byWa = new Map();
        const groups = [];
        for (const r of filtered) {
            const ficha = {
                id: r.id, name: r.name, trade_name: r.trade_name, slug: r.slug,
                rubro: r.rubro || null, rubro_slug: r.rubro_slug || null,
                ciudad: r.city || null, ficha_url: fichaUrl(r.slug),
            };
            if (!r.whatsapp) {
                groups.push({
                    whatsapp: null, estado: 'pendiente', fecha_contacto: null, notas: null,
                    fichas: [ficha], count: 1,
                });
                continue;
            }
            if (!byWa.has(r.whatsapp)) {
                const g = {
                    whatsapp: r.whatsapp,
                    estado: r.estado || 'pendiente',
                    fecha_contacto: r.fecha_contacto || null,
                    notas: r.notas || null,
                    fichas: [],
                    count: 0,
                };
                byWa.set(r.whatsapp, g);
                groups.push(g);
            }
            const g = byWa.get(r.whatsapp);
            g.fichas.push(ficha);
            g.count = g.fichas.length;
        }

        // Filtro por estado (sobre el grupo).
        let outGroups = estadoF ? groups.filter(g => (g.estado || 'pendiente') === estadoF) : groups;

        // Resumen: totales por estado + enviados hoy.
        const summary = { total_grupos: outGroups.length, total_fichas: 0, por_estado: {}, enviados_hoy: 0 };
        ESTADOS.forEach(e => { summary.por_estado[e] = 0; });
        const hoy = new Date(); const yyyy = hoy.getFullYear(), mm = hoy.getMonth(), dd = hoy.getDate();
        for (const g of outGroups) {
            summary.total_fichas += g.count;
            const e = g.estado || 'pendiente';
            if (summary.por_estado[e] != null) summary.por_estado[e]++;
            if (g.fecha_contacto) {
                const f = new Date(g.fecha_contacto);
                if (f.getFullYear() === yyyy && f.getMonth() === mm && f.getDate() === dd) summary.enviados_hoy++;
            }
        }

        res.json({ success: true, data: outGroups, summary, siteUrl });
    } catch (err) {
        console.error('[prospects]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── PATCH /outreach/:whatsapp — upsert del estado/notas por número ───────────
router.patch('/outreach/:whatsapp', async (req, res) => {
    try {
        const whatsapp = String(req.params.whatsapp || '').replace(/\D/g, '');
        if (!whatsapp) return res.status(400).json({ success: false, error: 'WhatsApp inválido' });
        const { estado, notas } = req.body || {};
        if (estado && !ESTADOS.includes(estado)) {
            return res.status(400).json({ success: false, error: `Estado inválido. Permitidos: ${ESTADOS.join(', ')}` });
        }
        // Sin estado (guardar notas) se conserva el que tenga; fila nueva → 'pendiente'.
        const nuevoEstado = estado || null;
        // envio=true: el operador mandó el mensaje (botón WhatsApp). Renueva la fecha,
        // pero no baja un estado más avanzado (respondio/reclamo/…) a 'enviado'.
        const envio = req.body?.envio === true && nuevoEstado === 'enviado';

        // fecha_contacto: con un envío real, o la primera vez que se marca 'enviado'
        // a mano. Antes cada PATCH con 'enviado' (incluido guardar notas) la pisaba.
        const { rows } = await pool.query(`
            INSERT INTO prospect_wa_outreach (whatsapp, estado, notas, fecha_contacto, created_at, updated_at)
            VALUES ($1, COALESCE($2::varchar, 'pendiente'), $3,
                    CASE WHEN $2::varchar = 'enviado' THEN NOW() END, NOW(), NOW())
            ON CONFLICT (whatsapp) DO UPDATE SET
                estado         = CASE
                                   WHEN $2::varchar IS NULL THEN prospect_wa_outreach.estado
                                   WHEN $4::boolean AND prospect_wa_outreach.estado NOT IN ('pendiente', 'enviado')
                                        THEN prospect_wa_outreach.estado
                                   ELSE $2::varchar END,
                notas          = COALESCE(EXCLUDED.notas, prospect_wa_outreach.notas),
                fecha_contacto = CASE
                                   WHEN $4::boolean THEN NOW()
                                   WHEN $2::varchar = 'enviado' AND prospect_wa_outreach.fecha_contacto IS NULL THEN NOW()
                                   ELSE prospect_wa_outreach.fecha_contacto END,
                updated_at     = NOW()
            RETURNING whatsapp, estado, fecha_contacto, notas`,
            [whatsapp, nuevoEstado, (notas === undefined ? null : notas), envio]
        );
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error('[prospects/outreach PATCH]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
