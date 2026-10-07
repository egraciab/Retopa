// Verificar ficha desde el Lead (captación → conversión):
//   verifica businesses.verified · pasa el lead a 'verificado' ·
//   crea 1 Oportunidad de onboarding SIN asignar (idempotente por negocio).
// Ejercita el helper REAL src/helpers/verifyFicha.js contra Postgres real,
// más chequeos de contrato sobre admin.js.
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const PGDATA = '/tmp/pg_vficha', PORT = 55499, BIN = '/usr/lib/postgresql/16/bin';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const { Client } = require('pg');
const BE = '/root/work/opt/retopa/backend';
const { runVerifyFicha } = require(BE + '/src/helpers/verifyFicha');

async function tx(c, fn) { await c.query('BEGIN'); try { const r = await fn(); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK'); throw e; } }

(async () => {
  try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (e) {}
  sh(`rm -rf ${PGDATA} && mkdir -p ${PGDATA} && chown postgres:postgres ${PGDATA}`);
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/initdb`, '-D', PGDATA, '-A', 'trust'], { stdio: 'ignore' });
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, '-o', `-p ${PORT} -k /tmp`, '-w', 'start'], { stdio: 'ignore' });
  const c = new Client({ host: '/tmp', port: PORT, user: 'postgres', database: 'postgres' }); await c.connect();

  await c.query(`CREATE TABLE businesses (id serial primary key, name text, trade_name text, ruc text, city text, verified boolean DEFAULT false, updated_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE service_leads (id serial primary key, business_id int, service_type text, status text, contact_name text, contact_email text, contact_phone text, notes text, updated_at timestamptz DEFAULT now())`);
  await c.query(`CREATE TABLE sales_signals (id serial primary key, business_id int, trigger_key text, product_target text, status text, assigned_ambassador_id int, evidence jsonb, suggested_message text, expires_at timestamptz, created_at timestamptz DEFAULT now(), status_changed_at timestamptz)`);
  await c.query(`CREATE TABLE site_config (key text primary key, value text)`);

  const newBiz = async (name, trade, verified = false) => (await c.query(
    `INSERT INTO businesses (name, trade_name, ruc, city, verified) VALUES ($1,$2,'80012345-6','Asunción',$3) RETURNING id`, [name, trade, verified])).rows[0].id;
  const newLead = async (bizId, name = 'Keyla Rico') => (await c.query(
    `INSERT INTO service_leads (business_id, service_type, status, contact_name, notes) VALUES ($1,'basic','pending',$2,'{"source":"web_register"}') RETURNING id`, [bizId, name])).rows[0].id;

  // ── Caso 1: verificación limpia ─────────────────────────────────────────
  let bizId = await newBiz('Panaderia Rico SA', 'Panadería Rico');
  let leadId = await newLead(bizId);
  let out = await tx(c, () => runVerifyFicha(c, leadId, {}));
  check('1 verifica la ficha (didVerify)', out.didVerify === true);
  check('1 businesses.verified = TRUE', (await c.query('SELECT verified FROM businesses WHERE id=$1', [bizId])).rows[0].verified === true);
  check('1 lead → status "verificado" (no "won")', (await c.query('SELECT status FROM service_leads WHERE id=$1', [leadId])).rows[0].status === 'verificado');
  check('1 opportunityCreated = true', out.opportunityCreated === true);

  const opp = (await c.query(`SELECT * FROM sales_signals WHERE business_id=$1`, [bizId])).rows;
  check('1 se creó exactamente 1 oportunidad', opp.length === 1, 'n=' + opp.length);
  check('1 oportunidad SIN asignar (assigned_ambassador_id NULL)', opp[0] && opp[0].assigned_ambassador_id === null);
  check('1 trigger_key = onb_bienvenida', opp[0] && opp[0].trigger_key === 'onb_bienvenida');
  check('1 product_target = onboarding', opp[0] && opp[0].product_target === 'onboarding');
  check('1 status = nueva', opp[0] && opp[0].status === 'nueva');
  check('1 suggested_message no vacío + voseo (contactá)', opp[0] && /contactá/i.test(opp[0].suggested_message));
  check('1 message usa el trade_name (Panadería Rico)', opp[0] && opp[0].suggested_message.includes('Panadería Rico'));
  check('1 evidence.source = lead_verify', opp[0] && opp[0].evidence.source === 'lead_verify');
  check('1 evidence.lead_id correcto', opp[0] && opp[0].evidence.lead_id === leadId);
  const ttlDays = opp[0] ? Math.round((new Date(opp[0].expires_at) - Date.now()) / 86400000) : -1;
  check('1 TTL por defecto ~21 días', ttlDays >= 20 && ttlDays <= 22, 'días=' + ttlDays);

  // ── Caso 2: idempotencia (misma ficha, 2ª verificación) ─────────────────
  out = await tx(c, () => runVerifyFicha(c, leadId, {}));
  check('2 didVerify = false (ya estaba verificada)', out.didVerify === false);
  check('2 NO crea otra oportunidad (opportunityCreated false)', out.opportunityCreated === false);
  check('2 sigue habiendo 1 sola oportunidad activa', (await c.query(`SELECT COUNT(*)::int n FROM sales_signals WHERE business_id=$1 AND status IN ('nueva','vista','contactado')`, [bizId])).rows[0].n === 1);

  // ── Caso 3: si la oportunidad previa se descarta, una nueva verif la recrea
  await c.query(`UPDATE sales_signals SET status='descartada' WHERE business_id=$1`, [bizId]);
  out = await tx(c, () => runVerifyFicha(c, leadId, {}));
  check('3 con la previa descartada → recrea oportunidad', out.opportunityCreated === true);
  check('3 ahora hay 1 activa + 1 descartada', (await c.query(`SELECT COUNT(*)::int n FROM sales_signals WHERE business_id=$1`, [bizId])).rows[0].n === 2);

  // ── Caso 4: TTL + mensaje configurables por site_config ──────────────────
  const bizId4 = await newBiz('Ferretería Central', null); // sin trade_name → usa name
  const lead4 = await newLead(bizId4, 'Juan Pérez');
  const cfg = { signal_onboarding_ttl_days: '30', signal_msg_onb_bienvenida: 'Nueva ficha: {business}. Dale la bienvenida y acompañá el onboarding.' };
  out = await tx(c, () => runVerifyFicha(c, lead4, cfg));
  const opp4 = (await c.query(`SELECT * FROM sales_signals WHERE business_id=$1`, [bizId4])).rows[0];
  check('4 TTL configurable ~30 días', Math.round((new Date(opp4.expires_at) - Date.now()) / 86400000) === 30);
  check('4 mensaje custom desde site_config', opp4.suggested_message.startsWith('Nueva ficha: Ferretería Central'));
  check('4 {business} interpolado con el name (sin trade_name)', opp4.suggested_message.includes('Ferretería Central'));

  // ── Caso 5: no colisiona con otros product_target ────────────────────────
  const bizId5 = await newBiz('Café del Sur', 'Café del Sur');
  const lead5 = await newLead(bizId5);
  await c.query(`INSERT INTO sales_signals (business_id, trigger_key, product_target, status) VALUES ($1,'t2_destacado_datos','destacado','nueva')`, [bizId5]);
  out = await tx(c, () => runVerifyFicha(c, lead5, {}));
  check('5 crea onboarding aunque exista una señal "destacado" activa', out.opportunityCreated === true);
  check('5 conviven onboarding + destacado', (await c.query(`SELECT COUNT(DISTINCT product_target)::int n FROM sales_signals WHERE business_id=$1 AND status='nueva'`, [bizId5])).rows[0].n === 2);

  // ── Caso 6: errores ──────────────────────────────────────────────────────
  const orphanLead = (await c.query(`INSERT INTO service_leads (business_id, service_type, status, contact_name) VALUES (NULL,'basic','pending','Sin Empresa') RETURNING id`)).rows[0].id;
  out = await tx(c, () => runVerifyFicha(c, orphanLead, {}));
  check('6 lead sin business_id → error NO_BUSINESS', out.error === 'NO_BUSINESS');
  check('6 NO crea oportunidad para lead huérfano', (await c.query(`SELECT COUNT(*)::int n FROM sales_signals WHERE evidence->>'lead_id' = $1`, [String(orphanLead)])).rows[0].n === 0);

  out = await tx(c, () => runVerifyFicha(c, 999999, {}));
  check('6 lead inexistente → error NOT_FOUND', out.error === 'NOT_FOUND');

  await c.end();
  spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' });

  // ── Chequeos de contrato sobre admin.js ──────────────────────────────────
  const A = fs.readFileSync(BE + '/src/routes/admin.js', 'utf8');
  check('src: endpoint POST /leads/:id/verify-ficha existe', /router\.post\(['"]\/leads\/:id\/verify-ficha['"]/.test(A));
  check('src: el endpoint usa el helper runVerifyFicha', /runVerifyFicha\(client, leadId, cfg\)/.test(A));
  check('src: /leads/:id acepta estados de captación (verificado/descartado)', /validStatuses = \[[^\]]*'verificado'[^\]]*'descartado'/.test(A));
  check('src: /leads/:id/status acepta verificado/descartado', /validStatuses = \['pending', 'contacted', 'closed', 'verificado', 'descartado'\]/.test(A));
  check('src: SIG_PRIO prioriza onb_bienvenida (THEN 0)', /WHEN 'onb_bienvenida' THEN 0/.test(A));
  check('src: correo de verificación sólo en transición (notifyBusinessVerified)', /if \(out\.didVerify\) notifyBusinessVerified\(out\.bizId\)/.test(A));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { spawnSync('runuser', ['-u', 'postgres', '--', `${BIN}/pg_ctl`, '-D', PGDATA, 'stop'], { stdio: 'ignore' }); } catch (_) {} process.exit(1); });
