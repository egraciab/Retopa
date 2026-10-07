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

const ESTADOS = ['pendiente', 'enviado', 'respondio', 'reclamo', 'rechazo'];

async function getSiteUrl() {
    try {
        const r = await pool.query("SELECT value FROM site_config WHERE key='site_url'");
        const v = (r.rows[0] && r.rows[0].value) || '';
        return (v || process.env.SITE_URL || 'https://retopa.com.py').replace(/\/$/, '');
    } catch (e) {
        return (process.env.SITE_URL || 'https://retopa.com.py').replace(/\/$/, '');
    }
}

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
            SELECT b.id, b.name, b.trade_name, b.slug, b.whatsapp, b.city,
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
            LEFT JOIN prospect_wa_outreach po ON po.whatsapp = b.whatsapp
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
        const nuevoEstado = estado || 'pendiente';
        const setFecha = nuevoEstado === 'enviado'; // marcar fecha al enviar

        const { rows } = await pool.query(`
            INSERT INTO prospect_wa_outreach (whatsapp, estado, notas, fecha_contacto, created_at, updated_at)
            VALUES ($1, $2, $3, CASE WHEN $4 THEN NOW() ELSE NULL END, NOW(), NOW())
            ON CONFLICT (whatsapp) DO UPDATE SET
                estado         = EXCLUDED.estado,
                notas          = COALESCE(EXCLUDED.notas, prospect_wa_outreach.notas),
                fecha_contacto = CASE WHEN $4 THEN NOW() ELSE prospect_wa_outreach.fecha_contacto END,
                updated_at     = NOW()
            RETURNING whatsapp, estado, fecha_contacto, notas`,
            [whatsapp, nuevoEstado, (notas === undefined ? null : notas), setFecha]
        );
        res.json({ success: true, data: rows[0] });
    } catch (err) {
        console.error('[prospects/outreach PATCH]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
