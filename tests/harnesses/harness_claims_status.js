// Claims → sincronía de estado con el Dashboard.
// Prueba que aprobar un claim deja el lead en 'won' (Ganado) y que el embudo lo
// cuenta; que 'completed'/'new' legacy también caen bien; y que el badge mapea.
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_claimstat', PORT = 55518, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const { Client } = require('pg');

// Réplica EXACTA del embudo del dashboard (admin.js)
function buildFunnel(leadsByStatus) {
  return {
    pending:     (leadsByStatus['pending']||0) + (leadsByStatus['new']||0),
    contacted:   leadsByStatus['contacted']   || 0,
    negotiating: leadsByStatus['negotiating'] || 0,
    follow_up:   leadsByStatus['follow_up']   || 0,
    won:         (leadsByStatus['won']||0) + (leadsByStatus['closed']||0) + (leadsByStatus['completed']||0),
    lost:        leadsByStatus['lost']        || 0,
  };
}

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();
  await c.query(`CREATE TABLE service_leads (id serial primary key, business_id int, service_type text, status text, updated_at timestamptz DEFAULT now())`);
  await c.query(`INSERT INTO service_leads (business_id, service_type, status) VALUES
    (1,'claim','pending'),   -- A: form, sin aprobar
    (2,'claim','new'),       -- B: token legacy, sin aprobar
    (3,'claim','completed'), -- C: aprobado legacy (estado viejo)
    (4,'claim','won'),       -- D: aprobado correcto
    (5,'basic','pending'),   -- E: lead normal pendiente
    (6,'basic','lost')`);    // F: lead perdido

  const group = async () => {
    const rows = (await c.query('SELECT status, COUNT(*)::int AS n FROM service_leads GROUP BY status')).rows;
    const m = {}; rows.forEach(r => m[r.status] = r.n); return m;
  };

  // ── ANTES de aprobar ───────────────────────────────────────────────────────
  let f = buildFunnel(await group());
  check('embudo ANTES: Pendientes = 3 (pending A,E + new B)', f.pending === 3, 'p=' + f.pending);
  check('embudo ANTES: Ganados = 2 (won D + completed C)', f.won === 2, 'w=' + f.won);
  check('embudo ANTES: Perdidos = 1', f.lost === 1);

  // ── APROBAR claims (misma sentencia que /claims/approve) ───────────────────
  const upd = await c.query(
    `UPDATE service_leads SET status='won', updated_at=NOW()
     WHERE service_type='claim' AND status IN ('new','pending')`);
  check('aprobar toca solo los claims pending/new (A,B) = 2 filas', upd.rowCount === 2, 'rows=' + upd.rowCount);

  // ── DESPUÉS de aprobar ─────────────────────────────────────────────────────
  f = buildFunnel(await group());
  check('embudo DESPUÉS: Ganados = 4 (won A,B,D + completed C)', f.won === 4, 'w=' + f.won);
  check('embudo DESPUÉS: Pendientes = 1 (solo el lead normal E)', f.pending === 1, 'p=' + f.pending);
  check('lead normal E (basic) NO fue tocado', (await c.query(`SELECT status FROM service_leads WHERE business_id=5`)).rows[0].status === 'pending');

  await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });

  // ── Badge: STATUS_CONFIG real de config.js ─────────────────────────────────
  const CFG = fs.readFileSync('/root/work/opt/retopa/frontend/admin/js/config.js', 'utf8');
  const m = CFG.match(/const STATUS_CONFIG = \{[\s\S]*?\n\};/);
  // eslint-disable-next-line no-eval
  const STATUS_CONFIG = eval('(' + m[0].replace('const STATUS_CONFIG =', '') .replace(/;\s*$/, '') + ')');
  const label = s => (STATUS_CONFIG[s] || STATUS_CONFIG.pending).label;
  check('badge: won → Ganado', label('won') === 'Ganado');
  check('badge: completed (legacy) → Ganado', label('completed') === 'Ganado', label('completed'));
  check('badge: new (legacy) → Pendiente', label('new') === 'Pendiente', label('new'));
  check('badge: pending → Pendiente', label('pending') === 'Pendiente');

  // ── Contrato de fuente ─────────────────────────────────────────────────────
  const A = fs.readFileSync('/root/work/opt/retopa/backend/src/routes/admin.js', 'utf8');
  const CR = fs.readFileSync('/root/work/opt/retopa/backend/src/routes/claim.routes.js', 'utf8');
  check('src: /admin/claims/approve setea lead won', /SET status='won'[\s\S]*?service_type='claim' AND status IN \('new','pending'\)/.test(A));
  check('src: embudo cuenta completed en Ganados', /leadsByStatus\['completed'\]\|\|0/.test(A));
  check('src: claim.routes approve → won', /SET status = 'won'/.test(CR));
  check('src: claim.routes crea lead como pending', /'claim', 'pending'/.test(CR));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
