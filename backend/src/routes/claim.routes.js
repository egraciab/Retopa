/**
 * RetoPA — routes/claim.routes.js
 * S3.2 — Workflow de claim de empresa desde email
 * Montado en /api/v2/claim
 */

const express  = require('express');
const router   = express.Router();
const { Pool } = require('pg');
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { sendEmail } = require('../config/mail');
const rateLimit = require('express-rate-limit');
const { logClaimEvent, CLIENT_EVENTS } = require('../utils/claimEvents');
const { mobilePY, mobileLocal, loadRubros, suggestRubro } = require('../helpers/claimFlow');
const { normalizePhone } = require('../utils/phone');
const redisClient = require('../config/redis');

const JWT_SECRET = require('../config/jwt');

// ── Auth admin para acciones sensibles de claim (aprobar/rechazar/token) ──────
// SEGURIDAD: estos endpoints estaban SIN autenticación (cualquiera podía aprobar
// un claim o generar un claim_token para cualquier ficha → apropiarse de negocios
// ajenos). Ahora exigen un JWT válido con rol admin/godmode. Fail-closed: si no
// hay token o es inválido, 401/403. (El panel usa /api/v2/admin/claims/*, que ya
// estaba protegido; estos quedan como respaldo, ahora seguro.)
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

const pool = new Pool({
    host:     process.env.DB_HOST     || 'postgres',
    port:     process.env.DB_PORT     || 5432,
    database: process.env.DB_NAME     || process.env.POSTGRES_DB,
    user:     process.env.DB_USER     || process.env.POSTGRES_USER,
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
});

function generateToken() {
    return crypto.randomBytes(32).toString('hex'); // 64 chars hex
}

// ── GET /claim/info?token=XYZ ── Info de la empresa para la página de claim ──
router.get('/info', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, error: 'Token requerido' });
    // Embudo: origen del link (utm_source) + id de visita (lo manda /reclamar).
    const evBase = { canal: 'token', source: req.query.src, visit: req.query.v };

    try {
        const result = await pool.query(`
            SELECT b.id, b.name, b.trade_name, b.slug, b.email, b.phone, b.whatsapp,
                   b.city, b.department, b.description, b.image_url, b.logo_emoji,
                   b.claim_status, b.claim_expires_at, b.verified, b.category_id,
                   c.name AS category_name,
                   EXISTS (SELECT 1 FROM user_businesses ub
                            WHERE ub.business_id = b.id AND ub.is_owner) AS has_owner
            FROM businesses b
            LEFT JOIN categories c ON c.id = b.category_id
            WHERE b.claim_token = $1 AND b.is_active = TRUE
        `, [token]);

        if (!result.rows.length) {
            logClaimEvent(pool, { ...evBase, event: 'link_invalid' });
            return res.status(404).json({ success: false, error: 'Token inválido o expirado' });
        }

        const biz = result.rows[0];

        // Verificar expiración
        if (biz.claim_expires_at && new Date() > new Date(biz.claim_expires_at)) {
            logClaimEvent(pool, { ...evBase, event: 'link_expired', businessId: biz.id });
            return res.status(410).json({ success: false, error: 'Este link expiró. Solicitá uno nuevo.' });
        }

        // Si ya fue aprobado (o ya tiene dueño)
        if (biz.claim_status === 'approved' || biz.has_owner) {
            logClaimEvent(pool, { ...evBase, event: 'link_claimed', businessId: biz.id });
            return res.status(409).json({ success: false, code: 'ALREADY_CLAIMED',
                error: 'Esta empresa ya tiene dueño en RetoPA. Si es tuya, entrá a tu panel.' });
        }

        logClaimEvent(pool, { ...evBase, event: 'link_opened', businessId: biz.id });

        // E1 — rubros (hojas) + sugerencia CON FUENTE (o ninguna) + WhatsApp precargado
        let rubros = [], suggestion = null;
        try {
            rubros = await loadRubros(pool);
            const cur = await pool.query(
                `SELECT category_id FROM business_categories WHERE business_id=$1
                  ORDER BY is_primary DESC, position ASC`, [biz.id]);
            const currentIds = cur.rows.map(r => r.category_id);
            if (biz.category_id && !currentIds.includes(biz.category_id)) currentIds.push(biz.category_id);
            suggestion = suggestRubro(biz, rubros, currentIds);
        } catch (e) { console.warn('[Claim] rubros:', e.message); }
        const waPrefill = mobilePY(biz.whatsapp) || mobilePY(biz.phone);

        res.json({ success: true, data: {
            id:           biz.id,
            name:         biz.trade_name || biz.name,
            legalName:    biz.name,
            slug:         biz.slug,
            email:        biz.email,
            phone:        biz.phone,
            city:         biz.city,
            department:   biz.department,
            description:  biz.description,
            imageUrl:     biz.image_url,
            logoEmoji:    biz.logo_emoji,
            categoryName: biz.category_name,
            claimStatus:  biz.claim_status,
            whatsappPrefill: waPrefill ? mobileLocal(waPrefill) : '',
            rubros:       rubros.map(r => ({ id: r.id, name: r.name, grupo: r.grupo || null })),
            suggestion,
        }});
    } catch (err) {
        console.error('[Claim] info error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /claim/event ── Pasos del embudo que solo ve el navegador ───────────
// (formulario iniciado / frenado por validación). Público pero acotado:
//  - solo eventos de la lista CLIENT_EVENTS y razones de la lista blanca;
//  - exige un token de reclamo EXISTENTE (no se puede ensuciar fichas ajenas);
//  - rate limit por IP; responde 204 siempre (no filtra si el token existe).
const eventLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
router.post('/event', eventLimiter, async (req, res) => {
    try {
        const { token, event, reason, src, v } = req.body || {};
        if (token && CLIENT_EVENTS.has(event)) {
            const r = await pool.query(
                'SELECT id FROM businesses WHERE claim_token = $1 AND is_active = TRUE', [String(token)]);
            if (r.rows.length)
                await logClaimEvent(pool, { event, reason, canal: 'token', source: src, visit: v, businessId: r.rows[0].id });
        }
    } catch (e) { /* nunca romper por instrumentación */ }
    res.status(204).end();
});

// ════════════════════════════════════════════════════════════════════════════
// E1 (2026-10-13) — Reclamo en una pantalla, sin contraseña.
// El token llegó al canal de la propia ficha (su WhatsApp o su correo): abrirlo
// prueba la posesión. Se aprueba AUTOMÁTICO pero PROVISORIO: queda en Claims
// "a revisar" con su foto previa (claim_snapshots) para Confirmar o Revertir.
// ════════════════════════════════════════════════════════════════════════════
// Límite por ENLACE + IP (no solo por IP: las operadoras móviles comparten IP entre
// miles de clientes y un límite por IP frenaría a dueños legítimos).
const confirmLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => `${String((req.body && req.body.token) || '').slice(0, 64)}|${req.ip}`,
    message: { success: false, error: 'Demasiados intentos. Probá de nuevo en unos minutos.' } });

function signClientSession(u) {
    return jwt.sign(
        { id: u.id, email: u.email || null, role: u.role, is_ambassador: false, loginAt: Math.floor(Date.now() / 1000) },
        JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_PUBLIC || '8h' });
}

async function invalidateBizCache(slug) {
    try { await redisClient.del(`dir:biz:${slug}`); } catch (e) {}
    try { const keys = await redisClient.keys('dir:biz:*'); if (keys && keys.length) await redisClient.del(keys); } catch (e) {}
    try { await redisClient.del('dir:categories:all'); } catch (e) {}
}

// ── POST /claim/confirm ── "Sí, es mío": rubro + WhatsApp + nombre (+ correo opcional)
router.post('/confirm', confirmLimiter, async (req, res) => {
    const b = req.body || {};
    const evBase = { canal: 'token', source: b.src, visit: b.v };
    const fail = (status, reason, error, extra = {}) => {
        logClaimEvent(pool, { ...evBase, event: 'submit_error', reason, businessId: extra.businessId });
        return res.status(status).json({ success: false, code: reason, error });
    };
    const token = String(b.token || '');
    const categoryId = parseInt(b.category_id, 10);
    const wa = mobilePY(b.whatsapp);
    const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const email = String(b.email || '').trim().toLowerCase();

    if (!token) return fail(400, 'token_invalid', 'Falta el enlace de reclamo.');
    if (!Number.isFinite(categoryId)) return fail(400, 'rubro_missing', 'Elegí a qué se dedica tu negocio.');
    if (!wa) return fail(400, 'whatsapp_invalid', 'Revisá tu número de WhatsApp (ej: 0981 123 456).');
    if (name.length < 2) return fail(400, 'name_missing', 'Decinos tu nombre.');
    if (email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return fail(400, 'email_invalid', 'Revisá tu correo, o dejalo vacío.');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const bizRes = await client.query(
            `SELECT * FROM businesses WHERE claim_token = $1 AND is_active = TRUE FOR UPDATE`, [token]);
        if (!bizRes.rows.length) { await client.query('ROLLBACK'); return fail(404, 'token_invalid', 'Este enlace ya no es válido.'); }
        const biz = bizRes.rows[0];
        if (biz.claim_expires_at && new Date() > new Date(biz.claim_expires_at)) {
            await client.query('ROLLBACK'); return fail(410, 'expired', 'Este enlace venció. Pedinos uno nuevo por WhatsApp.', { businessId: biz.id });
        }
        if (biz.claim_status === 'approved') {
            await client.query('ROLLBACK'); return fail(409, 'already_claimed', 'Esta empresa ya tiene dueño en RetoPA.', { businessId: biz.id });
        }
        const owner = await client.query('SELECT 1 FROM user_businesses WHERE business_id=$1 AND is_owner LIMIT 1', [biz.id]);
        if (owner.rows.length) {
            await client.query('ROLLBACK'); return fail(409, 'owner_exists', 'Esta empresa ya tiene dueño en RetoPA.', { businessId: biz.id });
        }
        const rub = await client.query(
            `SELECT c.id, c.name FROM categories c
              WHERE c.id = $1 AND NOT EXISTS (SELECT 1 FROM categories h WHERE h.parent_id = c.id)`, [categoryId]);
        if (!rub.rows.length) { await client.query('ROLLBACK'); return fail(400, 'rubro_missing', 'Elegí un rubro de la lista.', { businessId: biz.id }); }
        if (email) {
            const ex = await client.query('SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1', [email]);
            if (ex.rows.length) {
                await client.query('ROLLBACK');
                return fail(409, 'email_exists', 'Ese correo ya tiene cuenta en RetoPA. Dejalo vacío para seguir, o entrá con tu cuenta.', { businessId: biz.id });
            }
        }

        // 1) Foto previa COMPLETA (el "valor anterior") para poder revertir.
        const prevCats = await client.query(
            'SELECT category_id, is_primary, position FROM business_categories WHERE business_id=$1 ORDER BY position', [biz.id]);
        const snap = await client.query(
            `INSERT INTO claim_snapshots (business_id, snapshot, categories)
             SELECT id, to_jsonb(b) - 'location', $2::jsonb FROM businesses b WHERE b.id = $1 RETURNING id`,
            [biz.id, JSON.stringify(prevCats.rows)]);

        // 2) Cuenta del dueño: sin contraseña (entra por este enlace y, después, por link de acceso).
        const randomHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
        const fichaNums = [mobilePY(biz.whatsapp), mobilePY(biz.phone)].filter(Boolean);
        const phoneVerified = fichaNums.includes(wa); // el número al que le escribimos
        const u = (await client.query(
            `INSERT INTO users (name, email, password_hash, role, is_active, email_verified, phone, phone_verified_at, created_at)
             VALUES ($1, $2, $3, 'client', TRUE, FALSE, $4, $5, NOW())
             RETURNING id, name, email, role`,
            [name, email || null, randomHash, normalizePhone('0' + wa.slice(3)), phoneVerified ? new Date() : null])).rows[0];
        await client.query('UPDATE claim_snapshots SET user_id=$1 WHERE id=$2', [u.id, snap.rows[0].id]);

        // Si dejó correo: token para confirmarlo (7 días). No bloquea nada: el
        // correo es opcional; confirmarlo además le da un acceso a su panel.
        let verifyToken = null;
        if (email) {
            verifyToken = crypto.randomBytes(32).toString('hex');
            await client.query(
                `UPDATE users SET verify_token=$1, verify_token_expires=NOW() + interval '7 days' WHERE id=$2`,
                [verifyToken, u.id]);
        }

        await client.query(
            `INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit)
             VALUES ($1, $2, TRUE, TRUE)
             ON CONFLICT (user_id, business_id) DO UPDATE SET is_owner = TRUE, can_edit = TRUE`, [u.id, biz.id]);

        // 3) Rubro: ficha gratuita = un rubro (la M2M manda; category_id derivado).
        await client.query('DELETE FROM business_categories WHERE business_id=$1', [biz.id]);
        await client.query(
            `INSERT INTO business_categories (business_id, category_id, is_primary, position) VALUES ($1, $2, TRUE, 0)`,
            [biz.id, categoryId]);

        // 4) Reclamo aprobado automático, PROVISORIO (verified queda como estaba hasta la revisión).
        await client.query(
            `UPDATE businesses SET category_id=$2, claim_status='approved', claim_method='token',
                    claim_reviewed_at=NULL, claimed_by=$3, claimed_at=NOW(), updated_at=NOW()
              WHERE id=$1`, [biz.id, categoryId, u.id]);

        await client.query(`
            INSERT INTO service_leads (business_id, business_name, service_type, status,
                contact_name, contact_email, contact_phone, notes, created_at)
            VALUES ($1, $2, 'claim', 'won', $3, $4, $5, $6, NOW())`,
            [biz.id, biz.trade_name || biz.name, name, email || null, '+' + wa,
             JSON.stringify({ source: 'token_auto', rubro: rub.rows[0].name, utm_source: evBase.source || null, phone_verified: phoneVerified })]);

        if (biz.whatsapp) {
            await client.query(
                `INSERT INTO prospect_wa_outreach (whatsapp, estado, created_at, updated_at)
                 VALUES ($1, 'reclamo', NOW(), NOW())
                 ON CONFLICT (whatsapp) DO UPDATE SET estado='reclamo', updated_at=NOW()`, [biz.whatsapp]);
        }

        await client.query('COMMIT');

        logClaimEvent(pool, { ...evBase, event: 'submit_ok', businessId: biz.id, userId: u.id });
        logClaimEvent(pool, { ...evBase, event: 'auto_approved', businessId: biz.id, userId: u.id });
        invalidateBizCache(biz.slug);

        // Avisos (fire & forget): al correo de la FICHA (otro canal) y al equipo.
        (async () => {
            try {
                const cfgRes = await pool.query("SELECT key, value FROM site_config WHERE key IN ('site_name','site_url','leads_emails')");
                const cfg = {}; cfgRes.rows.forEach(r => { cfg[r.key] = r.value; });
                const siteName = cfg.site_name || 'RetoPA';
                const siteUrl = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
                const bizName = biz.trade_name || biz.name;
                // Al que reclamó (si dejó correo): "ya es tuyo" + confirmar correo.
                if (email && verifyToken) {
                    sendEmail(email, 'claimWelcome', { name, businessName: bizName, siteName, siteUrl,
                        verifyUrl: `${siteUrl}/?verify=${verifyToken}`, fichaUrl: `${siteUrl}/negocio/${biz.slug}` }).catch(() => {});
                }
                if (biz.email && String(biz.email).toLowerCase() !== email) {
                    sendEmail(biz.email, 'claimNoticeFicha', { businessName: bizName, claimantName: name, siteName, siteUrl,
                        fichaUrl: `${siteUrl}/negocio/${biz.slug}` }).catch(() => {});
                }
                for (const to of String(cfg.leads_emails || '').split(',').map(x => x.trim()).filter(Boolean)) {
                    sendEmail(to, 'claimAdminAlert', { auto: true, businessName: bizName, userName: name,
                        userEmail: email || '(sin correo)', userPhone: '+' + wa, city: biz.city || null,
                        adminUrl: `${siteUrl}/admin`, siteName, siteUrl }).catch(() => {});
                }
            } catch (e) { console.warn('[Claim] avisos:', e.message); }
        })();

        res.json({
            success: true,
            token: signClientSession(u),
            user: { id: u.id, email: u.email, name: u.name, role: u.role, email_verified: false, has_business: true },
            redirect: '/cliente/',
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        logClaimEvent(pool, { ...evBase, event: 'submit_error', reason: 'server' });
        console.error('[Claim] confirm error:', err);
        res.status(500).json({ success: false, error: 'No pudimos completar el reclamo. Probá de nuevo.' });
    } finally {
        client.release();
    }
});

// ── POST /claim/not-mine ── "No, no es mío": cierra el enlace y avisa a Prospectos
router.post('/not-mine', confirmLimiter, async (req, res) => {
    const b = req.body || {};
    try {
        const r = await pool.query(
            `UPDATE businesses SET claim_token = NULL, updated_at = NOW()
              WHERE claim_token = $1 AND is_active = TRUE AND claim_status IS DISTINCT FROM 'approved'
              RETURNING id, name, trade_name, whatsapp`, [String(b.token || '')]);
        if (r.rows.length) {
            const biz = r.rows[0];
            logClaimEvent(pool, { event: 'not_mine', canal: 'token', source: b.src, visit: b.v, businessId: biz.id });
            if (biz.whatsapp) {
                const nota = `[No es suyo: ${biz.trade_name || biz.name} · ${new Date().toISOString().slice(0, 10)}]`;
                await pool.query(
                    `INSERT INTO prospect_wa_outreach (whatsapp, estado, notas, created_at, updated_at)
                     VALUES ($1, 'no_es', $2, NOW(), NOW())
                     ON CONFLICT (whatsapp) DO UPDATE SET estado='no_es',
                        notas = TRIM(BOTH ' ' FROM COALESCE(prospect_wa_outreach.notas,'') || ' ' || EXCLUDED.notas),
                        updated_at = NOW()`, [biz.whatsapp, nota]).catch(e => console.warn('[Claim] not-mine outreach:', e.message));
            }
        }
    } catch (e) { console.warn('[Claim] not-mine:', e.message); }
    // Siempre lo mismo: no confirma si el enlace existía.
    res.json({ success: true });
});

// ── POST /claim/submit ── Dueño completa el formulario de claim ──────────────
router.post('/submit', async (req, res) => {
    const { token, name, email, password, phone } = req.body;
    const evBase = { canal: 'token', source: req.body.src, visit: req.body.v };
    if (!token || !name || !email || !password) {
        logClaimEvent(pool, { ...evBase, event: 'submit_error', reason: 'missing_fields' });
        return res.status(400).json({ success: false, error: 'Token, nombre, email y contraseña son requeridos' });
    }
    if (!email.includes('@')) {
        logClaimEvent(pool, { ...evBase, event: 'submit_error', reason: 'email_invalid' });
        return res.status(400).json({ success: false, error: 'Email inválido' });
    }
    if (password.length < 8) {
        logClaimEvent(pool, { ...evBase, event: 'submit_error', reason: 'password_short' });
        return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verificar token
        const bizResult = await client.query(`
            SELECT id, name, trade_name, email, slug, claim_status, claim_expires_at, verified
            FROM businesses
            WHERE claim_token = $1 AND is_active = TRUE
            FOR UPDATE
        `, [token]);

        if (!bizResult.rows.length) {
            await client.query('ROLLBACK');
            logClaimEvent(pool, { ...evBase, event: 'submit_error', reason: 'token_invalid' });
            return res.status(404).json({ success: false, error: 'Token inválido' });
        }

        const biz = bizResult.rows[0];

        if (biz.claim_expires_at && new Date() > new Date(biz.claim_expires_at)) {
            await client.query('ROLLBACK');
            logClaimEvent(pool, { ...evBase, event: 'submit_error', reason: 'expired', businessId: biz.id });
            return res.status(410).json({ success: false, error: 'Link expirado. Solicitá uno nuevo.' });
        }

        if (biz.claim_status === 'approved') {
            await client.query('ROLLBACK');
            logClaimEvent(pool, { ...evBase, event: 'submit_error', reason: 'already_claimed', businessId: biz.id });
            return res.status(409).json({ success: false, error: 'Esta empresa ya fue reclamada.' });
        }

        // Verificar si ya existe un usuario con ese email
        const existingUser = await client.query(
            'SELECT id FROM users WHERE email = $1', [email]
        );

        let userId;
        if (existingUser.rows.length > 0) {
            userId = existingUser.rows[0].id;
        } else {
            const hash = await bcrypt.hash(password, 10);
            const newUser = await client.query(`
                INSERT INTO users (name, email, password_hash, role, is_active, created_at)
                VALUES ($1, $2, $3, 'client', TRUE, NOW())
                RETURNING id
            `, [name, email, hash]);
            userId = newUser.rows[0].id;
        }

        // Vincular empresa al usuario
        await client.query(`
            INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit)
            VALUES ($1, $2, TRUE, TRUE)
            ON CONFLICT (user_id, business_id) DO UPDATE SET is_owner = TRUE, can_edit = TRUE
        `, [userId, biz.id]);

        // Marcar empresa como claim_pending
        await client.query(`
            UPDATE businesses SET
                claim_status = 'pending',
                claimed_by   = $1,
                claimed_at   = NOW(),
                updated_at   = NOW()
            WHERE id = $2
        `, [userId, biz.id]);

        // Crear lead automático
        await client.query(`
            INSERT INTO service_leads (business_id, business_name, service_type, status,
                contact_name, contact_email, contact_phone, notes, created_at)
            VALUES ($1, $2, 'claim', 'pending', $3, $4, $5, $6, NOW())
        `, [
            biz.id,
            biz.trade_name || biz.name,
            name,
            biz.email,
            phone || null,
            `Claim automático desde email de notificación. Token usado. Usuario creado: ${userId}`,
        ]);

        await client.query('COMMIT');
        logClaimEvent(pool, { ...evBase, event: 'submit_ok', businessId: biz.id, userId });

        // Obtener config del sitio para los emails
        const cfgRes = await pool.query(
            "SELECT key, value FROM site_config WHERE key IN ('site_name','site_url','leads_emails')"
        ).catch(()=>({ rows: [] }));
        const cfg = {};
        cfgRes.rows.forEach(r => { cfg[r.key] = r.value; });
        const siteName   = cfg.site_name   || 'RetoPA';
        const siteUrl    = (cfg.site_url   || 'https://retopa.com.py').replace(/\/$/, '');
        const rawEmails  = cfg.leads_emails || '';
        const recipients = rawEmails.split(',').map(e => e.trim()).filter(Boolean);

        // 1. Email al dueño: confirmación de recepción
        sendEmail(email, 'claimReceived', {
            name:         name,
            businessName: biz.trade_name || biz.name,
            email,
            siteName,
            siteUrl,
        }).catch(e => console.warn('[Claim] email recepción:', e.message));

        // 2. Email a los buzones de leads_emails: alerta de claim nuevo
        for (const recipient of recipients) {
            sendEmail(recipient, 'claimAdminAlert', {
                businessName: biz.trade_name || biz.name,
                userName:     name,
                userEmail:    email,
                userPhone:    phone || null,
                city:         biz.city || null,
                adminUrl:     `${siteUrl}/admin`,
                siteName,
                siteUrl,
            }).catch(e => console.warn(`[Claim] email admin → ${recipient}:`, e.message));
        }

        res.json({
            success: true,
            message: 'Solicitud recibida. El equipo de RetoPA verificará tu identidad en 24-48hs.',
            data: { slug: biz.slug, email }
        });

    } catch (err) {
        await client.query('ROLLBACK');
        logClaimEvent(pool, { ...evBase, event: 'submit_error', reason: 'server' });
        console.error('[Claim] submit error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// ── POST /claim/approve ── Admin aprueba el claim (requiere auth admin) ───────
router.post('/approve', requireAdmin, async (req, res) => {
    // Verificar que es admin — reusar middleware de auth si está disponible
    const { business_id } = req.body;
    if (!business_id) return res.status(400).json({ success: false, error: 'business_id requerido' });

    try {
        const result = await pool.query(`
            UPDATE businesses SET
                claim_status = 'approved',
                verified     = TRUE,
                updated_at   = NOW()
            WHERE id = $1 AND claim_status = 'pending'
            RETURNING name, trade_name, email, slug
        `, [business_id]);

        if (!result.rows.length)
            return res.status(404).json({ success: false, error: 'Claim no encontrado o ya procesado' });
        logClaimEvent(pool, { event: 'approved', canal: 'admin', businessId: business_id });

        // Actualizar el lead → 'won' (Ganado): el embudo y los badges reconocen
        // won/closed como "Ganado". Antes usaba 'completed', que no está mapeado
        // y se veía como "Pendiente" en el Dashboard.
        await pool.query(`
            UPDATE service_leads SET status = 'won', updated_at = NOW()
            WHERE business_id = $1 AND service_type = 'claim' AND status IN ('new','pending')
        `, [business_id]);

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[Claim] approve error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /claim/reject ── Admin rechaza el claim ──────────────────────────────
router.post('/reject', requireAdmin, async (req, res) => {
    const { business_id, reason } = req.body;
    if (!business_id) return res.status(400).json({ success: false, error: 'business_id requerido' });

    try {
        const rej = await pool.query(`
            UPDATE businesses SET
                claim_status = 'rejected',
                updated_at   = NOW()
            WHERE id = $1 AND claim_status = 'pending'
        `, [business_id]);
        if (rej.rowCount) logClaimEvent(pool, { event: 'rejected', canal: 'admin', businessId: business_id });

        await pool.query(`
            UPDATE service_leads SET status = 'rejected',
                notes = COALESCE(notes,'') || $2, updated_at = NOW()
            WHERE business_id = $1 AND service_type = 'claim' AND status = 'new'
        `, [business_id, reason ? ` | Motivo rechazo: ${reason}` : '']);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /claim/generate-token ── Generar token para una empresa (interno) ────
// Llamado desde admin.notify.routes.js al enviar el email
router.post('/generate-token', requireAdmin, async (req, res) => {
    const { business_id } = req.body;
    if (!business_id) return res.status(400).json({ success: false, error: 'business_id requerido' });

    try {
        const token = generateToken();
        const expires = new Date();
        expires.setDate(expires.getDate() + 30); // 30 días

        await pool.query(`
            UPDATE businesses SET
                claim_token      = $1,
                claim_token_at   = NOW(),
                claim_expires_at = $2,
                updated_at       = NOW()
            WHERE id = $3
        `, [token, expires, business_id]);

        res.json({ success: true, token });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
// 2026-10-14 — Reclamo desde la FICHA pública y ALTA de negocio con la MISMA
// pantalla que /reclamar (una sola pantalla, sin contraseña, rubro de lista).
//
//  · Ficha → /reclamar?ficha=SLUG. La prueba de posesión no puede ser "tocó el
//    botón" (lo toca cualquiera): si el WhatsApp de la ficha es suyo, le abrimos
//    el WhatsApp de RetoPA con un CÓDIGO; que escriba DESDE ese número es la prueba
//    (lo inicia el dueño → gratis para Meta). El admin le manda el link de reclamo
//    (claim_token) con un toque y el resto es el flujo de siempre. Si el número no
//    es el de la ficha, queda "en revisión".
//  · Alta → /registrar. Antes de crear, si ese celular ya está en una ficha
//    activa, se pregunta "¿Es esta tu ficha?" (el celular de la ficha es público).
//    Se crea y entra directo a Mi Portal (sin correo de activación).
// ════════════════════════════════════════════════════════════════════════════
const { supportWhatsApp, findUsersByPhone } = require('../helpers/accessLink');
const PH9 = col => `right(regexp_replace(COALESCE(${col}, ''), '\\D', '', 'g'), 9)`;
const escH = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

async function siteCfg() {
    const r = await pool.query("SELECT key, value FROM site_config WHERE key IN ('site_name','site_url','leads_emails')").catch(() => ({ rows: [] }));
    const c = {}; r.rows.forEach(x => { c[x.key] = x.value; });
    return { siteName: c.site_name || 'RetoPA', siteUrl: String(c.site_url || 'https://retopa.com.py').replace(/\/$/, ''),
             leads: String(c.leads_emails || '').split(',').map(x => x.trim()).filter(Boolean) };
}

// Límite por ficha/número + IP (las operadoras comparten IP entre miles de clientes).
const fichaLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => `${String((req.body && (req.body.slug || req.body.whatsapp)) || '').slice(0, 80)}|${req.ip}`,
    message: { success: false, error: 'Demasiados intentos. Probá de nuevo en unos minutos.' } });

// ── GET /claim/ficha?slug= ── la ficha a reclamar (datos públicos) ───────────
router.get('/ficha', async (req, res) => {
    const slug = String(req.query.slug || '').slice(0, 200);
    if (!/^[a-z0-9_-]+$/i.test(slug)) return res.status(400).json({ success: false, error: 'Ficha inválida' });
    try {
        const r = await pool.query(`
            SELECT b.id, b.name, b.trade_name, b.slug, b.phone, b.whatsapp, b.city, b.department, b.logo_emoji,
                   b.claim_status,
                   EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.business_id = b.id AND ub.is_owner) AS has_owner
              FROM businesses b WHERE b.slug = $1 AND b.is_active = TRUE`, [slug]);
        if (!r.rows.length) return res.status(404).json({ success: false, error: 'No encontramos esa ficha.' });
        const b = r.rows[0];
        if (b.has_owner || b.claim_status === 'approved') {
            logClaimEvent(pool, { event: 'link_claimed', canal: 'ficha', businessId: b.id });
            return res.status(409).json({ success: false, code: 'ALREADY_CLAIMED', error: 'Esta empresa ya tiene dueño en RetoPA.' });
        }
        logClaimEvent(pool, { event: 'link_opened', canal: 'ficha', businessId: b.id });
        const wa = mobilePY(b.whatsapp) || mobilePY(b.phone);
        res.json({ success: true, data: {
            id: b.id, name: b.trade_name || b.name, slug: b.slug, phone: b.phone, city: b.city, department: b.department,
            logoEmoji: b.logo_emoji, fichaWhatsapp: wa ? mobileLocal(wa) : null,
            canWhatsapp: !!(wa && await supportWhatsApp(pool)),
        }});
    } catch (err) { console.error('[Claim] ficha:', err); res.status(500).json({ success: false, error: 'No pudimos cargar la ficha.' }); }
});

// ── POST /claim/ficha/request ── pedido de reclamo desde la ficha ────────────
//   { slug, kind:'whatsapp' }                         → código + link a nuestro WhatsApp
//   { slug, kind:'revision', whatsapp, name, email?, message? } → queda para revisar
router.post('/ficha/request', fichaLimiter, async (req, res) => {
    const b = req.body || {};
    const kind = b.kind === 'revision' ? 'revision' : 'whatsapp';
    try {
        const r = await pool.query(`
            SELECT b.id, b.name, b.trade_name, b.slug, b.phone, b.whatsapp, b.city, b.claim_status,
                   EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.business_id = b.id AND ub.is_owner) AS has_owner
              FROM businesses b WHERE b.slug = $1 AND b.is_active = TRUE`, [String(b.slug || '')]);
        if (!r.rows.length) return res.status(404).json({ success: false, error: 'No encontramos esa ficha.' });
        const biz = r.rows[0];
        if (biz.has_owner || biz.claim_status === 'approved')
            return res.status(409).json({ success: false, code: 'ALREADY_CLAIMED', error: 'Esta empresa ya tiene dueño en RetoPA.' });
        const bizName = biz.trade_name || biz.name;
        const ip = String(req.ip || '').slice(0, 64);
        const { siteName, siteUrl, leads } = await siteCfg();
        const alert = (userName, userPhone, userEmail) => {
            for (const to of leads) sendEmail(to, 'claimAdminAlert', { auto: false, businessName: escH(bizName), userName: escH(userName),
                userEmail: escH(userEmail || '(sin correo)'), userPhone: escH(userPhone), city: escH(biz.city || ''),
                adminUrl: `${siteUrl}/admin`, siteName, siteUrl }).catch(() => {});
        };

        if (kind === 'whatsapp') {
            const fichaWa = mobilePY(biz.whatsapp) || mobilePY(biz.phone);
            const support = await supportWhatsApp(pool);
            if (!fichaWa) return res.status(400).json({ success: false, code: 'NO_FICHA_WA', error: 'La ficha no tiene un celular cargado.' });
            if (!support) return res.status(503).json({ success: false, code: 'NO_SUPPORT_WA', error: 'Ahora no podemos recibir WhatsApp. Usá la otra opción.' });
            // Reusar el pedido pendiente de las últimas 24 h (mismo código si lo vuelve a tocar).
            let row = (await pool.query(
                `SELECT id, code FROM claim_requests WHERE business_id = $1 AND kind = 'whatsapp' AND phone = $2
                    AND status = 'pending' AND created_at > NOW() - interval '24 hours' ORDER BY id DESC LIMIT 1`, [biz.id, fichaWa])).rows[0];
            if (!row) {
                const code = 'RP-' + String(crypto.randomInt(1000, 10000));
                row = (await pool.query(
                    `INSERT INTO claim_requests (business_id, kind, phone, code, ip) VALUES ($1, 'whatsapp', $2, $3, $4) RETURNING id, code`,
                    [biz.id, fichaWa, code, ip])).rows[0];
                logClaimEvent(pool, { event: 'submit_ok', canal: 'ficha', businessId: biz.id });
                alert('(pidió por WhatsApp, código ' + row.code + ')', '+' + fichaWa, null);
            }
            const text = `Hola ${siteName} 👋 Quiero reclamar mi negocio «${bizName}». Código: ${row.code}`;
            return res.json({ success: true, data: { code: row.code, fichaWhatsapp: mobileLocal(fichaWa),
                waUrl: `https://wa.me/${support}?text=${encodeURIComponent(text)}` } });
        }

        // kind === 'revision'
        const wa = mobilePY(b.whatsapp);
        const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 100);
        const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
        const message = String(b.message || '').trim().slice(0, 500);
        if (!wa) return res.status(400).json({ success: false, code: 'whatsapp_invalid', error: 'Revisá tu número de WhatsApp (ej: 0981 123 456).' });
        if (name.length < 2) return res.status(400).json({ success: false, code: 'name_missing', error: 'Decinos tu nombre.' });
        if (email && !EMAIL_RE.test(email)) return res.status(400).json({ success: false, code: 'email_invalid', error: 'Revisá el correo, o dejalo vacío.' });
        const dup = await pool.query(
            `SELECT id FROM claim_requests WHERE business_id = $1 AND kind = 'revision' AND phone = $2 AND status = 'pending'
                AND created_at > NOW() - interval '24 hours' LIMIT 1`, [biz.id, wa]);
        if (!dup.rows.length) {
            await pool.query(
                `INSERT INTO claim_requests (business_id, kind, phone, name, email, message, ip) VALUES ($1, 'revision', $2, $3, $4, $5, $6)`,
                [biz.id, wa, name, email || null, message || null, ip]);
            logClaimEvent(pool, { event: 'submit_ok', canal: 'ficha', businessId: biz.id });
            alert(name, '+' + wa, email);
        }
        res.json({ success: true });
    } catch (err) { console.error('[Claim] ficha/request:', err); res.status(500).json({ success: false, error: 'No pudimos registrar el pedido. Probá de nuevo.' }); }
});

// ── GET /claim/alta/info ── rubros (hojas) para el alta ──────────────────────
router.get('/alta/info', async (req, res) => {
    try {
        const rubros = await loadRubros(pool);
        res.json({ success: true, data: { rubros: rubros.map(r => ({ id: r.id, name: r.name, grupo: r.grupo || null })) } });
    } catch (err) { res.status(500).json({ success: false, error: 'No pudimos cargar los rubros.' }); }
});

function sessionUser(req) {
    try {
        const t = (req.headers.authorization || '').replace('Bearer ', '').trim();
        if (!t) return null;
        const d = jwt.verify(t, JWT_SECRET);
        return d && d.id ? d : null;
    } catch (e) { return null; }
}

const altaLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => `${String((req.body && req.body.whatsapp) || '').replace(/\D/g, '').slice(-9)}|${req.ip}`,
    message: { success: false, error: 'Demasiados intentos. Probá de nuevo en unos minutos.' } });

// ── POST /claim/alta ── alta de negocio en una pantalla ──────────────────────
// { business_name, category_id, city, whatsapp, name, email?, force?, plan? }
// Con sesión (Authorization): la ficha es de esa cuenta (el user_id NUNCA viene del body).
router.post('/alta', altaLimiter, async (req, res) => {
    const b = req.body || {};
    const me = sessionUser(req);
    const bizName = String(b.business_name || '').trim().replace(/\s+/g, ' ').slice(0, 200);
    const categoryId = parseInt(b.category_id, 10);
    let city = String(b.city || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const wa = mobilePY(b.whatsapp);
    const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 160);
    const desiredPlan = ['featured', 'premium'].includes(b.plan) ? b.plan : 'basic';
    const bad = (code, error, extra = {}) => res.status(400).json({ success: false, code, error, ...extra });

    if (bizName.length < 2) return bad('business_name_missing', 'Escribí el nombre de tu negocio.');
    if (!Number.isFinite(categoryId)) return bad('rubro_missing', 'Elegí a qué se dedica tu negocio.');
    if (city.length < 2) return bad('city_missing', 'Decinos en qué ciudad está.');
    if (!wa) return bad('whatsapp_invalid', 'Revisá el WhatsApp (ej: 0981 123 456).');
    if (!me && name.length < 2) return bad('name_missing', 'Decinos tu nombre.');
    if (!me && email && !EMAIL_RE.test(email)) return bad('email_invalid', 'Revisá el correo, o dejalo vacío.');

    try {
        const rub = await pool.query(
            `SELECT c.id, c.name FROM categories c WHERE c.id = $1 AND NOT EXISTS (SELECT 1 FROM categories h WHERE h.parent_id = c.id)`, [categoryId]);
        if (!rub.rows.length) return bad('rubro_missing', 'Elegí un rubro de la lista.');
        // Ciudad: de la lista de ciudades (no escrita a mano). Si la tabla está vacía, no se exige.
        const cityRow = await pool.query(
            `SELECT name FROM cities WHERE COALESCE(is_active, TRUE) AND lower(unaccent(name)) = lower(unaccent($1)) ORDER BY id LIMIT 1`, [city])
            .catch(e => { console.error('[claim/alta] ciudad:', e.message); return null; });   // si la consulta falla, no se bloquea el alta
        if (cityRow && !cityRow.rows.length) {
            const any = await pool.query('SELECT 1 FROM cities LIMIT 1').catch(() => ({ rows: [] }));
            if (any.rows.length) return bad('city_invalid', 'Elegí la ciudad de la lista.');
        } else if (cityRow) city = cityRow.rows[0].name;

        // ¿Ese celular ya está en una ficha? (dato público de la ficha → se puede mostrar)
        if (!b.force) {
            const ex = await pool.query(`
                SELECT b.name, b.trade_name, b.city, b.slug,
                       EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.business_id = b.id AND ub.is_owner) AS has_owner,
                       ${me ? 'EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.business_id = b.id AND ub.user_id = $2)' : 'FALSE'} AS mine
                  FROM businesses b
                 WHERE b.is_active = TRUE AND b.merged_into IS NULL
                   AND (${PH9('b.phone')} = $1 OR ${PH9('b.whatsapp')} = $1)
                 ORDER BY b.created_at LIMIT 3`, me ? [wa.slice(3), me.id] : [wa.slice(3)])
                .catch(() => pool.query(`
                SELECT b.name, b.trade_name, b.city, b.slug,
                       EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.business_id = b.id AND ub.is_owner) AS has_owner, FALSE AS mine
                  FROM businesses b WHERE b.is_active = TRUE AND (${PH9('b.phone')} = $1 OR ${PH9('b.whatsapp')} = $1)
                 ORDER BY b.created_at LIMIT 3`, [wa.slice(3)]));
            if (ex.rows.length) return res.status(409).json({ success: false, code: 'FICHA_EXISTS',
                error: 'Ese WhatsApp ya está en una ficha de RetoPA.',
                fichas: ex.rows.map(f => ({ name: f.trade_name || f.name, city: f.city, slug: f.slug, has_owner: f.has_owner, mine: f.mine })) });
        }

        if (me) {
            // Ficha gratuita = una por cuenta (salvo que tenga un plan pago).
            const lim = await pool.query(
                `SELECT COUNT(*) FILTER (WHERE ub.is_owner)::int AS total,
                        COUNT(*) FILTER (WHERE ub.is_owner AND b.plan_type IN ('featured','premium'))::int AS paid
                   FROM user_businesses ub JOIN businesses b ON b.id = ub.business_id WHERE ub.user_id = $1`, [me.id]);
            if (lim.rows[0].total >= 1 && lim.rows[0].paid === 0)
                return res.status(403).json({ success: false, code: 'FREE_LIMIT',
                    error: 'Con el plan gratuito podés tener una sola empresa. Mejorá el plan de la que ya tenés para sumar otra.' });
        } else {
            if ((await findUsersByPhone(pool, wa)).length)
                return res.status(409).json({ success: false, code: 'ACCOUNT_EXISTS',
                    error: 'Ya tenés una cuenta con ese WhatsApp. Entrá con tu WhatsApp y registrá el negocio desde ahí.' });
            if (email && (await pool.query('SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1', [email])).rows.length)
                return res.status(409).json({ success: false, code: 'email_exists',
                    error: 'Ese correo ya tiene cuenta en RetoPA. Dejalo vacío para seguir, o entrá con tu cuenta.' });
        }

        const client = await pool.connect();
        let biz, u, verifyToken = null;
        try {
            await client.query('BEGIN');
            const base = bizName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'negocio';
            let slug = base, n = 1;
            while ((await client.query('SELECT 1 FROM businesses WHERE slug = $1', [slug])).rows.length) slug = `${base}-${n++}`;
            biz = (await client.query(
                `INSERT INTO businesses (name, slug, category_id, city, phone, whatsapp, plan_type, verified, is_active, source, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'basic', FALSE, TRUE, 'web_registration', NOW()) RETURNING id, name, slug`,
                [bizName, slug, categoryId, city, '0' + wa.slice(3), wa])).rows[0];
            await client.query(
                `INSERT INTO business_categories (business_id, category_id, is_primary, position) VALUES ($1, $2, TRUE, 0)`, [biz.id, categoryId]);

            if (me) {
                u = (await client.query('SELECT id, name, email, role FROM users WHERE id = $1', [me.id])).rows[0];
            } else {
                const randomHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
                u = (await client.query(
                    `INSERT INTO users (name, email, password_hash, role, is_active, email_verified, phone, created_at)
                     VALUES ($1, $2, $3, 'client', TRUE, FALSE, $4, NOW()) RETURNING id, name, email, role`,
                    [name, email || null, randomHash, normalizePhone('0' + wa.slice(3))])).rows[0];
                if (email) {
                    verifyToken = crypto.randomBytes(32).toString('hex');
                    await client.query(`UPDATE users SET verify_token=$1, verify_token_expires=NOW() + interval '7 days' WHERE id=$2`, [verifyToken, u.id]);
                }
            }
            await client.query(
                `INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit) VALUES ($1, $2, TRUE, TRUE)
                 ON CONFLICT (user_id, business_id) DO UPDATE SET is_owner = TRUE, can_edit = TRUE`, [u.id, biz.id]);
            // Lead de captación (Captación / Leads: "Nuevo · por verificar" + asistente de duplicados).
            await client.query(
                `INSERT INTO service_leads (business_id, business_name, service_type, status, contact_name, contact_email, contact_phone, notes, created_at, updated_at)
                 VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, NOW(), NOW())`,
                [biz.id, bizName, desiredPlan, (me ? u.name : name) || null, (me ? u.email : email) || null, '+' + wa,
                 JSON.stringify({ source: 'web_registration', flow: 'alta_una_pantalla', name: bizName, business_name: bizName,
                     category_id: categoryId, rubro: rub.rows[0].name, city, phone: '+' + wa, user_id: u.id, desired_plan: desiredPlan,
                     plan_intent: desiredPlan !== 'basic' ? `Quiere contratar plan ${desiredPlan} — pendiente de pago` : null,
                     registered_at: new Date().toISOString() })]);
            await client.query('COMMIT');
        } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }

        invalidateBizCache(biz.slug);
        (async () => {
            try {
                const { siteName, siteUrl, leads } = await siteCfg();
                const fichaUrl = `${siteUrl}/negocio/${biz.slug}`;
                if (email && verifyToken) sendEmail(email, 'claimWelcome', { name, businessName: bizName, siteName, siteUrl,
                    verifyUrl: `${siteUrl}/?verify=${verifyToken}`, fichaUrl }).catch(() => {});
                for (const to of leads) sendEmail(to, 'newLead', { contactName: escH((me ? u.name : name) || ''), contactEmail: escH((me ? u.email : email) || '(sin correo)'),
                    contactPhone: '+' + wa, businessName: escH(bizName), businessPhone: '+' + wa, serviceType: desiredPlan,
                    businessUrl: fichaUrl, notes: escH(`${rub.rows[0].name} · ${city}`) }).catch(() => {});
            } catch (e) { console.warn('[Alta] avisos:', e.message); }
        })();

        res.status(201).json({ success: true, slug: biz.slug, redirect: '/cliente/',
            ...(me ? {} : { token: signClientSession(u),
                user: { id: u.id, email: u.email, name: u.name, role: u.role, email_verified: false, has_business: true } }) });
    } catch (err) {
        console.error('[Alta] error:', err);
        res.status(500).json({ success: false, error: 'No pudimos crear tu negocio. Probá de nuevo.' });
    }
});

// Exportar generateToken para uso interno
router.generateToken = generateToken;

module.exports = router;
