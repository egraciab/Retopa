// Provisión de acceso del dueño al aprobar un claim ("reloj suizo").
// Ejercita los helpers REALES (claimAccess.js) contra Postgres real: resolución
// del contacto (dueño vinculado vs lead del formulario), creación/vinculación de
// la cuenta como dueña, y el token de activación (reusa reset_token).
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_claimacc', PORT = 55511, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const BE = '/root/work/opt/retopa/backend';
const { resolveClaimContact, ensureClaimOwner, issueActivationToken } = require(BE + '/src/helpers/claimAccess');
const tx = async (c, fn) => { await c.query('BEGIN'); try { const r = await fn(); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK'); throw e; } };

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();
  await c.query(`CREATE TABLE users (id serial primary key, name text, email text, password_hash text NOT NULL, role text, is_active boolean DEFAULT true, reset_token text, reset_token_expires timestamptz, created_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE businesses (id serial primary key, name text, trade_name text, slug text, verified boolean DEFAULT false, claim_status text, claimed_by int)`);
  await c.query(`CREATE TABLE service_leads (id serial primary key, business_id int, service_type text, status text, contact_name text, contact_email text, contact_phone text, notes text, created_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE user_businesses (user_id int, business_id int, is_owner boolean, can_edit boolean, UNIQUE(user_id, business_id))`);

  const ownerOf = async bizId => (await c.query('SELECT user_id, is_owner, can_edit FROM user_businesses WHERE business_id=$1', [bizId])).rows;

  // ── A) Reclamo por FORMULARIO: sin cuenta previa ─────────────────────────
  await c.query(`INSERT INTO businesses (id,name,trade_name,slug,verified,claim_status) VALUES (1,'Seguridad Integral','Seguridad Integral','seg',false,'pending')`);
  await c.query(`INSERT INTO service_leads (business_id,service_type,status,contact_name,contact_email,contact_phone,notes) VALUES (1,'claim','pending','José Noguera','Jose@X.com','0981','{"message":"soy dueño"}')`);
  let contact = await tx(c, () => resolveClaimContact(c, 1));
  check('A resolveContact desde el lead (sin dueño vinculado)', contact.fromOwner === false && contact.email === 'Jose@X.com' && contact.name === 'José Noguera');
  let info = await tx(c, async () => { const i = await ensureClaimOwner(c, { id: 1, name: 'Seguridad Integral' }, contact); i.token = await issueActivationToken(c, i.userId); return i; });
  check('A crea la cuenta (created=true)', info.created === true && !!info.userId);
  check('A normaliza email a minúsculas', info.email === 'jose@x.com');
  const uA = (await c.query('SELECT * FROM users WHERE id=$1', [info.userId])).rows[0];
  check('A usuario con rol client + activo', uA.role === 'client' && uA.is_active === true);
  check('A password_hash seteado (no usable, se activa)', !!uA.password_hash && uA.password_hash.length > 20);
  check('A vinculado como DUEÑO (is_owner + can_edit)', (await ownerOf(1)).some(r => r.user_id === info.userId && r.is_owner && r.can_edit));
  check('A businesses.claimed_by seteado', (await c.query('SELECT claimed_by FROM businesses WHERE id=1')).rows[0].claimed_by === info.userId);
  check('A token de activación (64 hex) + expira a futuro', /^[0-9a-f]{64}$/.test(info.token) && new Date(uA.reset_token_expires) > new Date());

  // ── A2) Consumir el token como lo hace POST /auth/reset-password ──────────
  const newHash = await bcrypt.hash('MiClaveNueva1', 10);
  const consumed = await c.query('UPDATE users SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL WHERE reset_token=$2 AND reset_token_expires > NOW() RETURNING id', [newHash, info.token]);
  check('A2 el link de activación crea la contraseña (reset-password)', consumed.rowCount === 1);
  const uA2 = (await c.query('SELECT password_hash, reset_token FROM users WHERE id=$1', [info.userId])).rows[0];
  check('A2 ahora puede loguear (hash válido, token consumido)', await bcrypt.compare('MiClaveNueva1', uA2.password_hash) && uA2.reset_token === null);

  // ── B) Reclamo por TOKEN: cuenta ya existe y vinculada ───────────────────
  await c.query(`INSERT INTO users (id,name,email,password_hash,role) VALUES (50,'Ana','ana@x.com',$1,'client')`, [await bcrypt.hash('yaTengo1', 10)]);
  await c.query(`INSERT INTO businesses (id,name,slug,verified,claim_status,claimed_by) VALUES (2,'Farmacia','far',false,'pending',50)`);
  await c.query(`INSERT INTO user_businesses (user_id,business_id,is_owner,can_edit) VALUES (50,2,true,true)`);
  contact = await tx(c, () => resolveClaimContact(c, 2));
  check('B resolveContact usa el dueño vinculado', contact.fromOwner === true && contact.email === 'ana@x.com');
  info = await tx(c, () => ensureClaimOwner(c, { id: 2, name: 'Farmacia' }, contact));
  check('B NO crea cuenta (ya existe) → created=false', info.created === false && info.userId === 50);
  check('B no duplica usuarios', (await c.query(`SELECT COUNT(*)::int n FROM users WHERE email='ana@x.com'`)).rows[0].n === 1);

  // ── C) Cuenta existe por email pero NO vinculada (reclama por formulario) ──
  await c.query(`INSERT INTO users (id,name,email,password_hash,role) VALUES (60,'Carlos','carlos@x.com',$1,'user')`, [await bcrypt.hash('x', 10)]);
  await c.query(`INSERT INTO businesses (id,name,slug,verified,claim_status) VALUES (3,'Kiosco','kio',false,'pending')`);
  await c.query(`INSERT INTO service_leads (business_id,service_type,status,contact_name,contact_email) VALUES (3,'claim','pending','Carlos','carlos@x.com')`);
  info = await tx(c, async () => ensureClaimOwner(c, { id: 3, name: 'Kiosco' }, await resolveClaimContact(c, 3)));
  check('C reusa la cuenta existente y la vincula (created=false)', info.created === false && info.userId === 60);
  check('C ahora es dueño del negocio', (await ownerOf(3)).some(r => r.user_id === 60 && r.is_owner));
  check('C promueve role user→client', (await c.query('SELECT role FROM users WHERE id=60')).rows[0].role === 'client');

  // ── D) Idempotencia: segunda provisión no rompe ni duplica el vínculo ────
  info = await tx(c, () => ensureClaimOwner(c, { id: 1, name: 'Seguridad Integral' }, { email: 'jose@x.com', name: 'José' }));
  check('D re-provisión no duplica el vínculo dueño', (await c.query('SELECT COUNT(*)::int n FROM user_businesses WHERE business_id=1')).rows[0].n === 1);

  // ── E) Sin email → no crea nada ──────────────────────────────────────────
  info = await tx(c, () => ensureClaimOwner(c, { id: 9, name: 'X' }, { email: null }));
  check('E sin email de contacto → no crea usuario', info.userId === null && info.created === false);

  await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });

  // ── Contrato sobre el fuente ─────────────────────────────────────────────
  const A = fs.readFileSync(BE + '/src/routes/admin.js', 'utf8');
  const M = fs.readFileSync(BE + '/src/config/mail.js', 'utf8');
  check('src: approve provisiona (resolveClaimContact + ensureClaimOwner)', /router\.post\('\/claims\/approve'[\s\S]*resolveClaimContact\(client[\s\S]*ensureClaimOwner\(client/.test(A));
  check('src: approve emite token de activación si es cuenta nueva', /if \(info\.created\) token = await issueActivationToken/.test(A));
  check('src: existe endpoint /claims/grant-access', /router\.post\('\/claims\/grant-access'/.test(A));
  check('src: template de email claimActivate', /claimActivate:/.test(M));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
