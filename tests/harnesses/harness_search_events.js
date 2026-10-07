// "Top términos del mes" (Semáforo) — registro de búsquedas.
// Bug: el INSERT en search_events vivía DENTRO del branch de cache-miss, así que
// las búsquedas servidas desde Redis (las repetidas) nunca se guardaban.
// Este harness verifica (1) el INSERT + la lectura reales contra Postgres, y
// (2) por estructura del fuente, que el registro ya NO dependa del caché.
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_searchev', PORT = 55505, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const { Client } = require('pg');

// SQL EXACTO del endpoint (INSERT en directory.js, lectura en admin.js)
const INSERT_SQL = `
  INSERT INTO search_events (term, category_id, city)
  VALUES ($1,
          COALESCE(
            (SELECT id FROM categories WHERE slug = $2 LIMIT 1),
            (SELECT id FROM categories WHERE name ILIKE $3 OR slug ILIKE $3 ORDER BY business_count DESC NULLS LAST LIMIT 1)
          ),
          $4)`;
const TOP_SQL = `
  SELECT term, COUNT(*)::int AS n FROM search_events
  WHERE created_at >= date_trunc('month', NOW()) AND created_at < date_trunc('month', NOW()) + interval '1 month'
    AND term IS NOT NULL AND term <> ''
  GROUP BY term ORDER BY n DESC, term ASC LIMIT 50`;

// Réplica de la guarda JS del endpoint (qClean + offset 0 + term>=2 chars)
function shouldLog(qRaw, offset) {
  const qClean = (qRaw || '').trim();
  if (!qClean || (parseInt(offset) || 0) !== 0) return null;
  const term = qClean.toLowerCase().replace(/\s+/g, ' ').slice(0, 160);
  return term.length >= 2 ? term : null;
}

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();

  await c.query(`CREATE TABLE categories (id serial primary key, name text, slug text, business_count int DEFAULT 0)`);
  // Esquema real de la migración 2026-08-04_search_events.sql
  await c.query(`CREATE TABLE search_events (
    id BIGSERIAL PRIMARY KEY, term VARCHAR(160),
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    city VARCHAR(100), created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP)`);
  await c.query(`INSERT INTO categories (id,name,slug,business_count) VALUES
    (1,'Farmacias','farmacias',10),(2,'Restaurantes','restaurantes',5)`);

  const logSearch = async (qRaw, slug, city, offset = 0) => {
    const term = shouldLog(qRaw, offset);
    if (!term) return false;
    await c.query(INSERT_SQL, [term, slug || null, `%${term}%`, city ? String(city).trim().slice(0, 100) : null]);
    return true;
  };

  // ── Simular búsquedas (como si vinieran del sitio) ───────────────────────
  await logSearch('Farmacia', null, 'Asunción');   // sin slug → resuelve por nombre
  await logSearch('farmacia ', null, 'Asunción');  // repetida (esta ANTES no se guardaba: cache hit)
  await logSearch('  FARMACIA', null, null);       // normaliza (trim/lower) → mismo término
  await logSearch('restaurante', 'restaurantes', 'Luque'); // con slug
  await logSearch('restaurante', 'restaurantes', 'Luque');

  // Guardas: no debe registrar
  check('guarda: término de 1 char no se registra', (await logSearch('a', null, null)) === false);
  check('guarda: sin término no se registra', (await logSearch('   ', null, null)) === false);
  check('guarda: paginación (offset>0) no se registra', (await logSearch('farmacia', null, null, 20)) === false);

  // ── Lectura Top términos del mes ─────────────────────────────────────────
  const top = (await c.query(TOP_SQL)).rows;
  const byTerm = Object.fromEntries(top.map(r => [r.term, r.n]));
  check('registra búsquedas repetidas (farmacia = 3)', byTerm['farmacia'] === 3, 'n=' + byTerm['farmacia']);
  check('normaliza mayúsculas/espacios al mismo término', Object.keys(byTerm).filter(t => t === 'farmacia').length === 1);
  check('restaurante = 2', byTerm['restaurante'] === 2, 'n=' + byTerm['restaurante']);
  check('Top ordenado por frecuencia desc', top[0].term === 'farmacia' && top[0].n === 3);

  // ── Resolución de categoría ──────────────────────────────────────────────
  const catFarm = (await c.query(`SELECT DISTINCT category_id FROM search_events WHERE term='farmacia'`)).rows;
  check('categoría resuelta por NOMBRE cuando no hay slug (Farmacias=1)', catFarm.length === 1 && catFarm[0].category_id === 1);
  const catResto = (await c.query(`SELECT DISTINCT category_id FROM search_events WHERE term='restaurante'`)).rows;
  check('categoría resuelta por SLUG (restaurantes=2)', catResto.length === 1 && catResto[0].category_id === 2);

  // ── Filtro por mes: lo del mes pasado NO cuenta ──────────────────────────
  await c.query(`INSERT INTO search_events (term, category_id, city, created_at)
                 VALUES ('viejo', 1, NULL, date_trunc('month', NOW()) - interval '5 days')`);
  const top2 = (await c.query(TOP_SQL)).rows.map(r => r.term);
  check('mes anterior excluido del Top del mes', !top2.includes('viejo'));

  await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });

  // ── Contrato: el registro ya NO depende del caché ────────────────────────
  const D = fs.readFileSync('/root/work/opt/retopa/backend/src/routes/directory.js', 'utf8');
  const idxBizRoute = D.indexOf("router.get('/businesses'");
  const idxInsert = D.indexOf('INSERT INTO search_events');
  const idxCacheAfterInsert = D.indexOf('if (!data) {', idxInsert); // branch de caché de /businesses
  check('src: hay exactamente 1 INSERT a search_events', (D.match(/INSERT INTO search_events/g) || []).length === 1);
  check('src: el INSERT está dentro de /businesses y ANTES de su branch if(!data)',
    idxBizRoute > 0 && idxInsert > idxBizRoute && idxCacheAfterInsert > idxInsert);
  check('src: el catch ahora loguea el error (no lo traga en silencio)', /\[search_events\][^\n]*insert falló/.test(D));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
