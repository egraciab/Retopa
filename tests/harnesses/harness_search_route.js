// Revalidación END-TO-END del registro de búsquedas.
// Monta el router REAL de directory.js (Redis simulado + Postgres real) y le pega
// HTTP a /businesses?q=... comprobando que search_events recibe la fila:
//   - en CACHE-HIT (el bug original: no registraba)
//   - en CACHE-MISS aunque la query principal falle (INSERT va ANTES del branch)
//   - respetando las guardas (1 char / offset>0 no registran)
const { execSync, spawnSync } = require('child_process');
const PGDATA = '/tmp/pg_searchrt', PORT = 55507, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { Pool } = require('pg');
const express = require('express');
const BE = '/root/work/opt/retopa/backend';

// ── Inyectar mocks en require.cache ANTES de requerir directory.js ──────────
function mock(relPath, exportsObj) {
  const abs = require.resolve(BE + '/src/' + relPath);
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports: exportsObj };
}

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const pool = new Pool({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' });
  await pool.query(`CREATE TABLE categories (id serial primary key, name text, slug text, business_count int DEFAULT 0)`);
  await pool.query(`CREATE TABLE search_events (id BIGSERIAL PRIMARY KEY, term VARCHAR(160), category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL, city VARCHAR(100), created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`INSERT INTO categories (id,name,slug,business_count) VALUES (1,'Yuyos y hierbas','yuyos',3)`);
  await pool.query(`CREATE TABLE site_config (key text, value text)`);
  // NO creamos businesses → en cache-miss la query principal fallará (y aun así debe registrar).

  // Redis en memoria
  const store = new Map();
  const redisMock = {
    get: async k => (store.has(k) ? store.get(k) : null),
    setEx: async (k, ttl, v) => { store.set(k, v); },
    set: async (k, v) => { store.set(k, v); },
    del: async k => { (Array.isArray(k) ? k : [k]).forEach(x => store.delete(x)); },
    keys: async () => [...store.keys()],
  };

  mock('db.js', pool);
  mock('config/redis.js', redisMock);
  mock('utils/plan-limits.js', { getPlanLimits: async () => ({ max_categories: 1 }) });
  mock('config/mail.js', { sendEmail: async () => {} });
  mock('utils/pwa-icon.js', { getPwaIcon: async () => null });

  const router = require(BE + '/src/routes/directory.js');
  const app = express(); app.use('/api/v2/directory', router);
  const server = app.listen(0); await new Promise(r => server.on('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v2/directory';
  const get = (qs) => fetch(base + '/businesses?' + qs).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
  const countTerm = async t => (await pool.query('SELECT COUNT(*)::int n FROM search_events WHERE term=$1', [t])).rows[0].n;

  // ── 1) CACHE-HIT: sembrar la caché para {q:'yuyo'} y pegar ────────────────
  const keyHit = 'dir:biz:' + Buffer.from(JSON.stringify({ q: 'yuyo' })).toString('base64');
  store.set(keyHit, JSON.stringify({ data: [], total: 0 }));
  let r = await get('q=yuyo');
  await sleep(150); // el INSERT es fire-and-forget
  check('cache-hit → responde 200 (desde caché)', r.status === 200);
  check('cache-hit → REGISTRA la búsqueda (era el bug)', (await countTerm('yuyo')) === 1, 'n=' + (await countTerm('yuyo')));
  check('cache-hit → categoría resuelta (yuyos=1)', (await pool.query(`SELECT category_id FROM search_events WHERE term='yuyo'`)).rows[0].category_id === 1);

  // ── 2) CACHE-MISS: sin sembrar; la query principal falla (no hay businesses)
  //     pero el INSERT va ANTES del branch → igual debe registrar. ───────────
  r = await get('q=monitor');
  await sleep(150);
  check('cache-miss → registra aunque la query principal falle', (await countTerm('monitor')) === 1, 'n=' + (await countTerm('monitor')));

  // ── 3) CACHE-HIT repetido: segunda búsqueda igual TAMBIÉN registra ────────
  await get('q=yuyo'); await sleep(150);
  check('cache-hit repetido → suma (yuyo=2, ya no se pierde)', (await countTerm('yuyo')) === 2, 'n=' + (await countTerm('yuyo')));

  // ── 4) Guardas ───────────────────────────────────────────────────────────
  await get('q=a'); await sleep(120);
  check('guarda: 1 char no registra', (await countTerm('a')) === 0);
  store.set('dir:biz:' + Buffer.from(JSON.stringify({ q: 'teclado', offset: '20' })).toString('base64'), JSON.stringify({ data: [], total: 0 }));
  await get('q=teclado&offset=20'); await sleep(120);
  check('guarda: offset>0 (paginación) no registra', (await countTerm('teclado')) === 0);

  server.close(); await pool.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
