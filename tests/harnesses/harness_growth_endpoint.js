// GET /admin/dashboard/growth — Pulso del directorio con rango + granularidad.
// Verifica la consulta REAL contra Postgres: bucket por rango, relleno de ceros,
// exclusión de inactivas y conteos correctos por ventana.
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_growth', PORT = 55503, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const { Client } = require('pg');

// Rangos y consulta EXACTOS del endpoint admin.js
const GROWTH_RANGES = {
  '1w': { bucket: 'day',   interval: '7 days',   label: 'día' },
  '1m': { bucket: 'day',   interval: '30 days',  label: 'día' },
  '3m': { bucket: 'week',  interval: '90 days',  label: 'semana' },
  '6m': { bucket: 'month', interval: '6 months', label: 'mes' },
};
const growthSql = `
  WITH series AS (
    SELECT generate_series(
      date_trunc($1, NOW() - $2::interval),
      date_trunc($1, NOW()),
      ('1 ' || $1)::interval
    ) AS period
  ),
  counts AS (
    SELECT date_trunc($1, created_at) AS period, COUNT(*)::int AS count
    FROM businesses
    WHERE is_active = true AND created_at >= date_trunc($1, NOW() - $2::interval)
    GROUP BY 1
  )
  SELECT to_char(s.period, 'YYYY-MM-DD') AS period, COALESCE(c.count, 0)::int AS count
  FROM series s LEFT JOIN counts c ON c.period = s.period
  ORDER BY s.period`;
const growth = async (c, range) => {
  const r = GROWTH_RANGES[range];
  return (await c.query(growthSql, [r.bucket, r.interval])).rows;
};
const sum = rows => rows.reduce((a, r) => a + r.count, 0);

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();
  await c.query(`CREATE TABLE businesses (id serial primary key, is_active boolean DEFAULT true, created_at timestamptz)`);

  const add = async (daysAgo, n, active = true) => {
    for (let i = 0; i < n; i++) await c.query(`INSERT INTO businesses (is_active, created_at) VALUES ($1, NOW() - ($2||' days')::interval)`, [active, String(daysAgo)]);
  };
  // Escenario tipo RetoPA: gran importación vieja + goteo reciente
  await add(1, 2);      // ayer: 2
  await add(3, 1);      // hace 3 días: 1
  await add(10, 3);     // hace 10 días: 3
  await add(40, 5);     // hace 40 días: 5 (fuera de 1 mes, dentro de 3 meses)
  await add(120, 11000);// hace ~4 meses: la importación de 15k (dentro de 6 meses)
  await add(5, 4, false); // inactivas: NO deben contar

  // ── 1 semana → por día ───────────────────────────────────────────────────
  let rows = await growth(c, '1w');
  check('1w: bucket por día (~8 puntos)', rows.length >= 7 && rows.length <= 9, 'n=' + rows.length);
  check('1w: cuenta solo la última semana (2+1=3)', sum(rows) === 3, 'sum=' + sum(rows));
  check('1w: rellena días sin altas con 0', rows.some(r => r.count === 0));
  check('1w: excluye inactivas', sum(rows) === 3);

  // ── 1 mes → por día ──────────────────────────────────────────────────────
  rows = await growth(c, '1m');
  check('1m: bucket por día (~31 puntos)', rows.length >= 29 && rows.length <= 32, 'n=' + rows.length);
  check('1m: incluye hasta 10 días (2+1+3=6), excluye los de 40 días', sum(rows) === 6, 'sum=' + sum(rows));

  // ── 3 meses → por semana ─────────────────────────────────────────────────
  rows = await growth(c, '3m');
  check('3m: bucket por semana (~13 puntos)', rows.length >= 12 && rows.length <= 14, 'n=' + rows.length);
  check('3m: incluye los de 40 días (2+1+3+5=11), NO la importación de 120 días', sum(rows) === 11, 'sum=' + sum(rows));

  // ── 6 meses → por mes ────────────────────────────────────────────────────
  rows = await growth(c, '6m');
  check('6m: bucket por mes (~7 puntos)', rows.length >= 6 && rows.length <= 8, 'n=' + rows.length);
  check('6m: incluye la importación de 15k (total 11011)', sum(rows) === 11011, 'sum=' + sum(rows));
  check('6m: un mes concentra los 11.000 (pico de importación)', rows.some(r => r.count >= 11000));
  check('6m: hay meses del goteo reciente con conteo bajo', rows.some(r => r.count > 0 && r.count < 100));

  await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });

  // ── Contrato sobre admin.js ──────────────────────────────────────────────
  const A = fs.readFileSync('/root/work/opt/retopa/backend/src/routes/admin.js', 'utf8');
  check('src: endpoint /dashboard/growth existe', /router\.get\(['"]\/dashboard\/growth['"]/.test(A));
  check('src: GROWTH_RANGES con 1w/1m/3m/6m', /'1w':[\s\S]*'1m':[\s\S]*'3m':[\s\S]*'6m':/.test(A));
  check('src: rellena con generate_series (línea continua)', /generate_series\(/.test(A) && A.includes("date_trunc($1, NOW() - $2::interval)"));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
