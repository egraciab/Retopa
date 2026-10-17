/**
 * RetoPA — helpers/verifyFicha.js
 * Núcleo transaccional de "Verificar ficha" desde un Lead de captación.
 *
 * Ejecuta, dentro de una transacción ABIERTA por el llamador (client con BEGIN),
 * los 3 pasos del flujo captación → conversión:
 *   1) Verifica la ficha (businesses.verified) sólo en la transición no-verif → verif.
 *   2) Pasa el service_lead a estado de CAPTACIÓN 'verificado' (no es una venta).
 *   3) Crea una Oportunidad de onboarding/bienvenida en sales_signals, SIN asignar
 *      (assigned_ambassador_id NULL) para que el admin la derive luego a un embajador.
 *      Idempotente por negocio: no duplica si ya hay una 'onboarding' activa.
 *
 * NO hace COMMIT/ROLLBACK, ni envía correos, ni toca cachés: eso queda a cargo
 * del endpoint (o del test), para mantener el helper puro y determinista.
 *
 * @returns {Promise<{error?:string, bizId?:number, didVerify?:boolean,
 *                     opportunityCreated?:boolean, bizName?:string}>}
 *          error: 'NOT_FOUND' | 'NO_BUSINESS'
 */
async function runVerifyFicha(client, leadId, cfg = {}) {
  const leadRes = await client.query(
    'SELECT id, business_id, status, contact_name FROM service_leads WHERE id=$1', [leadId]
  );
  if (!leadRes.rows.length) return { error: 'NOT_FOUND' };
  const lead = leadRes.rows[0];
  const bizId = lead.business_id;
  if (!bizId) return { error: 'NO_BUSINESS' };

  // 0) DUEÑO (2026-10-17): verificar el alta también la deja en manos de quien la
  //    registró, si la ficha todavía no tiene dueño. Antes la ficha quedaba
  //    "verificada" pero huérfana y el dueño no la veía en Mi Portal.
  const ownerLinked = await linkRegistrantOwner(client, bizId, leadId);

  // 1) Verificar la ficha (sólo transición no-verificada → verificada)
  const vres = await client.query(
    'UPDATE businesses SET verified=TRUE, updated_at=NOW() WHERE id=$1 AND verified IS DISTINCT FROM TRUE RETURNING id',
    [bizId]
  );
  const didVerify = vres.rowCount > 0;

  // 2) El lead pasa a estado de CAPTACIÓN 'verificado' (ya no 'won')
  await client.query("UPDATE service_leads SET status='verificado', updated_at=NOW() WHERE id=$1", [leadId]);

  // 3) Oportunidad de onboarding SIN asignar (guarda contra duplicado activo por negocio)
  const ttlRaw = parseInt(cfg.signal_onboarding_ttl_days);
  const ttl = Number.isFinite(ttlRaw) && ttlRaw > 0 ? ttlRaw : 21;
  const bizRow = await client.query(
    "SELECT COALESCE(NULLIF(TRIM(trade_name),''), name) AS bizname, ruc, city FROM businesses WHERE id=$1", [bizId]
  );
  const bizName = bizRow.rows[0]?.bizname || lead.contact_name || 'la ficha';
  const defMsg = `¡${bizName} se sumó a RetoPA y ya está verificada! Contactá al dueño para darle la bienvenida, ayudarlo a completar su ficha y presentarle los planes. Es el mejor momento para acompañarlo.`;
  const tpl = (cfg.signal_msg_onb_bienvenida && String(cfg.signal_msg_onb_bienvenida).trim())
    ? String(cfg.signal_msg_onb_bienvenida).replace(/\{business\}/g, bizName)
    : defMsg;
  const evidence = JSON.stringify({
    business: bizName, ruc: bizRow.rows[0]?.ruc || null, city: bizRow.rows[0]?.city || null,
    source: 'lead_verify', lead_id: leadId
  });

  const oppRes = await client.query(`
    INSERT INTO sales_signals (business_id, trigger_key, product_target, status, assigned_ambassador_id, evidence, suggested_message, expires_at)
    SELECT $1::int, 'onb_bienvenida', 'onboarding', 'nueva', NULL, $2::jsonb, $3::text, NOW() + ($4::text||' days')::interval
    WHERE NOT EXISTS (
      SELECT 1 FROM sales_signals s
      WHERE s.business_id=$1::int AND s.product_target='onboarding' AND s.status IN ('nueva','vista','contactado')
    )
    RETURNING id`, [bizId, evidence, tpl, String(ttl)]);

  return { bizId, bizName, didVerify, opportunityCreated: oppRes.rowCount > 0, ownerLinked };
}

// ¿Quién registró la ficha? Con FUENTE, de la más fuerte a la más débil:
//   1) la cuenta que guardó el alta (notes.user_id)
//   2) la cuenta con el correo del formulario
//   3) la ÚNICA cuenta con el WhatsApp del formulario
// Si no hay ninguna (o hay ambigüedad), se abstiene: la asignás a mano.
// Nunca a una cuenta admin/GodMode. Devuelve {userId, name, via} o null.
async function linkRegistrantOwner(client, bizId, leadId) {
  const own = await client.query('SELECT 1 FROM user_businesses WHERE business_id=$1 AND is_owner LIMIT 1', [bizId]);
  if (own.rows.length) return null;
  const l = (await client.query(
    `SELECT contact_email, contact_phone,
            CASE WHEN notes IS JSON OBJECT THEN notes::jsonb ELSE '{}'::jsonb END AS n
       FROM service_leads WHERE id=$1`, [leadId])).rows[0] || {};
  const pick = async (sql, params, via) => {
    const r = await client.query(sql, params);
    return r.rows.length === 1 ? { userId: r.rows[0].id, name: r.rows[0].name, phone: r.rows[0].phone, via } : null;
  };
  const base = `SELECT id, name, phone FROM users WHERE is_active = TRUE AND role NOT IN ('admin','godmode')`;
  let u = null;
  const uid = parseInt(l.n && l.n.user_id, 10);
  if (uid) u = await pick(`${base} AND id = $1`, [uid], 'la cuenta que hizo el alta');
  const email = String(l.contact_email || '').trim().toLowerCase();
  if (!u && email.includes('@')) u = await pick(`${base} AND lower(email) = $1`, [email], 'el correo del formulario de alta');
  const d = String(l.contact_phone || '').replace(/\D/g, '');
  const m = d.match(/^(?:595|0)?(9\d{8})$/);
  if (!u && m) u = await pick(`${base} AND right(regexp_replace(COALESCE(phone,''),'\\D','','g'), 9) = $1`, [m[1]], 'el WhatsApp del formulario de alta');
  if (!u) return null;

  await client.query(
    `INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit) VALUES ($1, $2, TRUE, TRUE)
     ON CONFLICT (user_id, business_id) DO UPDATE SET is_owner = TRUE, can_edit = TRUE`, [u.userId, bizId]);
  await client.query("UPDATE users SET role = 'client' WHERE id = $1 AND role = 'user'", [u.userId]);
  // Si la cuenta no tiene WhatsApp, el que dejó en el formulario (para que pueda entrar con él).
  if (m && !String(u.phone || '').trim()) {
    const taken = await client.query(
      `SELECT 1 FROM users WHERE id <> $1 AND right(regexp_replace(COALESCE(phone,''),'\\D','','g'), 9) = $2 LIMIT 1`, [u.userId, m[1]]);
    if (!taken.rows.length) {
      await client.query('UPDATE users SET phone = $2 WHERE id = $1', [u.userId, '+595' + m[1]]);
      u.phoneFilled = '+595' + m[1];
    }
  }
  return { userId: u.userId, name: u.name, via: u.via, phoneFilled: u.phoneFilled || null };
}

module.exports = { runVerifyFicha, linkRegistrantOwner };
