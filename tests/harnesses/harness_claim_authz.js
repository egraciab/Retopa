// SEGURIDAD — /api/v2/claim/{approve,reject,generate-token} exigen admin.
// Antes estaban SIN auth (cualquiera podía aprobar claims o generar claim_token
// para cualquier ficha → apropiarse de negocios). Monta el router REAL de
// claim.routes.js (Postgres real) y le pega por HTTP con y sin token.
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_claimsec', PORT = 55513, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

// Env ANTES de requerir el router (crea su propio Pool + lee JWT_SECRET al cargar)
process.env.DB_HOST = '/tmp'; process.env.DB_PORT = String(PORT);
process.env.DB_USER = 'postgres'; process.env.DB_NAME = 'postgres'; process.env.DB_PASSWORD = '';
process.env.JWT_SECRET = 'test-secret-claimsec';

const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const express = require('express');
const BE = '/root/work/opt/retopa/backend';
// Mock de mail para no enviar nada
require.cache[require.resolve(BE + '/src/config/mail.js')] = { id: 'm', filename: 'm', loaded: true, exports: { sendEmail: async () => {} } };

const SEC = process.env.JWT_SECRET;
const tok = role => jwt.sign({ id: 1, email: 'x@x.com', role }, SEC, { expiresIn: '1h' });

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();
  await c.query(`CREATE TABLE categories (id serial primary key, name text)`);
  await c.query(`CREATE TABLE businesses (id serial primary key, name text, trade_name text, email text, phone text, slug text, city text, department text, description text, image_url text, logo_emoji text, category_id int, claim_status text, claim_token text, claim_token_at timestamptz, claim_expires_at timestamptz, verified boolean DEFAULT false, is_active boolean DEFAULT true, updated_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE service_leads (id serial primary key, business_id int, service_type text, status text, notes text, updated_at timestamptz DEFAULT now())`);
  await c.query(`INSERT INTO businesses (id,name,slug,claim_status,claim_token,is_active) VALUES
    (1,'Ficha Ajena','ficha-ajena','pending','tok-1',true),
    (2,'Otra','otra','pending','tok-2',true),
    (3,'Tercera','tercera','pending','tok-3',true)`);

  const router = require(BE + '/src/routes/claim.routes.js');
  const app = express(); app.use(express.json()); app.use('/api/v2/claim', router);
  const server = app.listen(0); await new Promise(r => server.on('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v2/claim';
  const post = (path, body, token) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
  const get = (path) => fetch(base + path).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
  const claimStatus = async id => (await c.query('SELECT claim_status FROM businesses WHERE id=$1', [id])).rows[0].claim_status;

  // ── /approve ─────────────────────────────────────────────────────────────
  let r = await post('/approve', { business_id: 1 });
  check('approve SIN token → 401 (antes: cualquiera aprobaba)', r.status === 401 && r.body.code === 'NO_TOKEN');
  check('approve sin token → NO tocó la ficha', (await claimStatus(1)) === 'pending');
  r = await post('/approve', { business_id: 1 }, tok('client'));
  check('approve con token NO-admin → 403', r.status === 403 && r.body.code === 'FORBIDDEN');
  check('approve no-admin → NO tocó la ficha', (await claimStatus(1)) === 'pending');
  r = await post('/approve', { business_id: 1 }, tok('admin'));
  check('approve con admin → 200 (funciona para el admin real)', r.status === 200 && r.body.success);
  check('approve admin → aprobó la ficha', (await claimStatus(1)) === 'approved');
  r = await post('/approve', { business_id: 2 }, tok('godmode'));
  check('approve con godmode → 200', r.status === 200 && r.body.success);

  // ── /generate-token (el más peligroso: daba token de apropiación) ─────────
  r = await post('/generate-token', { business_id: 3 });
  check('generate-token SIN token → 401 (antes: token de takeover a cualquiera)', r.status === 401);
  check('generate-token anónimo → NO generó token', (await c.query('SELECT claim_token FROM businesses WHERE id=3')).rows[0].claim_token === 'tok-3');
  r = await post('/generate-token', { business_id: 3 }, tok('client'));
  check('generate-token no-admin → 403', r.status === 403);
  r = await post('/generate-token', { business_id: 3 }, tok('admin'));
  check('generate-token admin → 200 + token 64hex', r.status === 200 && /^[0-9a-f]{64}$/.test(r.body.token));

  // ── /reject ──────────────────────────────────────────────────────────────
  r = await post('/reject', { business_id: 1 });
  check('reject SIN token → 401', r.status === 401);
  r = await post('/reject', { business_id: 1 }, tok('admin'));
  check('reject con admin → 200', r.status === 200 && r.body.success);

  // ── /info y /submit SIGUEN públicos (no romper el flujo del dueño) ────────
  r = await get('/info?token=tok-2'); // ya aprobado (id2) → 409, pero NO 401
  check('/info sigue público (no exige token de auth)', r.status !== 401);
  r = await post('/submit', {}); // faltan campos → 400, pero NO 401 por auth
  check('/submit sigue público (validación, no auth)', r.status === 400 && !r.body.code);

  server.close(); await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });

  const S = fs.readFileSync(BE + '/src/routes/claim.routes.js', 'utf8');
  check('src: los 3 endpoints usan requireAdmin', (S.match(/requireAdmin, async/g) || []).length === 3);
  check('src: requireAdmin exige rol admin/godmode', /decoded\.role !== 'admin' && decoded\.role !== 'godmode'/.test(S));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
