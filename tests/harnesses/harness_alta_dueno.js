// ALTA → DUEÑO (2026-10-17). Caso "El Empanadero": alta por el formulario viejo,
// el admin la verificó desde el Lead y la ficha quedó SIN dueño.
// directory.js + admin.js + helpers REALES contra Postgres efímero.
// Uso: node harness_alta_dueno.js <ROOT del repo (…/opt/retopa)>
const path = require('path');
const http = require('http');
const ROOT = process.argv[2] || '/opt/retopa';
const SRC = path.join(ROOT, 'backend/src');
process.env.DB_HOST = process.env.PGHOST || '/tmp'; process.env.DB_PORT = process.env.PGPORT || '5499';
process.env.DB_NAME = 'retopa'; process.env.DB_USER = 'retopa'; process.env.DB_PASSWORD = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-secret-0123456789abcdef';
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const mock = (rel, exports) => { const p = require.resolve(path.join(SRC, rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
const mails = [];
mock('config/redis', { get: async () => null, setEx: async () => {}, set: async () => {}, keys: async () => [], del: async () => {}, on: () => {} });
mock('utils/kit-pdf', { buildKitBatchPdf: async () => Buffer.from('') });
mock('utils/sysnet', { getNetworkStats: async () => ({}) });
mock('utils/pwa-icon', { getPwaIcon: async () => null });
mock('helpers/notifyOwner', { notifyOwner: async () => {} });
mock('config/mail', { sendEmail: async (to, tpl, data) => { mails.push({ to, tpl, data }); return { success: true }; }, renderTemplate: async () => ({}) });

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: 'retopa', user: 'retopa' });
  const q = (s, p) => pool.query(s, p);
  const express = require('express'), jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs');
  async function cleanup() {
    const ids = (await q("SELECT id FROM businesses WHERE slug LIKE 'ad-%' OR name LIKE 'AD %'")).rows.map(r => r.id);
    if (ids.length) {
      await q('DELETE FROM sales_signals WHERE business_id = ANY($1)', [ids]).catch(() => {});
      await q('DELETE FROM service_leads WHERE business_id = ANY($1)', [ids]);
      await q('DELETE FROM businesses WHERE id = ANY($1)', [ids]);
    }
    await q("DELETE FROM users WHERE email LIKE '%@ad.test' OR name LIKE 'AD %'");
  }
  await cleanup();
  const h = await bcrypt.hash('x', 4);
  const ADM = (await q(`INSERT INTO users (email, password_hash, name, role, phone) VALUES ('adm@ad.test',$1,'AD Admin','admin','+595991000999') RETURNING id`, [h])).rows[0].id;
  const OTHER = (await q(`INSERT INTO users (email, password_hash, name, role) VALUES ('otro@ad.test',$1,'AD Otro','client') RETURNING id`, [h])).rows[0].id;

  const app = express(); app.use(express.json());
  app.use('/api/v2/admin', require(path.join(SRC, 'routes/admin')));
  app.use('/api/v2', require(path.join(SRC, 'routes/directory')));
  const server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const port = server.address().port;
  const ADMIN = 'Bearer ' + jwt.sign({ id: ADM, role: 'admin' }, process.env.JWT_SECRET);
  const call = (method, p, body, auth = null) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, path: p, method,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...(auth ? { Authorization: auth } : {}) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) {} resolve({ status: res.statusCode, body: j }); }); });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
  const ownerOf = async id => (await q('SELECT user_id FROM user_businesses WHERE business_id=$1 AND is_owner', [id])).rows.map(r => r.user_id);

  // ── 1) El formulario viejo (POST /leads) ahora deja la ficha CON dueño ──────
  let r = await call('POST', '/api/v2/leads', { plan_type: 'basic', name: 'AD El Empanadero', phone: '0994 207 691', email: 'lauro@ad.test',
    contact_name: 'AD El Empanadero', contact_email: 'lauro@ad.test', city: 'Luque', user_id: OTHER });
  const B1 = r.body && r.body.data && r.body.data.business;
  const u1 = (await q("SELECT * FROM users WHERE email='lauro@ad.test'")).rows[0];
  check('alta por el formulario viejo: crea la cuenta pendiente (como antes)', r.status === 201 && u1 && u1.password_hash === '!pending-no-password!');
  check('…y la ficha YA es suya (antes quedaba huérfana hasta activar)', B1 && (await ownerOf(B1.id)).includes(u1.id), JSON.stringify(await ownerOf(B1.id)));
  check('…con el WhatsApp del alta en su cuenta (para entrar con WhatsApp)', u1 && u1.phone === '+595994207691', u1 && u1.phone);
  check('SEGURIDAD: el user_id del body se ignora (la ficha no es de "AD Otro")', !(await ownerOf(B1.id)).includes(OTHER));
  check('…y le llega el correo de activación (sin cambios)', mails.some(m => m.to === 'lauro@ad.test' && m.tpl === 'activateAccount'));

  // ── 2) Un alta ya HUÉRFANA (como la de anoche) → "Verificar ficha" la asigna ─
  const mk = async (name, slug, email, phone, notes = {}) => {
    const id = (await q(`INSERT INTO businesses (name, slug, phone, city, verified, is_active) VALUES ($1,$2,$3,'Luque',FALSE,TRUE) RETURNING id`, [name, slug, phone])).rows[0].id;
    const lid = (await q(`INSERT INTO service_leads (business_id, business_name, service_type, status, contact_name, contact_email, contact_phone, notes)
        VALUES ($1,$2,'basic','pending',$2,$3,$4,$5) RETURNING id`, [id, name, email, phone, JSON.stringify({ source: 'web_registration', ...notes })])).rows[0].id;
    return { id, lid };
  };
  const PEND = (await q(`INSERT INTO users (email, password_hash, name, role, is_active, email_verified) VALUES ('emp@ad.test','!pending-no-password!','AD Empanadero','user',TRUE,FALSE) RETURNING id`)).rows[0].id;
  const O = await mk('AD Empanadero Huérfano', 'ad-huerfano', 'EMP@ad.test', '595994207692');
  mails.length = 0;
  r = await call('POST', `/api/v2/admin/leads/${O.lid}/verify-ficha`, {}, ADMIN);
  check('Verificar ficha: OK y avisa a quién quedó asignada (con la fuente)', r.status === 200 && r.body.owner_linked && r.body.owner_linked.userId === PEND && /correo del formulario/.test(r.body.owner_linked.via), JSON.stringify(r.body && r.body.owner_linked));
  check('…la ficha queda verificada y CON dueño', (await q('SELECT verified FROM businesses WHERE id=$1', [O.id])).rows[0].verified === true && (await ownerOf(O.id)).includes(PEND));
  const up = (await q('SELECT role, phone FROM users WHERE id=$1', [PEND])).rows[0];
  check('…la cuenta pasa a cliente y toma el WhatsApp del formulario (no tenía)', up.role === 'client' && up.phone === '+595994207692', JSON.stringify(up));
  check('…el correo "verificada" le llega a SU correo', mails.some(m => m.tpl === 'verified' && m.to === 'emp@ad.test'), JSON.stringify(mails.map(m => [m.to, m.tpl])));
  const nt = r.body.notify || {};
  check('…y "Avisar por WhatsApp" con su link de acceso (correo marcado como enviado)', nt.wa === '595994207692' && /\?acceso=/.test(nt.message) && /verificado/.test(nt.message) && nt.emailed === true, JSON.stringify(nt));

  const PEND3 = (await q(`INSERT INTO users (email, password_hash, name, role, is_active) VALUES ('emp3@ad.test','!pending-no-password!','El Empanadero','user',TRUE) RETURNING id`)).rows[0].id;
  const O3 = await mk('El Empanadero', 'ad-emp3', 'emp3@ad.test', '0994 207 693');
  await q("UPDATE businesses SET name = 'AD El Empanadero 3' WHERE id = $1", [O3.id]);
  await q("UPDATE users SET name = 'AD El Empanadero 3' WHERE id = $1", [PEND3]);
  r = await call('POST', `/api/v2/admin/leads/${O3.lid}/verify-ficha`, {}, ADMIN);
  check('cuenta con el nombre del negocio: el aviso dice "¡Hola!" (no "¡Hola AD!")', /^¡Hola! /.test((r.body.notify || {}).message || ''), (r.body.notify || {}).message);

  // ── 3) Abstenerse cuando no hay a quién asignarla con fuente ─────────────────
  const N = await mk('AD Sin Cuenta', 'ad-sin-cuenta', 'nadie@ad.test', '0981000111');
  r = await call('POST', `/api/v2/admin/leads/${N.lid}/verify-ficha`, {}, ADMIN);
  check('sin cuenta que coincida: verifica pero NO inventa dueño', r.status === 200 && !r.body.owner_linked && (await ownerOf(N.id)).length === 0 && !r.body.notify);
  await q(`INSERT INTO users (email, password_hash, name, role, phone) VALUES ('a1@ad.test',$1,'AD Uno','client','+595981333444'), ('a2@ad.test',$1,'AD Dos','client','0981333444')`, [h]);
  const AMB = await mk('AD Ambiguo', 'ad-ambiguo', null, '0981 333 444');
  r = await call('POST', `/api/v2/admin/leads/${AMB.lid}/verify-ficha`, {}, ADMIN);
  check('mismo WhatsApp en DOS cuentas: se abstiene', !r.body.owner_linked && (await ownerOf(AMB.id)).length === 0);
  const ADMF = await mk('AD Del Admin', 'ad-del-admin', 'adm@ad.test', '0991000999');
  r = await call('POST', `/api/v2/admin/leads/${ADMF.lid}/verify-ficha`, {}, ADMIN);
  check('nunca se asigna a una cuenta admin/GodMode', !r.body.owner_linked && (await ownerOf(ADMF.id)).length === 0);
  const UID = (await q(`INSERT INTO users (email, password_hash, name, role) VALUES ('uid@ad.test',$1,'AD Por Id','client') RETURNING id`, [h])).rows[0].id;
  const BY = await mk('AD Por Cuenta', 'ad-por-cuenta', 'otro-correo@ad.test', null, { user_id: UID });
  r = await call('POST', `/api/v2/admin/leads/${BY.lid}/verify-ficha`, {}, ADMIN);
  check('la cuenta guardada por el alta (notes.user_id) tiene prioridad', r.body.owner_linked && r.body.owner_linked.userId === UID && /cuenta que hizo el alta/.test(r.body.owner_linked.via));

  // ── 4) Con dueño: no se toca ─────────────────────────────────────────────────
  r = await call('POST', `/api/v2/admin/leads/${O.lid}/verify-ficha`, {}, ADMIN);
  check('volver a verificar una ficha con dueño: no cambia nada', r.status === 200 && !r.body.owner_linked && JSON.stringify(await ownerOf(O.id)) === JSON.stringify([PEND]));

  // ── 5) Lista de Leads: ¿tiene dueño? ─────────────────────────────────────────
  r = await call('GET', '/api/v2/admin/leads?limit=200&view=all', null, ADMIN);
  const rows = (r.body && r.body.data) || [];
  const rowO = rows.find(x => x.id === O.lid), rowN = rows.find(x => x.id === N.lid);
  check('Leads: business_has_owner (true en la asignada, false en la huérfana)', rowO && rowO.business_has_owner === true && rowN && rowN.business_has_owner === false);

  // ── 6) "Asignar a quien la registró" en una ya verificada (idempotente) ─────
  await q(`INSERT INTO users (email, password_hash, name, role) VALUES ('nadie@ad.test',$1,'AD Apareció','client')`, [h]);
  r = await call('POST', `/api/v2/admin/leads/${N.lid}/verify-ficha`, {}, ADMIN);
  check('ficha ya verificada sin dueño: el mismo botón ahora la asigna', r.body.owner_linked && (await ownerOf(N.id)).length === 1);

  // ── 7) Verificar desde Empresas también asigna ───────────────────────────────
  const PEND2 = (await q(`INSERT INTO users (email, password_hash, name, role, is_active) VALUES ('emp2@ad.test','!pending-no-password!','AD Dos Pend','user',TRUE) RETURNING id`)).rows[0].id;
  const E = await mk('AD Desde Empresas', 'ad-desde-empresas', 'emp2@ad.test', '0994 111 222');
  r = await call('PATCH', `/api/v2/admin/businesses/${E.id}/verify`, { verified: true }, ADMIN);
  await new Promise(res => setTimeout(res, 400));
  check('Empresas → Verificar: también la deja a nombre de quien la registró', r.status === 200 && (await ownerOf(E.id)).includes(PEND2));

  await cleanup();
  await q("DELETE FROM users WHERE email LIKE '%@ad.test'");
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  server.close(); await pool.end(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
