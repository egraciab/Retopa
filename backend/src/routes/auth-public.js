const express    = require('express');
const router     = express.Router();
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const rateLimit  = require('express-rate-limit');
const pool       = require('../db');

const JWT_SECRET  = require('../config/jwt');

// ── SEGURIDAD: rate-limit contra fuerza bruta en endpoints de credenciales ────
// (el límite general de la API es 300/min; acá vamos mucho más estricto por IP).
// Cuenta solo los intentos fallidos en login (skipSuccessfulRequests) para no
// molestar al uso normal. 'trust proxy' ya está seteado en app.js (IP real).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true,
  message: { success: false, error: 'Demasiados intentos de acceso. Probá de nuevo en unos minutos.' },
});
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 8,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes. Probá de nuevo en unos minutos.' },
});
// Duración de sesión por rol (editable por env). Admin más corta por seguridad.
const JWT_EXPIRES_PUBLIC = process.env.JWT_EXPIRES_PUBLIC || '8h';   // público, cliente, embajador
const JWT_EXPIRES_ADMIN  = process.env.JWT_EXPIRES_ADMIN  || '30m';  // admin, godmode

function getTokenExpiry(role) {
  return ['admin', 'godmode'].includes(role) ? JWT_EXPIRES_ADMIN : JWT_EXPIRES_PUBLIC;
}

// Tope ABSOLUTO de sesión (aunque haya actividad). El expiresIn de arriba es la
// "ventana de inactividad": si no se refresca a tiempo, el token muere.
function parseDurMs(s) {
  const m = String(s || '').match(/^(\d+)\s*([smhd])$/);
  if (!m) return 0;
  return parseInt(m[1], 10) * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 })[m[2]];
}
const ABS_ADMIN_MS  = parseDurMs(process.env.JWT_ABSOLUTE_ADMIN  || '12h');
const ABS_PUBLIC_MS = parseDurMs(process.env.JWT_ABSOLUTE_PUBLIC || '7d');
function absoluteMaxMs(role) {
  return ['admin', 'godmode'].includes(role) ? ABS_ADMIN_MS : ABS_PUBLIC_MS;
}
// Segundos epoch del inicio de sesión (para el tope absoluto).
function nowSec() { return Math.floor(Date.now() / 1000); }

/**
 * ENGANCHE de fichas por correo.
 * Cuando un usuario se autentica (registro / login / 2FA), le asignamos como
 * DUEÑO las empresas cuyo email coincide con el suyo y que todavía NO tienen
 * dueño (creadas por el registro corto SIN sesión → sin user_businesses).
 * - Nunca "roba" una ficha que ya tiene dueño (NOT EXISTS is_owner).
 * - Nunca duplica la fila (user_id, business_id).
 * - Es best-effort: cualquier error se traga para no romper el login/registro.
 * Devuelve la cantidad de fichas enganchadas.
 */
async function linkOrphanBusinessesByEmail(userId, email) {
  if (!userId || !email) return 0;
  try {
    const { rows } = await pool.query(
      `INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit)
       SELECT $1, b.id, TRUE, TRUE
         FROM businesses b
        WHERE lower(b.email) = lower($2)
          AND b.is_active = TRUE
          AND NOT EXISTS (
                SELECT 1 FROM user_businesses ub
                 WHERE ub.business_id = b.id AND ub.is_owner = TRUE)
          AND NOT EXISTS (
                SELECT 1 FROM user_businesses ub2
                 WHERE ub2.business_id = b.id AND ub2.user_id = $1)
       RETURNING business_id`,
      [userId, String(email).toLowerCase()]
    );
    return rows.length;
  } catch (e) {
    console.error('[linkOrphanBusinessesByEmail]', e.message);
    return 0;
  }
}

/**
 * Enviar el correo de verificación con LINK MÁGICO (?verify=TOKEN).
 * Genera y guarda el token (24h). El enganche de fichas por correo se hace
 * recién cuando el usuario confirma con este link. Best-effort.
 */
async function sendVerificationEmail(userId, email, name) {
  try {
    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas
    await pool.query('UPDATE users SET verify_token=$1, verify_token_expires=$2 WHERE id=$3', [token, expiry, userId]);
    const c   = await getMailConfig();
    const url = `${c.site_url || 'https://retopa.com.py'}/?verify=${token}`;
    await sendMail(email, `Confirmá tu correo — ${c.site_name || 'RetoPA'}`, `
      <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#f8fafc">
        <div style="background:white;border-radius:20px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
          <div style="text-align:center;margin-bottom:28px">
            <div style="width:56px;height:56px;background:#f0f9ff;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:12px">✅</div>
            <h2 style="color:#0f172a;margin:0">Confirmá tu correo</h2>
          </div>
          <p style="color:#64748b;line-height:1.6;margin-bottom:24px">
            ¡Hola${name ? ' ' + name : ''}! Con este paso confirmás que este correo es tuyo y
            desbloqueás la gestión de tu${''} negocio en <strong>${c.site_name || 'RetoPA'}</strong>.
          </p>
          <a href="${url}"
            style="display:block;background:#0ea5e9;color:white;text-decoration:none;text-align:center;padding:14px 24px;border-radius:12px;font-weight:700;font-size:16px;margin-bottom:24px">
            Confirmar mi correo →
          </a>
          <p style="color:#94a3b8;font-size:12px;text-align:center">
            Este enlace expira en 24 horas.<br>
            Si no creaste una cuenta en ${c.site_name || 'RetoPA'}, ignorá este email.
          </p>
        </div>
      </div>
    `, 'verify_email');
    return true;
  } catch (e) {
    console.error('[sendVerificationEmail]', e.message);
    return false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Obtener config SMTP desde DB o env */
async function getMailConfig() {
  try {
    const result = await pool.query("SELECT key, value FROM site_config WHERE key LIKE 'smtp%' OR key = 'site_name' OR key = 'site_url'");
    const c = {};
    result.rows.forEach(r => { c[r.key] = r.value || ''; });
    // smtp_pass: si está vacío en DB, usar variable de entorno
    if (!c.smtp_pass) c.smtp_pass = process.env.SMTP_PASS || '';
    // Otros campos: fallback a env si no están en DB
    if (!c.smtp_host) c.smtp_host = process.env.SMTP_HOST || '';
    if (!c.smtp_user) c.smtp_user = process.env.SMTP_USER || '';
    if (!c.smtp_from) c.smtp_from = process.env.SMTP_FROM || c.smtp_user;
    if (!c.smtp_from_name) c.smtp_from_name = process.env.SMTP_FROM_NAME || 'RetoPA';
    if (!c.site_url)  c.site_url  = process.env.SITE_URL  || 'https://retopa.com.py';
    if (!c.site_name) c.site_name = process.env.SITE_NAME || 'RetoPA';
    return c;
  } catch(e) {
    return {
      smtp_host: process.env.SMTP_HOST || '',
      smtp_port: process.env.SMTP_PORT || '587',
      smtp_secure: process.env.SMTP_SECURE || 'false',
      smtp_user: process.env.SMTP_USER || '',
      smtp_pass: process.env.SMTP_PASS || '',
      smtp_from: process.env.SMTP_FROM || '',
      smtp_from_name: process.env.SMTP_FROM_NAME || 'RetoPA',
      site_name: process.env.SITE_NAME || 'RetoPA',
      site_url: process.env.SITE_URL || 'https://retopa.com.py',
    };
  }
}

/** Crear transporte nodemailer */
function buildTransport(c) {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: c.smtp_host,
    port: parseInt(c.smtp_port || 587),
    secure: c.smtp_secure === 'true',
    auth: { user: c.smtp_user, pass: c.smtp_pass || process.env.SMTP_PASS || '' },
    tls: { rejectUnauthorized: false },
  });
}

/** Enviar email con fallback silencioso y log */
async function sendMail(to, subject, html, type = 'general') {
  const startedAt = Date.now();
  try {
    const c = await getMailConfig();
    if (!c.smtp_host) return; // no configurado → silencioso
    const transport = buildTransport(c);
    const fromName  = c.smtp_from_name || 'RetoPA';
    const fromAddr  = c.smtp_from || c.smtp_user;
    await transport.sendMail({ from: `"${fromName}" <${fromAddr}>`, to, subject, html });
    // Log éxito
    pool.query(
      "INSERT INTO email_log (to_email, subject, type, status) VALUES ($1,$2,$3,'sent')",
      [to, subject, type]
    ).catch(() => {});
  } catch(e) {
    console.error('[Auth mail]', e.message);
    // Log fallo
    pool.query(
      "INSERT INTO email_log (to_email, subject, type, status, error) VALUES ($1,$2,$3,'failed',$4)",
      [to, subject, type, e.message]
    ).catch(() => {});
  }
}

/** Generar OTP numérico de 6 dígitos */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── POST /refresh ── Sesión deslizante (idle): renueva el token si sigue vigente.
// Falla si el token venció (idle superado) o si se pasó el tope ABSOLUTO desde el
// login. Sirve tanto para admin como para usuarios (ventana según rol).
router.post('/refresh', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ((req.body && req.body.token) || '');
    if (!token) return res.status(401).json({ success: false, error: 'Token requerido', code: 'NO_TOKEN' });

    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); }   // si venció (idle), acá falla → 401
    catch (e) { return res.status(401).json({ success: false, error: 'Sesión vencida', code: 'INVALID_TOKEN' }); }

    // Tope absoluto: desde loginAt (o iat en tokens viejos sin loginAt).
    const loginAt = decoded.loginAt || decoded.iat;
    if (loginAt && (Date.now() - loginAt * 1000) > absoluteMaxMs(decoded.role)) {
      return res.status(401).json({ success: false, error: 'Sesión alcanzó su duración máxima', code: 'SESSION_MAX' });
    }

    // Revalidar que el usuario siga activo.
    const u = (await pool.query('SELECT id, email, name, role, is_active, is_ambassador FROM users WHERE id=$1', [decoded.id])).rows[0];
    if (!u || !u.is_active) return res.status(401).json({ success: false, error: 'Usuario inactivo', code: 'INACTIVE' });

    const fresh = jwt.sign(
      { id: u.id, email: u.email, role: u.role, name: u.name, is_ambassador: !!u.is_ambassador, loginAt },
      JWT_SECRET, { expiresIn: getTokenExpiry(u.role) }
    );
    res.json({ success: true, token: fresh, user: { id: u.id, email: u.email, name: u.name, role: u.role } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /register ──────────────────────────────────────────────────────────
router.post('/register', sensitiveLimiter, async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password || !name)
      return res.status(400).json({ success: false, error: 'Email, contraseña y nombre son requeridos' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ success: false, error: 'Email inválido' });
    if (password.length < 6)
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });

    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows.length > 0)
      return res.status(409).json({ success: false, error: 'Este email ya está registrado' });

    const hash   = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, phone, role, is_active) VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id, email, name, role',
      [email.toLowerCase(), hash, name.trim(), phone || null, 'user']
    );
    const user  = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, loginAt: nowSec() }, JWT_SECRET, { expiresIn: getTokenExpiry(user.role) });

    // VERIFICACIÓN DE CORREO: enviamos el link mágico y NO enganchamos fichas
    // todavía. El enganche por correo se hace recién al confirmar (POST /verify-email),
    // así una cuenta sin verificar no puede reclamar fichas ajenas por email.
    await sendVerificationEmail(user.id, user.email, user.name);

    res.json({
      success: true, token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, email_verified: false, has_business: false }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /verify-email ── Confirma el correo con el token del link mágico y
// recién ahí engancha las fichas creadas con ese correo. Devuelve token de
// sesión para dejar al usuario logueado tras confirmar.
router.post('/verify-email', sensitiveLimiter, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'Token requerido' });

    const r = await pool.query(
      'SELECT id, email, name, role, is_ambassador, email_verified FROM users WHERE verify_token=$1 AND verify_token_expires > NOW()',
      [token]
    );
    if (!r.rows.length) {
      return res.status(400).json({ success: false, code: 'INVALID_TOKEN', error: 'El enlace de verificación es inválido o venció. Pedí uno nuevo.' });
    }
    const user = r.rows[0];

    await pool.query('UPDATE users SET email_verified=TRUE, verify_token=NULL, verify_token_expires=NULL WHERE id=$1', [user.id]);

    // ENGANCHE: ahora sí, asigna las fichas huérfanas con este correo.
    const linked = await linkOrphanBusinessesByEmail(user.id, user.email);
    const hasBiz = (await pool.query(
      'SELECT EXISTS(SELECT 1 FROM user_businesses WHERE user_id=$1 AND is_owner=TRUE) AS h', [user.id]
    )).rows[0].h;

    const isAmb = !!user.is_ambassador;
    const jwtToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, is_ambassador: isAmb, loginAt: nowSec() },
      JWT_SECRET, { expiresIn: getTokenExpiry(user.role) }
    );
    res.json({
      success: true, token: jwtToken, linked,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, is_ambassador: isAmb, email_verified: true, has_business: hasBiz }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /activate-account ── Alta de ficha SIN cuenta: el dueño abre el link
// mágico (?activar=TOKEN), define su CONTRASEÑA y con eso confirma el correo.
// Setea password, marca email_verified, engancha sus fichas y devuelve sesión.
router.post('/activate-account', sensitiveLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, error: 'Token y contraseña requeridos' });
    if (String(password).length < 8) return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });

    const r = await pool.query(
      'SELECT id, email, name, role, is_ambassador FROM users WHERE verify_token=$1 AND verify_token_expires > NOW()',
      [token]
    );
    if (!r.rows.length) {
      return res.status(400).json({ success: false, code: 'INVALID_TOKEN', error: 'El enlace de activación es inválido o venció. Pedí uno nuevo.' });
    }
    const user = r.rows[0];

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash=$1, email_verified=TRUE, verify_token=NULL, verify_token_expires=NULL WHERE id=$2',
      [hash, user.id]
    );

    // ENGANCHE: ahora sí, asigna las fichas huérfanas con este correo.
    const linked = await linkOrphanBusinessesByEmail(user.id, user.email);
    const hasBiz = (await pool.query(
      'SELECT EXISTS(SELECT 1 FROM user_businesses WHERE user_id=$1 AND is_owner=TRUE) AS h', [user.id]
    )).rows[0].h;

    const isAmb = !!user.is_ambassador;
    const jwtToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, is_ambassador: isAmb, loginAt: nowSec() },
      JWT_SECRET, { expiresIn: getTokenExpiry(user.role) }
    );
    res.json({
      success: true, token: jwtToken, linked,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, is_ambassador: isAmb, email_verified: true, has_business: hasBiz }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /resend-verification ── Reenvía el link mágico si el correo existe y
// aún no está verificado. Responde siempre OK para no filtrar qué correos existen.
router.post('/resend-verification', sensitiveLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email requerido' });
    const r = await pool.query('SELECT id, email, name, email_verified FROM users WHERE email=$1 AND is_active=TRUE', [email.toLowerCase()]);
    if (r.rows.length && !r.rows[0].email_verified) {
      await sendVerificationEmail(r.rows[0].id, r.rows[0].email, r.rows[0].name);
    }
    res.json({ success: true, message: 'Si el correo está registrado y sin confirmar, te reenviamos el enlace.' });
  } catch (err) {
    res.json({ success: true, message: 'Si el correo está registrado y sin confirmar, te reenviamos el enlace.' });
  }
});

// ── POST /login ──────────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query(
      'SELECT id, email, name, role, is_ambassador, password_hash, is_active, mfa_enabled, email_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (!result.rows.length || !result.rows[0].is_active)
      return res.status(401).json({ success: false, error: 'Credenciales inválidas o cuenta inactiva' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });

    // 2FA activo → enviar OTP y pedir verificación
    if (user.mfa_enabled) {
      const otp     = generateOTP();
      const expires = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query('UPDATE users SET mfa_otp=$1, mfa_otp_expires=$2 WHERE id=$3', [otp, expires, user.id]);

      // Enviar código
      const c = await getMailConfig();
      await sendMail(user.email, `${otp} — Código de acceso ${c.site_name || 'RetoPA'}`, `
        <div style="font-family:Inter,sans-serif;max-width:400px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:16px">
          <h2 style="color:#0f172a;text-align:center">Verificación en dos pasos</h2>
          <p style="color:#64748b;text-align:center">Tu código de acceso es:</p>
          <div style="background:white;border:2px solid #0ea5e9;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
            <span style="font-size:42px;font-weight:900;color:#0f172a;letter-spacing:10px">${otp}</span>
          </div>
          <p style="color:#94a3b8;font-size:12px;text-align:center">Válido por 10 minutos.</p>
        </div>
      `, 'mfa_login');

      return res.json({ success: true, mfa_required: true, user_id: user.id });
    }

    const isAmb = !!user.is_ambassador;
    // ENGANCHE sólo con correo VERIFICADO: asigna fichas huérfanas con este correo
    // antes de calcular has_business. Sin verificar, no reclama nada (seguridad).
    if (user.email_verified) await linkOrphanBusinessesByEmail(user.id, user.email);
    const hasBiz = (await pool.query(
      'SELECT EXISTS(SELECT 1 FROM user_businesses WHERE user_id=$1 AND is_owner=TRUE) AS h', [user.id]
    )).rows[0].h;
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, is_ambassador: isAmb, loginAt: nowSec() },
      JWT_SECRET, { expiresIn: getTokenExpiry(user.role) }
    );
    res.json({
      success: true, token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, is_ambassador: isAmb, email_verified: !!user.email_verified, has_business: hasBiz }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ── POST /mfa-send ───────────────────────────────────────────────────────────
router.post('/mfa-send', sensitiveLimiter, async (req, res) => {
  try {
    const { user_id } = req.body;
    const result = await pool.query('SELECT id, email, name FROM users WHERE id=$1 AND is_active=TRUE', [user_id]);
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    const user = result.rows[0];

    const otp     = generateOTP();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query('UPDATE users SET mfa_otp=$1, mfa_otp_expires=$2 WHERE id=$3', [otp, expires, user_id]);

    const c = await getMailConfig();
    await sendMail(user.email, `${otp} — Código de acceso`, `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px">
        <h2>Verificación en dos pasos</h2>
        <div style="background:#f0f9ff;border:2px solid #0ea5e9;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
          <span style="font-size:42px;font-weight:900;letter-spacing:10px;color:#0f172a">${otp}</span>
        </div>
        <p style="color:#94a3b8;font-size:12px">Válido por 10 minutos. ${c.site_name || 'RetoPA'}</p>
      </div>
    `, 'mfa_resend');
    res.json({ success: true, message: `Código enviado a ${user.email}` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /mfa-verify ─────────────────────────────────────────────────────────
router.post('/mfa-verify', sensitiveLimiter, async (req, res) => {
  try {
    const { user_id, otp } = req.body;
    const result = await pool.query('SELECT id, email, name, role, mfa_otp, mfa_otp_expires, email_verified FROM users WHERE id=$1', [user_id]);
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    const user = result.rows[0];

    if (!user.mfa_otp || user.mfa_otp !== otp.trim())
      return res.status(401).json({ success: false, error: 'Código incorrecto' });
    if (new Date() > new Date(user.mfa_otp_expires))
      return res.status(401).json({ success: false, error: 'Código expirado. Solicitá uno nuevo.' });

    await pool.query('UPDATE users SET mfa_otp=NULL, mfa_otp_expires=NULL WHERE id=$1', [user_id]);
    // ENGANCHE sólo con correo VERIFICADO (seguridad).
    if (user.email_verified) await linkOrphanBusinessesByEmail(user.id, user.email);
    const hasBiz = (await pool.query(
      'SELECT EXISTS(SELECT 1 FROM user_businesses WHERE user_id=$1 AND is_owner=TRUE) AS h', [user.id]
    )).rows[0].h;
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, loginAt: nowSec() }, JWT_SECRET, { expiresIn: getTokenExpiry(user.role) });
    res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role, email_verified: !!user.email_verified, has_business: hasBiz } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /forgot-password ─────────────────────────────────────────────────────
router.post('/forgot-password', sensitiveLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email requerido' });

    const result = await pool.query('SELECT id, name FROM users WHERE email=$1 AND is_active=TRUE', [email.toLowerCase()]);

    if (result.rows.length > 0) {
      const user   = result.rows[0];
      const token  = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      // Usar columna reset_token dedicada (mfa_otp es VARCHAR(10), no alcanza)
      await pool.query('UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE id=$3', [token, expiry, user.id]);

      const c   = await getMailConfig();
      const url = `${c.site_url || 'https://retopa.com.py'}/?reset=${token}`;

      await sendMail(email, `Restablecer contraseña — ${c.site_name || 'RetoPA'}`, `
        <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:40px 24px">
          <div style="background:white;border-radius:20px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
            <div style="text-align:center;margin-bottom:28px">
              <div style="width:56px;height:56px;background:#f0f9ff;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:12px">🔑</div>
              <h2 style="color:#0f172a;margin:0">Restablecer contraseña</h2>
            </div>
            <p style="color:#64748b;margin-bottom:24px">Hola <strong>${user.name}</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>${c.site_name || 'RetoPA'}</strong>.</p>
            <a href="${url}" style="display:block;background:#0ea5e9;color:white;text-decoration:none;text-align:center;padding:14px;border-radius:12px;font-weight:700;margin-bottom:24px">
              Restablecer mi contraseña →
            </a>
            <p style="color:#94a3b8;font-size:12px;text-align:center">Este enlace expira en 1 hora.<br>Si no solicitaste este cambio, ignorá este email.</p>
          </div>
        </div>
      `, 'reset');
    }

    // Siempre responder OK — no revelar si el email existe
    res.json({ success: true, message: 'Si el email está registrado, recibirás el enlace en minutos.' });
  } catch (err) {
    console.error('[Forgot pwd]', err.message);
    // Responder OK igual para no revelar información
    res.json({ success: true, message: 'Si el email está registrado, recibirás el enlace en minutos.' });
  }
});

// ── POST /reset-password ──────────────────────────────────────────────────────
router.post('/reset-password', sensitiveLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, error: 'Token y contraseña requeridos' });
    if (password.length < 8) return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });

    const result = await pool.query(
      "SELECT id FROM users WHERE reset_token=$1 AND reset_token_expires > NOW()",
      [token]
    );
    if (!result.rows.length) return res.status(400).json({ success: false, error: 'El enlace expiró o es inválido' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2', [hash, result.rows[0].id]);
    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /me ───────────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Token requerido' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const result  = await pool.query(
      'SELECT id, email, name, phone, role, email_verified, mfa_enabled FROM users WHERE id=$1',
      [decoded.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { res.status(401).json({ success: false, error: 'Token inválido' }); }
});

// ── POST /auth/admin-login — login exclusivo para panel admin ────────────────
// Igual al login normal pero solo acepta roles admin/godmode
router.post('/admin-login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });

        const result = await pool.query(
            'SELECT id, email, name, role, password_hash, is_active, mfa_enabled FROM users WHERE email = $1',
            [email.toLowerCase()]
        );
        const user = result.rows[0];

        if (!user || !user.is_active)
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });

        // Solo admins pueden entrar al panel
        if (!['admin','godmode'].includes(user.role))
            return res.status(403).json({ success: false, error: 'Sin acceso al panel de administración' });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid)
            return res.status(401).json({ success: false, error: 'Credenciales inválidas' });

        // Si tiene MFA activo, pedir código antes de dar token
        if (user.mfa_enabled) {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const exp = new Date(Date.now() + 10 * 60 * 1000);
            await pool.query('UPDATE users SET mfa_otp=$1, mfa_otp_expires=$2 WHERE id=$3', [otp, exp, user.id]);
            await sendMail(user.email, 'Código de verificación — Panel Admin RetoPA',
                `<h2>Código de acceso: <strong>${otp}</strong></h2><p>Válido por 10 minutos.</p>`);
            return res.json({ success: true, mfa_required: true, user_id: user.id });
        }

        // Coherente con la regla por rol (admin/godmode = corto). Antes: '8h' fijo.
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name, loginAt: nowSec() }, JWT_SECRET, { expiresIn: getTokenExpiry(user.role) });
        res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
