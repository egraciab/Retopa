// Envío en lote — segmento (filtros de /users) + cooldown por destinatario+plantilla
// (email_log) + tope por tanda. Verifica la lógica EXACTA contra Postgres real.
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_bulkmail', PORT = 55520, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const { Client } = require('pg');

// Réplica EXACTA del endpoint POST /admin/users/bulk-email.
function build({ template, q, role, is_active, inactive_days, cooldown_days = 7, limit = 500 }) {
  const base = ['1=1']; const bp = []; let bi = 1;
  if (q)    { base.push(`(u.name ILIKE $${bi} OR u.email ILIKE $${bi})`); bp.push(`%${q}%`); bi++; }
  if (role) { base.push(`u.role = $${bi++}`); bp.push(role); }
  if (is_active !== undefined && is_active !== '') { base.push(`u.is_active = $${bi++}`); bp.push(is_active === true || is_active === 'true'); }
  const invDays = parseInt(inactive_days, 10);
  if (Number.isFinite(invDays) && invDays > 0) { base.push(`(u.last_seen_at IS NULL OR u.last_seen_at < NOW() - ($${bi} || ' days')::interval)`); bp.push(String(invDays)); bi++; }
  base.push('u.email IS NOT NULL');
  const baseWhere = 'WHERE ' + base.join(' AND ');
  const cd = Math.max(parseInt(cooldown_days, 10) || 0, 0);
  let eligWhere = baseWhere; const eligParams = [...bp]; let ci = bi;
  if (cd > 0) {
    eligWhere += ` AND NOT EXISTS (SELECT 1 FROM email_log el WHERE el.to_email = u.email AND el.type = $${ci} AND el.status='sent' AND el.created_at > NOW() - ($${ci + 1} || ' days')::interval)`;
    eligParams.push(template, String(cd)); ci += 2;
  }
  const dataSql = `SELECT u.id, u.email,
      (SELECT COALESCE(b.trade_name,b.name) FROM user_businesses ub JOIN businesses b ON b.id=ub.business_id WHERE ub.user_id=u.id AND ub.is_owner=TRUE ORDER BY ub.business_id LIMIT 1) AS owned_name
      FROM users u ${eligWhere} ORDER BY u.last_seen_at ASC NULLS FIRST, u.created_at ASC LIMIT $${ci}`;
  return { baseWhere, bp, eligWhere, eligParams, dataSql, cd };
}

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();
  await c.query(`CREATE TABLE users (id serial primary key, name text, email text, role text, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now(), last_seen_at timestamptz)`);
  await c.query(`CREATE TABLE businesses (id serial primary key, name text, trade_name text)`);
  await c.query(`CREATE TABLE user_businesses (user_id int, business_id int, is_owner boolean)`);
  await c.query(`CREATE TABLE email_log (id serial primary key, to_email text, type text, status text, created_at timestamptz DEFAULT now())`);
  await c.query(`INSERT INTO users (id,name,email,role,last_seen_at) VALUES
    (1,'Ana','ana@x.com','client', NOW()-INTERVAL '40 days'),
    (2,'Beto','beto@x.com','user', NULL),
    (3,'Cata','cata@x.com','user', NOW()-INTERVAL '10 days'),
    (4,'Dani','dani@x.com','client', NOW()-INTERVAL '200 days'),
    (5,'Eli', NULL,       'user', NOW()-INTERVAL '40 days'),
    (6,'Adm','adm@x.com','admin', NOW()-INTERVAL '40 days')`);
  await c.query(`INSERT INTO businesses (id,name,trade_name) VALUES (10,'Ferretería Beto','Ferre Beto')`);
  await c.query(`INSERT INTO user_businesses (user_id,business_id,is_owner) VALUES (2,10,true)`);
  // Cooldown: Ana recibió 'reactivation' hace 2d (dentro de 7) → excluida; Dani hace 20d → incluida
  await c.query(`INSERT INTO email_log (to_email,type,status,created_at) VALUES
    ('ana@x.com','reactivation','sent', NOW()-INTERVAL '2 days'),
    ('dani@x.com','reactivation','sent', NOW()-INTERVAL '20 days')`);

  const run = async (opts) => {
    const q = build(opts);
    const matched = (await c.query(`SELECT COUNT(*)::int n FROM users u ${q.baseWhere}`, q.bp)).rows[0].n;
    const eligible = (await c.query(`SELECT COUNT(*)::int n FROM users u ${q.eligWhere}`, q.eligParams)).rows[0].n;
    const cap = Math.min(Math.max(parseInt(opts.limit,10)||500,1),2000);
    const rows = (await c.query(q.dataSql, [...q.eligParams, cap])).rows;
    return { matched, eligible, skipped: Math.max(matched-eligible,0), would_send: Math.min(eligible,cap), ids: rows.map(r=>r.id), rows };
  };

  // Segmento sin acceso +30d, plantilla reactivation, cooldown 7
  let r = await run({ template:'reactivation', inactive_days:30, cooldown_days:7 });
  check('matched (sin acceso +30d, con email) = 4 (Ana,Beto,Dani,Adm; Eli sin email fuera)', r.matched === 4, 'm='+r.matched);
  check('eligible = 3 (excluye Ana por cooldown 7d)', r.eligible === 3, 'e='+r.eligible);
  check('skipped_cooldown = 1 (Ana)', r.skipped === 1);
  check('Dani NO se salta (envío hace 20d > cooldown 7d)', r.ids.includes(4));
  check('orden last_seen ASC NULLS FIRST → Beto(NULL) primero', r.ids[0] === 2, 'ids='+r.ids);
  check('owned_name resuelto para Beto (Ferre Beto)', r.rows.find(x=>x.id===2)?.owned_name === 'Ferre Beto');

  // Tope por tanda
  r = await run({ template:'reactivation', inactive_days:30, cooldown_days:7, limit:2 });
  check('tope=2 → would_send 2, eligible 3', r.would_send === 2 && r.eligible === 3);
  check('tope respeta orden → Beto, Dani', r.ids.join() === '2,4', 'ids='+r.ids);

  // role=user acota el segmento
  r = await run({ template:'reactivation', inactive_days:30, role:'user', cooldown_days:7 });
  check('role=user + sin acceso +30d → matched 1 (solo Beto)', r.matched === 1 && r.ids.join()==='2', 'm='+r.matched+' ids='+r.ids);

  // cooldown 0 → sin exclusión
  r = await run({ template:'reactivation', inactive_days:30, cooldown_days:0 });
  check('cooldown=0 → eligible = matched (4, incluye Ana)', r.eligible === 4 && r.ids.includes(1));

  // otra plantilla distinta → el cooldown de reactivation no aplica
  r = await run({ template:'tipsFicha', inactive_days:30, cooldown_days:7 });
  check('plantilla distinta (tipsFicha) → cooldown de reactivation no aplica (eligible 4)', r.eligible === 4);

  await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });

  // Contrato de fuente
  const A = fs.readFileSync('/root/work/opt/retopa/backend/src/routes/admin.js', 'utf8');
  check('src: endpoint /users/bulk-email', /router\.post\('\/users\/bulk-email'/.test(A));
  check('src: valida plantilla con renderTemplate', /mail\.renderTemplate\(template/.test(A));
  check('src: cooldown NOT EXISTS sobre email_log por tipo', /NOT EXISTS \(SELECT 1 FROM email_log el WHERE el\.to_email = u\.email/.test(A));
  check('src: preview no envía (retorna would_send)', /preview: true, matched, eligible, skipped_cooldown, would_send/.test(A));
  check('src: rate-limit 333ms en el envío', /setTimeout\(r, 333\)/.test(A));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
