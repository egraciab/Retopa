// ============================================
// RETOPA — Panel del Cliente API
// /api/v2/client/*
// Requiere JWT con role = client | admin | godmode
// ============================================

const express = require('express');
const { getPlanLimits } = require('../utils/plan-limits');
const { normalizePhone } = require('../utils/phone');
const { sendEmail } = require('../config/mail');
const { buildKitPdf } = require('../utils/kit-pdf');
const { touchLastSeen } = require('../utils/presence');
const router  = require('express').Router();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const redisClient = require('../config/redis');

const pool = new Pool({
    host:     process.env.DB_HOST     || 'postgres',
    port:     process.env.DB_PORT     || 5432,
    database: process.env.DB_NAME     || process.env.POSTGRES_DB,
    user:     process.env.DB_USER     || process.env.POSTGRES_USER,
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
});

const JWT_SECRET = require('../config/jwt');
const ROLE_LEVEL = { godmode: 4, admin: 3, client: 2, user: 1 };

// ── Middleware: requiere login (cualquier rol >= client) ──────────────────
function requireAuth(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Token requerido', code: 'NO_TOKEN' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        // D8.1 — marcar actividad para "usuarios conectados" (throttled, fire & forget)
        touchLastSeen(pool, decoded);
        next();
    } catch(e) {
        res.status(401).json({ success: false, error: 'Token inválido o expirado', code: 'INVALID_TOKEN' });
    }
}

// ── Rutas públicas (sin auth) ──────────────────────────────────────────
// ── POST /client/businesses/:slug/click ── Registrar clic ────────────────
router.post('/businesses/:slug/click', async (req, res) => {
    try {
        const biz = await pool.query('SELECT id FROM businesses WHERE slug=$1', [req.params.slug]);
        if (!biz.rows.length) return res.status(404).json({ success: false });
        const { click_type = 'whatsapp' } = req.body;
        const validTypes = ['whatsapp', 'phone', 'website'];
        const type = validTypes.includes(click_type) ? click_type : 'whatsapp';
        const crypto = require('crypto');
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';
        const ipHash = crypto.createHash('sha256').update(ip + (process.env.JWT_SECRET||'')).digest('hex').slice(0,32);
        await pool.query(
            'INSERT INTO business_clicks (business_id, click_type, ip_hash) VALUES ($1,$2,$3)',
            [biz.rows[0].id, type, ipHash]
        );

        // Notificar al dueño por WhatsApp click — solo 1 vez por día por empresa
        if (type === 'whatsapp') {
            ;(async () => {
                const { notifyOwner } = require('../helpers/notifyOwner');
                // Contar clicks de hoy para evitar spam de emails
                const todayResult = await pool.query(`
                    SELECT COUNT(*) as cnt FROM business_clicks
                    WHERE business_id=$1 AND click_type='whatsapp'
                    AND clicked_at >= CURRENT_DATE
                `, [biz.rows[0].id]);
                const todayCount = parseInt(todayResult.rows[0]?.cnt || 1);
                // Solo notificar en el primer click del día
                if (todayCount === 1) {
                    await notifyOwner(biz.rows[0].id, 'whatsappContact', { todayCount });
                }
            })().catch(() => {});
        }

        res.json({ success: true });
    } catch(err) { res.status(200).json({ success: true }); } // silencioso
});

// ── POST /client/businesses/:slug/view ── Registrar visita ───────────────
// Llamado desde el SSR/frontend cuando se abre una ficha
router.post('/businesses/:slug/view', async (req, res) => {
    try {
        const biz = await pool.query('SELECT id FROM businesses WHERE slug=$1', [req.params.slug]);
        if (!biz.rows.length) return res.status(404).json({ success: false });
        const crypto = require('crypto');
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';
        const ipHash = crypto.createHash('sha256').update(ip + (process.env.JWT_SECRET||'')).digest('hex').slice(0,32);
        await pool.query(
            'INSERT INTO business_views (business_id, ip_hash, referrer) VALUES ($1,$2,$3)',
            [biz.rows[0].id, ipHash, req.headers.referer?.slice(0,500) || null]
        );
        res.json({ success: true });
    } catch(err) { res.status(200).json({ success: true }); } // silencioso
});

// ── GET /client/reviews ── Mis reseñas (para responder) — MOVIDO post-requireAuth
// (ver más abajo, después de router.use(requireAuth))

router.use(requireAuth);

// ── GET /client/reviews ── Mis reseñas ───────────────────────────────────
router.get('/reviews', async (req, res) => {
    try {
        const { business_slug } = req.query;
        let where = 'ub.user_id = $1';
        const params = [req.user.id];
        if (business_slug) {
            where += ' AND b.slug = $2';
            params.push(business_slug);
        }
        const result = await pool.query(`
            SELECT r.id, r.rating, r.comment, r.author_name, r.author_email,
                   r.created_at, r.is_approved,
                   r.owner_reply, r.owner_replied_at,
                   b.name as business_name, b.slug as business_slug,
                   b.plan_type
            FROM reviews r
            JOIN businesses b ON b.id = r.business_id
            JOIN user_businesses ub ON ub.business_id = b.id
            WHERE ${where}
            ORDER BY r.created_at DESC
            LIMIT 100
        `, params);
        res.json({ success: true, data: result.rows });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── PUT /client/reviews/:id/reply ── Responder reseña (solo Premium) ─────
router.put('/reviews/:id/reply', async (req, res) => {
    try {
        const { reply } = req.body;
        if (!reply || String(reply).trim().length < 2) {
            return res.status(400).json({ success: false, error: 'La respuesta no puede estar vacía' });
        }
        if (String(reply).length > 600) {
            return res.status(400).json({ success: false, error: 'Respuesta demasiado larga (máx 600 caracteres)' });
        }

        // Verificar ownership + plan Premium
        const check = await pool.query(`
            SELECT r.id, b.plan_type, b.slug
            FROM reviews r
            JOIN businesses b ON b.id = r.business_id
            JOIN user_businesses ub ON ub.business_id = b.id
            WHERE r.id = $1 AND ub.user_id = $2
        `, [req.params.id, req.user.id]);

        if (!check.rows.length) {
            return res.status(403).json({ success: false, error: 'Sin acceso a esta reseña' });
        }
        if (check.rows[0].plan_type !== 'premium') {
            return res.status(403).json({ success: false, error: 'Responder reseñas es exclusivo del plan Premium' });
        }

        await pool.query(
            `UPDATE reviews SET owner_reply=$1, owner_replied_at=NOW() WHERE id=$2`,
            [reply.trim(), req.params.id]
        );

        // Invalidar cache de la ficha pública
        try { await redisClient.del(`dir:biz:${check.rows[0].slug}`); } catch(e) {}

        res.json({ success: true, message: 'Respuesta publicada' });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /client/gallery/:id/click ── Registrar clic en imagen galería ───
// Público — llamado desde el frontend cuando alguien hace click en el link
router.post('/gallery/:id/click', async (req, res) => {
    try {
        const gallery = await pool.query(
            'SELECT id, business_id FROM business_gallery WHERE id=$1',
            [req.params.id]
        );
        if (!gallery.rows.length) return res.status(404).json({ success: false });

        const crypto = require('crypto');
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '';
        const ipHash = crypto.createHash('sha256').update(ip + (process.env.JWT_SECRET||'')).digest('hex').slice(0,32);

        await pool.query(
            'INSERT INTO gallery_clicks (gallery_id, business_id, ip_hash) VALUES ($1,$2,$3)',
            [gallery.rows[0].id, gallery.rows[0].business_id, ipHash]
        );
        res.json({ success: true });
    } catch(err) { res.status(200).json({ success: true }); } // silencioso
});

// ── GET /client/businesses/:slug/gallery-stats ── Stats galería (Premium) ─
router.get('/businesses/:slug/gallery-stats', async (req, res) => {
    try {
        const biz = await pool.query(
            `SELECT b.id, b.plan_type FROM businesses b
             JOIN user_businesses ub ON ub.business_id=b.id
             WHERE b.slug=$1 AND ub.user_id=$2`, [req.params.slug, req.user.id]
        );
        if (!biz.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso' });
        if (biz.rows[0].plan_type !== 'premium') {
            return res.status(403).json({ success: false, error: 'Estadísticas de galería son exclusivas del plan Premium' });
        }

        const stats = await pool.query(`
            SELECT
                bg.id, bg.image_url, bg.link_url, bg.link_label, bg.caption, bg.position,
                COUNT(gc.id)::int                                                     AS clicks_total,
                COUNT(gc.id) FILTER (WHERE gc.clicked_at >= NOW()-INTERVAL '30 days')::int AS clicks_30d,
                COUNT(gc.id) FILTER (WHERE gc.clicked_at >= NOW()-INTERVAL '7 days')::int  AS clicks_7d
            FROM business_gallery bg
            LEFT JOIN gallery_clicks gc ON gc.gallery_id = bg.id
            WHERE bg.business_id = $1
            GROUP BY bg.id
            ORDER BY bg.position
        `, [biz.rows[0].id]);

        res.json({ success: true, data: stats.rows });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /client/businesses/:slug/kit.pdf ── Kit QR imprimible (A5) del negocio ──
router.get('/businesses/:slug/kit.pdf', async (req, res) => {
    try {
        const biz = await pool.query(
            `SELECT b.id, b.name, b.trade_name AS "tradeName", b.kit_cta, b.image_url AS "imageUrl", b.slug, b.city, c.slug AS "categorySlug", c.name AS "categoryName"
             FROM businesses b
             JOIN user_businesses ub ON ub.business_id=b.id
             LEFT JOIN categories c ON c.id=b.category_id
             WHERE b.slug=$1 AND ub.user_id=$2`, [req.params.slug, req.user.id]
        );
        if (!biz.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso' });
        const cfgRows = await pool.query("SELECT key, value FROM site_config WHERE key IN ('site_url','site_name','qr_kit_cta','logo_url')");
        const cfg = {}; cfgRows.rows.forEach(r => { cfg[r.key] = r.value; });
        const pdf = await buildKitPdf(biz.rows[0], cfg);
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', `attachment; filename="kit-retopa-${biz.rows[0].slug}.pdf"`);
        res.send(pdf);
    } catch (err) {
        console.error('[kit.pdf]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/upgrade-lead', async (req, res) => {
    try {
        const { business_id, business_name, contact_name, contact_email, contact_phone, service_type, notes } = req.body;
        if (!contact_name || !contact_email) return res.status(400).json({ success: false, error: 'Nombre y email requeridos' });

        await pool.query(`
            INSERT INTO service_leads (business_id, business_name, service_type, status, contact_name, contact_email, contact_phone, notes)
            VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7)
        `, [business_id || null, business_name || '', service_type || 'premium',
            contact_name, contact_email, contact_phone || null, notes || null]);

        // Email de notificación — fire & forget
        ;(async () => {
            try {
                const cfgRow = await pool.query("SELECT value FROM site_config WHERE key='leads_emails'");
                const rawEmails = cfgRow.rows[0]?.value || '';
                const recipients = rawEmails.split(',').map(e => e.trim()).filter(Boolean);
                const planLabel = service_type === 'premium' ? 'Empresa Pro' : 'Negocio Digital';
                const emailData = {
                    contactName:   contact_name,
                    contactEmail:  contact_email,
                    contactPhone:  contact_phone || '—',
                    businessName:  business_name || '—',
                    businessPhone: contact_phone || '—',
                    serviceType:   service_type || 'premium',
                    businessUrl:   '',
                    notes:         `Solicitud de upgrade a ${planLabel} desde Panel Cliente. ${notes || ''}`.trim(),
                };
                for (const recipient of recipients) {
                    await sendEmail(recipient, 'newLead', emailData)
                        .catch(err => console.error(`[Upgrade lead email → ${recipient}]`, err.message));
                }
            } catch(e) { console.error('[Upgrade lead email]', e.message); }
        })();

        res.json({ success: true, created: true });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Helper D7.3d: resuelve negocio + config + precio + link para el flujo de plan ──
// Devuelve { error, status } si algo falla, o { ctx } con todo lo necesario.
async function loadPlanCtx(req) {
    const { business_id, business_slug, plan, contact_name, contact_email, contact_phone } = req.body;
    if (!['featured', 'premium'].includes(plan))
        return { status: 400, error: 'plan inválido' };

    const q = business_id
        ? await pool.query(`SELECT b.id,b.name,b.trade_name,b.slug,b.plan_type FROM businesses b JOIN user_businesses ub ON ub.business_id=b.id WHERE b.id=$1 AND ub.user_id=$2`, [business_id, req.user.id])
        : await pool.query(`SELECT b.id,b.name,b.trade_name,b.slug,b.plan_type FROM businesses b JOIN user_businesses ub ON ub.business_id=b.id WHERE b.slug=$1 AND ub.user_id=$2`, [business_slug, req.user.id]);
    const biz = q.rows[0];
    if (!biz) return { status: 403, error: 'Sin acceso a esa empresa' };

    const cfgRes = await pool.query(`SELECT key,value FROM site_config WHERE key IN ('tpago_link_featured','tpago_link_premium','leads_emails','site_name','site_url')`);
    const cfg = {}; cfgRes.rows.forEach(r => { cfg[r.key] = r.value; });
    const priceRow = await pool.query(`SELECT price, name FROM plans WHERE id=$1`, [plan]);

    return { ctx: {
        biz,
        bizName:     biz.trade_name || biz.name || biz.slug,
        plan,
        siteName:    cfg.site_name || 'RetoPA',
        siteUrl:     (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, ''),
        amount:      parseInt(priceRow.rows[0]?.price) || 0,
        planLabel:   priceRow.rows[0]?.name || (plan === 'premium' ? 'Empresa Pro' : 'Negocio Digital'),
        link:        (cfg[`tpago_link_${plan}`] || '').trim(),
        clientEmail: (contact_email || req.user.email || '').trim(),
        ownerName:   (contact_name || req.user.name || '').trim(),
        contactPhone: contact_phone || null,
        recipients:  (cfg.leads_emails || '').split(',').map(e => e.trim()).filter(Boolean),
    }};
}

// ── POST /client/plan-request ── D7.3d INTENCIÓN (Lead) ──
// "Quiero este plan": registra un LEAD (intención, sin pago declarado) y devuelve
// el link/monto para mostrar el paso de Tpago. NO crea la Solicitud todavía.
// Si el link de Tpago está vacío → cae al flujo de lead tradicional (mode:'lead').
router.post('/plan-request', async (req, res) => {
    try {
        const r = await loadPlanCtx(req);
        if (r.error) return res.status(r.status).json({ success: false, error: r.error });
        const c = r.ctx;

        // Idempotencia: si ya hay una Solicitud pendiente, no arrancar otra
        const pend = await pool.query(`SELECT id FROM plan_requests WHERE business_id=$1 AND status='pending'`, [c.biz.id]);
        if (pend.rows.length)
            return res.status(409).json({ success: false, error: 'Ya tenés una solicitud de plan pendiente. Esperá la confirmación antes de pedir otra.' });

        const mailer = require('../config/mail');

        // FALLBACK: sin link de Tpago → lead tradicional + aviso interno
        if (!c.link) {
            await upsertPlanLead(c, 'Solicitud de plan sin Tpago configurado — atender como lead');
            for (const to of c.recipients) {
                mailer.sendRawEmail(to, `📈 Solicitud de plan ${c.planLabel} — ${c.bizName}`,
                    `<p><strong>${c.bizName}</strong> pidió el plan <strong>${c.planLabel}</strong>.</p>
                     <p>Contacto: ${c.ownerName || '—'} · ${c.clientEmail || '—'} · ${c.contactPhone || '—'}</p>
                     <p>(Sin link de Tpago configurado — atender como lead.)</p>`).catch(() => {});
            }
            return res.json({ success: true, mode: 'lead' });
        }

        // INTENCIÓN: guardar/actualizar el LEAD (sin crear Solicitud ni mandar recibo)
        await upsertPlanLead(c, `Intención de plan ${c.planLabel} (aún no declaró pago) desde Portal`);

        res.json({ success: true, mode: 'tpago', data: {
            plan: c.plan, plan_label: c.planLabel, amount_gs: c.amount, tpago_link: c.link,
            business_slug: c.biz.slug,
        }});
    } catch (err) { console.error('[plan-request intent]', err.message); res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /client/plan-request/paid ── D7.3d "Listo, ya pagué" ──
// Recién acá se crea la Solicitud pendiente (pago declarado) + recibo al cliente
// + aviso interno, y el Lead de intención pasa a 'contacted'.
router.post('/plan-request/paid', async (req, res) => {
    try {
        const r = await loadPlanCtx(req);
        if (r.error) return res.status(r.status).json({ success: false, error: r.error });
        const c = r.ctx;
        if (!c.link) return res.status(400).json({ success: false, error: 'Este plan no tiene pago online configurado.' });

        // Idempotencia: una sola Solicitud pendiente por negocio
        const pend = await pool.query(`SELECT id FROM plan_requests WHERE business_id=$1 AND status='pending'`, [c.biz.id]);
        if (pend.rows.length)
            return res.status(409).json({ success: false, error: 'Ya tenés una solicitud de plan pendiente. Esperá la confirmación.' });

        const mailer = require('../config/mail');
        const reference = 'RetoPAPlan' + c.plan.charAt(0).toUpperCase() + c.plan.slice(1);
        const ins = await pool.query(
            `INSERT INTO plan_requests (business_id, user_id, plan, amount_gs, status, tpago_link, reference_id, notes)
             VALUES ($1,$2,$3,$4,'pending',$5,$6,$7) RETURNING id`,
            [c.biz.id, req.user.id, c.plan, c.amount, c.link, reference, `Contacto: ${c.ownerName} ${c.contactPhone || ''}`.trim()]);
        const requestId = ins.rows[0].id;

        // El Lead de intención pasa a 'contacted' (ya declaró pago → es Solicitud)
        await pool.query(
            `UPDATE service_leads SET status='contacted', updated_at=NOW()
             WHERE business_id=$1 AND status='pending' AND service_type IN ('featured','premium')`,
            [c.biz.id]).catch(() => {});

        // Recibo al cliente (plantilla editable planRequested)
        if (c.clientEmail) {
            sendEmail(c.clientEmail, 'planRequested', {
                name: c.ownerName, businessName: c.bizName, planLabel: c.planLabel,
                amount: c.amount.toLocaleString('es-PY'),
                tpagoLink: c.link, siteName: c.siteName, siteUrl: c.siteUrl, panelUrl: `${c.siteUrl}/cliente`,
            }).catch(() => {});
        }
        // Aviso interno a leads_emails
        for (const to of c.recipients) {
            mailer.sendRawEmail(to, `💳 Pago declarado — plan ${c.planLabel} — ${c.bizName}`,
                `<p><strong>${c.bizName}</strong> declaró haber pagado el plan <strong>${c.planLabel}</strong> por <strong>Gs. ${c.amount.toLocaleString('es-PY')}</strong>.</p>
                 <p>Contacto: ${c.ownerName || '—'} · ${c.clientEmail || '—'} · ${c.contactPhone || '—'}</p>
                 <p>Confirmá el pago en el Panel Admin → Solicitudes de plan.</p>
                 <p><a href="${c.siteUrl}/admin" style="background:#1B3A6B;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Ir al Panel Admin →</a></p>`).catch(() => {});
        }

        res.json({ success: true, mode: 'tpago', data: { request_id: requestId, plan: c.plan, plan_label: c.planLabel, amount_gs: c.amount, tpago_link: c.link } });
    } catch (err) { console.error('[plan-request paid]', err.message); res.status(500).json({ success: false, error: err.message }); }
});

// Crea o refresca el Lead de intención de plan (evita duplicar si ya hay uno pendiente)
async function upsertPlanLead(c, note) {
    const existing = await pool.query(
        `SELECT id FROM service_leads WHERE business_id=$1 AND status='pending' AND service_type IN ('featured','premium') ORDER BY created_at DESC LIMIT 1`,
        [c.biz.id]);
    if (existing.rows.length) {
        await pool.query(
            `UPDATE service_leads SET service_type=$2, contact_name=$3, contact_email=$4, contact_phone=$5, notes=$6, updated_at=NOW() WHERE id=$1`,
            [existing.rows[0].id, c.plan, c.ownerName, c.clientEmail, c.contactPhone, note]).catch(() => {});
    } else {
        await pool.query(
            `INSERT INTO service_leads (business_id, business_name, service_type, status, contact_name, contact_email, contact_phone, notes)
             VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)`,
            [c.biz.id, c.bizName, c.plan, c.ownerName, c.clientEmail, c.contactPhone, note]).catch(() => {});
    }
}

// ── GET /client/me ── Perfil del usuario actual ───────────────────────────
router.get('/me', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, phone, city, role, is_active, mfa_enabled, created_at FROM users WHERE id=$1',
            [req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        res.json({ success: true, data: result.rows[0] });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── PUT /client/me ── Actualizar perfil ──────────────────────────────────
router.put('/me', async (req, res) => {
    try {
        const { name, phone, city, password, currentPassword } = req.body;
        const user = await pool.query('SELECT id, password_hash FROM users WHERE id=$1', [req.user.id]);
        if (!user.rows.length) return res.status(404).json({ success: false });

        let updates = [], params = [], idx = 1;
        if (name)  { updates.push(`name=$${idx++}`);  params.push(name); }
        if (phone) { updates.push(`phone=$${idx++}`); params.push(phone); }
        if (city !== undefined) { updates.push(`city=$${idx++}`); params.push(city || null); }
        if (password) {
            if (!currentPassword) return res.status(400).json({ success: false, error: 'Ingresá tu contraseña actual' });
            const valid = await bcrypt.compare(currentPassword, user.rows[0].password_hash);
            if (!valid) return res.status(400).json({ success: false, error: 'Contraseña actual incorrecta' });
            const hash = await bcrypt.hash(password, 10);
            updates.push(`password_hash=$${idx++}`);
            params.push(hash);
        }
        if (!updates.length) return res.status(400).json({ success: false, error: 'Nada que actualizar' });
        updates.push(`updated_at=NOW()`);
        params.push(req.user.id);
        await pool.query(`UPDATE users SET ${updates.join(',')} WHERE id=$${idx}`, params);
        res.json({ success: true, message: 'Perfil actualizado' });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /client/mfa/send ── Enviar OTP al email del usuario ─────────────
router.post('/mfa/send', async (req, res) => {
    try {
        const user = await pool.query('SELECT id, email, name FROM users WHERE id=$1', [req.user.id]);
        if (!user.rows.length) return res.status(404).json({ success: false });
        const { email, name } = user.rows[0];
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const expires = new Date(Date.now() + 10 * 60 * 1000);
        await pool.query('UPDATE users SET mfa_otp=$1, mfa_otp_expires=$2 WHERE id=$3', [otp, expires, req.user.id]);
        await sendEmail(email, 'mfaCode', { name, otp }).catch(e => console.error('[MFA send]', e.message));
        res.json({ success: true, message: `Código enviado a ${email}` });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /client/mfa/verify ── Verificar OTP ──────────────────────────────
router.post('/mfa/verify', async (req, res) => {
    try {
        const { otp } = req.body;
        const user = await pool.query('SELECT mfa_otp, mfa_otp_expires FROM users WHERE id=$1', [req.user.id]);
        if (!user.rows.length) return res.status(404).json({ success: false });
        const { mfa_otp, mfa_otp_expires } = user.rows[0];
        if (!mfa_otp || !otp || String(mfa_otp) !== String(otp).trim())
            return res.status(400).json({ success: false, error: 'Código incorrecto' });
        if (new Date() > new Date(mfa_otp_expires))
            return res.status(400).json({ success: false, error: 'El código expiró. Solicitá uno nuevo.' });
        await pool.query('UPDATE users SET mfa_otp=NULL, mfa_otp_expires=NULL WHERE id=$1', [req.user.id]);
        res.json({ success: true, message: 'Código verificado' });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── PUT /client/mfa/toggle ── Activar/desactivar 2FA ─────────────────────
router.put('/mfa/toggle', async (req, res) => {
    try {
        const { enabled, otp } = req.body;
        if (enabled) {
            const user = await pool.query('SELECT mfa_otp, mfa_otp_expires FROM users WHERE id=$1', [req.user.id]);
            const { mfa_otp, mfa_otp_expires } = user.rows[0] || {};
            if (!mfa_otp || !otp || String(mfa_otp) !== String(otp).trim())
                return res.status(400).json({ success: false, error: 'Verificá tu código antes de activar el 2FA' });
            if (new Date() > new Date(mfa_otp_expires))
                return res.status(400).json({ success: false, error: 'El código expiró. Solicitá uno nuevo.' });
        }
        await pool.query(
            'UPDATE users SET mfa_enabled=$1, mfa_otp=NULL, mfa_otp_expires=NULL WHERE id=$2',
            [!!enabled, req.user.id]
        );
        res.json({ success: true, message: enabled ? '2FA activado' : '2FA desactivado' });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /client/businesses/:slug/gallery ── Ver galería ──────────────────
router.get('/businesses/:slug/gallery', async (req, res) => {
    try {
        const biz = await pool.query(
            `SELECT b.id, b.plan_type FROM businesses b
             JOIN user_businesses ub ON ub.business_id=b.id
             WHERE b.slug=$1 AND ub.user_id=$2`, [req.params.slug, req.user.id]
        );
        if (!biz.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso' });

        const gallery = await pool.query(
            `SELECT id, image_url, link_url, link_label, caption, position,
                    description, price, price_label, is_available
             FROM business_gallery WHERE business_id=$1 ORDER BY position`,
            [biz.rows[0].id]
        );
        const limits    = await getPlanLimits(biz.rows[0].plan_type);
        const maxPhotos = limits.max_gallery;
        res.json({ success: true, data: gallery.rows, maxPhotos, planType: biz.rows[0].plan_type });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /client/businesses/:slug/gallery ── Agregar imagen ──────────────
router.post('/businesses/:slug/gallery', async (req, res) => {
    try {
        const biz = await pool.query(
            `SELECT b.id, b.plan_type FROM businesses b
             JOIN user_businesses ub ON ub.business_id=b.id
             WHERE b.slug=$1 AND ub.user_id=$2 AND ub.can_edit=TRUE`, [req.params.slug, req.user.id]
        );
        if (!biz.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso' });

        const planLimits = await getPlanLimits(biz.rows[0].plan_type);
        const maxPhotos  = planLimits.max_gallery;
        if (!planLimits.has_gallery || maxPhotos === 0) return res.status(403).json({ success: false, error: 'Tu plan no incluye galería' });

        const currentCount = await pool.query('SELECT COUNT(*) FROM business_gallery WHERE business_id=$1', [biz.rows[0].id]);
        if (parseInt(currentCount.rows[0].count) >= maxPhotos)
            return res.status(400).json({ success: false, error: `Límite de ${maxPhotos} imágenes para tu plan` });

        const { image_url, link_url, link_label, caption, position,
                description, price, price_label, is_available } = req.body;
        if (!image_url) return res.status(400).json({ success: false, error: 'image_url requerido' });

        const result = await pool.query(
            `INSERT INTO business_gallery
             (business_id, image_url, link_url, link_label, caption, position,
              description, price, price_label, is_available)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [biz.rows[0].id, image_url, link_url||null, link_label||null,
             caption||null, position||0,
             description||null, price||null, price_label||null,
             is_available !== false]
        );
        // Invalidar cache de la ficha pública
        try { await redisClient.del(`dir:biz:${req.params.slug}`); } catch(e) {}
        res.json({ success: true, data: result.rows[0] });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── PUT /client/gallery/:id ── Actualizar imagen ──────────────────────────
router.put('/gallery/:id', async (req, res) => {
    try {
        const check = await pool.query(
            `SELECT g.id, b.slug FROM business_gallery g
             JOIN businesses b ON b.id=g.business_id
             JOIN user_businesses ub ON ub.business_id=b.id
             WHERE g.id=$1 AND ub.user_id=$2`, [req.params.id, req.user.id]
        );
        if (!check.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso' });

        const { link_url, link_label, caption, position,
                description, price, price_label, is_available } = req.body;
        await pool.query(
            `UPDATE business_gallery SET
             link_url=$1, link_label=$2, caption=$3, position=$4,
             description=$5, price=$6, price_label=$7, is_available=$8,
             updated_at=NOW() WHERE id=$9`,
            [link_url||null, link_label||null, caption||null, position||0,
             description||null, price||null, price_label||null,
             is_available !== false, req.params.id]
        );
        // Invalidar cache de la ficha
        const slug = check.rows[0].slug;
        try { await redisClient.del(`dir:biz:${slug}`); } catch(e) {}
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE /client/gallery/:id ── Eliminar imagen ────────────────────────
router.delete('/gallery/:id', async (req, res) => {
    try {
        const check = await pool.query(
            `SELECT g.id, b.slug FROM business_gallery g
             JOIN businesses b ON b.id=g.business_id
             JOIN user_businesses ub ON ub.business_id=b.id
             WHERE g.id=$1 AND ub.user_id=$2`, [req.params.id, req.user.id]
        );
        if (!check.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso' });
        await pool.query('DELETE FROM business_gallery WHERE id=$1', [req.params.id]);
        // Invalidar cache
        const slug = check.rows[0].slug;
        try { await redisClient.del(`dir:biz:${slug}`); } catch(e) {}
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /client/businesses ── Mis empresas ───────────────────────────────
router.get('/businesses', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.id, b.slug, b.name, b.trade_name, b.kit_cta, b.city, b.plan_type, b.verified, b.is_active,
                   b.image_url, b.cover_url, b.phone, b.whatsapp, b.email, b.website,
                   b.rating, b.review_count, COALESCE(b.like_count,0) as like_count,
                   b.description, b.address, b.tags, b.hours,
                   b.hours_json as "hoursJson", b.lat, b.lng,
                   fn_quality_score(b.*) AS "qualityScore",
                   fn_profile_completion(b.*) AS completion,
                   (b.boost_until > NOW()) AS boosted, b.boost_until,
                   b.social_instagram, b.social_facebook, b.social_tiktok,
                   b.social_linkedin, b.social_twitter, b.social_youtube,
                   b.category_id,
                   c.name as category_name, c.slug as category_slug, c.icon as category_icon,
                   ub.is_owner, ub.can_edit,
                   -- Límites del plan — para que el frontend no tenga valores hardcodeados
                   COALESCE(p.max_categories, 1)     AS max_categories,
                   COALESCE(p.max_gallery,    0)     AS max_gallery,
                   COALESCE(p.max_social,     0)     AS max_social,
                   COALESCE(p.max_tags,       5)     AS max_tags,
                   COALESCE(p.has_gallery,    false) AS has_gallery,
                   COALESCE(p.has_social,     false) AS has_social,
                   COALESCE(p.has_hours,      false) AS has_hours,
                   COALESCE(p.has_reviews_reply, false) AS has_reviews_reply,
                   -- Categorías múltiples (IDs)
                   COALESCE((
                       SELECT json_agg(json_build_object('id', bc2.category_id, 'name', cat2.name, 'icon', cat2.icon, 'color', cat2.color))
                       FROM business_categories bc2
                       JOIN categories cat2 ON cat2.id = bc2.category_id
                       WHERE bc2.business_id = b.id
                   ), '[]'::json) as categories_data,
                   -- Stats 30 días
                   (SELECT COUNT(*) FROM business_views bv WHERE bv.business_id=b.id AND bv.viewed_at >= NOW()-INTERVAL '30 days') as views_30d,
                   (SELECT COUNT(*) FROM business_clicks bc WHERE bc.business_id=b.id AND bc.clicked_at >= NOW()-INTERVAL '30 days' AND bc.click_type='whatsapp') as whatsapp_30d,
                   -- D7: solicitud de plan pendiente (para el estado "En revisión")
                   (SELECT json_build_object('plan', pr.plan, 'amount_gs', pr.amount_gs, 'tpago_link', pr.tpago_link)
                      FROM plan_requests pr WHERE pr.business_id=b.id AND pr.status='pending'
                      ORDER BY pr.created_at DESC LIMIT 1) as pending_plan_request,
                   -- D7: vencimiento del plan pago vigente (plan_grants reason='paid')
                   (SELECT pg.expires_at FROM plan_grants pg WHERE pg.business_id=b.id AND pg.reason='paid'
                      AND pg.reverted_at IS NULL AND pg.expires_at > NOW()
                      ORDER BY pg.expires_at DESC LIMIT 1) as plan_expires_at
            FROM user_businesses ub
            JOIN businesses b ON b.id = ub.business_id
            LEFT JOIN categories c ON c.id = b.category_id
            LEFT JOIN plans p ON p.id = b.plan_type
            WHERE ub.user_id = $1
            ORDER BY ub.is_owner DESC, b.name
        `, [req.user.id]);
        res.json({ success: true, data: result.rows });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /client/businesses/:slug/stats ── Estadísticas detalladas ────────
router.get('/businesses/:slug/stats', async (req, res) => {
    try {
        // Verificar ownership
        const biz = await pool.query(
            `SELECT b.id FROM businesses b
             JOIN user_businesses ub ON ub.business_id=b.id
             WHERE b.slug=$1 AND ub.user_id=$2`, [req.params.slug, req.user.id]
        );
        if (!biz.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso' });
        const bizId   = biz.rows[0].id;
        const planType = biz.rows[0].plan_type;

        // Período según plan y parámetro solicitado
        const requestedDays = parseInt(req.query.days) || 30;
        // Plan Pro: hasta 90 días · Destacado: hasta 30 días · Básico: sin acceso
        const maxDays = planType === 'premium' ? 90 : planType === 'featured' ? 30 : 7;
        const days    = Math.min(requestedDays, maxDays);

        // Vistas por día — período parametrizado
        const views = await pool.query(`
            SELECT TO_CHAR(DATE(viewed_at), 'YYYY-MM-DD') as day, COUNT(*) as count
            FROM business_views
            WHERE business_id=$1 AND viewed_at >= NOW()-INTERVAL '${days} days'
            GROUP BY DATE(viewed_at) ORDER BY day
        `, [bizId]);

        // Totales
        const totals = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE viewed_at >= NOW()-INTERVAL '7 days')  as views_7d,
                COUNT(*) FILTER (WHERE viewed_at >= NOW()-INTERVAL '30 days') as views_30d,
                COUNT(*) FILTER (WHERE viewed_at >= NOW()-INTERVAL '90 days') as views_90d,
                COUNT(*) as views_total
            FROM business_views WHERE business_id=$1
        `, [bizId]);

        // Clics — período seleccionado (para el gráfico futuro)
        const clicks = await pool.query(`
            SELECT click_type, COUNT(*) as count
            FROM business_clicks
            WHERE business_id=$1 AND clicked_at >= NOW()-INTERVAL '${days} days'
            GROUP BY click_type
        `, [bizId]);

        // Clics totales históricos (para cards)
        const clicksTotal = await pool.query(`
            SELECT click_type, COUNT(*) as count
            FROM business_clicks
            WHERE business_id=$1
            GROUP BY click_type
        `, [bizId]);

        // Breakdown de reseñas por estrella
        const ratingBreakdown = await pool.query(`
            SELECT rating::int, COUNT(*) as count
            FROM reviews
            WHERE business_id=$1 AND is_approved=TRUE
            GROUP BY rating ORDER BY rating DESC
        `, [bizId]);

        res.json({
            success: true,
            data: {
                views_chart:      views.rows,
                totals:           totals.rows[0],
                clicks:           clicks.rows,
                clicks_total:     clicksTotal.rows,
                rating_breakdown: ratingBreakdown.rows,
                days,
                max_days: maxDays,
            }
        });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── PUT /client/businesses/:slug ── Editar mi empresa ────────────────────
router.put('/businesses/:slug', async (req, res) => {
    const conn = await pool.connect();
    try {
        const { slug } = req.params;
        // Verificar que el usuario es dueño o puede editar
        const check = await conn.query(`
            SELECT b.id, b.plan_type FROM businesses b
            JOIN user_businesses ub ON ub.business_id=b.id
            WHERE b.slug=$1 AND ub.user_id=$2 AND ub.can_edit=TRUE
        `, [slug, req.user.id]);
        if (!check.rows.length) return res.status(403).json({ success: false, error: 'Sin permiso para editar esta empresa' });

        const bizId = check.rows[0].id;
        const planType = check.rows[0].plan_type || 'basic';

        const { name, trade_name, description, kit_cta, phone: rawPhone, whatsapp: rawWhatsapp, email, website, address, city, hours, hours_json, tags, lat, lng, category_ids,
                social_instagram, social_facebook, social_tiktok, social_linkedin, social_twitter, social_youtube } = req.body;

        // Normalizar teléfonos al guardar
        const phone    = normalizePhone(rawPhone);
        const whatsapp = normalizePhone(rawWhatsapp) || phone;

        // Validar set de categorías si vino
        let catIds = null;
        if (Array.isArray(category_ids)) {
            catIds = Array.from(new Set(category_ids.map(n => parseInt(n)).filter(Number.isFinite)));
            const limits = await getPlanLimits(planType);
            if (catIds.length > limits.max_categories) {
                return res.status(400).json({
                    success: false,
                    error: `Tu plan permite hasta ${limits.max_categories} categoría(s); enviaste ${catIds.length}`,
                    code: 'CATEGORY_LIMIT_EXCEEDED'
                });
            }
        }

        // Validar redes sociales por plan
        // basic: solo WhatsApp (ya existe, no se toca aquí)
        // featured: hasta 2 redes adicionales
        // premium: todas
        const planLimitsEdit = await getPlanLimits(planType);
        const socialFields = { social_instagram, social_facebook, social_tiktok, social_linkedin, social_twitter, social_youtube };
        const socialProvided = Object.entries(socialFields).filter(([, v]) => v !== undefined && v !== null && v !== '');
        if (!planLimitsEdit.has_social && socialProvided.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Tu plan no incluye redes sociales. Actualizá tu plan para agregar redes.',
                code: 'SOCIAL_PLAN_LIMIT'
            });
        }
        if (planLimitsEdit.has_social && planLimitsEdit.max_social > 0 && socialProvided.length > planLimitsEdit.max_social) {
            return res.status(400).json({
                success: false,
                error: `Tu plan permite hasta ${planLimitsEdit.max_social} redes sociales.`,
                code: 'SOCIAL_PLAN_LIMIT'
            });
        }

        const updates = []; const params = []; let idx = 1;
        if (trade_name !== undefined) { updates.push(`trade_name=$${idx++}`); params.push(trade_name); }
        if (name !== undefined)        { updates.push(`name=$${idx++}`);        params.push(name); }
        if (description !== undefined) { updates.push(`description=$${idx++}`); params.push(description); }
        if (kit_cta !== undefined)     { updates.push(`kit_cta=$${idx++}`);     params.push(kit_cta ? String(kit_cta).slice(0,160) : null); }
        if (phone !== undefined)       { updates.push(`phone=$${idx++}`);       params.push(phone); }
        if (whatsapp !== undefined)    { updates.push(`whatsapp=$${idx++}`);    params.push(whatsapp); }
        if (email !== undefined)       { updates.push(`email=$${idx++}`);       params.push(email); }
        if (website !== undefined)     { updates.push(`website=$${idx++}`);     params.push(website); }
        if (address !== undefined)     { updates.push(`address=$${idx++}`);     params.push(address); }
        if (city !== undefined)        { updates.push(`city=$${idx++}`);        params.push(city); }
        if (hours !== undefined)       { updates.push(`hours=$${idx++}`);       params.push(hours); }
        if (hours_json !== undefined && hours_json !== null) {
            updates.push(`hours_json=$${idx++}`);
            params.push(JSON.stringify(hours_json));
        }
        if (tags !== undefined)        { updates.push(`tags=$${idx++}`);        params.push(tags); }
        if (lat !== undefined && lat !== null && lat !== '') { updates.push(`lat=$${idx++}`); params.push(parseFloat(lat)); }
        if (lng !== undefined && lng !== null && lng !== '') { updates.push(`lng=$${idx++}`); params.push(parseFloat(lng)); }
        if (catIds !== null)           { updates.push(`category_id=$${idx++}`); params.push(catIds.length ? catIds[0] : null); }
        // Redes sociales (solo si se enviaron, para no pisar con null accidentalmente)
        if (social_instagram !== undefined) { updates.push(`social_instagram=$${idx++}`); params.push(social_instagram || null); }
        if (social_facebook  !== undefined) { updates.push(`social_facebook=$${idx++}`);  params.push(social_facebook  || null); }
        if (social_tiktok    !== undefined) { updates.push(`social_tiktok=$${idx++}`);    params.push(social_tiktok    || null); }
        if (social_linkedin  !== undefined) { updates.push(`social_linkedin=$${idx++}`);  params.push(social_linkedin  || null); }
        if (social_twitter   !== undefined) { updates.push(`social_twitter=$${idx++}`);   params.push(social_twitter   || null); }
        if (social_youtube   !== undefined) { updates.push(`social_youtube=$${idx++}`);   params.push(social_youtube   || null); }

        if (!updates.length && catIds === null) return res.status(400).json({ success: false, error: 'Nada que actualizar' });

        await conn.query('BEGIN');

        let returnedSlug = slug;
        if (updates.length) {
            updates.push(`updated_at=NOW()`);
            params.push(bizId);
            const result = await conn.query(
                `UPDATE businesses SET ${updates.join(',')} WHERE id=$${idx} RETURNING slug`,
                params
            );
            returnedSlug = result.rows[0].slug;
        }

        if (catIds !== null) {
            await conn.query('DELETE FROM business_categories WHERE business_id=$1', [bizId]);
            for (let i = 0; i < catIds.length; i++) {
                await conn.query(
                    `INSERT INTO business_categories (business_id, category_id, is_primary, position)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (business_id, category_id) DO NOTHING`,
                    [bizId, catIds[i], i === 0, i]
                );
            }
        }

        await conn.query('COMMIT');

        // S30 (gamificación soft) — empujón de visibilidad al alcanzar ficha completa.
        // Se otorga una sola vez por ventana (7 días) cuando la ficha queda al 100%.
        // Envuelto en try: si aún no existe la columna boost_until, no rompe el guardado.
        let boostGranted = false;
        try {
            const boostRes = await conn.query(
                `UPDATE businesses
                    SET boost_until = NOW() + INTERVAL '7 days'
                  WHERE id = $1
                    AND (boost_until IS NULL OR boost_until < NOW())
                    AND (SELECT (fn_profile_completion(b.*)->>'completion')::int
                           FROM businesses b WHERE b.id = $1) = 100
                  RETURNING boost_until`,
                [bizId]
            );
            boostGranted = boostRes.rows.length > 0;
        } catch (e) { /* columna boost_until ausente aún → ignorar */ }

        // Invalidar cache — ficha individual + listados que pueden contenerla
        try { await redisClient.del(`dir:biz:${slug}`); } catch(e) {}
        try { await redisClient.del(`dir:biz:${returnedSlug}`); } catch(e) {}
        try { await redisClient.keys('dir:biz:*').then(keys => keys.length && redisClient.del(keys)); } catch(e) {}
        try { await redisClient.del('dir:categories:all'); } catch(e) {}
        try { await redisClient.del('dir:popular'); } catch(e) {}

        res.json({ success: true, slug: returnedSlug, boost_granted: boostGranted });
    } catch(err) {
        try { await conn.query('ROLLBACK'); } catch(_) {}
        res.status(500).json({ success: false, error: err.message });
    } finally {
        conn.release();
    }
});

module.exports = router;
