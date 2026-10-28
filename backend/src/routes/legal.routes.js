// ═══════════════════════════════════════════════════════════════════════════
// RetoPA — Páginas legales editables (2026-10-28)
//
// publicRouter  (/api/v2/legal)
//   GET  /page/:page[?v=2.0]   Términos / Privacidad renderizados (los sirve
//                              frontend/server.js en /terminos.html y /privacidad.html)
//   POST /baja                 pedido de baja / rectificación / actualización sin cuenta
//   POST /denuncia             pedido de retiro de contenido (Ley 4868/2013)
// adminRouter   (/api/v2/admin/legal, solo admin)
//   datos del responsable, editor Markdown con versionado e historial,
//   pedidos (legal_requests) y aviso por correo de cambio sustancial (por tandas).
//
// Markdown → HTML: helpers/legalMarkdown.js (escapa TODO antes de dar formato).
// Caché en memoria de 5 min de la página vigente, invalidada al guardar.
// ═══════════════════════════════════════════════════════════════════════════
const express   = require('express');
const rateLimit = require('express-rate-limit');
const jwt       = require('jsonwebtoken');
const fs        = require('fs');
const path      = require('path');
const pool      = require('../db');
const redisClient = require('../config/redis');
const JWT_SECRET  = require('../config/jwt');
const { sendEmail } = require('../config/mail');
const { renderMarkdown, VAR_RX } = require('../helpers/legalMarkdown');

const PAGES = {
    terminos:   { title: 'Términos y Condiciones de Uso', url: '/terminos.html',
                  desc: 'Términos y condiciones de uso de RetoPA, el directorio comercial de Paraguay: fichas, reclamos, planes, reseñas y contacto.' },
    privacidad: { title: 'Política de Privacidad', url: '/privacidad.html',
                  desc: 'Cómo trata RetoPA los datos personales: qué datos, de dónde vienen, para qué, con quién se comparten y cómo ejercer tus derechos.' },
};
// Datos del responsable editables desde el Admin (sección 0).
const DATA_KEYS = ['legal_razon_social', 'legal_ruc', 'legal_marca_operada', 'legal_domicilio', 'legal_email',
    'legal_representante_nombre', 'legal_representante_email', 'legal_gracia_dias',
    'legal_mostrar_nota_revision', 'legal_fuentes_publicas'];
// Variables que se pueden usar en el Markdown ({{…}}).
const VARS = ['legal_razon_social', 'legal_ruc', 'legal_marca_operada', 'legal_domicilio', 'legal_email',
    'legal_representante_nombre', 'legal_representante_email', 'legal_gracia_dias', 'plan_grace_days',
    'site_url', 'version', 'fecha'];
const DEFAULT_MD = {};
for (const p of Object.keys(PAGES)) {
    try { DEFAULT_MD[p] = fs.readFileSync(path.join(__dirname, '../assets/legal', `${p}.md`), 'utf8'); }
    catch (e) { DEFAULT_MD[p] = ''; }
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = ymd => { const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}` : String(ymd || ''); };
const isPlaceholder = v => /^\s*<<.*>>\s*$/.test(String(v || ''));
const ymdPY = (d = new Date()) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10); // Paraguay (UTC-3)

// ── Configuración y caché ───────────────────────────────────────────────────
async function loadCfg(db = pool) {
    const { rows } = await db.query(
        "SELECT key, value FROM site_config WHERE key LIKE 'legal\\_%' OR key IN ('site_url','site_name','plan_grace_days','leads_emails')");
    const cfg = {};
    rows.forEach(r => { cfg[r.key] = r.value == null ? '' : r.value; });
    return cfg;
}
function varsFor(cfg, page, version, fecha) {
    const v = {};
    for (const k of VARS) v[k] = cfg[k] == null ? '' : cfg[k];
    // Un dato que sigue como marcador (<<…>>) no se muestra crudo en la página pública.
    for (const k of Object.keys(v)) if (isPlaceholder(v[k])) v[k] = '[pendiente de completar]';
    v.site_url = (cfg.site_url || 'https://retopa.com.py').replace(/\/+$/, '');
    v.plan_grace_days = cfg.plan_grace_days || '7';
    v.legal_gracia_dias = cfg.legal_gracia_dias || '90';
    v.version = version || cfg[`legal_${page}_version`] || '';
    v.fecha = fechaLarga(fecha || cfg[`legal_${page}_fecha`]);
    return v;
}
const TTL_MS = 5 * 60 * 1000;
let pageCache = {};
function invalidate() {
    pageCache = {};
    redisClient.del('dir:site-config').catch(() => {});
    redisClient.del('dir:legal-fuentes').catch(() => {});
}

async function buildPage(page, version) {
    const cfg = await loadCfg();
    const curVersion = cfg[`legal_${page}_version`] || '';
    const versions = (await pool.query(
        `SELECT version, to_char(published_at, 'YYYY-MM-DD') AS fecha FROM legal_versions
          WHERE page = $1 ORDER BY published_at DESC, id DESC`, [page]).catch(() => ({ rows: [] }))).rows;
    let md = cfg[`legal_${page}_md`] || DEFAULT_MD[page];
    let fecha = cfg[`legal_${page}_fecha`];
    let shown = curVersion;
    if (version && version !== curVersion) {
        const r = await pool.query(
            `SELECT version, content_md, to_char(published_at, 'YYYY-MM-DD') AS fecha FROM legal_versions
              WHERE page = $1 AND version = $2 ORDER BY published_at DESC LIMIT 1`, [page, version]);
        if (!r.rows.length) return null;
        md = r.rows[0].content_md; fecha = r.rows[0].fecha; shown = r.rows[0].version;
    }
    const { html, toc } = renderMarkdown(md, varsFor(cfg, page, shown, fecha));
    const bannerHasta = cfg.legal_banner_hasta || '';
    return {
        page, title: PAGES[page].title, description: PAGES[page].desc, url: PAGES[page].url,
        version: shown, currentVersion: curVersion, isCurrent: shown === curVersion,
        fecha: fechaLarga(fecha), html, toc,
        versions: versions.map(v => ({ version: v.version, fecha: fechaLarga(v.fecha) })),
        notaRevision: cfg.legal_mostrar_nota_revision === 'true',
        banner: bannerHasta && bannerHasta >= ymdPY() ? bannerHasta : '',
        operador: { razonSocial: cfg.legal_razon_social || '', ruc: cfg.legal_ruc || '' },
    };
}

// ── Validaciones ────────────────────────────────────────────────────────────
// Dígito verificador del RUC (SET/DNIT): módulo 11, pesos 2..11 desde la derecha.
function rucDv(base) {
    const s = String(base).replace(/\D/g, '');
    let k = 2, t = 0;
    for (let i = s.length - 1; i >= 0; i--) { t += (+s[i]) * k; k = k >= 11 ? 2 : k + 1; }
    const r = t % 11;
    return r > 1 ? 11 - r : 0;
}
function validRuc(ruc) {
    const m = String(ruc || '').trim().match(/^(\d{3,9})-(\d)$/);
    return !!m && rucDv(m[1]) === +m[2];
}
const validEmail = e => /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(String(e || '').trim());
function bump(version, major) {
    const m = String(version || '').match(/^(\d+)(?:\.(\d+))?$/);
    if (!m) return major ? '1.0' : '1.1';
    return major ? `${+m[1] + 1}.0` : `${m[1]}.${(+m[2] || 0) + 1}`;
}
const unknownVars = md => [...new Set([...String(md || '').matchAll(VAR_RX)].map(x => x[1].toLowerCase()).filter(k => !VARS.includes(k)))];

// ════════════════════════════════════════════════════════════════════════════
// Público
// ════════════════════════════════════════════════════════════════════════════
const publicRouter = express.Router();

publicRouter.get('/page/:page', async (req, res) => {
    const page = req.params.page;
    if (!PAGES[page]) return res.status(404).json({ success: false, error: 'Página no encontrada' });
    const v = String(req.query.v || '').slice(0, 10);
    try {
        const key = `${page}:${v}`;
        const hit = pageCache[key];
        if (hit && Date.now() - hit.at < TTL_MS) return res.json({ success: true, data: hit.data });
        const data = await buildPage(page, v);
        if (!data) return res.status(404).json({ success: false, error: 'Esa versión no existe' });
        pageCache[key] = { at: Date.now(), data };
        res.json({ success: true, data });
    } catch (err) {
        console.error('[legal] page:', err.message);
        res.status(500).json({ success: false, error: 'No pudimos cargar la página' });
    }
});

// Un limitador por formulario: 8 envíos por hora por IP (cuentan también los rechazados).
const makeLimiter = () => rateLimit({
    windowMs: 60 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Hiciste muchos pedidos seguidos. Probá de nuevo en una hora o escribinos por correo.' },
});
const clip = (v, n) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, n);

// Busca la ficha por su URL (/negocios/…/<slug>, /negocio/<slug> o ?empresa=<slug>).
async function findBusiness(url) {
    const u = String(url || '');
    const q = u.match(/[?&]empresa=([a-z0-9_-]+)/i);
    const seg = u.split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop();
    const slug = (q && q[1]) || (/^[a-z0-9_-]+$/i.test(seg || '') ? seg : '');
    if (!slug) return null;
    const r = await pool.query('SELECT id, COALESCE(NULLIF(trade_name,\'\'), name) AS name, slug FROM businesses WHERE slug = $1 LIMIT 1', [slug]);
    return r.rows[0] || null;
}

async function createRequest(req, res, kind) {
    const b = req.body || {};
    if (b.website) return res.json({ success: true });        // honeypot: bot → fingimos éxito
    const tipo = kind === 'denuncia' ? 'retiro' : String(b.tipo || '');
    if (!['baja', 'rectificacion', 'actualizacion', 'retiro'].includes(tipo) || (kind === 'baja' && tipo === 'retiro'))
        return res.status(400).json({ success: false, error: 'Elegí qué querés pedir.' });
    const nombre = clip(b.nombre, 120), contacto = clip(b.contacto, 160), vinculo = clip(b.vinculo, 200);
    const businessUrl = clip(b.business_url, 300);
    let detalle = String(b.detalle || '').trim().slice(0, 4000);
    if (nombre.length < 2) return res.status(400).json({ success: false, error: 'Decinos tu nombre.' });
    const waDigits = contacto.replace(/\D/g, '');
    if (!validEmail(contacto) && !(waDigits.length >= 9 && waDigits.length <= 13))
        return res.status(400).json({ success: false, error: 'Dejanos un correo o un WhatsApp para responderte.' });
    if (!businessUrl) return res.status(400).json({ success: false, error: 'Pegá el enlace de la ficha (o su nombre).' });
    if (detalle.length < 5) return res.status(400).json({ success: false, error: 'Contanos qué querés que hagamos.' });
    if (kind === 'denuncia') {
        const derecho = String(b.derecho || '').trim().slice(0, 1000);
        if (derecho.length < 5) return res.status(400).json({ success: false, error: 'Contanos qué derecho se afecta y por qué.' });
        if (b.buena_fe !== true) return res.status(400).json({ success: false, error: 'Falta la declaración de buena fe.' });
        detalle = `Contenido: ${detalle}\n\nDerecho afectado: ${derecho}`;
    } else if (!vinculo) {
        return res.status(400).json({ success: false, error: 'Contanos tu vínculo con el negocio.' });
    }
    try {
        const biz = await findBusiness(businessUrl).catch(() => null);
        const r = await pool.query(
            `INSERT INTO legal_requests (tipo, business_id, business_url, nombre, email_o_whatsapp, vinculo, detalle, buena_fe)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [tipo, biz ? biz.id : null, businessUrl, nombre, contacto, vinculo || null, detalle, b.buena_fe === true]);
        const id = r.rows[0].id;
        // Aviso al equipo (buzones de leads). Nunca bloquea la respuesta.
        loadCfg().then(cfg => {
            const to = String(cfg.leads_emails || '').split(',').map(x => x.trim()).filter(Boolean);
            for (const addr of to) sendEmail(addr, 'legalRequestAlert', {
                id, tipo, nombre, contacto, vinculo, detalle, businessUrl,
                businessName: biz ? biz.name : '', siteUrl: (cfg.site_url || '').replace(/\/+$/, ''),
            }).catch(e => console.error('[legal] alerta:', e.message));
        }).catch(e => console.error('[legal] alerta cfg:', e.message));
        res.json({ success: true, id });
    } catch (err) {
        console.error('[legal] request:', err.message);
        res.status(500).json({ success: false, error: 'No pudimos guardar el pedido. Probá de nuevo o escribinos por correo.' });
    }
}
publicRouter.post('/baja', makeLimiter(), (req, res) => createRequest(req, res, 'baja'));
publicRouter.post('/denuncia', makeLimiter(), (req, res) => createRequest(req, res, 'denuncia'));

// ════════════════════════════════════════════════════════════════════════════
// Admin
// ════════════════════════════════════════════════════════════════════════════
const ROLE_LEVEL = { godmode: 4, admin: 3, client: 2, user: 1 };
function requireAdmin(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Token requerido', code: 'NO_TOKEN' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if ((ROLE_LEVEL[decoded.role] || 0) < ROLE_LEVEL.admin)
            return res.status(403).json({ success: false, error: 'Sin permisos', code: 'FORBIDDEN' });
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ success: false, error: 'Token inválido o expirado', code: 'INVALID_TOKEN' });
    }
}
const adminRouter = express.Router();
adminRouter.use(requireAdmin);
const fail500 = (res, where, err) => { console.error(`[legal] ${where}:`, err.message); res.status(500).json({ success: false, error: err.message }); };
const upsert = (db, key, value) => db.query(
    `INSERT INTO site_config (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [key, value]);

// Pendientes del aviso de cambio sustancial (titulares de cuenta con correo).
const AVISO_WHERE = `u.is_active = TRUE AND u.role IN ('user','client') AND u.email IS NOT NULL AND u.email <> ''
                     AND u.legal_aviso_enviado IS DISTINCT FROM $1`;

adminRouter.get('/config', async (req, res) => {
    try {
        const cfg = await loadCfg();
        const data = {};
        for (const k of DATA_KEYS) data[k] = cfg[k] == null ? '' : cfg[k];
        const pages = {};
        for (const p of Object.keys(PAGES)) pages[p] = { version: cfg[`legal_${p}_version`] || '', fecha: cfg[`legal_${p}_fecha`] || '' };
        const counts = (await pool.query(`SELECT estado, COUNT(*)::int AS n FROM legal_requests GROUP BY estado`)).rows;
        const avisoId = cfg.legal_aviso_id || '';
        const pend = avisoId ? (await pool.query(`SELECT COUNT(*)::int AS n FROM users u WHERE ${AVISO_WHERE}`, [avisoId])).rows[0].n : 0;
        res.json({ success: true, data: {
            config: data, pages, vars: VARS, banner: cfg.legal_banner_hasta || '',
            placeholders: DATA_KEYS.filter(k => isPlaceholder(cfg[k])),
            requests: Object.fromEntries(counts.map(c => [c.estado, c.n])),
            aviso: { id: avisoId, pendientes: pend },
        } });
    } catch (err) { fail500(res, 'config', err); }
});

adminRouter.put('/config', async (req, res) => {
    const b = req.body || {};
    const errs = [];
    const val = {};
    for (const k of DATA_KEYS) if (b[k] !== undefined) val[k] = String(b[k]).trim();
    if (val.legal_ruc !== undefined && !validRuc(val.legal_ruc)) errs.push('El RUC no es válido (revisá el dígito verificador).');
    for (const k of ['legal_email', 'legal_representante_email'])
        if (val[k] !== undefined && !isPlaceholder(val[k]) && !validEmail(val[k])) errs.push(`Correo inválido: ${k.replace('legal_', '')}.`);
    if (val.legal_gracia_dias !== undefined && !(/^\d+$/.test(val.legal_gracia_dias) && +val.legal_gracia_dias >= 1 && +val.legal_gracia_dias <= 365))
        errs.push('Los días de gracia tienen que ser un número entero entre 1 y 365.');
    if (val.legal_mostrar_nota_revision !== undefined) val.legal_mostrar_nota_revision = val.legal_mostrar_nota_revision === 'true' ? 'true' : 'false';
    if (val.legal_fuentes_publicas !== undefined) {
        try {
            const j = JSON.parse(val.legal_fuentes_publicas || '{}');
            if (!j || typeof j !== 'object' || Array.isArray(j) || Object.values(j).some(x => typeof x !== 'string')) throw new Error();
            val.legal_fuentes_publicas = JSON.stringify(j);
        } catch (e) { errs.push('Fuentes públicas: tiene que ser un objeto JSON {"origen": "Fuente"}.'); }
    }
    for (const k of ['legal_razon_social', 'legal_domicilio', 'legal_representante_nombre', 'legal_marca_operada'])
        if (val[k] !== undefined && val[k].length < 2) errs.push(`Falta: ${k.replace('legal_', '').replace(/_/g, ' ')}.`);
    if (errs.length) return res.status(400).json({ success: false, error: errs.join(' ') });
    try {
        for (const [k, v] of Object.entries(val)) await upsert(pool, k, v);
        invalidate();
        // Las fichas cachean su respuesta 60 s: la línea de fuente se actualiza sola.
        res.json({ success: true });
    } catch (err) { fail500(res, 'config put', err); }
});

adminRouter.get('/page/:page', async (req, res) => {
    const page = req.params.page;
    if (!PAGES[page]) return res.status(404).json({ success: false, error: 'Página no encontrada' });
    try {
        const cfg = await loadCfg();
        res.json({ success: true, data: { page, md: cfg[`legal_${page}_md`] || DEFAULT_MD[page],
            version: cfg[`legal_${page}_version`] || '', fecha: cfg[`legal_${page}_fecha`] || '', vars: VARS } });
    } catch (err) { fail500(res, 'page get', err); }
});

adminRouter.post('/preview', async (req, res) => {
    const page = String((req.body || {}).page || 'terminos');
    if (!PAGES[page]) return res.status(400).json({ success: false, error: 'Página inválida' });
    try {
        const cfg = await loadCfg();
        const md = String((req.body || {}).md || '');
        const { html, toc } = renderMarkdown(md, varsFor(cfg, page));
        res.json({ success: true, data: { html, toc, unknownVars: unknownVars(md) } });
    } catch (err) { fail500(res, 'preview', err); }
});

// Publica una versión nueva: archiva en legal_versions, sube la versión (minor, o
// major si es sustancial), fecha = hoy. Sustancial → banner 15 días + aviso por correo.
async function publish(page, md, sustancial, userId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("SELECT 1 FROM site_config WHERE key = $1 FOR UPDATE", [`legal_${page}_version`]);
        const cfg = await loadCfg(client);
        const version = bump(cfg[`legal_${page}_version`], sustancial);
        const fecha = ymdPY();
        await client.query(
            `INSERT INTO legal_versions (page, version, content_md, sustancial, published_by) VALUES ($1,$2,$3,$4,$5)`,
            [page, version, md, sustancial, Number.isFinite(+userId) ? +userId : null]);
        await upsert(client, `legal_${page}_md`, md);
        await upsert(client, `legal_${page}_version`, version);
        await upsert(client, `legal_${page}_fecha`, fecha);
        if (sustancial) {
            await upsert(client, 'legal_banner_hasta', ymdPY(new Date(Date.now() + 15 * 86400e3)));
            await upsert(client, 'legal_aviso_id', `${fecha}-${page}-${version}`.slice(0, 40));
        }
        await client.query('COMMIT');
        invalidate();
        return { version, fecha };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally { client.release(); }
}

adminRouter.post('/page/:page', async (req, res) => {
    const page = req.params.page;
    if (!PAGES[page]) return res.status(404).json({ success: false, error: 'Página no encontrada' });
    const md = String((req.body || {}).md || '');
    if (md.trim().length < 50) return res.status(400).json({ success: false, error: 'El texto está vacío o es demasiado corto.' });
    if (md.length > 200000) return res.status(400).json({ success: false, error: 'El texto es demasiado largo.' });
    const unk = unknownVars(md);
    if (unk.length) return res.status(400).json({ success: false, error: `Variables desconocidas: ${unk.map(v => `{{${v}}}`).join(', ')}` });
    try {
        const r = await publish(page, md, (req.body || {}).sustancial === true, req.user && req.user.id);
        res.json({ success: true, data: r });
    } catch (err) { fail500(res, 'publish', err); }
});

adminRouter.get('/versions/:page', async (req, res) => {
    if (!PAGES[req.params.page]) return res.status(404).json({ success: false, error: 'Página no encontrada' });
    try {
        const { rows } = await pool.query(
            `SELECT lv.id, lv.version, lv.sustancial, lv.published_at, u.name AS published_by_name
               FROM legal_versions lv LEFT JOIN users u ON u.id = lv.published_by
              WHERE lv.page = $1 ORDER BY lv.published_at DESC, lv.id DESC`, [req.params.page]);
        res.json({ success: true, data: rows });
    } catch (err) { fail500(res, 'versions', err); }
});

adminRouter.get('/version/:id', async (req, res) => {
    try {
        const r = await pool.query('SELECT id, page, version, content_md, published_at FROM legal_versions WHERE id = $1', [parseInt(req.params.id, 10)]);
        if (!r.rows.length) return res.status(404).json({ success: false, error: 'Versión no encontrada' });
        res.json({ success: true, data: r.rows[0] });
    } catch (err) { fail500(res, 'version', err); }
});

// Restaurar = publicar el contenido de una versión vieja como versión nueva
// (el historial nunca se reescribe).
adminRouter.post('/version/:id/restore', async (req, res) => {
    try {
        const r = await pool.query('SELECT page, content_md FROM legal_versions WHERE id = $1', [parseInt(req.params.id, 10)]);
        if (!r.rows.length) return res.status(404).json({ success: false, error: 'Versión no encontrada' });
        const out = await publish(r.rows[0].page, r.rows[0].content_md, (req.body || {}).sustancial === true, req.user && req.user.id);
        res.json({ success: true, data: out });
    } catch (err) { fail500(res, 'restore', err); }
});

adminRouter.get('/requests', async (req, res) => {
    const estado = String(req.query.estado || '');
    try {
        const params = [];
        let where = '';
        if (['pendiente', 'en_curso', 'resuelta', 'rechazada'].includes(estado)) { params.push(estado); where = 'WHERE lr.estado = $1'; }
        const { rows } = await pool.query(
            `SELECT lr.*, b.slug, COALESCE(NULLIF(b.trade_name,''), b.name) AS business_name
               FROM legal_requests lr LEFT JOIN businesses b ON b.id = lr.business_id
               ${where} ORDER BY lr.created_at DESC LIMIT 200`, params);
        res.json({ success: true, data: rows });
    } catch (err) { fail500(res, 'requests', err); }
});

adminRouter.patch('/requests/:id', async (req, res) => {
    const b = req.body || {};
    const estado = String(b.estado || '');
    if (!['pendiente', 'en_curso', 'resuelta', 'rechazada'].includes(estado))
        return res.status(400).json({ success: false, error: 'Estado inválido' });
    try {
        const r = await pool.query(
            `UPDATE legal_requests SET estado = $2::varchar, notas = $3,
                    resolved_at = CASE WHEN $2::varchar IN ('resuelta','rechazada') THEN COALESCE(resolved_at, NOW()) ELSE NULL END
              WHERE id = $1 RETURNING id`,
            [parseInt(req.params.id, 10), estado, String(b.notas || '').slice(0, 4000) || null]);
        if (!r.rows.length) return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
        res.json({ success: true });
    } catch (err) { fail500(res, 'request patch', err); }
});

// Aviso de cambio sustancial por correo, en tandas (como Notificar empresas):
// cada llamada manda hasta `limit` y marca a quién ya le llegó.
adminRouter.post('/aviso/send', async (req, res) => {
    const limit = Math.min(Math.max(parseInt((req.body || {}).limit, 10) || 25, 1), 50);
    try {
        const cfg = await loadCfg();
        const avisoId = cfg.legal_aviso_id || '';
        if (!avisoId) return res.status(400).json({ success: false, error: 'No hay ningún cambio sustancial publicado para avisar.' });
        const { rows } = await pool.query(
            `SELECT u.id, u.email, u.name FROM users u WHERE ${AVISO_WHERE} ORDER BY u.id LIMIT $2`, [avisoId, limit]);
        const siteUrl = (cfg.site_url || 'https://retopa.com.py').replace(/\/+$/, '');
        let sent = 0, failed = 0;
        for (const u of rows) {
            const r = await sendEmail(u.email, 'legal_update', {
                name: u.name || '', siteName: cfg.site_name || 'RetoPA', siteUrl,
                terminosVersion: cfg.legal_terminos_version, privacidadVersion: cfg.legal_privacidad_version,
                vigenciaDesde: fechaLarga(cfg.legal_banner_hasta),
            }, { logType: 'legal_update' });
            // Se marca aunque falle (correo inválido): si no, la tanda se trabaría siempre en el mismo.
            await pool.query('UPDATE users SET legal_aviso_enviado = $2 WHERE id = $1', [u.id, avisoId]);
            if (r && r.success) sent++; else failed++;
            await new Promise(ok => setTimeout(ok, 333));
        }
        const pend = (await pool.query(`SELECT COUNT(*)::int AS n FROM users u WHERE ${AVISO_WHERE}`, [avisoId])).rows[0].n;
        res.json({ success: true, data: { sent, failed, pendientes: pend } });
    } catch (err) { fail500(res, 'aviso', err); }
});

// ── Aceptación de términos (registro y reclamo) ─────────────────────────────
async function termsTag(db = pool) {
    const { rows } = await db.query("SELECT key, value FROM site_config WHERE key IN ('legal_terminos_version','legal_privacidad_version')");
    const c = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return `T${c.legal_terminos_version || '?'}/P${c.legal_privacidad_version || '?'}`;
}
// Guarda versión + fecha de aceptación. El opt-in comercial es SEPARADO: solo se
// prende si lo marcó (nunca se apaga desde acá: para darse de baja hay otro camino).
async function recordAcceptance(db, userId, marketing) {
    const tag = await termsTag(db);
    await db.query(
        `UPDATE users SET terms_accepted_version = $2, terms_accepted_at = NOW(),
                marketing_opt_in = marketing_opt_in OR $3,
                marketing_opt_in_at = CASE WHEN $3 AND NOT marketing_opt_in THEN NOW() ELSE marketing_opt_in_at END
          WHERE id = $1`, [userId, tag, marketing === true]);
}

module.exports = { publicRouter, adminRouter, recordAcceptance, termsTag, validRuc, rucDv, bump, PAGES };
