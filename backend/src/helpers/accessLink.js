/**
 * RetoPA — helpers/accessLink.js  (2026-10-13)
 * Acceso SIN contraseña para dueños: link de un solo uso + datos de contacto.
 *
 *  - mintAccessLink(pool, userId, siteUrl) → '<site>/?acceso=<64 hex>' (7 días, un uso).
 *    En la base queda SOLO el hash (sha256). Nunca para admins.
 *  - siteInfo(pool)        → { siteName, siteUrl }
 *  - supportWhatsApp(pool) → '5959XXXXXXXX' del WhatsApp de RetoPA (site_config:
 *    social_whatsapp / whatsapp_url / contact_phone, el primero que sea celular PY).
 *  - findUsersByPhone(pool, wa) → usuarios activos (no admin) con ese celular.
 */
const crypto = require('crypto');
const { mobilePY } = require('./claimFlow');

async function siteInfo(pool) {
    const r = await pool.query("SELECT key, value FROM site_config WHERE key IN ('site_name','site_url')").catch(() => ({ rows: [] }));
    const c = {}; r.rows.forEach(x => { c[x.key] = x.value; });
    return { siteName: c.site_name || 'RetoPA', siteUrl: String(c.site_url || process.env.SITE_URL || 'https://retopa.com.py').replace(/\/$/, '') };
}

async function mintAccessLink(pool, userId, siteUrl) {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const u = await pool.query(
        `UPDATE users SET access_token_hash = $2, access_token_expires = NOW() + interval '7 days'
          WHERE id = $1 AND is_active = TRUE AND role NOT IN ('admin','godmode') RETURNING id`, [userId, hash]);
    return u.rows.length ? `${siteUrl}/?acceso=${raw}` : null;
}

async function supportWhatsApp(pool) {
    const r = await pool.query(
        "SELECT key, value FROM site_config WHERE key IN ('social_whatsapp','whatsapp_url','contact_phone')").catch(() => ({ rows: [] }));
    const c = {}; r.rows.forEach(x => { c[x.key] = x.value; });
    for (const k of ['social_whatsapp', 'whatsapp_url', 'contact_phone']) {
        const v = String(c[k] || '');
        // wa.me/5959..., api.whatsapp.com/send?phone=5959..., +595 9..., 09...
        const m = v.match(/(?:wa\.me\/|phone=)?(\+?[\d\s().-]{9,})/);
        const wa = m ? mobilePY(m[1]) : null;
        if (wa) return wa;
    }
    return null;
}

// '5959XXXXXXXX' → usuarios cuyo teléfono, en dígitos, sea 5959.., 09.. o 9..
async function findUsersByPhone(pool, wa) {
    const local9 = String(wa).slice(3);
    const { rows } = await pool.query(
        `SELECT id, email, name, role, is_ambassador, password_hash, password_set_at, is_active,
                mfa_enabled, email_verified, phone
           FROM users
          WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') IN ($1, $2, $3)
            AND is_active = TRUE AND role NOT IN ('admin','godmode')
          ORDER BY (password_set_at IS NOT NULL) DESC, last_seen_at DESC NULLS LAST, id DESC
          LIMIT 5`, [wa, '0' + local9, local9]);
    return rows;
}

module.exports = { siteInfo, mintAccessLink, supportWhatsApp, findUsersByPhone };
