// Reclamos (Claims) — routing unificado.
// (1) POST /businesses/:slug/claim (router REAL) ahora marca claim_status='pending'
//     → el reclamo cae en el panel Claims, no solo en Leads.
// (2) El endpoint /claims expone contacto + mensaje/evidencia + origen.
// (3) Backfill rescata reclamos viejos que quedaron sin claim_status.
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_claims', PORT = 55509, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { Pool } = require('pg');
const express = require('express');
const BE = '/root/work/opt/retopa/backend';
function mock(rel, exp) { const abs = require.resolve(BE + '/src/' + rel); require.cache[abs] = { id: abs, filename: abs, loaded: true, exports: exp }; }

// Lectura /claims (SQL EXACTO de admin.js) + su mapeo.
const CLAIMS_SQL = `
  SELECT b.id, b.name, b.trade_name, b.slug, b.email, b.phone, b.city, b.department,
         b.claim_status, b.claimed_at, b.claim_token_at, b.notify_count, b.notified_at,
         u.id AS user_id, u.name AS user_name, u.email AS user_email,
         sl.contact_name AS lead_contact_name, sl.contact_email AS lead_contact_email,
         sl.contact_phone AS lead_contact_phone, sl.notes AS lead_notes
  FROM businesses b
  LEFT JOIN users u ON u.id = b.claimed_by
  LEFT JOIN LATERAL (
    SELECT contact_name, contact_email, contact_phone, notes FROM service_leads
    WHERE business_id = b.id AND service_type='claim' ORDER BY created_at DESC LIMIT 1
  ) sl ON TRUE
  WHERE b.claim_status IS NOT NULL
  ORDER BY CASE b.claim_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, b.claimed_at DESC`;
const mapClaims = rows => rows.map(r => {
  let message = '', evidence_url = '';
  if (r.lead_notes) { try { const p = JSON.parse(r.lead_notes); message = p.message || ''; evidence_url = p.evidence_url || ''; } catch (e) {} }
  return { ...r, origin: r.user_id ? 'cuenta' : 'formulario', message, evidence_url,
    contact_name: r.user_name || r.lead_contact_name || null,
    contact_email: r.user_email || r.lead_contact_email || r.email || null,
    contact_phone: r.lead_contact_phone || r.phone || null };
});

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const pool = new Pool({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' });
  await pool.query(`CREATE TABLE users (id serial primary key, name text, email text)`);
  await pool.query(`CREATE TABLE businesses (id serial primary key, name text, trade_name text, slug text, verified boolean DEFAULT false,
     claim_status text, claimed_by int, claimed_at timestamptz, claim_token_at timestamptz, notify_count int DEFAULT 0, notified_at timestamptz,
     email text, phone text, city text, department text, updated_at timestamptz DEFAULT now())`);
  await pool.query(`CREATE TABLE service_leads (id serial primary key, business_id int, business_name text, service_type text, status text,
     contact_name text, contact_email text, contact_phone text, notes text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);
  await pool.query(`CREATE TABLE site_config (key text, value text)`);

  const redisMock = { get: async () => null, setEx: async () => {}, set: async () => {}, del: async () => {}, keys: async () => [] };
  mock('db.js', pool); mock('config/redis.js', redisMock);
  mock('utils/plan-limits.js', { getPlanLimits: async () => ({ max_categories: 1 }) });
  mock('config/mail.js', { sendEmail: async () => {} });
  mock('utils/pwa-icon.js', { getPwaIcon: async () => null });

  const router = require(BE + '/src/routes/directory.js');
  const app = express(); app.use(express.json()); app.use('/api/v2/directory', router);
  const server = app.listen(0); await new Promise(r => server.on('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v2/directory';
  const postClaim = (slug, body) => fetch(`${base}/businesses/${slug}/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));

  // ── 1) Reclamo por FORMULARIO público ────────────────────────────────────
  await pool.query(`INSERT INTO businesses (id,name,slug,verified) VALUES (1,'Seguridad Integral','seguridad-integral',false)`);
  let r = await postClaim('seguridad-integral', { contact_name: 'José Noguera', contact_email: 'jose@x.com', contact_phone: '0981', message: 'Soy el dueño', evidence_url: 'http://ev.com/doc' });
  check('formulario → 200', r.status === 200);
  const b1 = (await pool.query('SELECT claim_status, claimed_at FROM businesses WHERE id=1')).rows[0];
  check('formulario → marca claim_status=pending (¡cae en Claims!)', b1.claim_status === 'pending');
  check('formulario → setea claimed_at', !!b1.claimed_at);
  const l1 = (await pool.query(`SELECT * FROM service_leads WHERE business_id=1 AND service_type='claim'`)).rows;
  check('formulario → crea lead espejo de claim', l1.length === 1 && l1[0].status === 'pending');

  let claims = mapClaims((await pool.query(CLAIMS_SQL)).rows);
  const c1 = claims.find(c => c.id === 1);
  check('/claims lo lista', !!c1);
  check('/claims origen = formulario (sin cuenta)', c1.origin === 'formulario');
  check('/claims trae contacto del lead', c1.contact_name === 'José Noguera' && c1.contact_email === 'jose@x.com' && c1.contact_phone === '0981');
  check('/claims trae mensaje y evidencia', c1.message === 'Soy el dueño' && c1.evidence_url === 'http://ev.com/doc');

  // ── 2) Reclamo por TOKEN (cuenta vinculada) → origen=cuenta ──────────────
  await pool.query(`INSERT INTO users (id,name,email) VALUES (7,'Ana Dueña','ana@x.com')`);
  await pool.query(`INSERT INTO businesses (id,name,slug,verified,claim_status,claimed_by,claimed_at) VALUES (2,'Farmacia Sur','farmacia-sur',false,'pending',7,NOW())`);
  await pool.query(`INSERT INTO service_leads (business_id,service_type,status,contact_name,contact_email,notes) VALUES (2,'claim','new','Ana Dueña','ana@x.com','Claim automático token')`);
  claims = mapClaims((await pool.query(CLAIMS_SQL)).rows);
  const c2 = claims.find(c => c.id === 2);
  check('/claims token → origen = cuenta', c2.origin === 'cuenta');
  check('/claims token → contacto desde el usuario', c2.contact_email === 'ana@x.com');

  // ── 3) Guardas del formulario ────────────────────────────────────────────
  await pool.query(`INSERT INTO businesses (id,name,slug,verified) VALUES (3,'Ya Verificada','ya-verif',true)`);
  r = await postClaim('ya-verif', { contact_name: 'X', contact_email: 'x@x.com' });
  check('ficha ya verificada → 400', r.status === 400);
  await pool.query(`INSERT INTO businesses (id,name,slug,verified,claim_status) VALUES (4,'Ya Reclamada','ya-recl',false,'approved')`);
  r = await postClaim('ya-recl', { contact_name: 'X', contact_email: 'x@x.com' });
  check('ficha ya reclamada (approved) → 409', r.status === 409);

  // ── 4) Backfill de reclamos viejos sin claim_status ──────────────────────
  await pool.query(`INSERT INTO businesses (id,name,slug,verified,claim_status) VALUES (5,'Huérfano','huerfano',false,NULL)`);
  await pool.query(`INSERT INTO service_leads (business_id,service_type,status,contact_name,notes) VALUES (5,'claim','pending','Viejo Reclamo','{"message":"reclamo viejo"}')`);
  check('pre-backfill: huérfano NO está en Claims', !mapClaims((await pool.query(CLAIMS_SQL)).rows).some(c => c.id === 5));
  await pool.query(fs.readFileSync(BE + '/../sql/2026-08-30_backfill_claim_status.sql', 'utf8'));
  const c5 = mapClaims((await pool.query(CLAIMS_SQL)).rows).find(c => c.id === 5);
  check('post-backfill: huérfano AHORA está en Claims (pending)', c5 && c5.claim_status === 'pending');
  check('post-backfill: trae su mensaje del lead', c5 && c5.message === 'reclamo viejo');
  check('backfill NO toca la ya verificada (id3 sigue sin claim_status)', (await pool.query('SELECT claim_status FROM businesses WHERE id=3')).rows[0].claim_status === null);

  server.close(); await pool.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });

  // ── Contrato sobre el fuente ─────────────────────────────────────────────
  const D = fs.readFileSync(BE + '/src/routes/directory.js', 'utf8');
  const A = fs.readFileSync(BE + '/src/routes/admin.js', 'utf8');
  check('src: el formulario setea claim_status=pending', /UPDATE businesses SET claim_status='pending'[\s\S]*claimed_at=NOW\(\)/.test(D));
  check('src: /leads excluye claim', /NOT IN \('promo_boost', 'claim'\)/.test(A));
  check('src: /claims expone origin + mensaje/evidencia', /origin: r\.user_id \? 'cuenta' : 'formulario'/.test(A));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
