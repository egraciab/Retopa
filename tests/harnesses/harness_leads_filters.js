// /admin/leads — filtro origin (captacion/venta) + semántica de vistas
// (verificado/descartado ahora cuentan como "tratados"). Verifica las cláusulas
// WHERE reales contra Postgres 16, incluyendo notes NO-JSON (IS JSON OBJECT).
const { execSync, spawnSync } = require('child_process');
const PGDATA = '/tmp/pg_lfilt', PORT = 55501, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const { Client } = require('pg');

// Cláusulas EXACTAS copiadas del endpoint GET /admin/leads
const BASE = `WHERE sl.service_type NOT IN ('promo_boost', 'claim')`;
const VIEW = {
  active:   `AND sl.archived = FALSE AND sl.status NOT IN ('won','lost','closed','verificado','descartado')`,
  archived: `AND (sl.archived = TRUE OR sl.status IN ('won','lost','closed','verificado','descartado'))`,
  all:      ``,
};
const CAPTACION_PRED = `(
  COALESCE(sl.service_type,'') NOT IN ('featured','premium','claim')
  AND (
    COALESCE(sl.service_type,'') IN ('basic','')
    OR COALESCE(sl.notes IS JSON OBJECT AND (sl.notes::jsonb->>'source') = 'web_register', FALSE)
  )
)`;
const ORIGIN = {
  captacion: `AND ${CAPTACION_PRED}`,
  venta:     `AND NOT ${CAPTACION_PRED}`,
  '':        ``,
};
const idsFor = async (c, view = 'all', origin = '') => {
  const sql = `SELECT sl.id FROM service_leads sl ${BASE} ${VIEW[view]} ${ORIGIN[origin]} ORDER BY sl.id`;
  return (await c.query(sql)).rows.map(r => r.id);
};
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();

  await c.query(`CREATE TABLE service_leads (id int primary key, service_type text, status text, notes text, archived boolean DEFAULT false)`);
  await c.query(`INSERT INTO service_leads (id, service_type, status, notes) VALUES
    (1,'basic','pending','{"source":"web_register"}'),
    (2,'basic','verificado','{"source":"web_register"}'),
    (3,'basic','descartado','{"source":"web_register"}'),
    (4,'featured','pending','{}'),
    (5,'featured','won',NULL),
    (6,'featured','contacted','texto plano no-json'),
    (7,'promo_boost','pending','{"source":"web_register"}'),
    (8,'claim','pending','{"source":"claim_request"}'),
    (9,'basic','pending','{"ruc":"800","address":"x"}'),
    (10,'general','pending','{}'),
    (11,'','pending',NULL)`);

  // ── Origen (sin filtro de vista) ─────────────────────────────────────────
  // Captación = ficha gratis (basic / sin plan) o marca web_register.
  check('captación = básicos/sin-plan {1,2,3,9,11}', eq(await idsFor(c, 'all', 'captacion'), [1, 2, 3, 9, 11]));
  check('caso Syrocco: basic SIN source → captación (id9)', (await idsFor(c, 'all', 'captacion')).includes(9));
  check('sin plan (service_type vacío) → captación (id11)', (await idsFor(c, 'all', 'captacion')).includes(11));
  check('venta = featured/general {4,5,6,10} (claim excluido de Leads)', eq(await idsFor(c, 'all', 'venta'), [4, 5, 6, 10]));
  check('general → venta, no captación (id10)', !(await idsFor(c, 'all', 'captacion')).includes(10));
  check('promo_boost SIEMPRE excluido (base)', !(await idsFor(c, 'all', '')).includes(7));
  check('claim EXCLUIDO de Leads en todo origen/vista (id8)', ![
    ...(await idsFor(c, 'all', '')), ...(await idsFor(c, 'all', 'venta')), ...(await idsFor(c, 'all', 'captacion')),
  ].includes(8));
  check('notes no-JSON (id6, featured) NO rompe y cae en venta', (await idsFor(c, 'all', 'venta')).includes(6));
  check('notes NULL (id5, featured) cae en venta', (await idsFor(c, 'all', 'venta')).includes(5));

  // ── Vistas: verificado/descartado ahora son "tratados" ───────────────────
  const active = await idsFor(c, 'active', '');
  check('active EXCLUYE verificado (2)', !active.includes(2));
  check('active EXCLUYE descartado (3)', !active.includes(3));
  check('active EXCLUYE won (5)', !active.includes(5));
  check('active INCLUYE nuevos/pending (1,4) y contacted (6); claim(8) fuera', [1, 4, 6].every(id => active.includes(id)) && !active.includes(8));

  const archived = await idsFor(c, 'archived', '');
  check('archived INCLUYE verificado/descartado/won (2,3,5)', [2, 3, 5].every(id => archived.includes(id)));
  check('archived NO incluye pending activo (1)', !archived.includes(1));

  // ── Combinaciones que usan las tarjetas KPI ──────────────────────────────
  check('captación + active = Nuevos por verificar {1,9,11}', eq(await idsFor(c, 'active', 'captacion'), [1, 9, 11]));
  check('captación + archived = verificados/descartados {2,3}', eq(await idsFor(c, 'archived', 'captacion'), [2, 3]));
  check('venta + archived = won {5}', eq(await idsFor(c, 'archived', 'venta'), [5]));

  await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
