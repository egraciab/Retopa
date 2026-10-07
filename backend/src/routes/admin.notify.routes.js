/**
 * RetoPA — routes/admin.notify.routes.js
 * Panel de notificación masiva por email
 * Montado en /api/v2/admin/notify
 */

const express    = require('express');
const router     = express.Router();
const { Pool }   = require('pg');
const nodemailer = require('nodemailer');
const jwt        = require('jsonwebtoken');
const JWT_SECRET = require('../config/jwt');

const pool = new Pool({
    host:     process.env.DB_HOST     || 'postgres',
    port:     process.env.DB_PORT     || 5432,
    database: process.env.DB_NAME     || process.env.POSTGRES_DB,
    user:     process.env.DB_USER     || process.env.POSTGRES_USER,
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
});

// SEGURIDAD (defensa en profundidad): este router hace envío masivo de emails y
// genera claim_tokens. Antes quedaba protegido SOLO por el orden de montaje bajo
// /api/v2/admin. Ahora exige explícitamente rol admin/godmode en TODAS sus rutas.
function requireAdmin(req, res, next) {
    try {
        const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
        if (!token) return res.status(401).json({ success: false, error: 'Token requerido', code: 'NO_TOKEN' });
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin' && decoded.role !== 'godmode')
            return res.status(403).json({ success: false, error: 'Acceso denegado: requiere admin', code: 'FORBIDDEN' });
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ success: false, error: 'Token inválido', code: 'INVALID_TOKEN' });
    }
}
router.use(requireAdmin);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getSMTPConfig() {
    const res = await pool.query('SELECT key, value FROM site_config');
    const cfg = {};
    res.rows.forEach(r => { cfg[r.key] = r.value; });
    return cfg;
}

function buildTransport(cfg) {
    return nodemailer.createTransport({
        host:   cfg.smtp_host || process.env.SMTP_HOST,
        port:   parseInt(cfg.smtp_port || process.env.SMTP_PORT || 587),
        secure: (cfg.smtp_secure || 'false') === 'true',
        auth: {
            user: cfg.smtp_user || process.env.SMTP_USER,
            pass: cfg.smtp_pass || process.env.SMTP_PASS,
        },
        tls: { rejectUnauthorized: false },
    });
}

function interpolate(tpl, vars) {
    return (tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || '');
}

function buildEmailHTML(biz, cfg) {
    const siteUrl  = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
    const siteName = cfg.site_name || 'RetoPA';
    const tagline  = cfg.site_tagline || 'El ecosistema comercial de Paraguay';

    // Usar claim_token si existe, fallback al slug
    const claimUrl = biz.claim_token
        ? `${siteUrl}/reclamar?token=${biz.claim_token}&utm_source=notify&utm_medium=email`
        : `${siteUrl}/registro?claim=${encodeURIComponent(biz.slug)}&utm_source=notify&utm_medium=email`;
    const profileUrl = `${siteUrl}/negocio/${biz.slug}`;

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1B3A6B,#0f2548);padding:36px 40px;text-align:center">
      <div style="font-size:32px;margin-bottom:8px">📍</div>
      <h1 style="color:white;margin:0;font-size:22px;font-weight:800">${siteName}</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px">${tagline}</p>
    </div>

    <!-- Body -->
    <div style="padding:36px 40px">
      <p style="color:#0f172a;font-size:16px;font-weight:700;margin:0 0 8px">¡Hola! 👋</p>
      <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px">
        ${cfg.notify_body
            ? interpolate(cfg.notify_body, { nombre: biz.name, ciudad: biz.city || '', sitio: siteName })
                .split('\n').map(l => `<p style="margin:0 0 8px">${l}</p>`).join('')
            : `Encontramos a <strong style="color:#0f172a">${biz.name}</strong> en nuestras fuentes de datos y ya creamos
        un perfil en <strong>${siteName}</strong> — ${tagline}.`}
      </p>

      <!-- Profile card -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Tu perfil actual</p>
        <p style="margin:0 0 12px;font-size:18px;font-weight:800;color:#0f172a">${biz.name}</p>
        ${biz.city ? `<p style="margin:0 0 4px;font-size:13px;color:#64748b">📍 ${biz.city}${biz.department ? ', ' + biz.department : ''}</p>` : ''}
        ${biz.phone ? `<p style="margin:0 0 4px;font-size:13px;color:#64748b">📞 ${biz.phone}</p>` : ''}
        ${biz.email ? `<p style="margin:0 0 4px;font-size:13px;color:#64748b">✉️ ${biz.email}</p>` : ''}
        <a href="${profileUrl}" style="display:inline-block;margin-top:12px;font-size:12px;color:#0ea5e9;text-decoration:none">Ver perfil público →</a>
      </div>

      <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px">
        ¿Es tu empresa? <strong>Reclamá y verificá tu perfil gratis</strong> para:
      </p>

      <ul style="margin:0 0 24px;padding:0;list-style:none">
        ${['✅ Aparecer primero en los resultados de búsqueda',
           '📝 Completar descripción, fotos y horarios',
           '📊 Ver estadísticas de visitas y contactos',
           '🏷️ Gestionar tus categorías y servicios'].map(item =>
          `<li style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155">${item}</li>`
        ).join('')}
      </ul>

      <!-- CTA -->
      <div style="text-align:center;margin:32px 0">
        <a href="${claimUrl}"
           style="display:inline-block;background:#1B3A6B;color:#ffffff !important;text-decoration:none;padding:16px 40px;border-radius:12px;font-weight:800;font-size:16px;letter-spacing:.3px;border:3px solid #1B3A6B;mso-padding-alt:0">
          ✅ Reclamar mi perfil gratis →
        </a>
        <p style="margin:12px 0 0;font-size:11px;color:#94a3b8">O copiá este link: <a href="${claimUrl}" style="color:#1B3A6B;word-break:break-all">${claimUrl}</a></p>
      </div>

      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">
        Si no sos el responsable de esta empresa, podés ignorar este email.<br>
        No compartimos tus datos con terceros.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center">
      <p style="margin:0;font-size:11px;color:#94a3b8">
        © ${new Date().getFullYear()} ${siteName} · <a href="${siteUrl}" style="color:#0ea5e9;text-decoration:none">${siteUrl.replace('https://','')}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── GET /notify/candidates ── Empresas notificables ──────────────────────────
router.get('/candidates', async (req, res) => {
    try {
        const { notified, page = 1, limit = 50, q, source } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Leer cooldown desde site_config
        const cfgRow = await pool.query("SELECT value FROM site_config WHERE key='notify_cooldown_days'");
        const cooldownDays = parseInt(cfgRow.rows[0]?.value || 30);

        let where = [`b.is_active = TRUE`, `b.verified = FALSE`, `b.email IS NOT NULL`];
        const params = [];
        let idx = 1;

        if (notified === 'no')       where.push(`b.notified_at IS NULL`);
        if (notified === 'yes')      where.push(`b.notified_at IS NOT NULL`);
        if (notified === 'cooldown') where.push(`(b.notified_at IS NULL OR b.notified_at < NOW() - INTERVAL '${cooldownDays} days')`);
        if (source)                  { where.push(`b.source = $${idx++}`); params.push(source); }
        if (q)                       { where.push(`b.name ILIKE $${idx++}`); params.push(`%${q}%`); }

        const whereSql = `WHERE ${where.join(' AND ')}`;

        const total = parseInt((await pool.query(
            `SELECT COUNT(*) FROM businesses b ${whereSql}`, params
        )).rows[0].count);

        const data = await pool.query(`
            SELECT b.id, b.name, b.email, b.phone, b.city, b.source,
                   b.slug, b.notified_at, b.notify_count,
                   (CASE WHEN b.verified THEN 40 ELSE 0 END
                    + CASE WHEN b.email    IS NOT NULL THEN 15 ELSE 0 END
                    + CASE WHEN b.phone    IS NOT NULL THEN 15 ELSE 0 END
                    + CASE WHEN b.website  IS NOT NULL THEN 10 ELSE 0 END
                    + CASE WHEN b.description IS NOT NULL THEN 10 ELSE 0 END) AS quality_score
            FROM businesses b
            ${whereSql}
            ORDER BY b.notified_at ASC NULLS FIRST, quality_score DESC, b.created_at DESC
            LIMIT $${idx++} OFFSET $${idx++}
        `, [...params, parseInt(limit), offset]);

        // Stats rápidas incluyendo cooldown
        const stats = (await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE b.email IS NOT NULL AND b.verified = FALSE) AS notificables,
                COUNT(*) FILTER (WHERE b.email IS NOT NULL AND b.verified = FALSE AND b.notified_at IS NULL) AS sin_notificar,
                COUNT(*) FILTER (WHERE b.email IS NOT NULL AND b.verified = FALSE AND b.notified_at IS NOT NULL) AS ya_notificadas,
                COUNT(*) FILTER (WHERE b.email IS NOT NULL AND b.verified = FALSE
                    AND (b.notified_at IS NULL OR b.notified_at < NOW() - INTERVAL '${cooldownDays} days')) AS elegibles_cooldown
            FROM businesses b WHERE b.is_active = TRUE
        `)).rows[0];

        res.json({
            success: true,
            data: data.rows,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
            cooldown_days: cooldownDays,
            stats: {
                notificables:      parseInt(stats.notificables),
                sin_notificar:     parseInt(stats.sin_notificar),
                ya_notificadas:    parseInt(stats.ya_notificadas),
                elegibles_cooldown: parseInt(stats.elegibles_cooldown),
            }
        });
    } catch (err) {
        console.error('[Notify] candidates error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Elegibilidad de campaña (compartida por preview y campaña) ───────────────
// Mismo score que /candidates (para poder filtrar por score mínimo).
const SCORE_SQL = `(CASE WHEN b.verified THEN 40 ELSE 0 END
   + CASE WHEN b.email       IS NOT NULL THEN 15 ELSE 0 END
   + CASE WHEN b.phone       IS NOT NULL THEN 15 ELSE 0 END
   + CASE WHEN b.website     IS NOT NULL THEN 10 ELSE 0 END
   + CASE WHEN b.description  IS NOT NULL THEN 10 ELSE 0 END)`;

// Construye el WHERE de elegibilidad a partir de los parámetros de la campaña.
// Base: activas, NO verificadas, con email. Parámetros opcionales:
//   include_cooldown (default true): true = nunca notificadas + las que superaron
//     el cooldown; false = SOLO nunca notificadas.
//   source, city (LOWER exacto), min_score (>=).
// Devuelve { whereSql, params, nextIdx } para seguir agregando ($limit/$offset).
function buildCampaignFilter(body = {}, cooldownDays = 30) {
    const conds = ['b.is_active = TRUE', 'b.verified = FALSE', 'b.email IS NOT NULL'];
    const params = [];
    let idx = 1;
    const includeCooldown = !(body.include_cooldown === false || body.include_cooldown === 'false');
    const cd = parseInt(cooldownDays, 10) || 30;
    if (includeCooldown) conds.push(`(b.notified_at IS NULL OR b.notified_at < NOW() - INTERVAL '${cd} days')`);
    else                 conds.push('b.notified_at IS NULL');
    if (body.source)     { conds.push(`b.source = $${idx++}`); params.push(String(body.source)); }
    if (body.city && String(body.city).trim()) { conds.push(`LOWER(b.city) = LOWER($${idx++})`); params.push(String(body.city).trim()); }
    const minScore = parseInt(body.min_score, 10);
    if (Number.isFinite(minScore) && minScore > 0) { conds.push(`${SCORE_SQL} >= $${idx++}`); params.push(minScore); }
    return { whereSql: 'WHERE ' + conds.join(' AND '), params, nextIdx: idx, includeCooldown };
}

// ── POST /notify/campaign-preview ── "Recalcular": cuántas y a quiénes ────────
// Dry-run que refleja EXACTAMENTE la elegibilidad de /campaign (incluye cooldown y
// filtros). No envía nada. Devuelve total elegible, cuántas se enviarían con el
// tope, y una muestra de las primeras (mismo orden que la campaña).
router.post('/campaign-preview', async (req, res) => {
    try {
        const cfgRow = await pool.query("SELECT value FROM site_config WHERE key='notify_cooldown_days'");
        const cooldownDays = parseInt(cfgRow.rows[0]?.value || 30);
        const { whereSql, params } = buildCampaignFilter(req.body, cooldownDays);

        const total = parseInt((await pool.query(`SELECT COUNT(*) FROM businesses b ${whereSql}`, params)).rows[0].count);
        const cap = parseInt(req.body.limit, 10);
        const hasCap = Number.isFinite(cap) && cap > 0;
        const to_send = hasCap ? Math.min(total, cap) : total;

        const sample = (await pool.query(`
            SELECT b.name, b.email, b.city, b.source, ${SCORE_SQL} AS quality_score
            FROM businesses b ${whereSql}
            ORDER BY b.notified_at ASC NULLS FIRST, quality_score DESC, b.created_at DESC
            LIMIT 5`, params)).rows;

        res.json({
            success: true,
            total_eligible: total,
            to_send,
            cap: hasCap ? cap : null,
            include_cooldown: buildCampaignFilter(req.body, cooldownDays).includeCooldown,
            cooldown_days: cooldownDays,
            sample,
        });
    } catch (err) {
        console.error('[Campaign preview]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /notify/preview ── Cuántas se enviarían ─────────────────────────────
router.post('/preview', async (req, res) => {
    try {
        const { ids } = req.body; // array de IDs o 'all'
        if (!ids) return res.status(400).json({ success: false, error: 'ids requerido' });

        let count, sample;
        if (ids === 'all') {
            count = parseInt((await pool.query(
                `SELECT COUNT(*) FROM businesses WHERE is_active=TRUE AND verified=FALSE AND email IS NOT NULL AND notified_at IS NULL`
            )).rows[0].count);
            sample = (await pool.query(
                `SELECT name, email, city FROM businesses WHERE is_active=TRUE AND verified=FALSE AND email IS NOT NULL AND notified_at IS NULL ORDER BY created_at DESC LIMIT 5`
            )).rows;
        } else {
            if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, error: 'ids debe ser array o "all"' });
            count = ids.length;
            sample = (await pool.query(
                `SELECT name, email, city FROM businesses WHERE id = ANY($1) AND email IS NOT NULL LIMIT 5`,
                [ids]
            )).rows;
        }

        res.json({ success: true, count, sample });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const crypto = require('crypto');

function generateClaimToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ── POST /notify/send ── Disparar envío ──────────────────────────────────────
router.post('/send', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids) return res.status(400).json({ success: false, error: 'ids requerido' });

        const cfg = await getSMTPConfig();
        const transport = buildTransport(cfg);
        await transport.verify();

        // Obtener empresas a notificar
        let businesses;
        if (ids === 'all') {
            businesses = (await pool.query(
                `SELECT id, name, email, phone, city, department, slug
                 FROM businesses
                 WHERE is_active=TRUE AND verified=FALSE AND email IS NOT NULL AND notified_at IS NULL
                 ORDER BY created_at DESC`
            )).rows;
        } else {
            if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, error: 'ids debe ser array o "all"' });
            businesses = (await pool.query(
                `SELECT id, name, email, phone, city, department, slug
                 FROM businesses WHERE id = ANY($1) AND email IS NOT NULL`,
                [ids]
            )).rows;
        }

        if (businesses.length === 0) return res.json({ success: true, sent: 0, failed: 0, message: 'No hay empresas para notificar' });

        const fromName = cfg.smtp_from_name || 'RetoPA';
        const fromAddr = cfg.smtp_from || cfg.smtp_user;
        const siteName = cfg.site_name || 'RetoPA';

        let sent = 0, failed = 0;
        const errors = [];

        for (const biz of businesses) {
            try {
                // Generar claim token único para esta empresa
                const claimToken = generateClaimToken();
                const claimExpires = new Date();
                claimExpires.setDate(claimExpires.getDate() + 30);
                await pool.query(`
                    UPDATE businesses SET
                        claim_token = $1, claim_token_at = NOW(),
                        claim_expires_at = $2, updated_at = NOW()
                    WHERE id = $3
                `, [claimToken, claimExpires, biz.id]);
                biz.claim_token = claimToken;

                await transport.sendMail({
                    from:    `"${fromName}" <${fromAddr}>`,
                    to:      biz.email,
                    subject: cfg.notify_subject
                        ? interpolate(cfg.notify_subject, { nombre: biz.name, ciudad: biz.city || '', sitio: siteName })
                        : `${biz.name} ya está en ${siteName} — reclamá tu perfil`,
                    cc: cfg.notify_cc || undefined,
                    html:    buildEmailHTML(biz, cfg),
                });

                await pool.query(
                    `UPDATE businesses SET notified_at = NOW(), notify_count = COALESCE(notify_count, 0) + 1, updated_at = NOW() WHERE id = $1`,
                    [biz.id]
                );

                // Log en email_log
                await pool.query(
                    `INSERT INTO email_log (to_email, subject, type, status) VALUES ($1, $2, 'notify', 'sent')`,
                    [biz.email, `${biz.name} ya está en ${siteName}`]
                ).catch(() => {});

                sent++;
                // Rate limiting: 3 emails/segundo para no saturar el SMTP
                await new Promise(r => setTimeout(r, 333));
            } catch (e) {
                failed++;
                errors.push({ name: biz.name, email: biz.email, error: e.message });
                await pool.query(
                    `INSERT INTO email_log (to_email, subject, type, status, error) VALUES ($1, $2, 'notify', 'failed', $3)`,
                    [biz.email, `Notificación ${biz.name}`, e.message]
                ).catch(() => {});
            }
        }

        console.log(`[Notify] Enviados: ${sent}, Fallidos: ${failed}`);
        res.json({ success: true, sent, failed, errors: errors.slice(0, 10) });
    } catch (err) {
        console.error('[Notify] send error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /notify/email-preview ── Preview del email con datos reales ────────────
router.get('/email-preview', async (req, res) => {
    try {
        const cfg = await getSMTPConfig();
        const siteName = cfg.site_name || 'RetoPA';
        const fromName = cfg.smtp_from_name || 'RetoPA';
        const fromAddr = cfg.smtp_from || cfg.smtp_user;

        // Tomar una empresa real con email para el preview
        const sample = await pool.query(
            `SELECT id, name, email, phone, city, department, slug
             FROM businesses
             WHERE is_active=TRUE AND email IS NOT NULL AND slug IS NOT NULL
             ORDER BY (CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN city IS NOT NULL THEN 1 ELSE 0 END) DESC, RANDOM()
             LIMIT 1`
        );

        if (!sample.rows.length) return res.status(404).json({ success: false, error: 'No hay empresas con email para preview' });

        const biz = sample.rows[0];
        const subject = cfg.notify_subject
            ? interpolate(cfg.notify_subject, { nombre: biz.name, ciudad: biz.city || '', sitio: siteName })
            : `${biz.name} ya está en ${siteName} — reclamá tu perfil`;

        res.json({
            success: true,
            from:    `"${fromName}" <${fromAddr}>`,
            subject,
            cc:      cfg.notify_cc || null,
            html:    buildEmailHTML(biz, cfg),
            sample:  { name: biz.name, email: biz.email, city: biz.city },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /notify/cooldown ── Guardar cooldown en site_config ─────────────────
router.post('/cooldown', async (req, res) => {
    try {
        const { days } = req.body;
        const d = parseInt(days);
        if (!d || d < 1 || d > 365) return res.status(400).json({ success: false, error: 'días debe ser entre 1 y 365' });
        await pool.query(`
            INSERT INTO site_config (key, value) VALUES ('notify_cooldown_days', $1)
            ON CONFLICT (key) DO UPDATE SET value = $1
        `, [String(d)]);
        res.json({ success: true, cooldown_days: d });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /notify/campaign ── Campaña respetando cooldown ─────────────────────
router.post('/campaign', async (req, res) => {
    try {
        const cfgRow = await pool.query("SELECT value FROM site_config WHERE key='notify_cooldown_days'");
        const cooldownDays = parseInt(cfgRow.rows[0]?.value || 30);

        const cfg = await getSMTPConfig();
        const transport = buildTransport(cfg);
        await transport.verify();

        // Elegibles: mismos filtros que el preview ("recalcular") → source, city,
        // min_score, include_cooldown; + tope opcional por tanda (limit).
        const { whereSql, params, nextIdx } = buildCampaignFilter(req.body, cooldownDays);
        const cap = parseInt(req.body.limit, 10);
        const hasCap = Number.isFinite(cap) && cap > 0;
        const limitSql = hasCap ? `LIMIT $${nextIdx}` : '';
        const businesses = (await pool.query(`
            SELECT b.id, b.name, b.email, b.phone, b.city, b.department, b.slug
            FROM businesses b
            ${whereSql}
            ORDER BY b.notified_at ASC NULLS FIRST, b.created_at DESC
            ${limitSql}
        `, hasCap ? [...params, cap] : params)).rows;

        if (!businesses.length) return res.json({ success: true, sent: 0, failed: 0, remaining: 0, message: 'No hay empresas elegibles' });

        const fromName = cfg.smtp_from_name || 'RetoPA';
        const fromAddr = cfg.smtp_from || cfg.smtp_user;
        const siteName = cfg.site_name || 'RetoPA';
        let sent = 0, failed = 0;
        const errors = [];

        for (const biz of businesses) {
            try {
                const claimToken = generateClaimToken();
                const claimExpires = new Date();
                claimExpires.setDate(claimExpires.getDate() + 30);
                await pool.query(`
                    UPDATE businesses SET claim_token=$1, claim_token_at=NOW(),
                    claim_expires_at=$2, updated_at=NOW() WHERE id=$3
                `, [claimToken, claimExpires, biz.id]);
                biz.claim_token = claimToken;

                await transport.sendMail({
                    from:    `"${fromName}" <${fromAddr}>`,
                    to:      biz.email,
                    subject: cfg.notify_subject
                        ? interpolate(cfg.notify_subject, { nombre: biz.name, ciudad: biz.city || '', sitio: siteName })
                        : `${biz.name} ya está en ${siteName} — reclamá tu perfil`,
                    html: buildEmailHTML(biz, cfg),
                });

                await pool.query(
                    `UPDATE businesses SET notified_at=NOW(), notify_count=COALESCE(notify_count,0)+1, updated_at=NOW() WHERE id=$1`,
                    [biz.id]
                );
                await pool.query(
                    `INSERT INTO email_log (to_email, subject, type, status) VALUES ($1,$2,'notify','sent')`,
                    [biz.email, `${biz.name} ya está en ${siteName}`]
                ).catch(()=>{});

                sent++;
                await new Promise(r => setTimeout(r, 333));
            } catch (e) {
                failed++;
                errors.push({ name: biz.name, email: biz.email, error: e.message });
            }
        }

        // Cuántas quedan elegibles tras esta tanda (útil cuando se usó tope por tanda).
        let remaining = 0;
        try { remaining = parseInt((await pool.query(`SELECT COUNT(*) FROM businesses b ${whereSql}`, params)).rows[0].count); } catch (_) {}

        res.json({ success: true, sent, failed, remaining, capped: hasCap ? cap : null, errors: errors.slice(0, 10), cooldown_days: cooldownDays });
    } catch (err) {
        console.error('[Campaign]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /notify/templates ── Leer todas las plantillas ───────────────────────
router.get('/templates', async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT key, value FROM site_config WHERE key LIKE 'tpl_%' ORDER BY key"
        );
        const tpls = {};
        result.rows.forEach(r => { tpls[r.key] = r.value; });
        res.json({ success: true, data: tpls });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /notify/templates ── Guardar una o varias plantillas ─────────────────
router.post('/templates', async (req, res) => {
    try {
        const { templates } = req.body; // { 'tpl_newReview_subject': '...', ... }
        if (!templates || typeof templates !== 'object')
            return res.status(400).json({ success: false, error: 'templates requerido' });

        for (const [key, value] of Object.entries(templates)) {
            if (!key.startsWith('tpl_')) continue; // seguridad
            await pool.query(`
                INSERT INTO site_config (key, value) VALUES ($1, $2)
                ON CONFLICT (key) DO UPDATE SET value = $2
            `, [key, value]);
        }
        res.json({ success: true, saved: Object.keys(templates).length });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// Datos de prueba por template (compartido: test-template + template-preview)
// Datos REALES del Destacado Fundador activo de una ficha (para no mandar los
// días de ejemplo). Devuelve {days, expiresLabel} o null si no tiene uno activo.
async function realFounderData(businessId) {
    if (!businessId) return null;
    const g = await pool.query(
        `SELECT created_at, expires_at FROM plan_grants
         WHERE business_id=$1 AND reason='founder' AND reverted_at IS NULL AND expires_at > NOW()
         ORDER BY expires_at DESC LIMIT 1`, [businessId]
    );
    if (!g.rows.length) return null;
    const { created_at, expires_at } = g.rows[0];
    const days = Math.max(1, Math.round((new Date(expires_at) - new Date(created_at)) / 86400000));
    const expiresLabel = new Date(expires_at).toLocaleDateString('es-PY',
        { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Asuncion' });
    return { days, expiresLabel };
}

function buildNotifyTestData({ siteName, siteUrl, bname, bslug, oname, to, realBiz }) {
  return {
    welcome:         { name: oname, siteName, siteUrl, panelUrl: `${siteUrl}/cliente` },
    verified:        { name: oname, businessName: bname, businessUrl: `${siteUrl}/negocio/${bslug}`, siteName, siteUrl },
    newReview:       { ownerName: oname, businessName: bname, rating: 4, comment: 'Excelente servicio, muy recomendable.', authorName: 'Cliente Test', canReply: true, businessUrl: `${siteUrl}/negocio/${bslug}`, panelUrl: `${siteUrl}/cliente`, siteName, siteUrl },
    likeMilestone:   { ownerName: oname, businessName: bname, likeCount: 25, businessUrl: `${siteUrl}/negocio/${bslug}`, panelUrl: `${siteUrl}/cliente`, siteName, siteUrl },
    whatsappContact: { ownerName: oname, businessName: bname, todayCount: 3, businessUrl: `${siteUrl}/negocio/${bslug}`, panelUrl: `${siteUrl}/cliente`, siteName, siteUrl },
    weeklySummary:   { ownerName: oname, businessName: bname, weekLabel: 'Semana del 1 de junio', views: 142, whatsappClicks: 7, reviews: 2, likes: 5, qualityScore: 65, businessUrl: `${siteUrl}/negocio/${bslug}`, panelUrl: `${siteUrl}/cliente`, siteName, siteUrl },
    founderExpiring: { name: oname, businessName: bname, businessUrl: `${siteUrl}/negocio/${bslug}`, panelUrl: `${siteUrl}/cliente`, plansUrl: `${siteUrl}/#planes`, siteName, siteUrl, views: 142, whatsappClicks: 9 },
    founderGranted:  { ownerName: oname, businessName: bname, days: 90, expiresLabel: new Date(Date.now() + 90 * 86400000).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Asuncion' }), businessUrl: `${siteUrl}/negocio/${bslug}`, panelUrl: `${siteUrl}/cliente`, siteName, siteUrl },
    planRequested:   { name: oname, businessName: bname, planLabel: 'Empresa Pro', amount: (499000).toLocaleString('es-PY'), tpagoLink: 'https://tpago.example/pay', panelUrl: `${siteUrl}/cliente`, siteName, siteUrl },
    planActivated:   { name: oname, businessName: bname, planLabel: 'Empresa Pro', expires: '10 de septiembre de 2026', panelUrl: `${siteUrl}/cliente`, siteName, siteUrl },
    planRejected:    { name: oname, businessName: bname, planLabel: 'Empresa Pro', reason: 'No recibimos el pago', panelUrl: `${siteUrl}/cliente`, siteName, siteUrl },
    signalDigest:    { name: oname, count: 3, items: [bname, 'Ferretería Sur', 'Panadería La Espiga'], panelUrl: `${siteUrl}/embajador`, siteName, siteUrl },
    planRenewalReminder: { name: oname, businessName: bname, planLabel: 'Business Pro', daysLeft: 3, whenText: 'vence en 3 días', amount: (299000).toLocaleString('es-PY'), expires: '10 de septiembre de 2026', tpagoLink: 'https://tpago.example/pay', panelUrl: `${siteUrl}/cliente`, plansUrl: `${siteUrl}/#planes`, siteName, siteUrl },
    planExpired:     { name: oname, businessName: bname, planLabel: 'Business Pro', views: 142, whatsappClicks: 9, panelUrl: `${siteUrl}/cliente`, plansUrl: `${siteUrl}/#planes`, siteName, siteUrl },
    claimReceived:   { name: oname, businessName: bname, email: to, siteName, siteUrl },
    claimApproved:   { name: oname, businessName: bname, businessUrl: `${siteUrl}/negocio/${bslug}`, panelUrl: `${siteUrl}/cliente`, siteName, siteUrl },
    claimAdminAlert: { businessName: bname, userName: oname, userEmail: to, userPhone: realBiz?.phone || '+595981000000', city: realBiz?.city || 'Asunción', adminUrl: `${siteUrl}/admin`, siteName, siteUrl },
    notifyBiz:       { name: bname, ciudad: realBiz?.city || 'Asunción', sitio: siteName, claimUrl: `${siteUrl}/reclamar?token=test` },
    passwordReset:   { name: oname, resetUrl: `${siteUrl}/reset?token=test123`, siteName, siteUrl },
    tipsFicha:       { name: oname, businessName: bname, businessUrl: `${siteUrl}/negocio/${bslug}`, panelUrl: `${siteUrl}/cliente`, siteName, siteUrl },
    reactivation:    { name: oname, businessName: bname, businessUrl: `${siteUrl}/negocio/${bslug}`, panelUrl: `${siteUrl}/cliente`, siteName, siteUrl },
    firstSteps:      { name: oname, businessName: bname, businessUrl: `${siteUrl}/negocio/${bslug}`, panelUrl: `${siteUrl}/cliente`, siteName, siteUrl },
  };
}

// ── GET /notify/template-preview ── Render-only (no envía) para "Ver preview" ─
router.get('/template-preview', async (req, res) => {
  try {
    const template = req.query.template;
    if (!template) return res.status(400).json({ success: false, error: 'template requerido' });
    const cfg = await getSMTPConfig();
    const siteName = cfg.site_name || 'RetoPA';
    const siteUrl  = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
    let realBiz = null;
    if (req.query.business_slug) {
      const r = await pool.query(`SELECT b.*, u.name AS owner_name FROM businesses b
        LEFT JOIN user_businesses ub ON ub.business_id=b.id AND ub.is_owner=TRUE
        LEFT JOIN users u ON u.id=ub.user_id WHERE b.slug=$1 LIMIT 1`, [req.query.business_slug]);
      realBiz = r.rows[0] || null;
    }
    const bname = realBiz ? (realBiz.trade_name || realBiz.name) : 'Mi Empresa Test';
    const bslug = realBiz?.slug || 'test';
    const oname = realBiz?.owner_name || 'Dueño de Prueba';

    // notifyBiz: usa el HTML de la notificación masiva
    if (template === 'notifyBiz') {
      const fakeBiz = { name: bname, email: 'preview@retopa.com.py', phone: realBiz?.phone, city: realBiz?.city || 'Asunción', slug: bslug, claim_token: 'test-token-preview' };
      const html = buildEmailHTML(fakeBiz, cfg);
      const subject = cfg.notify_subject ? interpolate(cfg.notify_subject, { nombre: bname, ciudad: realBiz?.city || '', sitio: siteName }) : `Notificación — ${bname}`;
      return res.json({ success: true, subject, html });
    }

    const testData = buildNotifyTestData({ siteName, siteUrl, bname, bslug, oname, to: 'preview@retopa.com.py', realBiz });
    const data = testData[template];
    if (!data) return res.status(400).json({ success: false, error: `Template "${template}" no reconocido` });
    const { renderTemplate } = require('../config/mail');
    const { subject, html } = await renderTemplate(template, data);
    res.json({ success: true, subject, html });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /notify/test-template ── Enviar email de prueba por template ────────
router.post('/test-template', async (req, res) => {
    try {
        const { template, to, business_slug } = req.body;
        if (!template || !to) return res.status(400).json({ success: false, error: 'template y to requeridos' });

        const cfg  = await getSMTPConfig();
        const { sendEmail } = require('../config/mail');
        const siteName = cfg.site_name || 'RetoPA';
        const siteUrl  = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');

        // Obtener empresa real si se especificó
        let realBiz = null;
        if (business_slug) {
            const bizRes = await pool.query(
                `SELECT b.*, u.name AS owner_name, u.email AS owner_email
                 FROM businesses b
                 LEFT JOIN user_businesses ub ON ub.business_id=b.id AND ub.is_owner=TRUE
                 LEFT JOIN users u ON u.id=ub.user_id
                 WHERE b.slug=$1 LIMIT 1`, [business_slug]
            );
            realBiz = bizRes.rows[0] || null;
        }

        const bname = realBiz ? (realBiz.trade_name || realBiz.name) : 'Mi Empresa Test';
        const bslug = realBiz?.slug || 'test';
        const oname = realBiz?.owner_name || 'Dueño de Prueba';

        // Datos de prueba por template — usando datos reales si hay empresa
        const testData = buildNotifyTestData({ siteName, siteUrl, bname, bslug, oname, to, realBiz });

        const data = testData[template];
        if (!data && template !== 'notifyBiz')
            return res.status(400).json({ success: false, error: `Template "${template}" no reconocido` });

        // Fundador: si hay una ficha real seleccionada con Destacado activo,
        // usar sus DÍAS reales (no los de ejemplo).
        if (template === 'founderGranted' && realBiz) {
            const rf = await realFounderData(realBiz.id);
            if (rf) { data.days = rf.days; data.expiresLabel = rf.expiresLabel; }
        }

        // notifyBiz usa el sistema de notificación masiva existente
        if (template === 'notifyBiz') {
            const fakeBiz = { name: bname, email: to, phone: realBiz?.phone, city: realBiz?.city || 'Asunción', slug: bslug, claim_token: 'test-token-preview' };
            const mailHtml = buildEmailHTML(fakeBiz, cfg);
            const transport = buildTransport(cfg);
            await transport.sendMail({
                from: `"${cfg.smtp_from_name || 'RetoPA'}" <${cfg.smtp_from || cfg.smtp_user}>`,
                to,
                subject: cfg.notify_subject ? interpolate(cfg.notify_subject, { nombre: bname, ciudad: realBiz?.city || '', sitio: siteName }) : `[TEST] Notificación masiva — ${bname}`,
                html: mailHtml,
            });
            await pool.query(`INSERT INTO email_log (to_email, subject, type, status, metadata) VALUES ($1,$2,'test','sent',$3)`,
                [to, `[TEST] notifyBiz`, JSON.stringify({ template: 'notifyBiz' })]).catch(()=>{});
            return res.json({ success: true, message: `Email de prueba "notifyBiz" enviado a ${to}` });
        }

        // skipLog: lo registramos nosotros como 'test' con asunto [TEST] (evita doble log).
        await sendEmail(to, template, data, { skipLog: true });

        // Log
        await pool.query(
            `INSERT INTO email_log (to_email, subject, type, status, metadata)
             VALUES ($1, $2, 'test', 'sent', $3)`,
            [to, `[TEST] ${template}`, JSON.stringify({ template })]
        ).catch(()=>{});

        res.json({ success: true, message: `Email de prueba "${template}" enviado a ${to}` });
    } catch (err) {
        await pool.query(
            `INSERT INTO email_log (to_email, subject, type, status, error)
             VALUES ($1, $2, 'test', 'failed', $3)`,
            [req.body.to || '', `[TEST] ${req.body.template || ''}`, err.message]
        ).catch(()=>{});
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /notify/send-template ── Envío REAL manual de una plantilla ──────────
// Igual que test-template pero manda un correo de verdad (sin [TEST]) al
// destinatario elegido, con datos de la ficha seleccionada. sendEmail() lo
// registra solo en email_log (type = plantilla). Útil para reenvíos puntuales.
router.post('/send-template', async (req, res) => {
    try {
        const { template, to, business_slug } = req.body;
        if (!template || !to) return res.status(400).json({ success: false, error: 'template y destinatario requeridos' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to).trim()))
            return res.status(400).json({ success: false, error: 'Email de destino inválido' });
        if (template === 'notifyBiz')
            return res.status(400).json({ success: false, error: 'Usá "Notificar empresas" para el envío masivo.' });

        const cfg  = await getSMTPConfig();
        const { sendEmail } = require('../config/mail');
        const siteName = cfg.site_name || 'RetoPA';
        const siteUrl  = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');

        let realBiz = null;
        if (business_slug) {
            const bizRes = await pool.query(
                `SELECT b.*, u.name AS owner_name, u.email AS owner_email
                 FROM businesses b
                 LEFT JOIN user_businesses ub ON ub.business_id=b.id AND ub.is_owner=TRUE
                 LEFT JOIN users u ON u.id=ub.user_id
                 WHERE b.slug=$1 LIMIT 1`, [business_slug]
            );
            realBiz = bizRes.rows[0] || null;
        }
        const bname = realBiz ? (realBiz.trade_name || realBiz.name) : 'Tu empresa';
        const bslug = realBiz?.slug || '';
        const oname = realBiz?.owner_name || '';

        const data = buildNotifyTestData({ siteName, siteUrl, bname, bslug, oname, to, realBiz })[template];
        if (!data) return res.status(400).json({ success: false, error: `Template "${template}" no reconocido` });

        // Fundador: en un envío REAL, usar los días reales de la ficha (no los de ejemplo).
        if (template === 'founderGranted') {
            if (!realBiz) return res.status(400).json({ success: false, error: 'Elegí la ficha para enviar el aviso de Destacado Fundador (así toma los días reales).' });
            const rf = await realFounderData(realBiz.id);
            if (!rf) return res.status(409).json({ success: false, error: 'Esta ficha no tiene un Destacado Fundador activo. Otorgalo primero y luego reenviá el aviso.' });
            data.days = rf.days;
            data.expiresLabel = rf.expiresLabel;
        }

        const r = await sendEmail(to.trim(), template, data);  // sendEmail loguea solo (type=template)
        if (!r || !r.success) return res.status(502).json({ success: false, error: (r && r.error) || 'No se pudo enviar' });
        res.json({ success: true, message: `Correo "${template}" enviado a ${to}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /notify/logs ── Últimos emails enviados (paginado) ────────────────────
router.get('/logs', async (req, res) => {
    try {
        const { limit = 25, offset = 0, type, status } = req.query;
        let where = [];
        const params = [];
        let idx = 1;
        if (type)   { where.push(`type = $${idx++}`);   params.push(type); }
        if (status) { where.push(`status = $${idx++}`); params.push(status); }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        // Total que matchea el filtro actual (para el paginado)
        const totalRes = await pool.query(
            `SELECT COUNT(*) AS total FROM email_log ${whereSql}`, params
        );
        const filteredTotal = parseInt(totalRes.rows[0].total);

        const logs = await pool.query(`
            SELECT id, to_email, subject, type, status, error, metadata, created_at
            FROM email_log ${whereSql}
            ORDER BY created_at DESC
            LIMIT $${idx} OFFSET $${idx+1}
        `, [...params, parseInt(limit), parseInt(offset)]);

        const stats = await pool.query(`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status='sent')   AS sent,
                COUNT(*) FILTER (WHERE status='failed') AS failed,
                COUNT(*) FILTER (WHERE type='test')     AS tests,
                COUNT(*) FILTER (WHERE type='notify')   AS notify,
                COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '24 hours') AS last_24h
            FROM email_log
        `);

        res.json({ success: true, data: logs.rows, stats: stats.rows[0], filteredTotal });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
