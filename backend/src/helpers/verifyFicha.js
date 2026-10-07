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

  return { bizId, bizName, didVerify, opportunityCreated: oppRes.rowCount > 0 };
}

module.exports = { runVerifyFicha };
