// ALTA DE FICHA SIN CUENTA → ACTIVACIÓN. Prueba el helper de provisión
// (provisionFichaOwnerActivation) y el endpoint POST /auth/activate-account
// contra Postgres REAL. Verifica: cuenta pendiente creada + correo de activación;
// reuso; enganche inmediato si ya verificada; crear contraseña confirma+engancha;
// no se puede loguear hasta activar; token inválido/corto rechazados.
const { execSync, spawnSync } = require('child_process');
const PGDATA = '/tmp/pg_fichaact', PORT = 55534, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

process.env.DB_HOST = '/tmp'; process.env.DB_PORT = String(PORT);
process.env.DB_USER = 'postgres'; process.env.DB_NAME = 'postgres'; process.env.DB_PASSWORD = '';
process.env.JWT_SECRET = 'test-secret-fichaact';

const { Client } = require('pg');
const express = require('express');
const BE = '/root/work/opt/retopa/backend';
const { provisionFichaOwnerActivation, PENDING_PWD } = require(BE + '/src/helpers/fichaActivation');

// Mock rate-limit → pass-through.
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

  // Fichas creadas por el alta corta sin sesión.
  await c.query(`INSERT INTO businesses (id,name,email,is_active) VALUES
     (1,'Frio Car Luque','duenio@x.com',true),
     (2,'Otra Ficha Mismo Dueño','duenio@x.com',true),
     (3,'Ficha De Verificado','verif@x.com',true)`);

  const sent = [];
  const sendEmail = async (to, tpl, data) => { sent.push({ to, tpl, data }); };
  const prov = args => provisionFichaOwnerActivation({ pool: c, sendEmail, siteName: 'RetoPA', siteUrl: 'https://retopa.com.py', ...args });
  const owners = async id => (await c.query('SELECT user_id FROM user_businesses WHERE business_id=$1 AND is_owner=TRUE', [id])).rows;

  // ── 1) CREATED: cuenta nueva pendiente + correo de activación, sin enganche ──
  const r1 = await prov({ email: 'Duenio@x.com', name: 'Dueño Uno', businessId: 1, businessName: 'Frio Car Luque' });
  check('provision: mode=created', r1.mode === 'created', 'mode=' + r1.mode);
  check('provision: sentActivation=true', r1.sentActivation === true);
  const u1 = (await c.query("SELECT email, password_hash, email_verified, verify_token FROM users WHERE email='duenio@x.com'")).rows[0];
  check('cuenta pendiente creada (email en minúsculas, no verificada)', !!u1 && u1.email === 'duenio@x.com' && u1.email_verified === false);
  check('password_hash = placeholder no usable', u1.password_hash === PENDING_PWD);
  check('verify_token seteado', !!u1.verify_token);
  check('la ficha 1 NO se enganchó todavía', (await owners(1)).length === 0);
  const mail1 = sent.find(m => m.to === 'duenio@x.com' && m.tpl === 'activateAccount');
  check('se envió correo activateAccount con activateUrl ?activar=', !!mail1 && /\/\?activar=/.test(mail1.data.activateUrl), mail1 ? mail1.data.activateUrl : 'no mail');

  // ── 2) REUSED: 2da ficha del mismo correo (sin verificar) reusa la cuenta ──
  const r2 = await prov({ email: 'duenio@x.com', name: 'Dueño Uno', businessId: 2, businessName: 'Otra' });
  check('provision: mode=reused (misma cuenta pendiente)', r2.mode === 'reused' && r2.userId === r1.userId, 'mode=' + r2.mode);
  const nUsers = (await c.query("SELECT count(*)::int n FROM users WHERE email='duenio@x.com'")).rows[0].n;
  check('no se duplicó la cuenta', nUsers === 1, 'n=' + nUsers);

  // ── 3) LINKED_VERIFIED: si ya hay cuenta verificada, engancha en el acto ──
  await c.query(`INSERT INTO users (email,password_hash,name,email_verified) VALUES ('verif@x.com','$2a$10$abc','Verificado',TRUE)`);
  const sentBefore = sent.length;
  const r3 = await prov({ email: 'verif@x.com', name: 'Verificado', businessId: 3, businessName: 'Ficha De Verificado' });
  check('provision: mode=linked_verified', r3.mode === 'linked_verified', 'mode=' + r3.mode);
  check('provision: sentActivation=false (no manda activación)', r3.sentActivation === false);
  check('la ficha 3 se enganchó en el acto a la cuenta verificada', (await owners(3)).some(o => o.user_id === r3.userId));
  check('no se mandó correo de activación al verificado', sent.length === sentBefore);

  // ── 4) Endpoint /auth/activate-account: crear contraseña confirma + engancha ──
  const router = require(BE + '/src/routes/auth-public.js');
  const app = express(); app.use(express.json()); app.use('/api/v2/auth', router);
  const server = app.listen(0); await new Promise(r => server.on('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v2/auth';
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));

  // login ANTES de activar → imposible (placeholder no matchea)
  const preLogin = await post('/login', { email: 'duenio@x.com', password: 'loquesea123' });
  check('no se puede loguear antes de activar', preLogin.status === 401, 'status=' + preLogin.status);

  const actToken = (await c.query("SELECT verify_token FROM users WHERE email='duenio@x.com'")).rows[0].verify_token;
  // contraseña corta → 400
  const short = await post('/activate-account', { token: actToken, password: '123' });
  check('activate con contraseña corta → 400', short.status === 400);
  // token inválido → 400
  const bad = await post('/activate-account', { token: 'no-existe', password: 'MiClaveSegura1' });
  check('activate con token inválido → 400', bad.status === 400 && bad.body?.code === 'INVALID_TOKEN');
  // activación OK
  const act = await post('/activate-account', { token: actToken, password: 'MiClaveSegura1' });
  check('activate-account 200 + token de sesión', act.status === 200 && !!act.body?.token, 'status=' + act.status);
  check('activate: email_verified=true + has_business=true', act.body?.user?.email_verified === true && act.body?.user?.has_business === true);
  check('activate engancha ambas fichas del correo (linked=2)', act.body?.linked === 2, 'linked=' + act.body?.linked);
  check('fichas 1 y 2 quedaron enganchadas', (await owners(1)).length === 1 && (await owners(2)).length === 1);
  const u1b = (await c.query("SELECT password_hash, email_verified, verify_token FROM users WHERE email='duenio@x.com'")).rows[0];
  check('password real seteado (bcrypt) y token limpio', u1b.password_hash.startsWith('$2') && u1b.email_verified === true && u1b.verify_token === null);

  // ── 5) Ya con contraseña, el login funciona ──
  const login = await post('/login', { email: 'duenio@x.com', password: 'MiClaveSegura1' });
  check('login funciona con la contraseña recién creada', login.status === 200 && login.body?.user?.has_business === true, 'status=' + login.status);

  // ── 6) Token ya consumido → 400 ──
  const reuse = await post('/activate-account', { token: actToken, password: 'OtraClave123' });
  check('token de activación ya usado → 400', reuse.status === 400);

  await c.end();
  server.close();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
