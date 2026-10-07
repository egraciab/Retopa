// ENGANCHE de fichas por correo (con verificación de correo).
// Al CONFIRMAR el correo (o loguearse ya verificado), se asignan como dueño las
// businesses con email = el del usuario que aún no tienen dueño. Monta el router
// REAL auth-public.js contra Postgres REAL. Verifica las salvaguardas: no robar,
// case-insensitive, is_active, sin duplicados — todo a través del flujo real de
// registro → verificación.
const { execSync, spawnSync } = require('child_process');
const PGDATA = '/tmp/pg_engancha', PORT = 55531, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

process.env.DB_HOST = '/tmp'; process.env.DB_PORT = String(PORT);
process.env.DB_USER = 'postgres'; process.env.DB_NAME = 'postgres'; process.env.DB_PASSWORD = '';
process.env.JWT_SECRET = 'test-secret-engancha';

const { Client } = require('pg');
const express = require('express');
const BE = '/root/work/opt/retopa/backend';

// Mock de express-rate-limit → pass-through (el test hace varias llamadas sensibles).
const RL_PATH = require.resolve('express-rate-limit', { paths: [BE, BE + '/node_modules'] });
require.cache[RL_PATH] = { id: RL_PATH, filename: RL_PATH, loaded: true, exports: () => (req, res, next) => next() };

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();

  await c.query(`CREATE TABLE users (
     id serial primary key, email text UNIQUE, password_hash text, name text, phone text,
     role text DEFAULT 'user', is_active boolean DEFAULT true, is_ambassador boolean DEFAULT false,
     mfa_enabled boolean DEFAULT false, mfa_otp text, mfa_otp_expires timestamptz,
     email_verified boolean DEFAULT false, verify_token text, verify_token_expires timestamptz,
     reset_token text, reset_token_expires timestamptz)`);
  await c.query(`CREATE TABLE businesses (id serial primary key, name text, email text, is_active boolean DEFAULT true)`);
  await c.query(`CREATE TABLE user_businesses (user_id int, business_id int, is_owner boolean DEFAULT false, can_edit boolean DEFAULT false, UNIQUE(user_id,business_id))`);
  await c.query(`CREATE TABLE site_config (key text primary key, value text)`);
  await c.query(`CREATE TABLE email_log (id serial primary key, to_email text, subject text, type text, status text, error text, created_at timestamptz DEFAULT now())`);

  await c.query(`INSERT INTO businesses (id,name,email,is_active) VALUES
     (1,'Cerrajeria El Rapido','owner@x.com',true),
     (2,'Ferreteria Dona','owner@x.com',true),
     (3,'Kiosco May','OWNER2@X.com',true),
     (4,'Ficha Ajena','shared@x.com',true),
     (5,'Ficha Inactiva','inactiva@x.com',false)`);
  await c.query(`INSERT INTO users (id,email,password_hash,name) VALUES (99,'dueno.previo@x.com','x','Previo')`);
  await c.query(`INSERT INTO user_businesses (user_id,business_id,is_owner,can_edit) VALUES (99,4,true,true)`);
  await c.query(`SELECT setval('users_id_seq', 100, true)`);

  const router = require(BE + '/src/routes/auth-public.js');
  const app = express(); app.use(express.json()); app.use('/api/v2/auth', router);
  const server = app.listen(0); await new Promise(r => server.on('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v2/auth';
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
  const owners = async id => (await c.query('SELECT user_id FROM user_businesses WHERE business_id=$1 AND is_owner=TRUE ORDER BY user_id', [id])).rows;
  // Registra y confirma el correo en un solo paso; devuelve {uid, linked}.
  const registerAndVerify = async (email, name) => {
    const reg = await post('/register', { email, password: 'secret123', name });
    const tok = (await c.query('SELECT verify_token FROM users WHERE email=$1', [email.toLowerCase()])).rows[0].verify_token;
    const ver = await post('/verify-email', { token: tok });
    return { uid: reg.body?.user?.id, linked: ver.body?.linked, verBody: ver.body };
  };

  // ── 1) Confirmar correo engancha las 2 fichas del mismo dueño ──
  const a = await registerAndVerify('Owner@x.com', 'Owner Uno');
  check('confirmar correo engancha ambas fichas del mismo email (linked=2)', a.linked === 2, 'linked=' + a.linked);
  check('ficha 1 al nuevo usuario', (await owners(1)).some(r => r.user_id === a.uid));
  check('ficha 2 al nuevo usuario', (await owners(2)).some(r => r.user_id === a.uid));

  // ── 2) Case-insensitive (ficha 3 con email en MAYÚS) ──
  const b = await registerAndVerify('owner2@x.com', 'Owner Dos');
  check('ficha 3 (email en MAYUS) enganchada case-insensitive', (await owners(3)).some(r => r.user_id === b.uid), 'linked=' + b.linked);

  // ── 3) NO robar ficha con dueño (ficha 4, dueño 99) ──
  const d = await registerAndVerify('shared@x.com', 'Intruso');
  const o4 = await owners(4);
  check('ficha 4 NO se le roba al dueño previo', o4.length === 1 && o4[0].user_id === 99, JSON.stringify(o4));
  check('confirmar(shared): linked=0 (no enganchó nada)', d.linked === 0, 'linked=' + d.linked);

  // ── 4) is_active=FALSE no se engancha (ficha 5) ──
  const e = await registerAndVerify('inactiva@x.com', 'Inactivo');
  check('ficha inactiva NO se engancha', (await owners(5)).length === 0 && e.linked === 0, 'linked=' + e.linked);

  // ── 5) Sin duplicados: confirmar de nuevo (re-login verificado) no repite filas ──
  const login2 = await post('/login', { email: 'owner@x.com', password: 'secret123' });
  check('re-login verificado sigue 200', login2.status === 200);
  check('ficha 1 con exactamente un dueño (sin duplicar)', (await owners(1)).length === 1, JSON.stringify(await owners(1)));

  await c.end();
  server.close();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
