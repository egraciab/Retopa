// VERIFICACIÓN DE CORREO por link mágico + enganche gateado por verificación.
// Monta el router REAL auth-public.js contra Postgres REAL y le pega por HTTP.
// Verifica: register NO engancha (manda link); verify-email confirma + engancha;
// login sólo engancha si está verificado; token inválido/expirado/reusado.
const { execSync, spawnSync } = require('child_process');
const PGDATA = '/tmp/pg_emailverif', PORT = 55533, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

process.env.DB_HOST = '/tmp'; process.env.DB_PORT = String(PORT);
process.env.DB_USER = 'postgres'; process.env.DB_NAME = 'postgres'; process.env.DB_PASSWORD = '';
process.env.JWT_SECRET = 'test-secret-emailverif';

const { Client } = require('pg');
const express = require('express');
const BE = '/root/work/opt/retopa/backend';

// Mock de express-rate-limit → middleware pass-through (evita el 429 en el test).
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

  // Fichas huérfanas creadas por el registro corto sin sesión.
  await c.query(`INSERT INTO businesses (id,name,email,is_active) VALUES
     (1,'Frio Car Luque','newbiz@x.com',true),
     (2,'Panaderia Login','loginuser@x.com',true)`);

  const router = require(BE + '/src/routes/auth-public.js');
  const app = express(); app.use(express.json()); app.use('/api/v2/auth', router);
  const server = app.listen(0); await new Promise(r => server.on('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v2/auth';
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
  const owners = async id => (await c.query('SELECT user_id FROM user_businesses WHERE business_id=$1 AND is_owner=TRUE', [id])).rows;
  const tokenOf = async email => (await c.query('SELECT verify_token, email_verified FROM users WHERE email=$1', [email.toLowerCase()])).rows[0];

  // ── 1) REGISTER no engancha; deja email_verified=false y manda token ──
  const reg = await post('/register', { email: 'newbiz@x.com', password: 'secret123', name: 'Nuevo Dueño' });
  check('register 200 + token de sesión', reg.status === 200 && !!reg.body?.token);
  check('register: user.email_verified=false', reg.body?.user?.email_verified === false, 'ev=' + reg.body?.user?.email_verified);
  check('register: has_business=false (todavía no engancha)', reg.body?.user?.has_business === false);
  const t1 = await tokenOf('newbiz@x.com');
  check('register guardó verify_token en la DB', !!t1.verify_token && t1.email_verified === false);
  check('la ficha 1 sigue SIN dueño tras el registro', (await owners(1)).length === 0);

  // ── 2) VERIFY-EMAIL confirma + engancha ──
  const ver = await post('/verify-email', { token: t1.verify_token });
  check('verify-email 200', ver.status === 200 && ver.body?.success === true, 'status=' + ver.status);
  check('verify-email: linked=1', ver.body?.linked === 1, 'linked=' + ver.body?.linked);
  check('verify-email: user.email_verified=true + has_business=true', ver.body?.user?.email_verified === true && ver.body?.user?.has_business === true);
  check('verify-email devuelve token de sesión (queda logueado)', !!ver.body?.token);
  const o1 = await owners(1);
  check('la ficha 1 quedó enganchada al usuario', o1.length === 1 && o1[0].user_id === reg.body.user.id, JSON.stringify(o1));
  const t1b = await tokenOf('newbiz@x.com');
  check('el verify_token se limpió y email_verified=true', t1b.verify_token === null && t1b.email_verified === true);

  // ── 3) Reusar el token ya consumido → 400 ──
  const verReuse = await post('/verify-email', { token: t1.verify_token });
  check('token ya usado → 400 INVALID_TOKEN', verReuse.status === 400 && verReuse.body?.code === 'INVALID_TOKEN', 'status=' + verReuse.status);

  // ── 4) Token EXPIRADO → 400 (usuario insertado con expiración pasada) ──
  await c.query(`INSERT INTO users (email,password_hash,name,email_verified,verify_token,verify_token_expires)
                 VALUES ('exp@x.com','x','Exp',false,'tok-expirado', NOW() - INTERVAL '1 hour')`);
  const verExp = await post('/verify-email', { token: 'tok-expirado' });
  check('token expirado → 400', verExp.status === 400 && verExp.body?.success === false, 'status=' + verExp.status);

  // ── 5) LOGIN gatea el enganche por verificación ──
  const regL = await post('/register', { email: 'loginuser@x.com', password: 'secret123', name: 'Login User' });
  check('la ficha 2 sigue sin dueño tras registrar (sin verificar)', (await owners(2)).length === 0);
  // login SIN verificar → no engancha
  const loginUnverified = await post('/login', { email: 'loginuser@x.com', password: 'secret123' });
  check('login sin verificar: has_business=false', loginUnverified.body?.user?.has_business === false, 'hb=' + loginUnverified.body?.user?.has_business);
  check('login sin verificar: email_verified=false en la respuesta', loginUnverified.body?.user?.email_verified === false);
  check('la ficha 2 sigue huérfana tras login sin verificar', (await owners(2)).length === 0);
  // verificar y luego login → ahora sí engancha
  const tL = await tokenOf('loginuser@x.com');
  await post('/verify-email', { token: tL.verify_token });
  const o2 = await owners(2);
  check('tras verificar, la ficha 2 queda enganchada', o2.length === 1 && o2[0].user_id === regL.body.user.id, JSON.stringify(o2));
  const loginVerified = await post('/login', { email: 'loginuser@x.com', password: 'secret123' });
  check('login ya verificado: email_verified=true + has_business=true', loginVerified.body?.user?.email_verified === true && loginVerified.body?.user?.has_business === true);

  // ── 6) RESEND: para un correo sin verificar responde OK y regenera token ──
  const before = (await tokenOf('exp@x.com')).verify_token;
  const resend = await post('/resend-verification', { email: 'exp@x.com' });
  const after = (await tokenOf('exp@x.com')).verify_token;
  check('resend-verification 200 OK', resend.status === 200 && resend.body?.success === true);
  check('resend regeneró el token para el correo sin verificar', after && after !== before, 'before=' + before + ' after=' + after);

  await c.end();
  server.close();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
