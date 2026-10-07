// Notificar empresas — filtro de elegibilidad de campaña + preview ("recalcular")
// + tope por tanda. Verifica la lógica EXACTA contra Postgres real.
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_notifycamp', PORT = 55517, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const { Client } = require('pg');

// ── Réplica EXACTA de lo que hay en admin.notify.routes.js ───────────────────
const SCORE_SQL = `(CASE WHEN b.verified THEN 40 ELSE 0 END
   + CASE WHEN b.email       IS NOT NULL THEN 15 ELSE 0 END
   + CASE WHEN b.phone       IS NOT NULL THEN 15 ELSE 0 END
   + CASE WHEN b.website     IS NOT NULL THEN 10 ELSE 0 END
   + CASE WHEN b.description  IS NOT NULL THEN 10 ELSE 0 END)`;
function buildCampaignFilter(body = {}, cooldownDays = 30) {
  const conds = ['b.is_active = TRUE', 'b.verified = FALSE', 'b.email IS NOT NULL'];
  const params = []; let idx = 1;
  const includeCooldown = !(body.include_cooldown === false || body.include_cooldown === 'false');
  const cd = parseInt(cooldownDays, 10) || 30;
  if (includeCooldown) conds.push(`(b.notified_at IS NULL OR b.notified_at < NOW() - INTERVAL '${cd} days')`);
  else                 conds.push('b.notified_at IS NULL');
  if (body.source)     { conds.push(`b.source = $${idx++}`); params.push(String(body.source)); }
  if (body.city && String(body.city).trim()) { conds.push(`LOWER(b.city) = LOWER($${idx++})`); params.push(String(body.city).trim()); }
  const minScore = parseInt(body.min_score, 10);
  if (Number.isFinite(minScore) && minScore > 0) { conds.push(`${SCORE_SQL} >= $${idx++}`); params.push(minScore); }
  return { whereSql: 'WHERE ' + conds.join(' AND '), params, nextIdx: idx, includeCooldown };
}

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();
  await c.query(`CREATE TABLE businesses (
    id serial primary key, name text, email text, phone text, website text, description text,
    city text, source text, is_active boolean DEFAULT true, verified boolean DEFAULT false,
    notified_at timestamptz, notify_count int DEFAULT 0, created_at timestamptz DEFAULT now())`);
  // score = 15(email)+15(phone)+10(web)+10(desc)  (verified siempre F acá)
  await c.query(`INSERT INTO businesses (id,name,email,phone,website,description,city,source,verified,notified_at,created_at) VALUES
    (1,'Ana','a@x.com','1','w','d','Asunción','MIC', false, NULL,                  NOW()-INTERVAL '1 d'),  -- score 50, nunca
    (2,'Beto','b@x.com',NULL,NULL,NULL,'Luque','MIC', false, NULL,                  NOW()-INTERVAL '2 d'),  -- score 15, nunca
    (3,'Cata','c@x.com','1',NULL,NULL,'Asunción','MIC', false, NOW()-INTERVAL '3 d',NOW()-INTERVAL '3 d'),  -- score 30, notif reciente (dentro cooldown 7)
    (4,'Dani','d@x.com','1','w',NULL,'Asunción','import_nil', false, NOW()-INTERVAL '40 d', NOW()-INTERVAL '4 d'), -- score 40, notif vieja
    (5,'Eli','e@x.com','1','w','d','Asunción','MIC', true,  NULL, NOW()-INTERVAL '5 d'),  -- VERIFICADA → excluida
    (6,'Fabi',NULL,'1','w','d','Asunción','MIC', false, NULL, NOW()-INTERVAL '6 d'),       -- sin email → excluida
    (8,'Hugo','h@x.com',NULL,NULL,'d','Luque','import_nil', false, NULL, NOW()-INTERVAL '8 d')`); // Hugo: score 25, nunca
  await c.query(`INSERT INTO businesses (id,name,email,city,source,is_active,verified,notified_at) VALUES
    (7,'Gabi','g@x.com','Asunción','MIC', false, false, NULL)`); // inactiva → excluida

  const CD = 7;
  const preview = async (body) => {
    const { whereSql, params } = buildCampaignFilter(body, CD);
    const total = parseInt((await c.query(`SELECT COUNT(*) FROM businesses b ${whereSql}`, params)).rows[0].count);
    const cap = parseInt(body.limit, 10); const hasCap = Number.isFinite(cap) && cap > 0;
    return { total, to_send: hasCap ? Math.min(total, cap) : total };
  };
  const ids = async (body) => {
    const { whereSql, params, nextIdx } = buildCampaignFilter(body, CD);
    const cap = parseInt(body.limit, 10); const hasCap = Number.isFinite(cap) && cap > 0;
    const rows = (await c.query(
      `SELECT b.id FROM businesses b ${whereSql} ORDER BY b.notified_at ASC NULLS FIRST, b.created_at DESC ${hasCap ? `LIMIT $${nextIdx}` : ''}`,
      hasCap ? [...params, cap] : params)).rows;
    return rows.map(r => r.id);
  };

  // Base: sin filtros, include_cooldown por defecto (true)
  let r = await preview({});
  check('elegibles base (nunca + cooldown>7d) = 4 (Ana,Beto,Dani,Hugo)', r.total === 4, 'total=' + r.total);
  check('excluye verificada/sin-email/inactiva/reciente', !(await ids({})).some(i => [3,5,6,7].includes(i)), 'ids=' + await ids({}));

  // include_cooldown = false → solo nunca notificadas (excluye Dani)
  r = await preview({ include_cooldown: false });
  check('solo nunca notificadas = 3 (Ana,Beto,Hugo)', r.total === 3, 'total=' + r.total);
  check('   → excluye a Dani (ya notificada, aunque vieja)', !(await ids({ include_cooldown: false })).includes(4));

  // source = MIC
  r = await preview({ source: 'MIC' });
  check('source=MIC → 2 (Ana,Beto)', r.total === 2, 'total=' + r.total);

  // city = asunción (case-insensitive)
  r = await preview({ city: 'asuncióN' });
  check('city=asunción (case-insensitive) → 2 (Ana,Dani)', r.total === 2 && (await ids({ city: 'asuncióN' })).sort().join()==='1,4', 'ids=' + await ids({ city: 'asuncióN' }));

  // min_score
  r = await preview({ min_score: 40 });
  check('min_score=40 → 2 (Ana50,Dani40)', r.total === 2, 'total=' + r.total);
  r = await preview({ min_score: 25 });
  check('min_score=25 → 3 (Ana,Dani,Hugo25)', r.total === 3, 'total=' + r.total);
  r = await preview({ min_score: 51 });
  check('min_score=51 → 0', r.total === 0, 'total=' + r.total);

  // combinado: source MIC + score≥40 → solo Ana
  check('source=MIC + score≥40 → [Ana]', (await ids({ source: 'MIC', min_score: 40 })).join() === '1');

  // tope por tanda
  r = await preview({ limit: 2 });
  check('tope=2 → to_send=2, total_eligible=4', r.to_send === 2 && r.total === 4);
  const capIds = await ids({ limit: 2 });
  check('tope respeta orden (nunca-notificadas primero, 2 ids)', capIds.length === 2 && !capIds.includes(4), 'ids=' + capIds);

  // "remaining" tras enviar la 1a tanda: marcamos las 2 enviadas y recomprobamos
  await c.query(`UPDATE businesses SET notified_at=NOW(), notify_count=notify_count+1 WHERE id = ANY($1)`, [capIds]);
  r = await preview({});
  check('remaining tras tanda de 2 = 2 (Dani + la que faltó)', r.total === 2, 'total=' + r.total);

  await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });

  // ── Contrato sobre el fuente real ──────────────────────────────────────────
  const N = fs.readFileSync('/root/work/opt/retopa/backend/src/routes/admin.notify.routes.js', 'utf8');
  check('src: existe buildCampaignFilter', /function buildCampaignFilter\(/.test(N));
  check('src: endpoint /campaign-preview', /router\.post\('\/campaign-preview'/.test(N));
  check('src: /campaign usa buildCampaignFilter', /buildCampaignFilter\(req\.body, cooldownDays\)/.test(N));
  check('src: /campaign aplica LIMIT por tope', /const limitSql = hasCap \? `LIMIT \$\$\{nextIdx\}`/.test(N));
  check('src: /campaign devuelve remaining', /remaining\s*=\s*parseInt/.test(N));
  check('src: include_cooldown=false → solo nunca notificadas', /else\s+conds\.push\('b\.notified_at IS NULL'\)/.test(N));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
