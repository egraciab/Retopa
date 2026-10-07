/**
 * RetoPA — helpers/fichaActivation.js
 *
 * Alta de ficha SIN sesión (formulario corto público): además de crear la ficha,
 * provisionamos una CUENTA PENDIENTE para el correo del dueño y le mandamos un
 * correo de ACTIVACIÓN con link mágico (?activar=TOKEN). Al abrir el link, el
 * dueño crea su contraseña → se verifica el correo y recién ahí se enganchan sus
 * fichas (POST /auth/activate-account).
 *
 * Reglas:
 *  - Si ya existe una cuenta VERIFICADA con ese correo → enganchamos la ficha en
 *    el acto (el correo ya está probado) y NO mandamos activación.
 *  - Si existe pero SIN verificar → reusamos la cuenta y (re)enviamos activación.
 *  - Si no existe → creamos cuenta pendiente (sin contraseña usable) + activación.
 *
 * password_hash placeholder: un valor que NO es un hash bcrypt válido, así ningún
 * login puede matchear hasta que el dueño defina su contraseña en la activación.
 */
const crypto = require('crypto');

const PENDING_PWD = '!pending-no-password!';

async function provisionFichaOwnerActivation({ pool, sendEmail, email, name, businessId, businessName, siteName, siteUrl, businessUrl }) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return { mode: 'skip', sentActivation: false };

  // ¿Existe cuenta con ese correo?
  let userId = null, verified = false, existed = false;
  const found = await pool.query('SELECT id, email_verified FROM users WHERE email=$1', [em]);
  if (found.rows.length) {
    existed = true;
    userId = found.rows[0].id;
    verified = !!found.rows[0].email_verified;
  } else {
    try {
      const ins = await pool.query(
        `INSERT INTO users (email, password_hash, name, role, is_active, email_verified)
         VALUES ($1, $2, $3, 'user', TRUE, FALSE) RETURNING id`,
        [em, PENDING_PWD, (name || '').trim() || null]
      );
      userId = ins.rows[0].id;
    } catch (e) {
      // Carrera por el UNIQUE(email): reintentar leyendo.
      const again = await pool.query('SELECT id, email_verified FROM users WHERE email=$1', [em]);
      if (!again.rows.length) throw e;
      existed = true; userId = again.rows[0].id; verified = !!again.rows[0].email_verified;
    }
  }

  // Cuenta ya verificada → enganchar en el acto, sin activación.
  if (verified) {
    if (businessId) {
      await pool.query(
        `INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit)
         VALUES ($1, $2, TRUE, TRUE)
         ON CONFLICT (user_id, business_id) DO UPDATE SET is_owner=TRUE, can_edit=TRUE`,
        [userId, businessId]
      ).catch(() => {});
    }
    return { mode: 'linked_verified', userId, sentActivation: false };
  }

  // Pendiente/sin verificar → token de activación (7 días) + correo.
  const token  = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query('UPDATE users SET verify_token=$1, verify_token_expires=$2 WHERE id=$3', [token, expiry, userId]);

  const base = (siteUrl || 'https://retopa.com.py').replace(/\/$/, '');
  const activateUrl = `${base}/?activar=${token}`;
  await sendEmail(em, 'activateAccount', {
    name: name || '',
    businessName: businessName || '',
    activateUrl,
    businessUrl: businessUrl || '',
    siteName: siteName || 'RetoPA',
    siteUrl: base,
  }).catch(() => {});

  return { mode: existed ? 'reused' : 'created', userId, sentActivation: true };
}

module.exports = { provisionFichaOwnerActivation, PENDING_PWD };
