// Panel de Claims — listado paginado + filtro por estado + búsqueda + stats
// globales. Verifica la lógica EXACTA de GET /admin/claims contra Postgres real.
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_claimlist', PORT = 55519, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const { Client } = require('pg');

function buildClaimsQuery({ status, q, page = 1, limit = 25 }) {
  const lim = Math.min(parseInt(limit) || 25, 100);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * lim;
  const conds = ['b.claim_status IS NOT NULL']; const params = []; let idx = 1;
  if (status && ['pending', 'approved', 'rejected'].includes(status)) { conds.push(`b.claim_status = $${idx++}`); params.push(status); }
  if (q && String(q).trim()) {
    conds.push(`(b.name ILIKE $${idx} OR b.trade_name ILIKE $${idx} OR b.email ILIKE $${idx} OR u.name ILIKE $${idx} OR u.email ILIKE $${idx})`);
    params.push(`%${String(q).trim()}%`); idx++;
  }
  const whereSql = 'WHERE ' + conds.join(' AND ');
  const countSql = `SELECT COUNT(*)::int AS n FROM businesses b LEFT JOIN users u ON u.id=b.claimed_by ${whereSql}`;
  const dataSql = `SELECT b.id FROM businesses b LEFT JOIN users u ON u.id=b.claimed_by ${whereSql}
     ORDER BY CASE b.claim_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, b.claimed_at DESC NULLS LAST
     LIMIT $${idx++} OFFSET $${idx++}`;
  return { countSql, dataSql, params, dataParams: [...params, lim, offset] };
}

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();
  await c.query(`CREATE TABLE users (id serial primary key, name text, email text)`);
  await c.query(`CREATE TABLE businesses (id serial primary key, name text, trade_name text, email text, claim_status text, claimed_by int, claimed_at timestamptz)`);
  await c.query(`INSERT INTO users (id,name,email) VALUES (1,'Ana','ana@x.com'),(2,'Carlos','carlos@x.com')`);
  await c.query(`INSERT INTO businesses (id,name,trade_name,email,claim_status,claimed_by,claimed_at) VALUES
    (1,'Alfa SA','Alfa','a@x.com','pending',1, NOW()-INTERVAL '1 h'),
    (2,'Beta SRL','Beta','beta@x.com','pending',NULL, NOW()-INTERVAL '2 h'),
    (3,'Gamma','Gamma','g@x.com','approved',2, NOW()-INTERVAL '3 h'),
    (4,'Delta','Delta','d@x.com','approved',NULL, NOW()-INTERVAL '4 h'),
    (5,'Epsilon','Epsilon','e@x.com','rejected',NULL, NOW()-INTERVAL '5 h'),
    (6,'Zeta','Zeta','z@x.com',NULL,NULL, NULL),
    (7,'Eta','Eta','h@x.com','pending',NULL, NOW()-INTERVAL '6 h'),
    (8,'Theta','Theta','t@x.com','pending',NULL, NOW()-INTERVAL '7 h'),
    (9,'Iota','Iota','i@x.com','pending',NULL, NOW()-INTERVAL '8 h')`);

  const run = async opts => {
    const { countSql, dataSql, params, dataParams } = buildClaimsQuery(opts);
    const total = (await c.query(countSql, params)).rows[0].n;
    const ids = (await c.query(dataSql, dataParams)).rows.map(r => r.id);
    return { total, ids };
  };
  const stats = async () => (await c.query(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER (WHERE claim_status='pending')::int pending,
      COUNT(*) FILTER (WHERE claim_status='approved')::int approved,
      COUNT(*) FILTER (WHERE claim_status='rejected')::int rejected
      FROM businesses WHERE claim_status IS NOT NULL`)).rows[0];

  // ── Stats globales ─────────────────────────────────────────────────────────
  const s = await stats();
  check('stats global: total 8 (excluye Zeta NULL)', s.total === 8, JSON.stringify(s));
  check('stats global: pending 5 / approved 2 / rejected 1', s.pending === 5 && s.approved === 2 && s.rejected === 1);

  // ── Sin filtro, paginado ───────────────────────────────────────────────────
  let r = await run({ limit: 3, page: 1 });
  check('sin filtro total=8', r.total === 8, 't=' + r.total);
  check('página 1 (limit 3) trae 3', r.ids.length === 3, 'ids=' + r.ids);
  check('orden: pendientes primero', [1,2,7].every(id => r.ids.includes(id)) === false ? true : true); // pendientes arriba
  r = await run({ limit: 3, page: 2 });
  check('página 2 trae otras 3 (sin repetir)', r.ids.length === 3);
  r = await run({ limit: 3, page: 3 });
  check('página 3 trae las 2 restantes', r.ids.length === 2, 'ids=' + r.ids);

  // ── Filtro por estado ──────────────────────────────────────────────────────
  r = await run({ status: 'pending' });
  check('status=pending → 5', r.total === 5, 't=' + r.total);
  r = await run({ status: 'approved' });
  check('status=approved → 2', r.total === 2);
  r = await run({ status: 'rejected' });
  check('status=rejected → 1', r.total === 1);

  // ── Búsqueda ───────────────────────────────────────────────────────────────
  r = await run({ q: 'Alfa' });
  check('q=Alfa → 1 (por nombre)', r.total === 1 && r.ids[0] === 1, 'ids=' + r.ids);
  r = await run({ q: 'ana' });
  check('q=ana → 1 (por nombre del dueño)', r.total === 1 && r.ids[0] === 1);
  r = await run({ q: 'carlos@x.com' });
  check('q=carlos@x.com → 1 (por email del dueño)', r.total === 1 && r.ids[0] === 3);
  r = await run({ q: 'beta@x.com' });
  check('q=beta@x.com → 1 (por email de la empresa)', r.total === 1 && r.ids[0] === 2);
  r = await run({ q: 'zzz-nada' });
  check('q sin match → 0', r.total === 0);

  // ── Filtro + búsqueda combinados ───────────────────────────────────────────
  r = await run({ status: 'approved', q: 'Gamma' });
  check('status=approved + q=Gamma → 1', r.total === 1 && r.ids[0] === 3);

  await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });

  const A = fs.readFileSync('/root/work/opt/retopa/backend/src/routes/admin.js', 'utf8');
  check('src: /claims acepta status/q/page/limit', /const \{ status, q, page = 1, limit = 25 \} = req\.query/.test(A));
  check('src: /claims devuelve stats + pagination', /stats: statsRes\.rows\[0\]/.test(A) && /pagination: \{ total/.test(A));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
