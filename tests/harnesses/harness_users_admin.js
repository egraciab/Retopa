// ADMIN → USUARIOS (2026-10-13): paginado, búsqueda, edición completa, guardas de rol.
// admin.js REAL contra Postgres efímero con el esquema de prod + migraciones.
// Uso: node harness_users_admin.js <ROOT del repo (…/opt/retopa)>
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
mock('config/redis', { get: async () => null, setEx: async () => {}, set: async () => {}, keys: async () => [], del: async () => {}, on: () => {} });
mock('utils/kit-pdf', { buildKitBatchPdf: async () => Buffer.from('') });
mock('utils/sysnet', { getNetworkStats: async () => ({}) });
mock('helpers/notifyOwner', { notifyOwner: async () => {} });
mock('helpers/verifyFicha', { runVerifyFicha: async () => ({}) });
mock('config/mail', { sendEmail: async () => ({ success: true }), renderTemplate: async () => ({}) });

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: 'retopa', user: 'retopa' });
  const q = (s, p) => pool.query(s, p);
  const express = require('express'), jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs');

  // ── Datos: 30 usuarios "ua" + un admin + un godmode ────────────────────────
  await q("DELETE FROM user_businesses WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@ua.test' OR name LIKE 'UA %')");
  await q("DELETE FROM users WHERE email LIKE '%@ua.test' OR name LIKE 'UA %'");
  await q("DELETE FROM service_leads WHERE business_id IN (SELECT id FROM businesses WHERE slug LIKE 'ua-%')");
  await q("DELETE FROM businesses WHERE slug LIKE 'ua-%'");
  const h = await bcrypt.hash('x', 4);
  const ids = [];
  for (let i = 1; i <= 30; i++) {
    ids.push((await q(`INSERT INTO users (email, password_hash, name, role, is_active, phone, created_at)
      VALUES ($1,$2,$3,'client',TRUE,$4, NOW() - make_interval(mins => $5)) RETURNING id`,
      [`u${i}@ua.test`, h, `UA Usuario ${String(i).padStart(2, '0')}`, `0981 555 ${String(i).padStart(3, '0')}`, i])).rows[0].id);
  }
  const ADM = (await q(`INSERT INTO users (email, password_hash, name, role) VALUES ('adm@ua.test',$1,'UA Admin','admin') RETURNING id`, [h])).rows[0].id;
  const GOD = (await q(`INSERT INTO users (email, password_hash, name, role) VALUES ('god@ua.test',$1,'UA God','godmode') RETURNING id`, [h])).rows[0].id;
  const BIZ = (await q("INSERT INTO businesses (name, trade_name, slug, is_active) VALUES ('Ferretería Ñandutí SA','Ferre Ñandutí','ua-ferre',TRUE) RETURNING id")).rows[0].id;
  await q('INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit) VALUES ($1,$2,TRUE,TRUE)', [ids[4], BIZ]);

  const app = express(); app.use(express.json());
  app.use('/api/v2/admin', require(path.join(SRC, 'routes/admin')));
  const server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const port = server.address().port;
  const tok = (id, role) => 'Bearer ' + jwt.sign({ id, role }, process.env.JWT_SECRET);
  const ADMIN = tok(ADM, 'admin'), GODT = tok(GOD, 'godmode');
  const call = (method, p, body, auth = ADMIN) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, path: p, method,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), Authorization: auth } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) {} resolve({ status: res.statusCode, body: j }); }); });
    req.on('error', reject); if (data) req.write(data); req.end();
  });

  // ── Paginado ───────────────────────────────────────────────────────────────
  const qs = '&q=UA%20Usuario';
  let p1 = await call('GET', '/api/v2/admin/users?limit=25&page=1' + qs);
  let p2 = await call('GET', '/api/v2/admin/users?limit=25&page=2' + qs);
  check('página 1: 25 usuarios, total 30, 2 páginas', p1.body.data.length === 25 && p1.body.pagination.total === 30 && p1.body.pagination.pages === 2, JSON.stringify(p1.body.pagination));
  check('página 2: los 5 restantes y dice page=2', p2.body.data.length === 5 && p2.body.pagination.page === 2);
  const overlap = p1.body.data.filter(a => p2.body.data.some(b => b.id === a.id));
  check('sin repetidos entre páginas', overlap.length === 0);
  const off = await call('GET', '/api/v2/admin/users?limit=25&offset=25' + qs);
  check('compatibilidad: ?offset=25 también da la página 2', off.body.pagination.page === 2 && off.body.data.length === 5);
  const big = await call('GET', '/api/v2/admin/users?limit=99999&page=1' + qs);
  check('limit acotado a 100', big.body.pagination.limit === 100);

  // ── Búsqueda ───────────────────────────────────────────────────────────────
  let r = await call('GET', '/api/v2/admin/users?q=' + encodeURIComponent('+595 981 555 017'));
  check('buscar por WhatsApp (+595…) encuentra al usuario', r.body.data.length === 1 && r.body.data[0].name === 'UA Usuario 17', JSON.stringify(r.body.data.map(x => x.name)));
  r = await call('GET', '/api/v2/admin/users?q=' + encodeURIComponent('0981555017'));
  check('buscar por WhatsApp (09…) encuentra al usuario', r.body.data.length === 1);
  r = await call('GET', '/api/v2/admin/users?q=' + encodeURIComponent('Ñandutí'));
  check('buscar por negocio encuentra al dueño', r.body.data.length === 1 && r.body.data[0].id === ids[4]);
  r = await call('GET', '/api/v2/admin/users?q=u7%40ua.test');
  check('buscar por correo (como antes)', r.body.data.length === 1);
  const row = (await call('GET', '/api/v2/admin/users?q=' + encodeURIComponent('Ñandutí'))).body.data[0];
  check('fila: trae si confirmó el correo y si el WhatsApp está probado', typeof row.email_verified === 'boolean' && typeof row.phone_verified === 'boolean');
  check('fila: negocio principal, WhatsApp normalizado, sin hashes', row.owned_name === 'Ferre Ñandutí' && row.wa === '595981555005' && !('password_hash' in row) && !('access_token_hash' in row), JSON.stringify(row));

  // ── Negocio y WhatsApp de la ficha en la lista; sugerencias con fuente ─────
  const OW = ids[9];   // sin WhatsApp en su usuario; su ficha y su reclamo sí lo tienen
  await q('UPDATE users SET phone = NULL WHERE id = $1', [OW]);
  const BZ2 = (await q("INSERT INTO businesses (name, slug, is_active, whatsapp, phone) VALUES ('Veterinaria Capiatá','ua-vet',TRUE,'595984111222','021 555 555') RETURNING id")).rows[0].id;
  await q('INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit) VALUES ($1,$2,TRUE,TRUE)', [OW, BZ2]);
  await q(`INSERT INTO service_leads (business_id, business_name, service_type, status, contact_email, contact_phone)
           VALUES ($1,'Veterinaria Capiatá','claim','won','u10@ua.test','0985 333 444'), ($1,'x','claim','won','u10@ua.test','0984 111 222')`, [BZ2]);
  let lr = await call('GET', '/api/v2/admin/users?q=' + encodeURIComponent('Veterinaria Capiatá'));
  const orow = lr.body.data[0] || {};
  check('lista: negocio principal con su id (para abrir la ficha)', orow.owned_id === BZ2 && orow.owned_name === 'Veterinaria Capiatá');
  check('lista: WhatsApp de la FICHA aparte (no se mezcla con el del usuario)', orow.phone === null && orow.owned_wa === '595984111222', JSON.stringify(orow));
  lr = await call('GET', `/api/v2/admin/users/${OW}/contact-suggestions`);
  const sg = lr.body.data || [];
  check('sugerencias: WhatsApp de la ficha + el del formulario, cada uno con su fuente', sg.length === 2 && sg[0].wa === '595984111222' && /ficha «Veterinaria Capiatá»/.test(sg[0].source)
        && sg[1].wa === '595985333444' && /formulario de reclamo/.test(sg[1].source), JSON.stringify(sg));
  check('sugerencias: sin repetidos ni teléfonos fijos', !sg.some(x => x.wa.startsWith('59521')) && new Set(sg.map(x => x.wa)).size === sg.length);
  await q("UPDATE users SET phone = '+595985333444' WHERE id = $1", [OW]);
  lr = await call('GET', `/api/v2/admin/users/${OW}/contact-suggestions`);
  check('sugerencias: no repite el que ya tiene el usuario', !(lr.body.data || []).some(x => x.wa === '595985333444'));
  await q('UPDATE users SET phone = NULL WHERE id = $1', [OW]);

  // ── PUT /users/:id ─────────────────────────────────────────────────────────
  const U = ids[0];
  r = await call('PUT', `/api/v2/admin/users/${U}`, { name: ' ', email: 'a@b.co', phone: '' });
  check('nombre vacío → 400 field=name', r.status === 400 && r.body.field === 'name');
  r = await call('PUT', `/api/v2/admin/users/${U}`, { name: 'Ana', email: 'mal@', phone: '' });
  check('correo inválido → 400 field=email', r.status === 400 && r.body.field === 'email');
  r = await call('PUT', `/api/v2/admin/users/${U}`, { name: 'Ana', email: 'U2@ua.test', phone: '' });
  check('correo de otra cuenta → 409', r.status === 409 && r.body.field === 'email');
  r = await call('PUT', `/api/v2/admin/users/${U}`, { name: 'Ana', email: '', phone: '021 555 555' });
  check('WhatsApp fijo/ inválido → 400 field=phone', r.status === 400 && r.body.field === 'phone');
  r = await call('PUT', `/api/v2/admin/users/${U}`, { name: 'Ana', email: '', phone: '' });
  check('sin correo NI WhatsApp → 400 (no podría entrar)', r.status === 400);
  r = await call('PUT', `/api/v2/admin/users/${U}`, { name: 'Ana', email: '', phone: '981 222 333', password: '123' });
  check('contraseña corta → 400', r.status === 400 && r.body.field === 'password');
  r = await call('PUT', `/api/v2/admin/users/${U}`, { name: '  Ana   Pérez ', email: 'ANA@UA.test', phone: '0981 222 333', role: 'client', is_active: true, password: 'clave-segura-1' });
  const u0 = (await q('SELECT * FROM users WHERE id=$1', [U])).rows[0];
  check('guardar: nombre limpio, correo en minúsculas, WhatsApp +595…', r.status === 200 && u0.name === 'Ana Pérez' && u0.email === 'ana@ua.test' && u0.phone === '+595981222333', JSON.stringify({ n: u0.name, e: u0.email, p: u0.phone }));
  check('contraseña nueva: guardada y marcada (password_set_at)', await bcrypt.compare('clave-segura-1', u0.password_hash) && !!u0.password_set_at);
  r = await call('PUT', `/api/v2/admin/users/${U}`, { name: 'Ana Pérez', email: '', phone: '0981 222 333' });
  check('correo opcional: se puede quitar si tiene WhatsApp', r.status === 200 && (await q('SELECT email FROM users WHERE id=$1', [U])).rows[0].email === null);

  // ── Guardas de rol (400, nunca 403: el panel cierra sesión con 403) ─────────
  r = await call('PUT', `/api/v2/admin/users/${U}/role`, { role: 'god' });
  check('rol inválido ("god") → 400', r.status === 400);
  r = await call('PUT', `/api/v2/admin/users/${U}/role`, { role: 'godmode' });
  check('admin NO puede dar GodMode → 400', r.status === 400 && /GodMode/.test(r.body.error));
  r = await call('PUT', `/api/v2/admin/users/${GOD}`, { name: 'UA God', email: 'god@ua.test', role: 'user' });
  check('admin NO puede tocar a un GodMode → 400', r.status === 400);
  r = await call('PUT', `/api/v2/admin/users/${GOD}/status`, { is_active: false });
  check('admin NO puede desactivar a un GodMode → 400', r.status === 400);
  r = await call('PUT', `/api/v2/admin/users/${ADM}/role`, { role: 'client' });
  check('nadie se cambia su propio rol → 400', r.status === 400 && /propio rol/.test(r.body.error));
  r = await call('PUT', `/api/v2/admin/users/${ADM}/status`, { is_active: false });
  check('nadie se desactiva a sí mismo → 400', r.status === 400);
  r = await call('DELETE', `/api/v2/admin/users/${ADM}`, null);
  check('nadie se borra a sí mismo → 400', r.status === 400);
  r = await call('PUT', `/api/v2/admin/users/${ADM}`, { name: 'UA Admin 2', email: 'adm@ua.test', phone: '' });
  check('editar mis propios datos (sin tocar rol) → OK', r.status === 200);
  r = await call('PUT', `/api/v2/admin/users/${U}/role`, { role: 'godmode' }, GODT);
  check('GodMode SÍ puede dar GodMode', r.status === 200 && (await q('SELECT role FROM users WHERE id=$1', [U])).rows[0].role === 'godmode');
  r = await call('PUT', `/api/v2/admin/users/${U}/role`, { role: 'client' }, GODT);
  check('…y quitarlo', r.status === 200);
  r = await call('POST', '/api/v2/admin/users', { name: 'X', email: 'x@ua.test', password: 'clave-segura-1', role: 'godmode' });
  check('admin NO puede crear GodMode → 400', r.status === 400);
  r = await call('POST', '/api/v2/admin/users', { name: 'UA Nuevo', email: 'nuevo@ua.test', password: 'clave-segura-1', phone: '0982 111 222', role: 'client' });
  await new Promise(res => setTimeout(res, 100));
  const nu = (await q("SELECT phone, password_set_at FROM users WHERE email='nuevo@ua.test'")).rows[0];
  check('alta: WhatsApp normalizado y contraseña marcada', r.status === 200 && nu.phone === '+595982111222' && !!nu.password_set_at, JSON.stringify(nu));

  server.close(); await pool.end();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
