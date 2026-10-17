// claimEvents.js — instrumentación del embudo de reclamo/captación de fichas.
//
// Registra cada paso (link abierto, formulario iniciado, enviado, aprobado…) en
// la tabla claim_events para medir DÓNDE se cae la gente, en vez de suponerlo.
//
// Reglas:
//  - Fire & forget: NUNCA rompe ni demora el flujo del usuario (todo error se traga).
//  - Sin datos personales: ni IP, ni user-agent, ni email/teléfono. Solo ids,
//    el nombre del evento, el canal/origen y metadatos acotados.
//  - Lista blanca de eventos y de razones: lo que no está, no se guarda.
//  - Si la migración aún no corrió (tabla inexistente), no pasa nada.

const EVENTS = new Set([
  'link_opened',      // GET /claim/info OK (vio su ficha)
  'link_invalid',     // token inexistente
  'link_expired',     // token vencido
  'link_claimed',     // la ficha ya estaba reclamada/aprobada
  'form_started',     // primer toque en el formulario (frontend)
  'form_error',       // validación del formulario frenó el envío (frontend)
  'submit_ok',        // reclamo enviado
  'submit_error',     // el servidor rechazó el envío
  'approved',         // admin aprobó
  'access_granted',   // admin otorgó/reenvió acceso
  'rejected',         // admin rechazó
  // E1 (2026-10-13)
  'auto_approved',    // reclamo con token confirmado → aprobado automático (provisorio)
  'not_mine',         // "No, no es mío" desde el link
  'reviewed',         // admin confirmó un reclamo automático
  'reverted',         // admin revirtió un reclamo automático
]);

// Eventos que el FRONTEND puede reportar vía POST /claim/event (el resto los
// registra solo el backend, donde ocurren).
const CLIENT_EVENTS = new Set(['form_started', 'form_error']);

const REASONS = new Set([
  'name_missing', 'email_invalid', 'password_short', 'missing_fields',
  'token_invalid', 'expired', 'already_claimed', 'server', 'network',
  // E1
  'rubro_missing', 'whatsapp_invalid', 'email_exists', 'owner_exists',
]);

const CANALES = new Set(['token', 'ficha', 'admin']);

// Normaliza strings cortos (origen utm, visit id): minúsculas, [a-z0-9_-], ≤ max.
function clean(v, max) {
  if (v == null) return null;
  const s = String(v).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, max);
  return s || null;
}

function toIntOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * logClaimEvent(pool, { event, businessId, userId, canal, source, visit, reason })
 * Devuelve la promesa (los call sites la ignoran; los tests la pueden await).
 */
function logClaimEvent(pool, ev) {
  try {
    if (!pool || !ev || !EVENTS.has(ev.event)) return Promise.resolve(false);
    const canal  = CANALES.has(ev.canal) ? ev.canal : null;
    const reason = REASONS.has(ev.reason) ? ev.reason : null;
    return pool.query(
      `INSERT INTO claim_events (event, business_id, user_id, canal, source, visit, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ev.event, toIntOrNull(ev.businessId), toIntOrNull(ev.userId), canal,
       clean(ev.source, 24), clean(ev.visit, 32), reason]
    ).then(() => true).catch(() => false);
  } catch (e) { return Promise.resolve(false); }
}

module.exports = { logClaimEvent, EVENTS, CLIENT_EVENTS, REASONS, clean };
