/**
 * RetoPA — helpers/claimAccess.js
 * Provisión de acceso del dueño al aprobar un reclamo (claim).
 *
 * El objetivo: sin importar por qué vía entró el reclamo (link con token o
 * formulario público), al APROBAR el reclamante debe quedar como DUEÑO de la
 * ficha y con forma de entrar. El admin es la compuerta (nadie obtiene acceso
 * sin aprobación).
 *
 * Estos helpers corren dentro de una transacción ABIERTA por el llamador.
 * No envían emails ni hacen commit: eso queda en el endpoint.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Resuelve a quién pertenece el reclamo: si ya hay un usuario dueño vinculado
// (flujo por token), usa ese; si no, toma el contacto del último lead 'claim'
// (flujo por formulario). Devuelve {name, email, phone, fromOwner}.
async function resolveClaimContact(client, businessId) {
  const owner = await client.query(
    `SELECT u.id, u.name, u.email
       FROM users u JOIN user_businesses ub ON ub.user_id = u.id
      WHERE ub.business_id = $1 AND ub.is_owner = TRUE
      ORDER BY ub.user_id LIMIT 1`, [businessId]
  );
  if (owner.rows.length && owner.rows[0].email) {
    return { name: owner.rows[0].name, email: owner.rows[0].email, phone: null, fromOwner: true };
  }
  const lead = await client.query(
    `SELECT contact_name, contact_email, contact_phone
       FROM service_leads
      WHERE business_id = $1 AND service_type = 'claim'
      ORDER BY created_at DESC LIMIT 1`, [businessId]
  );
  const l = lead.rows[0] || {};
  return { name: l.contact_name || null, email: (l.contact_email || '').trim() || null, phone: l.contact_phone || null, fromOwner: false };
}

// Garantiza que exista un usuario para ese email, lo vincula como DUEÑO de la
// ficha y lo marca como claimed_by. Devuelve {userId, created, email, name}.
// created=true → el usuario se creó ahora (sin contraseña usable → necesita activar).
async function ensureClaimOwner(client, business, contact) {
  const email = (contact.email || '').trim().toLowerCase();
  if (!email) return { userId: null, created: false, email: null, name: contact.name || null };

  let userId, created = false, name = contact.name || null;
  const existing = await client.query('SELECT id, name FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
  if (existing.rows.length) {
    userId = existing.rows[0].id;
    name = name || existing.rows[0].name;
  } else {
    // Contraseña aleatoria NO usable: entrará vía link de activación (reset_token).
    const randomHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
    const ins = await client.query(
      `INSERT INTO users (name, email, password_hash, role, is_active, created_at)
       VALUES ($1, $2, $3, 'client', TRUE, NOW()) RETURNING id`,
      [name || email, email, randomHash]
    );
    userId = ins.rows[0].id;
    created = true;
  }

  await client.query(
    `INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit)
     VALUES ($1, $2, TRUE, TRUE)
     ON CONFLICT (user_id, business_id) DO UPDATE SET is_owner = TRUE, can_edit = TRUE`,
    [userId, business.id]
  );
  await client.query('UPDATE businesses SET claimed_by = $1 WHERE id = $2', [userId, business.id]);
  await client.query("UPDATE users SET role = 'client' WHERE id = $1 AND role = 'user'", [userId]);

  return { userId, created, email, name };
}

// Genera y persiste un token de activación (reusa la columna reset_token que ya
// consume POST /auth/reset-password). Devuelve el token (para el link /?reset=).
async function issueActivationToken(client, userId, days = 7) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + days * 24 * 3600 * 1000);
  await client.query('UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3', [token, expiry, userId]);
  return token;
}

module.exports = { resolveClaimContact, ensureClaimOwner, issueActivationToken };
