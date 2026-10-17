// LOGIN CON WHATSAPP O CORREO · CONTRASEÑA OPCIONAL · PEDIDOS DE ACCESO (2026-10-13)
// Routers REALES (auth-public, client, admin) contra Postgres efímero con el
// esquema de prod + migraciones (claim_events, reclamo_e1, login_whatsapp).
// Uso: node harness_login_wa.js <ROOT del repo (…/opt/retopa)>
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mock = (rel, exports) => { const p = require.resolve(path.join(SRC, rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
const sent = [];
mock('config/redis', { get: async () => null, setEx: async () => {}, set: async () => {}, keys: async () => [], del: async () => {}, isReady: false, on: () => {} });
mock('utils/kit-pdf', { buildKitBatchPdf: async () => Buffer.from(''), buildKitPdf: async () => Buffer.from('') });
mock('utils/sysnet', { getNetworkStats: async () => ({}) });
mock('helpers/notifyOwner', { notifyOwner: async () => {} });
mock('helpers/verifyFicha', { runVerifyFicha: async () => ({}) });
mock('config/mail', { sendEmail: async (to, template, data) => { sent.push({ to, template, data }); return { success: true }; }, renderTemplate: async () => ({}) });

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: 'retopa', user: 'retopa' });
  const q = (s, p) => pool.query(s, p);
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const bcrypt = require('bcryptjs');

  // ── Migración: relleno inicial de password_set_at (se recrea la columna) ────
  // Base efímera: se saca la columna, se cargan 3 casos y se corre el SQL real.
  await q('ALTER TABLE users DROP COLUMN IF EXISTS password_set_at');
  await q(`DELETE FROM claim_snapshots WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'bf-%@harness.test');
           DELETE FROM users WHERE email LIKE 'bf-%@harness.test'`);
  const realHash = await bcrypt.hash('x', 4);
  await q(`INSERT INTO users (email, password_hash, name, role) VALUES ('bf-real@harness.test',$1,'r','client'),
           ('bf-pending@harness.test','!pending-no-password!','p','user'), ('bf-e1@harness.test',$1,'e','client')`, [realHash]);
  const bfBiz = (await q("INSERT INTO businesses (name, slug, is_active) VALUES ('bf','lw-bf',TRUE) RETURNING id")).rows[0].id;
  await q(`INSERT INTO claim_snapshots (business_id, user_id, snapshot) SELECT $1, id, '{}'::jsonb FROM users WHERE email='bf-e1@harness.test'`, [bfBiz]);
  const fs = require('fs');
  await q(fs.readFileSync(path.join(ROOT, 'sql/2026-10-13_login_whatsapp.sql'), 'utf8'));
  await q(fs.readFileSync(path.join(ROOT, 'sql/2026-10-13_login_whatsapp.sql'), 'utf8')); // idempotente

  // ── Estado de la migración ─────────────────────────────────────────────────
  const col = (await q("SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_set_at'")).rows.length;
  check('migración: users.password_set_at existe', col === 1);
  check('migración: tabla access_requests', (await q("SELECT to_regclass('access_requests') AS t")).rows[0].t === 'access_requests');
  check('migración: índice por dígitos del teléfono', (await q("SELECT 1 FROM pg_indexes WHERE indexname='idx_users_phone_digits'")).rows.length === 1);
  const bf = (await q("SELECT email, password_set_at FROM users WHERE email IN ('bf-real@harness.test','bf-pending@harness.test','bf-e1@harness.test') ORDER BY email")).rows;
  const bfm = Object.fromEntries(bf.map(r => [r.email, r.password_set_at]));
  check('relleno inicial: con contraseña real → marcada', !!bfm['bf-real@harness.test']);
  check('relleno inicial: placeholder de altas → sin marcar', bfm['bf-pending@harness.test'] === null);
  check('relleno inicial: reclamó por enlace → sin marcar', bfm['bf-e1@harness.test'] === null);

  // ── Datos ──────────────────────────────────────────────────────────────────
  await q(`DELETE FROM access_requests; DELETE FROM user_businesses WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@lw.test' OR phone LIKE '+59598%');
           DELETE FROM users WHERE email LIKE '%@lw.test' OR (email IS NULL AND phone LIKE '+59598%'); DELETE FROM businesses WHERE slug LIKE 'lw-%'`);
  await q("INSERT INTO site_config (key, value) VALUES ('site_url','https://dev.retopa.test'),('site_name','RetoPA'),('social_whatsapp','https://wa.me/595986484905') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value");
  const h = await bcrypt.hash('clave-segura-1', 10);
  const rnd = await bcrypt.hash('random-que-nadie-sabe', 10);
  const mkU = async (email, phone, hash, pset, role = 'client', name = 'Usuario') => (await q(
    `INSERT INTO users (email, password_hash, name, role, is_active, phone, password_set_at) VALUES ($1,$2,$3,$4,TRUE,$5,$6) RETURNING id`,
    [email, hash, name, role, phone, pset ? new Date() : null])).rows[0].id;
  const UA = await mkU('ana@lw.test', '0981 123 456', h, true, 'client', 'Ana Pérez');      // con contraseña, teléfono en formato local
  const UB = await mkU(null, '+595982000111', rnd, false, 'client', 'Beto');                // reclamó por enlace, sin correo ni contraseña
  const UC = await mkU('caro@lw.test', '+595983333333', rnd, false, 'client', 'Caro');       // sin contraseña, con correo
  const BB = (await q("INSERT INTO businesses (name, slug, is_active) VALUES ('Taller Beto','lw-beto',TRUE) RETURNING id")).rows[0].id;
  await q('INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit) VALUES ($1,$2,TRUE,TRUE)', [UB, BB]);

  const app = express();
  app.use(express.json());
  app.use('/api/v2/auth', require(path.join(SRC, 'routes/auth-public')));
  app.use('/api/v2/client', require(path.join(SRC, 'routes/client')));
  app.use('/api/v2/admin', require(path.join(SRC, 'routes/admin')));
  const server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const port = server.address().port;
  const call = (method, p, body, auth) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, path: p, method,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...(auth ? { Authorization: auth } : {}) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) {} resolve({ status: res.statusCode, body: j }); }); });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
  const login = (email, password) => call('POST', '/api/v2/auth/login', { email, password });
  const ADMIN = 'Bearer ' + jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);

  // ── Login con WhatsApp ─────────────────────────────────────────────────────
  for (const f of ['+595981123456', '0981 123 456', '981123456', '+595 981-123-456']) {
    const r = await login(f, 'clave-segura-1');
    check(`WhatsApp "${f}" + contraseña → entra`, r.status === 200 && r.body.token && r.body.user.id === UA, JSON.stringify(r.body).slice(0, 80));
  }
  let r = await login('+595981123456', 'mal');
  check('WhatsApp con contraseña incorrecta → 401 "Credenciales inválidas"', r.status === 401 && r.body.code !== 'NO_PASSWORD');
  r = await login('+595982000111', 'loquesea');
  check('WhatsApp de quien no creó contraseña → NO_PASSWORD (lo guía a entrar sin contraseña)', r.status === 401 && r.body.code === 'NO_PASSWORD', JSON.stringify(r.body));
  r = await login('+595987777777', 'x');
  check('WhatsApp sin cuenta → 401', r.status === 401 && r.body.code !== 'NO_PASSWORD');
  r = await login('021 555 555', 'x');
  check('teléfono fijo / inválido → 400 con mensaje claro', r.status === 400 && /WhatsApp/.test(r.body.error));

  // ── Login con correo (regresión + NO_PASSWORD) ─────────────────────────────
  r = await login('ana@lw.test', 'clave-segura-1');
  check('correo + contraseña → entra (como siempre)', r.status === 200 && r.body.user.id === UA);
  r = await login('caro@lw.test', 'x');
  check('correo de quien no creó contraseña → NO_PASSWORD', r.status === 401 && r.body.code === 'NO_PASSWORD');
  r = await login('ana@lw.test', '');
  check('sin contraseña → 401 (no 500)', r.status === 401);

  // ── Entrar sin contraseña ──────────────────────────────────────────────────
  sent.length = 0;
  r = await call('POST', '/api/v2/auth/access-request', { identifier: 'caro@lw.test' });
  await sleep(100);
  const mail1 = sent.find(s => s.template === 'accessLink');
  check('correo → le llega el link de acceso', r.status === 200 && r.body.mode === 'email' && mail1 && mail1.to === 'caro@lw.test' && /\?acceso=[a-f0-9]{64}$/.test(mail1.data.url));
  r = await call('POST', '/api/v2/auth/access-link', { token: mail1.data.url.split('acceso=')[1] });
  check('el link del correo da sesión', r.status === 200 && r.body.user.id === UC);
  sent.length = 0;
  const rx = await call('POST', '/api/v2/auth/access-request', { identifier: 'noexiste@lw.test' });
  check('correo sin cuenta → misma respuesta, sin correo enviado (no revela)', rx.status === 200 && rx.body.message === r.body.message || (rx.status === 200 && sent.length === 0));

  sent.length = 0;
  r = await call('POST', '/api/v2/auth/access-request', { identifier: '+595982000111' });
  check('WhatsApp → abre el WhatsApp de RetoPA (soporte desde site_config)', r.status === 200 && r.body.mode === 'whatsapp' && r.body.support_wa === '595986484905', JSON.stringify(r.body));
  check('WhatsApp → mensaje armado con su número', /quiero entrar a mi panel/i.test(r.body.wa_message) && /\+595 982 000 111/.test(r.body.wa_message), r.body.wa_message);
  const ar = (await q("SELECT * FROM access_requests WHERE phone='+595982000111'")).rows;
  check('WhatsApp → queda el pedido para el admin, con su cuenta', ar.length === 1 && ar[0].user_id === UB);
  r = await call('POST', '/api/v2/auth/access-request', { identifier: '0983 333 333' });
  await sleep(100);
  check('WhatsApp de alguien CON correo → además le llega el link solo', sent.some(s => s.template === 'accessLink' && s.to === 'caro@lw.test'));
  r = await call('POST', '/api/v2/auth/access-request', { identifier: '0989 999 999' });
  check('WhatsApp sin cuenta → misma respuesta; pedido sin cuenta', r.status === 200 && r.body.mode === 'whatsapp'
        && (await q("SELECT user_id FROM access_requests WHERE phone='+595989999999'")).rows[0].user_id === null);
  r = await call('POST', '/api/v2/auth/access-request', { identifier: '021 555 555' });
  check('número inválido → 400', r.status === 400);

  // ── Admin: pedidos de acceso ───────────────────────────────────────────────
  await call('POST', '/api/v2/auth/access-request', { identifier: '+595982000111' }); // repetido
  r = await call('GET', '/api/v2/admin/access-requests', null, ADMIN);
  const beto = (r.body.data || []).filter(x => x.phone === '+595982000111');
  check('Admin: pedidos agrupados por número (repetidos = 1)', r.status === 200 && beto.length === 1, JSON.stringify(r.body.data).slice(0, 160));
  check('Admin: con nombre, negocio y WhatsApp', beto[0].user_name === 'Beto' && beto[0].business === 'Taller Beto' && beto[0].wa === '595982000111');
  r = await call('GET', '/api/v2/admin/dashboard', null, ADMIN);
  check('badge de Claims suma los pedidos de acceso', r.body.stats.pending_claims >= 3, String(r.body.stats.pending_claims));
  r = await call('POST', '/api/v2/admin/access-requests/handled', { phone: '+595982000111' }, ADMIN);
  r = await call('GET', '/api/v2/admin/access-requests', null, ADMIN);
  check('marcar atendido → sale de la lista', !(r.body.data || []).some(x => x.phone === '+595982000111'));

  // ── Mi Portal: crear la primera contraseña sin "actual" ────────────────────
  const BETO = 'Bearer ' + jwt.sign({ id: UB, role: 'client' }, process.env.JWT_SECRET);
  r = await call('GET', '/api/v2/client/me', null, BETO);
  check('/client/me → has_password=false para quien reclamó por enlace', r.body.data.has_password === false);
  r = await call('PUT', '/api/v2/client/me', { password: 'corta' }, BETO);
  check('contraseña corta → 400', r.status === 400);
  r = await call('PUT', '/api/v2/client/me', { password: 'mi-clave-nueva' }, BETO);
  check('crear la PRIMERA contraseña sin la actual → OK', r.status === 200 && r.body.success);
  check('queda marcada (password_set_at)', !!(await q('SELECT password_set_at FROM users WHERE id=$1', [UB])).rows[0].password_set_at);
  r = await login('0982 000 111', 'mi-clave-nueva');
  check('y ya entra con WhatsApp + contraseña', r.status === 200 && r.body.user.id === UB);
  r = await call('PUT', '/api/v2/client/me', { password: 'otra-clave-123' }, BETO);
  check('para CAMBIARLA después sí pide la actual', r.status === 400 && /actual/.test(r.body.error));
  r = await call('GET', '/api/v2/client/me', null, BETO);
  check('/client/me → has_password=true', r.body.data.has_password === true);

  // ── Registro y reset marcan la contraseña ──────────────────────────────────
  r = await call('POST', '/api/v2/auth/register', { name: 'Nuevo', email: 'nuevo@lw.test', password: 'clave-segura-9' });
  check('registro → password_set_at', r.status === 200 && !!(await q("SELECT password_set_at FROM users WHERE email='nuevo@lw.test'")).rows[0].password_set_at);
  await q("UPDATE users SET reset_token='r'||repeat('0',63), reset_token_expires=NOW()+interval '1 hour', password_set_at=NULL WHERE id=$1", [UC]);
  r = await call('POST', '/api/v2/auth/reset-password', { token: 'r' + '0'.repeat(63), password: 'clave-caro-1' });
  check('reset de contraseña → password_set_at', r.status === 200 && !!(await q('SELECT password_set_at FROM users WHERE id=$1', [UC])).rows[0].password_set_at);

  server.close(); await pool.end();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
