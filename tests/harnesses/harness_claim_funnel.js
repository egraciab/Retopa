// CLAIM FUNNEL (Admin) + BADGE de claims — 2026-10-13.
// Monta el router REAL de admin.js (deps pesadas mockeadas) contra un Postgres
// efímero con el esquema de prod + la migración claim_events, y verifica:
//  - GET /admin/claims/funnel: activación, embudo por origen, motivos,
//    "abrieron y no terminaron" (WA normalizado, link vigente/vencido), días,
//    auth admin, y ready:false sin la tabla.
//  - GET /admin/dashboard: pending_leads ya NO cuenta claims ni promo_boost;
//    pending_claims = mismo criterio que la sección Claims.
// Uso: node harness_claim_funnel.js <ROOT del repo (…/opt/retopa)>
const path = require('path');
const http = require('http');
const ROOT = process.argv[2] || '/opt/retopa';
const SRC = path.join(ROOT, 'backend/src');

process.env.DB_HOST = process.env.PGHOST || '/tmp';
process.env.DB_PORT = process.env.PGPORT || '5499';
process.env.DB_NAME = 'retopa';
process.env.DB_USER = 'retopa';
process.env.DB_PASSWORD = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-secret-0123456789abcdef';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const mock = (rel, exports) => {
  const p = require.resolve(path.join(SRC, rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
mock('config/redis', { get: async () => null, setEx: async () => {}, set: async () => {}, keys: async () => [], del: async () => {}, isReady: false, on: () => {} });
mock('utils/kit-pdf', { buildKitBatchPdf: async () => Buffer.from('') });
mock('utils/sysnet', { getNetworkStats: async () => ({}) });
mock('helpers/notifyOwner', { notifyOwner: async () => {} });
mock('helpers/verifyFicha', { runVerifyFicha: async () => ({}) });
mock('config/mail', { sendEmail: async () => ({ success: true }), renderTemplate: async () => ({}) });

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: 'retopa', user: 'retopa' });
  const q = (s, p) => pool.query(s, p);

  const express = require('express');
  const jwt = require('jsonwebtoken');
  const router = require(path.join(SRC, 'routes/admin'));
  const app = express();
  app.use(express.json());
  app.use('/api/v2/admin', router);
  const server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const port = server.address().port;
  const ADMIN = 'Bearer ' + jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
  const CLIENT = 'Bearer ' + jwt.sign({ id: 2, role: 'client' }, process.env.JWT_SECRET);
  const get = (p, auth = ADMIN) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, headers: auth ? { Authorization: auth } : {} }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) {} resolve({ status: res.statusCode, body: j }); });
    }).on('error', reject);
  });

  // ── Datos ──────────────────────────────────────────────────────────────────
  await q('TRUNCATE claim_events');
  // Desde el login por WhatsApp el badge de Claims también suma los pedidos de acceso.
  await q("DO $$ BEGIN IF to_regclass('public.access_requests') IS NOT NULL THEN DELETE FROM access_requests; END IF; END $$");
  await q("DELETE FROM user_businesses; DELETE FROM service_leads; DELETE FROM users WHERE email LIKE '%@harness.test'; DELETE FROM businesses WHERE slug LIKE 'h-%'");
  await q("INSERT INTO site_config (key, value) VALUES ('site_url','https://retopa.test') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value").catch(() => {});
  const ins = async (name, slug, extra = {}) => (await q(
    `INSERT INTO businesses (name, slug, is_active, whatsapp, phone, city, claim_token, claim_expires_at, claim_status)
     VALUES ($1,$2,TRUE,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [name, slug, extra.whatsapp || null, extra.phone || null, extra.city || null, extra.token || null, extra.exp || null, extra.status || null])).rows[0].id;
  const T1 = '1'.repeat(64), T2 = '2'.repeat(64), T3 = '3'.repeat(64), T5 = '5'.repeat(64);
  const B1 = await ins('Ferretería <b>Uno</b>', 'h-uno', { whatsapp: '0981 123 456', city: 'Luque', token: T1, exp: new Date(Date.now() + 9e8) });
  const B2 = await ins('Panadería Dos', 'h-dos', { phone: '021 555 555', token: T2, exp: new Date(Date.now() - 9e7) });
  const B3 = await ins('Taller Tres', 'h-tres', { whatsapp: '+595 982 000 111', token: T3, exp: new Date(Date.now() + 9e8), status: 'approved' });
  const B4 = await ins('Kiosco Cuatro', 'h-cuatro', { status: 'pending' });
  const B5 = await ins('Vieja Cinco', 'h-cinco', { phone: '0983999888', token: T5, exp: new Date(Date.now() + 9e8) });
  const U3 = (await q("INSERT INTO users (email, password_hash, name, role, last_seen_at) VALUES ('tres@harness.test','x','Tres','client', NOW()) RETURNING id")).rows[0].id;
  await q('INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit) VALUES ($1,$2,TRUE,TRUE)', [U3, B3]);

  const ev = (event, b, extra = {}) => q(
    `INSERT INTO claim_events (event, business_id, user_id, canal, source, visit, reason, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() - make_interval(mins => $8))`,
    [event, b, extra.user || null, extra.canal || 'token', extra.source || null, extra.visit || null, extra.reason || null, extra.ago || 5]);
  await ev('link_opened', B1, { source: 'wa', visit: 'v1', ago: 120 });
  await ev('link_opened', B1, { source: 'wa', visit: 'v1b', ago: 90 });
  await ev('form_started', B1, { source: 'wa', visit: 'v1b', ago: 89 });
  await ev('form_error', B1, { source: 'wa', visit: 'v1b', reason: 'password_short', ago: 88 });
  await ev('link_opened', B2, { source: 'notify', visit: 'v2', ago: 300 });
  await ev('link_opened', B3, { source: 'wa', visit: 'v3', ago: 200 });
  await ev('form_started', B3, { source: 'wa', visit: 'v3', ago: 199 });
  await ev('submit_ok', B3, { source: 'wa', visit: 'v3', user: U3, ago: 198 });
  await ev('approved', B3, { canal: 'admin', ago: 100 });
  await ev('submit_ok', B4, { canal: 'ficha', ago: 50 });
  await ev('link_invalid', null, { source: 'notify', ago: 40 });
  await ev('link_opened', B5, { source: 'wa', visit: 'v5', ago: 60 * 24 * 10 }); // hace 10 días

  // service_leads: 1 lead real + 1 claim + 1 promo_boost, todos pending
  await q(`INSERT INTO service_leads (business_id, business_name, service_type, status) VALUES
           ($1,'x','basic','pending'), ($2,'x','claim','pending'), ($1,'x','promo_boost','pending')`, [B1, B4]);

  // ── Dashboard (badge) ──────────────────────────────────────────────────────
  const d = await get('/api/v2/admin/dashboard');
  check('GET /dashboard → 200', d.status === 200 && d.body && d.body.success, d.status + ' ' + JSON.stringify(d.body || {}).slice(0, 160));
  const st = (d.body && d.body.stats) || {};
  check('pending_leads ya NO cuenta claim ni promo_boost (=1)', st.pending_leads === 1, String(st.pending_leads));
  check('pending_claims = fichas con claim pendiente (=1)', st.pending_claims === 1, String(st.pending_claims));

  // ── Embudo ─────────────────────────────────────────────────────────────────
  let r = await get('/api/v2/admin/claims/funnel?days=30');
  check('GET /claims/funnel → 200 ready', r.status === 200 && r.body.success && r.body.ready === true && r.body.days === 30);
  const t = r.body.total || {};
  check('total: 4 fichas vieron su link en 30 d', t.fichas_vistas === 4, JSON.stringify(t));
  check('total: visitas deduplicadas (5)', t.visitas === 5, String(t.visitas));
  check('total: iniciaron 2 · frenados 1 · enviaron 2 · aprobados 1 · entró 1',
    t.iniciaron_form === 2 && t.frenados_validacion === 1 && t.enviaron === 2 && t.aprobados === 1 && t.dueno_entro === 1, JSON.stringify(t));
  check('total: 1 link muerto', t.links_muertos === 1);
  const byO = Object.fromEntries((r.body.embudo || []).map(x => [x.origen, x]));
  check('por origen: wa, notify y boton_ficha', byO.wa && byO.notify && byO.boton_ficha, Object.keys(byO).join(','));
  check('por origen: wa vio 3, envió 1, aprobado 1', byO.wa && byO.wa.fichas_vistas === 3 && byO.wa.enviaron === 1 && byO.wa.aprobados === 1);
  check('por origen: el aprobado (admin) se atribuye al canal que lo trajo', byO.admin === undefined && !byO['(sin origen)']);
  check('por origen: ordenado por fichas vistas', (r.body.embudo || [])[0].origen === 'wa');
  check('motivos: password_short ×1', (r.body.motivos || []).length === 1 && r.body.motivos[0].reason === 'password_short' && r.body.motivos[0].n === 1);
  const ab = r.body.abandonos || [];
  check('abandonos: B1, B2 y B5 (no el enviado ni el aprobado)', ab.map(x => x.id).sort().join() === [B1, B2, B5].sort().join(), ab.map(x => x.nombre).join(' | '));
  check('abandonos: el más reciente primero', ab[0] && ab[0].id === B1);
  const a1 = ab.find(x => x.id === B1) || {}, a2 = ab.find(x => x.id === B2) || {}, a5 = ab.find(x => x.id === B5) || {};
  check('abandono B1: último paso form_error, 2 visitas, origen wa', a1.ultimo_paso === 'form_error' && a1.visitas === 2 && a1.origen === 'wa');
  check('abandono B1: WhatsApp normalizado 595981123456', a1.wa === '595981123456', a1.wa);
  check('abandono B1: link vigente con utm_source=wa_seguimiento', a1.claim_url === `https://retopa.test/reclamar/?token=${T1}&utm_source=wa_seguimiento`, a1.claim_url);
  check('abandono B2: línea fija → sin WhatsApp', a2.wa === null);
  check('abandono B2: token vencido → sin link', a2.claim_url === null);
  check('abandono B5: celular tomado de phone (0983…)', a5.wa === '595983999888', a5.wa);
  check('abandonos: no expone token crudo fuera del link', !('claim_token' in a1));

  r = await get('/api/v2/admin/claims/funnel?days=7');
  check('days=7: la ficha de hace 10 días queda afuera', r.body.days === 7 && !(r.body.abandonos || []).some(x => x.id === B5) && r.body.total.fichas_vistas === 3);
  r = await get("/api/v2/admin/claims/funnel?days=1;DROP%20TABLE%20claim_events");
  check('days inválido → 30 (sin inyección)', r.status === 200 && r.body.days === 30);
  check('activación: viene de v_duenos_activacion', r.body.activacion && 'entraron_alguna_vez' in r.body.activacion);

  r = await get('/api/v2/admin/claims/funnel', null);
  check('sin token → 401', r.status === 401);
  r = await get('/api/v2/admin/claims/funnel', CLIENT);
  check('rol cliente → 403', r.status === 403);

  await q('ALTER TABLE claim_events RENAME TO claim_events_off');
  r = await get('/api/v2/admin/claims/funnel');
  check('sin migración → ready:false (no rompe Claims)', r.status === 200 && r.body.success && r.body.ready === false);
  await q('ALTER TABLE claim_events_off RENAME TO claim_events');

  server.close(); await pool.end();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
