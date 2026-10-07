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

    try {
        const result = await pool.query(`
            SELECT b.id, b.name, b.trade_name, b.slug, b.email, b.phone,
                   b.city, b.department, b.description, b.image_url, b.logo_emoji,
                   b.claim_status, b.claim_expires_at, b.verified,
                   c.name AS category_name
            FROM businesses b
            LEFT JOIN categories c ON c.id = b.category_id
            WHERE b.claim_token = $1 AND b.is_active = TRUE
        `, [token]);

        if (!result.rows.length)
            return res.status(404).json({ success: false, error: 'Token inválido o expirado' });

        const biz = result.rows[0];

        // Verificar expiración
        if (biz.claim_expires_at && new Date() > new Date(biz.claim_expires_at))
            return res.status(410).json({ success: false, error: 'Este link expiró. Solicitá uno nuevo.' });

        // Si ya fue aprobado
        if (biz.claim_status === 'approved')
            return res.status(409).json({ success: false, error: 'Esta empresa ya fue reclamada.' });

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
        }});
    } catch (err) {
        console.error('[Claim] info error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /claim/submit ── Dueño completa el formulario de claim ──────────────
router.post('/submit', async (req, res) => {
    const { token, name, email, password, phone } = req.body;
    if (!token || !name || !email || !password)
        return res.status(400).json({ success: false, error: 'Token, nombre, email y contraseña son requeridos' });
    if (!email.includes('@'))
        return res.status(400).json({ success: false, error: 'Email inválido' });
    if (password.length < 8)
        return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });

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
            return res.status(404).json({ success: false, error: 'Token inválido' });
        }

        const biz = bizResult.rows[0];

        if (biz.claim_expires_at && new Date() > new Date(biz.claim_expires_at)) {
            await client.query('ROLLBACK');
            return res.status(410).json({ success: false, error: 'Link expirado. Solicitá uno nuevo.' });
        }

        if (biz.claim_status === 'approved') {
            await client.query('ROLLBACK');
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
        await pool.query(`
            UPDATE businesses SET
                claim_status = 'rejected',
                updated_at   = NOW()
            WHERE id = $1 AND claim_status = 'pending'
        `, [business_id]);

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

// Exportar generateToken para uso interno
router.generateToken = generateToken;

module.exports = router;
