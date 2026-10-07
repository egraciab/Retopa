// LOGROS (backend) — Postgres REAL. Verifica, contra el CÓDIGO FUENTE real:
//  1) 'achievements_config' está en el allowlist del PUT /site-config (admin.js)
//     y en el whitelist del GET público /site-config (directory.js).
//  2) Round-trip real: upsert (query exacta de admin.js) + SELECT whitelist
//     exacto de directory.js → devuelve achievements_config y FILTRA las no
//     whitelisteadas.
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_logros', PORT = 55561, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const ADMIN = fs.readFileSync('/root/work/opt/retopa/backend/src/routes/admin.js', 'utf8');
const DIR   = fs.readFileSync('/root/work/opt/retopa/backend/src/routes/directory.js', 'utf8');

// ── 1) Extraer del fuente real ───────────────────────────────────────────────
// allowlist del PUT: const allowed = [ ... ];  (el bloque que contiene site_name)
const allowedMatch = ADMIN.match(/const allowed = \[([\s\S]*?)\];/);
let allowed = [];
try { allowed = eval('[' + allowedMatch[1] + ']'); } catch (e) {}
check('admin.js: allowlist parseado', Array.isArray(allowed) && allowed.length > 10, 'len=' + allowed.length);
check("admin.js: allowlist incluye 'achievements_config'", allowed.includes('achievements_config'));
// isAllowed real: allowed.includes(k) || /^signals?_/.test(k)
const isAllowed = (k) => allowed.includes(k) || /^signals?_/.test(k);
check('admin.js: isAllowed acepta achievements_config', isAllowed('achievements_config'));
check('admin.js: isAllowed rechaza una key arbitraria', !isAllowed('hackeame_esto'));

// whitelist público: el grupo (...) sin paréntesis anidados que contiene achievements_config
const inMatch = DIR.match(/\(([^()]*'achievements_config'[^()]*)\)/);
let whitelist = [];
try { whitelist = eval('[' + inMatch[1] + ']'); } catch (e) {}
check('directory.js: whitelist público parseado', Array.isArray(whitelist) && whitelist.length > 10, 'len=' + whitelist.length);
check("directory.js: whitelist incluye 'achievements_config'", whitelist.includes('achievements_config'));

// ── 2) Round-trip real en Postgres ───────────────────────────────────────────
(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const { Client } = require('pg');
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();
  await c.query(`CREATE TABLE site_config (key varchar(100) PRIMARY KEY, value text, updated_at timestamptz DEFAULT now())`);

  // Query EXACTA del PUT admin.js (upsert)
  const UPSERT = `INSERT INTO site_config (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`;
  const cfgJson = JSON.stringify([{ id: 'querido', enabled: true, label: 'Fans', threshold: 5, order: 0 }]);

  // Simular el PUT: sólo se guardan las keys permitidas por isAllowed
  const incoming = { achievements_config: cfgJson, hackeame_esto: 'no', secret_x: 'tampoco' };
  for (const [k, v] of Object.entries(incoming)) {
    if (isAllowed(k)) await c.query(UPSERT, [k, v]);
  }
  // Insertamos a mano una key NO whitelisteada para probar el filtro del SELECT público
  await c.query(UPSERT, ['smtp_pass', 'SECRETO']);  // smtp_pass no está en el whitelist público

  const stored = await c.query(`SELECT value FROM site_config WHERE key='achievements_config'`);
  check('round-trip: achievements_config se guardó (upsert real)', stored.rows[0] && stored.rows[0].value === cfgJson);
  const hack = await c.query(`SELECT 1 FROM site_config WHERE key='hackeame_esto'`);
  check('round-trip: key no permitida NO se guardó (isAllowed)', hack.rows.length === 0);

  // Query EXACTA del GET público (whitelist) — construida desde el whitelist real del fuente
  const inList = whitelist.map(k => `'${k}'`).join(',');
  const pub = await c.query(`SELECT key, value FROM site_config WHERE key IN (${inList})`);
  const pubKeys = pub.rows.map(r => r.key);
  check('GET público: devuelve achievements_config', pubKeys.includes('achievements_config'));
  check('GET público: NO expone smtp_pass (no whitelisteado)', !pubKeys.includes('smtp_pass'));
  const val = (pub.rows.find(r => r.key === 'achievements_config') || {}).value;
  check('GET público: el JSON de logros viaja intacto', val === cfgJson);

  await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
