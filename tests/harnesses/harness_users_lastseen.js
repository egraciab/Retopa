// Usuarios — último acceso (last_seen_at) + ficha propia (owned_slug) en /admin/users.
// Verifica la consulta REAL de lista contra Postgres, incluida la re-escritura a
// COUNT (regex) que ahora convive con la subconsulta owned_slug.
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_userseen', PORT = 55515, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const { Client } = require('pg');

// Consulta EXACTA del endpoint GET /admin/users (count limpio + data)
function buildUsersQuery({ q, role, is_active, limit = 25, page = 1 }) {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const conds = ['1=1']; const params = []; let idx = 1;
  if (q) { conds.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx})`); params.push(`%${q}%`); idx++; }
  if (role) { conds.push(`u.role = $${idx++}`); params.push(role); }
  if (is_active !== undefined && is_active !== '') { conds.push(`u.is_active = $${idx++}`); params.push(is_active === 'true'); }
  const whereSql = 'WHERE ' + conds.join(' AND ');
  const countSql = `SELECT COUNT(DISTINCT u.id)::int AS n FROM users u ${whereSql}`;
  const sql = `
      SELECT u.id, u.name, u.email, u.phone, u.city, u.role, u.is_active, u.created_at, u.last_seen_at,
             COUNT(ub.business_id) as business_count,
             (SELECT b.slug FROM user_businesses ub2 JOIN businesses b ON b.id = ub2.business_id
               WHERE ub2.user_id = u.id AND ub2.is_owner = TRUE ORDER BY ub2.business_id LIMIT 1) AS owned_slug
      FROM users u LEFT JOIN user_businesses ub ON ub.user_id = u.id
      ${whereSql}
      GROUP BY u.id, u.name, u.email, u.phone, u.city, u.role, u.is_active, u.created_at, u.last_seen_at
      ORDER BY u.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  return { sql, countSql, params: [...params], dataParams: [...params, parseInt(limit), offset] };
}

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();
  await c.query(`CREATE TABLE users (id serial primary key, name text, email text, phone text, city text, role text, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now(), last_seen_at timestamptz)`);
  await c.query(`CREATE TABLE businesses (id serial primary key, slug text)`);
  await c.query(`CREATE TABLE user_businesses (user_id int, business_id int, is_owner boolean)`);
  await c.query(`INSERT INTO users (id,name,email,role,last_seen_at,created_at) VALUES
    (1,'Ana','ana@x.com','client', NOW(), NOW()-INTERVAL '10 days'),
    (2,'Beto','beto@x.com','user', NULL, NOW()-INTERVAL '5 days'),
    (3,'Cata','cata@x.com','user', NOW()-INTERVAL '3 days', NOW()-INTERVAL '20 days')`);
  await c.query(`INSERT INTO businesses (id,slug) VALUES (10,'ficha-ana'),(11,'ficha-ana2')`);
  await c.query(`INSERT INTO user_businesses (user_id,business_id,is_owner) VALUES (1,10,true),(1,11,false)`);

  const run = async opts => {
    const { sql, countSql, params, dataParams } = buildUsersQuery(opts);
    const rows = (await c.query(sql, dataParams)).rows;
    const total = (await c.query(countSql, params)).rows[0].n;
    return { rows, total };
  };

  // ── Lista completa ────────────────────────────────────────────────────────
  let r = await run({});
  check('lista trae los 3 usuarios', r.rows.length === 3);
  check('COUNT limpio da el total correcto (=3, arregla el "Total: 1")', r.total === 3, 'total=' + r.total);
  const ana = r.rows.find(u => u.id === 1), beto = r.rows.find(u => u.id === 2);
  check('devuelve last_seen_at (Ana con valor)', ana.last_seen_at != null);
  check('last_seen_at NULL cuando nunca entró (Beto)', beto.last_seen_at === null);
  check('business_count correcto (Ana=2: dueña+delegada)', Number(ana.business_count) === 2, 'n=' + ana.business_count);
  check('owned_slug = ficha de la que es DUEÑA (ana → ficha-ana)', ana.owned_slug === 'ficha-ana');
  check('owned_slug NULL si no es dueño de ninguna (Beto)', beto.owned_slug === null);

  // ── Filtros ───────────────────────────────────────────────────────────────
  r = await run({ q: 'ana' });
  check('filtro q=ana → 1 (y COUNT coincide)', r.rows.length === 1 && r.total === 1);
  r = await run({ role: 'user' });
  check('filtro role=user → 2', r.rows.length === 2 && r.total === 2);

  // ── KPIs globales (tarjetas) — NO dependen de filtro/página ────────────────
  const stats = (await c.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE is_active)::int  AS active,
           COUNT(*) FILTER (WHERE role='client')::int  AS clients,
           COUNT(*) FILTER (WHERE role='admin')::int   AS admins,
           COUNT(*) FILTER (WHERE role='godmode')::int AS godmode
    FROM users`)).rows[0];
  check('KPI total global = 3', stats.total === 3);
  check('KPI activos global = 3', stats.active === 3);
  check('KPI clientes global = 1 (solo Ana)', stats.clients === 1);
  check('KPI admins/godmode = 0', stats.admins === 0 && stats.godmode === 0);

  await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });

  const A = fs.readFileSync('/root/work/opt/retopa/backend/src/routes/admin.js', 'utf8');
  check('src: /users SELECT incluye last_seen_at', /SELECT u\.id[\s\S]*u\.last_seen_at,/.test(A));
  check('src: /users SELECT incluye owned_slug (ficha propia)', /AS owned_slug/.test(A));
  check('src: count usa COUNT(DISTINCT u.id) sin GROUP BY', /SELECT COUNT\(DISTINCT u\.id\)::int AS n FROM users u \${whereSql}/.test(A));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
