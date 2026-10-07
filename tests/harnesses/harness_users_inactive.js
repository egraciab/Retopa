// Usuarios — filtro "sin acceso" (inactive_days) sobre /admin/users.
// Verifica contra Postgres REAL que el filtro devuelve inactivos hace +N días
// INCLUYENDO a los que nunca entraron (last_seen NULL), y que el COUNT coincide.
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_userinact', PORT = 55516, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const { Client } = require('pg');

// Consulta EXACTA del endpoint GET /admin/users, con el nuevo filtro inactive_days.
function buildUsersQuery({ q, role, is_active, inactive_days, limit = 25, page = 1 }) {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const conds = ['1=1']; const params = []; let idx = 1;
  if (q) { conds.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx})`); params.push(`%${q}%`); idx++; }
  if (role) { conds.push(`u.role = $${idx++}`); params.push(role); }
  if (is_active !== undefined && is_active !== '') { conds.push(`u.is_active = $${idx++}`); params.push(is_active === 'true'); }
  const invDays = parseInt(inactive_days, 10);
  if (Number.isFinite(invDays) && invDays > 0) {
    conds.push(`(u.last_seen_at IS NULL OR u.last_seen_at < NOW() - ($${idx} || ' days')::interval)`);
    params.push(String(invDays)); idx++;
  }
  const whereSql = 'WHERE ' + conds.join(' AND ');
  const countSql = `SELECT COUNT(DISTINCT u.id)::int AS n FROM users u ${whereSql}`;
  const sql = `
      SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.last_seen_at
      FROM users u LEFT JOIN user_businesses ub ON ub.user_id = u.id
      ${whereSql}
      GROUP BY u.id
      ORDER BY u.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  return { sql, countSql, params: [...params], dataParams: [...params, parseInt(limit), offset] };
}

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();
  await c.query(`CREATE TABLE users (id serial primary key, name text, email text, role text, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now(), last_seen_at timestamptz)`);
  await c.query(`CREATE TABLE user_businesses (user_id int, business_id int, is_owner boolean)`);
  // Ana: hoy | Beto: NUNCA | Cata: hace 10d | Dani: hace 45d | Eli: hace 200d
  await c.query(`INSERT INTO users (id,name,email,role,last_seen_at,created_at) VALUES
    (1,'Ana','ana@x.com','client', NOW(),                    NOW()-INTERVAL '1 day'),
    (2,'Beto','beto@x.com','user', NULL,                      NOW()-INTERVAL '2 day'),
    (3,'Cata','cata@x.com','user', NOW()-INTERVAL '10 days',  NOW()-INTERVAL '3 day'),
    (4,'Dani','dani@x.com','user', NOW()-INTERVAL '45 days',  NOW()-INTERVAL '4 day'),
    (5,'Eli','eli@x.com','client', NOW()-INTERVAL '200 days', NOW()-INTERVAL '5 day')`);

  const run = async opts => {
    const { sql, countSql, params, dataParams } = buildUsersQuery(opts);
    const rows = (await c.query(sql, dataParams)).rows;
    const total = (await c.query(countSql, params)).rows[0].n;
    return { ids: rows.map(r => r.id), total };
  };

  // Sin filtro → los 5
  let r = await run({});
  check('sin filtro → 5 usuarios', r.total === 5, 'total=' + r.total);

  // +7 días → Beto(NULL), Cata(10), Dani(45), Eli(200)  (NO Ana)
  r = await run({ inactive_days: '7' });
  check('sin acceso +7d → 4 (incluye NULL, excluye a Ana de hoy)', r.total === 4 && r.ids.length === 4, 'ids=' + r.ids);
  check('sin acceso +7d → incluye a Beto (nunca entró)', r.ids.includes(2));
  check('sin acceso +7d → NO incluye a Ana (activa hoy)', !r.ids.includes(1));

  // +30 días → Beto(NULL), Dani(45), Eli(200)  (NO Ana, NO Cata de 10d)
  r = await run({ inactive_days: '30' });
  check('sin acceso +30d → 3', r.total === 3, 'ids=' + r.ids);
  check('sin acceso +30d → excluye a Cata (10 días)', !r.ids.includes(3));
  check('sin acceso +30d → incluye Dani(45) y Eli(200)', r.ids.includes(4) && r.ids.includes(5));
  check('sin acceso +30d → sigue incluyendo NULL (Beto)', r.ids.includes(2));

  // +90 días → Beto(NULL), Eli(200)
  r = await run({ inactive_days: '90' });
  check('sin acceso +90d → 2 (Beto NULL + Eli 200d)', r.total === 2 && r.ids.includes(2) && r.ids.includes(5), 'ids=' + r.ids);

  // Combinado con role=user → Beto(NULL), Dani(45)  [Eli es client]
  r = await run({ inactive_days: '30', role: 'user' });
  check('sin acceso +30d + role=user → 2 (Beto, Dani; Eli es client)', r.total === 2 && r.ids.includes(2) && r.ids.includes(4), 'ids=' + r.ids);

  // Valor inválido/0 → se ignora (los 5)
  r = await run({ inactive_days: '0' });
  check('inactive_days=0 se ignora → 5', r.total === 5);
  r = await run({ inactive_days: 'abc' });
  check('inactive_days no numérico se ignora → 5', r.total === 5);

  await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });

  // Contrato sobre el fuente real
  const A = fs.readFileSync('/root/work/opt/retopa/backend/src/routes/admin.js', 'utf8');
  check('src: /users lee inactive_days del query', /inactive_days\s*\}\s*=\s*req\.query|,\s*inactive_days\s*\}/.test(A));
  check('src: filtro usa last_seen_at IS NULL OR < NOW()-interval', /u\.last_seen_at IS NULL OR u\.last_seen_at < NOW\(\) - \(\$\$\{idx\} \|\| ' days'\)::interval/.test(A));
  check('src: valida invDays > 0 (Number.isFinite)', /Number\.isFinite\(invDays\)\s*&&\s*invDays\s*>\s*0/.test(A));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
