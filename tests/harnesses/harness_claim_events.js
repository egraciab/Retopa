// CLAIM EVENTS — instrumentación del embudo de reclamo (2026-10-12).
// Monta el router REAL de claim.routes.js contra un Postgres efímero con el
// esquema de producción + la migración sql/2026-10-12_claim_events.sql.
// Mail mockeado. Verifica: eventos por paso, saneo, lista blanca, rate limit,
// que la medición nunca rompa el flujo, first_seen_at, vistas y plantilla
// prospectDigest.
// Uso: node harness_claim_events.js <ROOT del repo (…/opt/retopa)>
// Env: PGHOST PGPORT (socket), DB retopa/usuario retopa.
const path = require('path');
const http = require('http');
const fs = require('fs');
const ROOT = process.argv[2] || '/opt/retopa';
const SRC = path.join(ROOT, 'backend/src');

process.env.DB_HOST = process.env.PGHOST || '/tmp';
process.env.DB_PORT = process.env.PGPORT || '5499';
process.env.DB_NAME = 'retopa';
process.env.DB_USER = 'retopa';
process.env.DB_PASSWORD = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-secret-0123456789abcdef';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const mock = (rel, exports) => {
  const p = require.resolve(path.join(SRC, rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
const sent = [];
const realMailPath = require.resolve(path.join(SRC, 'config/mail'));

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: 'retopa', user: 'retopa' });
  const q = (s, p) => pool.query(s, p);

  // ── Plantilla prospectDigest (mail.js real, render sin enviar) ─────────────
  mock('db', { query: async () => ({ rows: [] }) });
  const mail = require(realMailPath);
  const r = await mail.renderTemplate('prospectDigest', {
    count: 7, visitasMes: 321, items: ['Ferretería <script>x</script> (Luque) — 40 visitas'],
    enviados7d: 3, reclamaron: 1, tasaClaim: 4.2, siteName: 'RetoPA', siteUrl: 'https://retopa.com.py',
    panelUrl: 'https://retopa.com.py/admin/index.html#prospects',
  });
  check('prospectDigest existe y renderiza', !!(r && r.subject && r.html));
  check('prospectDigest: asunto con la cantidad', /7 prospectos/.test(r.subject), r.subject);
  check('prospectDigest: escapa nombres de negocio', !r.html.includes('<script>x') && r.html.includes('&lt;script&gt;'));
  check('prospectDigest: link al Panel Prospectos', r.html.includes('#prospects'));
  const r1 = await mail.renderTemplate('prospectDigest', { count: 1, items: [] });
  check('prospectDigest: singular y sin items no rompe', /1 prospecto para/.test(r1.subject) && /sin destacados/.test(r1.html));
  delete require.cache[realMailPath];

  // ── Router real de claim con mail mockeado ─────────────────────────────────
  mock('config/mail', { sendEmail: async (to, template, data) => { sent.push({ to, template }); return { success: true }; } });
  // claim.routes usa Redis desde E1 (invalidar caché de la ficha) → simulado.
  mock('config/redis', { get: async () => null, set: async () => {}, keys: async () => [], del: async () => {}, on: () => {} });
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const router = require(path.join(SRC, 'routes/claim.routes'));
  const app = express();
  app.use(express.json());
  app.use('/api/v2/claim', router);
  const server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const port = server.address().port;
  const call = (method, p, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, path: p, method,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) {} resolve({ status: res.statusCode, body: j }); }); });
    req.on('error', reject); if (data) req.write(data); req.end();
  });

  // Datos de prueba
  await q('TRUNCATE claim_events');
  await q("DELETE FROM user_businesses; DELETE FROM service_leads; DELETE FROM users WHERE email LIKE '%@harness.test'; DELETE FROM businesses WHERE slug LIKE 'h-%'");
  const TOK = 'a'.repeat(64), TOK_EXP = 'b'.repeat(64);
  const B1 = (await q(`INSERT INTO businesses (name, slug, is_active, claim_token, claim_expires_at)
                       VALUES ('Cerrajería Harness','h-cerrajeria',TRUE,$1, NOW()+interval '30 days') RETURNING id`, [TOK])).rows[0].id;
  const B2 = (await q(`INSERT INTO businesses (name, slug, is_active, claim_token, claim_expires_at)
                       VALUES ('Vencida Harness','h-vencida',TRUE,$1, NOW()-interval '1 day') RETURNING id`, [TOK_EXP])).rows[0].id;
  const ev = async (where = 'TRUE', p = []) => (await q(`SELECT * FROM claim_events WHERE ${where} ORDER BY id`, p)).rows;
  const flush = () => sleep(120); // los logs son fire & forget

  // 1) Link abierto (con origen y visita)
  let x = await call('GET', `/api/v2/claim/info?token=${TOK}&src=WA&v=visit123`);
  await flush();
  check('GET /info válido → 200', x.status === 200);
  let e = await ev("event='link_opened'");
  check('link_opened registrado con ficha, canal y origen normalizado',
    e.length === 1 && e[0].business_id === B1 && e[0].canal === 'token' && e[0].source === 'wa' && e[0].visit === 'visit123',
    JSON.stringify(e[0] || {}));

  // 2) Token inválido / vencido
  x = await call('GET', `/api/v2/claim/info?token=${'z'.repeat(64)}&src=notify`);
  check('GET /info inválido → 404', x.status === 404);
  x = await call('GET', `/api/v2/claim/info?token=${TOK_EXP}&src=wa`);
  check('GET /info vencido → 410', x.status === 410);
  await flush();
  check('link_invalid registrado (sin ficha)', (await ev("event='link_invalid'")).length === 1 && (await ev("event='link_invalid' AND business_id IS NULL")).length === 1);
  check('link_expired registrado con su ficha', (await ev("event='link_expired' AND business_id=$1", [B2])).length === 1);

  // 3) Saneo del origen (sin inyección)
  await call('GET', `/api/v2/claim/info?token=${TOK}&src=${encodeURIComponent("wa'<script>;DROP")}&v=v2`);
  await flush();
  const lastOpen = (await ev("event='link_opened'")).pop();
  check('origen saneado a [a-z0-9_-]', lastOpen && lastOpen.source === 'wascriptdrop', lastOpen && lastOpen.source);

  // 4) Eventos del navegador
  x = await call('POST', '/api/v2/claim/event', { token: TOK, event: 'form_started', src: 'wa', v: 'visit123' });
  check('POST /event → 204', x.status === 204);
  await call('POST', '/api/v2/claim/event', { token: TOK, event: 'form_error', reason: 'password_short', src: 'wa', v: 'visit123' });
  await call('POST', '/api/v2/claim/event', { token: TOK, event: 'form_error', reason: 'cualquier-cosa', src: 'wa' });
  await call('POST', '/api/v2/claim/event', { token: TOK, event: 'approved' });                 // no permitido al cliente
  await call('POST', '/api/v2/claim/event', { token: 'x'.repeat(64), event: 'form_started' });  // token inexistente
  x = await call('POST', '/api/v2/claim/event', { event: 'form_started' });                     // sin token
  check('POST /event sin token → 204 igual (no filtra nada)', x.status === 204);
  await flush();
  check('form_started registrado', (await ev("event='form_started' AND business_id=$1", [B1])).length === 1);
  check('form_error con razón de la lista blanca', (await ev("event='form_error' AND reason='password_short'")).length === 1);
  check('razón fuera de lista → se guarda sin razón', (await ev("event='form_error' AND reason IS NULL")).length === 1);
  check('el cliente NO puede registrar "approved"', (await ev("event='approved'")).length === 0);
  check('token inexistente / sin token → nada registrado', (await ev("event='form_started'")).length === 1);

  // 5) Envío: error de validación y OK
  x = await call('POST', '/api/v2/claim/submit', { token: TOK, name: 'Ana', email: 'ana@harness.test', password: '123', src: 'wa', v: 'visit123' });
  check('submit con contraseña corta → 400', x.status === 400);
  x = await call('POST', '/api/v2/claim/submit', { token: TOK, name: 'Ana', email: 'ana@harness.test', password: 'clave-segura-1', phone: '0981000000', src: 'wa', v: 'visit123' });
  await flush();
  check('submit OK → 200 (flujo intacto)', x.status === 200 && x.body && x.body.success, JSON.stringify(x.body));
  check('submit_error password_short registrado', (await ev("event='submit_error' AND reason='password_short'")).length === 1);
  const uid = (await q("SELECT id FROM users WHERE email='ana@harness.test'")).rows[0].id;
  const so = await ev("event='submit_ok'");
  check('submit_ok con ficha, dueño y origen', so.length === 1 && so[0].business_id === B1 && so[0].user_id === uid && so[0].source === 'wa', JSON.stringify(so[0] || {}));
  check('el flujo sigue mandando sus correos', sent.some(s => s.template === 'claimReceived'));

  // 6) Aprobación (admin) → approved, sin el id del admin como dueño
  const adminTok = jwt.sign({ id: 999999, role: 'admin' }, process.env.JWT_SECRET);
  x = await call('POST', '/api/v2/claim/approve', { business_id: B1 }, { Authorization: 'Bearer ' + adminTok });
  await flush();
  check('approve → 200', x.status === 200);
  const ap = await ev("event='approved'");
  check('approved registrado (canal admin, sin user_id del admin)', ap.length === 1 && ap[0].canal === 'admin' && ap[0].user_id === null, JSON.stringify(ap[0] || {}));

  // 7) Vista del embudo + primer ingreso
  let emb = (await q("SELECT * FROM v_claim_embudo WHERE origen='wa'")).rows[0];
  check('v_claim_embudo: fila "wa" con el embudo completo',
    emb && +emb.fichas_vistas === 1 && +emb.iniciaron_form === 1 && +emb.frenados_validacion === 1 && +emb.enviaron === 1 && +emb.aprobados === 1,
    JSON.stringify(emb || {}));
  // Se abrió con 2 ids de visita (visit123 y v2). Reabrir con visit123 NO suma.
  // (desde E1 /info también exige que la ficha no tenga dueño → se lo saca un momento)
  await q("UPDATE businesses SET claim_status=NULL WHERE id=$1", [B1]);
  await q("UPDATE user_businesses SET is_owner=FALSE WHERE business_id=$1", [B1]);
  await call('GET', `/api/v2/claim/info?token=${TOK}&src=wa&v=visit123`);
  await flush();
  await q("UPDATE user_businesses SET is_owner=TRUE WHERE business_id=$1", [B1]);
  await q("UPDATE businesses SET claim_status='approved' WHERE id=$1", [B1]);
  emb = (await q("SELECT * FROM v_claim_embudo WHERE origen='wa'")).rows[0];
  check('v_claim_embudo: visitas deduplicadas por id de visita (3 aperturas, 2 visitas)',
    emb && +emb.visitas === 2 && (await ev("event='link_opened'")).length === 3, emb && emb.visitas);
  check('v_claim_embudo: dueño todavía no entró', emb && +emb.dueno_entro === 0);
  const tot = (await q("SELECT * FROM v_claim_embudo WHERE origen='TOTAL'")).rows[0];
  check('v_claim_embudo: fila TOTAL presente y al final', !!tot && (await q('SELECT origen FROM v_claim_embudo')).rows.pop().origen === 'TOTAL');
  check('v_claim_embudo: links muertos atribuidos (notify + wa)', +tot.links_muertos === 2, tot.links_muertos);

  const { touchLastSeen } = require(path.join(SRC, 'utils/presence'));
  await touchLastSeen(pool, { id: uid });
  const fs1 = (await q('SELECT first_seen_at, last_seen_at FROM users WHERE id=$1', [uid])).rows[0];
  check('presence: primer ingreso fija first_seen_at y last_seen_at', fs1.first_seen_at && fs1.last_seen_at);
  await q("UPDATE users SET last_seen_at = last_seen_at - interval '2 minutes' WHERE id=$1", [uid]);
  await touchLastSeen(pool, { id: uid });
  const fs2 = (await q('SELECT first_seen_at, last_seen_at FROM users WHERE id=$1', [uid])).rows[0];
  check('presence: un segundo ingreso NO pisa first_seen_at', +fs2.first_seen_at === +fs1.first_seen_at && +fs2.last_seen_at > +fs1.first_seen_at - 1);
  emb = (await q("SELECT * FROM v_claim_embudo WHERE origen='wa'")).rows[0];
  check('v_claim_embudo: dueño entró → dueno_entro = 1', +emb.dueno_entro === 1);
  const act = (await q('SELECT * FROM v_duenos_activacion')).rows[0];
  check('v_duenos_activacion: cuenta nueva con ficha y que entró', +act.total >= 1 && +act.con_ficha >= 1 && +act.entraron_alguna_vez >= 1, JSON.stringify(act));

  // 8) Presence: si la columna no existe aún (42703) cae a la consulta vieja
  const calls = [];
  const fakePool = { query: async (sql) => { calls.push(sql); if (/first_seen_at/.test(sql)) { const er = new Error('column does not exist'); er.code = '42703'; throw er; } return { rows: [] }; } };
  await touchLastSeen(fakePool, { id: 1 });
  check('presence sin migración: reintenta sin first_seen_at (no pierde la marca)', calls.length === 2 && !/first_seen_at/.test(calls[1]));

  // 9) La medición NUNCA rompe el flujo: sin tabla claim_events
  await q('ALTER TABLE claim_events RENAME TO claim_events_off');
  await q("UPDATE businesses SET claim_status=NULL WHERE id=$1", [B1]);
  await q("UPDATE user_businesses SET is_owner=FALSE WHERE business_id=$1", [B1]);
  x = await call('GET', `/api/v2/claim/info?token=${TOK}&src=wa`);
  const xe = await call('POST', '/api/v2/claim/event', { token: TOK, event: 'form_started' });
  await flush();
  check('sin tabla de eventos: /info sigue respondiendo 200', x.status === 200);
  check('sin tabla de eventos: /event sigue respondiendo 204', xe.status === 204);
  await q('ALTER TABLE claim_events_off RENAME TO claim_events');

  // 10) Rate limit del endpoint público
  let last = null;
  for (let i = 0; i < 31; i++) last = await call('POST', '/api/v2/claim/event', { token: TOK, event: 'form_started' });
  check('POST /event limitado por IP (30/min) → 429', last.status === 429, last.status);

  // 11) Estático: admin.js y directory.js registran sus pasos
  const A = fs.readFileSync(path.join(SRC, 'routes/admin.js'), 'utf8');
  const D = fs.readFileSync(path.join(SRC, 'routes/directory.js'), 'utf8');
  check('admin.js importa logClaimEvent', /require\('\.\.\/utils\/claimEvents'\)/.test(A));
  check('admin.js: approved con el dueño (info.userId)', /event: 'approved', canal: 'admin', businessId: biz\.id, userId: info\.userId/.test(A));
  check('admin.js: access_granted en grant-access', /event: 'access_granted'/.test(A));
  check('admin.js: rejected', /event: 'rejected', canal: 'admin'/.test(A));
  check('directory.js: reclamo por botón de la ficha → submit_ok canal ficha', /event: 'submit_ok', canal: 'ficha', businessId: biz\.id/.test(D) && /require\('\.\.\/utils\/claimEvents'\)/.test(D));

  server.close(); await pool.end();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
