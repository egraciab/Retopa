// PROSPECTOS — embudo coherente + fecha_contacto que no se pisa (2026-10-29)
// Migración 2026-10-29_prospectos_embudo_fechas.sql + prospects.routes.js REAL
// + prospectSetEstado/prospectSaveNotas de admin/js/prospects.js.
// Uso: node harness_prospectos_embudo.js <ROOT del repo (…/opt/retopa)>
//   (Postgres en PGHOST/PGPORT, default 127.0.0.1:5499, base y usuario "retopa",
//    con esquema de prod y, si se quiere probar el backfill real, los datos de
//    prospect_wa_outreach de prod.)
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const ROOT = process.argv[2] || '/opt/retopa';
const SRC = path.join(ROOT, 'backend/src');
process.env.DB_HOST = process.env.PGHOST || '127.0.0.1'; process.env.DB_PORT = process.env.PGPORT || '5499';
process.env.DB_NAME = 'retopa'; process.env.DB_USER = 'retopa'; process.env.DB_PASSWORD = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-secret-0123456789abcdef';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const mock = (rel, exports) => { const p = require.resolve(path.join(SRC, rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
mock('config/redis', { get: async () => null, setEx: async () => {}, set: async () => {}, keys: async () => [], del: async () => {}, on: () => {} });

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: 'retopa', user: 'retopa' });
  const q = (s, p) => pool.query(s, p);
  const MIG = fs.readFileSync(path.join(ROOT, 'sql/2026-10-29_prospectos_embudo_fechas.sql'), 'utf8');
  const T = '59598177';   // prefijo de números de prueba
  await q(`DELETE FROM prospect_wa_outreach WHERE whatsapp LIKE '${T}%'`);

  // ── 1) Migración ──────────────────────────────────────────────────────────
  // Filas sintéticas: una pisada en la ventana (se restaura), una en la ventana
  // pero creada ese mismo día (no se toca) y una fuera de la ventana (no se toca).
  await q(`INSERT INTO prospect_wa_outreach (whatsapp, estado, notas, fecha_contacto, created_at) VALUES
     ('${T}0001','reclamo',NULL,'2026-10-19 00:41:30+00','2026-09-30 12:00+00'),
     ('${T}0002','enviado','ya','2026-10-19 00:41:40+00','2026-10-19 00:41:40+00'),
     ('${T}0003','enviado',NULL,'2026-10-20 10:00+00','2026-09-30 12:00+00')`);
  const antes = (await q(`SELECT id, estado, notas, fecha_contacto, created_at FROM prospect_wa_outreach ORDER BY id`)).rows;
  const enVentana = antes.filter(r => r.fecha_contacto >= new Date('2026-10-19T00:41:00Z') && r.fecha_contacto < new Date('2026-10-19T00:42:00Z') && r.created_at < new Date('2026-10-19T00:00:00Z'));

  await q(MIG);
  const desp = (await q(`SELECT id, whatsapp, estado, notas, fecha_contacto, created_at FROM prospect_wa_outreach ORDER BY id`)).rows;
  const byId = Object.fromEntries(desp.map(r => [r.id, r]));
  check('restaura fecha_contacto = created_at en las filas pisadas',
    enVentana.length > 0 && enVentana.every(r => +byId[r.id].fecha_contacto === +r.created_at),
    'filas=' + enVentana.map(r => r.id).join(','));
  check('deja nota de trazabilidad con la fecha que tenía',
    enVentana.every(r => /fecha_contacto restaurada al primer envío; estaba en 2026-10-19 00:41 UTC/.test(byId[r.id].notas || '')));
  check('conserva las notas previas (se agrega al final)',
    enVentana.filter(r => r.notas).every(r => byId[r.id].notas.startsWith(r.notas.trim())));
  const otras = antes.filter(r => !enVentana.some(v => v.id === r.id));
  check('no toca ninguna otra fila (estado, notas, fecha)',
    otras.every(r => byId[r.id].estado === r.estado && byId[r.id].notas === r.notas && +byId[r.id].fecha_contacto === +r.fecha_contacto),
    'otras=' + otras.length);
  check('no cambia estados en ninguna fila', antes.every(r => byId[r.id].estado === r.estado));

  const v1 = (await q('SELECT * FROM v_prospectos_embudo')).rows[0];
  const cols = (await q(`SELECT string_agg(attname, ',' ORDER BY attnum) AS c FROM pg_attribute WHERE attrelid='v_prospectos_embudo'::regclass AND attnum > 0`)).rows[0].c;
  check('vista: mismas columnas, mismo orden',
    cols === 'contactados,respondieron,reclamaron,no_interesa,numero_malo,tasa_claim_pct,enviados_7d,respuestas_total,tasa_respuesta_pct', cols);
  check('vista: respondieron incluye reclamos (= respuestas_total)',
    +v1.respondieron === +v1.respuestas_total && +v1.respondieron >= +v1.reclamaron, JSON.stringify(v1));
  const esp = (await q(`SELECT count(*)::int n FROM (SELECT estado FROM prospect_outreach UNION ALL
                          SELECT estado FROM prospect_wa_outreach WHERE estado <> 'pendiente') c WHERE estado <> 'enviado'`)).rows[0].n;
  check('vista: respondieron = filas que no quedaron en enviado', +v1.respondieron === esp, `vista=${v1.respondieron} esperado=${esp}`);

  await q(MIG);
  const otraVez = (await q(`SELECT id, notas, fecha_contacto FROM prospect_wa_outreach ORDER BY id`)).rows;
  check('idempotente: la segunda corrida no cambia nada',
    otraVez.every(r => r.notas === byId[r.id].notas && +r.fecha_contacto === +byId[r.id].fecha_contacto));
  await q(`DELETE FROM prospect_wa_outreach WHERE whatsapp LIKE '${T}%'`);

  // ── 2) PATCH /outreach/:whatsapp ──────────────────────────────────────────
  const express = require('express'), jwt = require('jsonwebtoken');
  const router = require(path.join(SRC, 'routes/prospects.routes.js'));
  const app = express(); app.use(express.json()); app.use('/p', router);
  const server = app.listen(0); await new Promise(r => server.on('listening', r));
  const TOKEN = jwt.sign({ id: 1, role: 'admin', email: 'a@x.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const base = 'http://127.0.0.1:' + server.address().port + '/p/outreach/';
  const patch = (w, b) => fetch(base + w, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, d: (await r.json().catch(() => ({}))).data }));
  const row = async w => (await q('SELECT estado, notas, fecha_contacto FROM prospect_wa_outreach WHERE whatsapp=$1', [w])).rows[0];
  const VIEJA = '2026-10-01T12:00:00.000Z';
  const setRow = (w, estado, fecha) => q('UPDATE prospect_wa_outreach SET estado=$2, fecha_contacto=$3 WHERE whatsapp=$1', [w, estado, fecha]);
  const reciente = f => f && Date.now() - new Date(f).getTime() < 60000;
  const A = T + '1001', B = T + '1002', C = T + '1003';

  let r = await patch(A, { notas: 'solo nota' });
  check('nota en número nuevo → pendiente, sin fecha', r.status === 200 && r.d.estado === 'pendiente' && r.d.fecha_contacto === null && r.d.notas === 'solo nota', JSON.stringify(r.d));
  r = await patch(A, { estado: 'enviado' });
  check("marcar 'enviado' a mano la primera vez → pone fecha", r.d.estado === 'enviado' && reciente(r.d.fecha_contacto), JSON.stringify(r.d));

  await setRow(A, 'enviado', VIEJA);
  r = await patch(A, { notas: 'otra nota' });
  check('guardar notas NO pisa la fecha ni el estado', r.d.estado === 'enviado' && r.d.fecha_contacto === VIEJA && r.d.notas === 'otra nota', JSON.stringify(r.d));
  r = await patch(A, { notas: '' });
  check('guardar nota vacía tampoco pisa la fecha', r.d.fecha_contacto === VIEJA, JSON.stringify(r.d));
  r = await patch(A, { estado: 'enviado' });
  check("volver a elegir 'enviado' en el select NO pisa la fecha", r.d.fecha_contacto === VIEJA, JSON.stringify(r.d));
  r = await patch(A, { estado: 'respondio' });
  check('pasar a respondio conserva la fecha', r.d.estado === 'respondio' && r.d.fecha_contacto === VIEJA);
  r = await patch(A, { estado: 'respondio', envio: true });
  check('envio=true con otro estado se ignora (no renueva fecha)', r.d.estado === 'respondio' && r.d.fecha_contacto === VIEJA);
  r = await patch(A, { estado: 'enviado', envio: true });
  check('botón WhatsApp sobre respondio → queda respondio, renueva fecha', r.d.estado === 'respondio' && reciente(r.d.fecha_contacto), JSON.stringify(r.d));

  await setRow(A, 'reclamo', VIEJA);
  r = await patch(A, { notas: 'nota desde pantalla vieja' });
  check('guardar notas NO baja un reclamo', r.d.estado === 'reclamo' && r.d.fecha_contacto === VIEJA, JSON.stringify(r.d));
  r = await patch(A, { estado: 'enviado', envio: true });
  check('reenviar por WhatsApp NO baja un reclamo (renueva fecha)', r.d.estado === 'reclamo' && reciente(r.d.fecha_contacto), JSON.stringify(r.d));
  await setRow(A, 'reclamo', VIEJA);
  r = await patch(A, { estado: 'enviado' });
  check("corrección manual reclamo → 'enviado' sigue permitida, sin tocar fecha", r.d.estado === 'enviado' && r.d.fecha_contacto === VIEJA, JSON.stringify(r.d));

  await setRow(A, 'pendiente', VIEJA);
  r = await patch(A, { estado: 'enviado', envio: true });
  check('envío desde pendiente → enviado con fecha nueva', r.d.estado === 'enviado' && reciente(r.d.fecha_contacto));

  r = await patch(B, { estado: 'enviado', envio: true });
  check('envío a número nuevo → enviado con fecha', r.status === 200 && r.d.estado === 'enviado' && reciente(r.d.fecha_contacto));
  r = await patch(C, { estado: 'enviado' });
  check('panel viejo en caché (sin envio) en número nuevo → pone fecha', r.d.estado === 'enviado' && reciente(r.d.fecha_contacto));
  r = await patch(C, { estado: 'pendiente' });
  check("volver a 'pendiente' a mano sigue funcionando", r.d.estado === 'pendiente');
  r = await patch(C, { estado: 'inventado' });
  check('estado inválido → 400', r.status === 400);
  const nC = await row(C);
  check('el 400 no tocó la fila', nC.estado === 'pendiente');

  // ── 3) Panel: qué manda cada función ──────────────────────────────────────
  const js = fs.readFileSync(path.join(ROOT, 'frontend/admin/js/prospects.js'), 'utf8');
  const grab = name => { const i = js.indexOf('async function ' + name + '('); const j = js.indexOf('\n}\n', i); return js.slice(i, j + 2); };
  const sent = [];
  const ctx = {
    _prospAll: [{ whatsapp: '595981', estado: 'enviado', notas: 'hola' }],
    apiAdminPost: async (url, body) => { sent.push(body); return { success: true, data: { estado: 'reclamo', notas: body.notas ?? 'hola', fecha_contacto: null } }; },
    prospectRenderCounters() {}, prospectRenderTable() {}, showToast() {},
  };
  vm.createContext(ctx);
  vm.runInContext(grab('prospectSetEstado') + '\n' + grab('prospectSaveNotas'), ctx);
  await ctx.prospectSaveNotas('595981', 'hola');
  check('notas sin cambios (onblur) → no se manda nada', sent.length === 0, JSON.stringify(sent));
  await ctx.prospectSaveNotas('595981', 'nueva');
  check('notas cambiadas → manda solo {notas}, sin estado', sent.length === 1 && JSON.stringify(sent[0]) === '{"notas":"nueva"}', JSON.stringify(sent[0]));
  check('toma el estado que devuelve el servidor', ctx._prospAll[0].estado === 'reclamo');
  await ctx.prospectSetEstado('595981', 'respondio');
  check('select → envio:false', JSON.stringify(sent[1]) === '{"estado":"respondio","envio":false}', JSON.stringify(sent[1]));
  await ctx.prospectSetEstado('595981', 'enviado', true);
  check('botón WhatsApp → envio:true', JSON.stringify(sent[2]) === '{"estado":"enviado","envio":true}', JSON.stringify(sent[2]));
  check('los dos llamados del botón pasan fromSend=true', (js.match(/prospectSetEstado\(whatsapp, 'enviado', true\)/g) || []).length === 2);

  await q(`DELETE FROM prospect_wa_outreach WHERE whatsapp LIKE '${T}%'`);
  server.close(); await pool.end();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
