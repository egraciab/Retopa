// RECLAMO DESDE LA FICHA + ALTA EN UNA PANTALLA + ORDEN DE BÚSQUEDA (2026-10-14)
// claim.routes.js + directory.js + admin.js REALES contra Postgres efímero.
// Uso: node harness_reclamo_ficha.js <ROOT del repo (…/opt/retopa)>
const path = require('path');
const http = require('http');
const ROOT = process.argv[2] || '/opt/retopa';
const SRC = path.join(ROOT, 'backend/src');
process.env.DB_HOST = process.env.PGHOST || '/tmp'; process.env.DB_PORT = process.env.PGPORT || '5499';
process.env.DB_NAME = 'retopa'; process.env.DB_USER = 'retopa'; process.env.DB_PASSWORD = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-secret-0123456789abcdef';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const mock = (rel, exports) => { const p = require.resolve(path.join(SRC, rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
const mails = [];
mock('config/redis', { get: async () => null, setEx: async () => {}, set: async () => {}, keys: async () => [], del: async () => {}, on: () => {} });
mock('utils/kit-pdf', { buildKitBatchPdf: async () => Buffer.from('') });
mock('utils/sysnet', { getNetworkStats: async () => ({}) });
mock('utils/pwa-icon', { getPwaIcon: async () => null });
mock('helpers/notifyOwner', { notifyOwner: async () => {} });
mock('helpers/verifyFicha', { runVerifyFicha: async () => ({}) });
mock('config/mail', { sendEmail: async (to, tpl, data) => { mails.push({ to, tpl, data }); return { success: true }; }, renderTemplate: async () => ({}) });

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: 'retopa', user: 'retopa' });
  const q = (s, p) => pool.query(s, p);
  const express = require('express'), jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs');

  // ── Limpieza y datos ───────────────────────────────────────────────────────
  async function cleanup() {
    const ids = (await q("SELECT id FROM businesses WHERE slug LIKE 'rf-%' OR name LIKE 'RF %'")).rows.map(r => r.id);
    if (ids.length) {
      await q('DELETE FROM claim_requests WHERE business_id = ANY($1)', [ids]);
      await q('DELETE FROM claim_snapshots WHERE business_id = ANY($1)', [ids]).catch(() => {});
      await q('DELETE FROM business_merges WHERE survivor_id = ANY($1) OR duplicate_id = ANY($1)', [ids]).catch(() => {});
      await q('DELETE FROM service_leads WHERE business_id = ANY($1)', [ids]);
      await q('DELETE FROM businesses WHERE id = ANY($1)', [ids]);
    }
    await q("DELETE FROM users WHERE email LIKE '%@rf.test' OR name LIKE 'RF %'");
    await q("DELETE FROM prospect_wa_outreach WHERE whatsapp LIKE '59598177%'").catch(() => {});
    await q("DELETE FROM cities WHERE slug LIKE 'rf-city-%'");
  }
  await cleanup();
  await q("INSERT INTO site_config (key, value) VALUES ('social_whatsapp','595986484905') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
  const h = await bcrypt.hash('x', 4);
  const ADM = (await q(`INSERT INTO users (email, password_hash, name, role) VALUES ('adm@rf.test',$1,'RF Admin','admin') RETURNING id`, [h])).rows[0].id;
  const cat = async (name, slug, parent = null) => {
    const ex = (await q('SELECT id FROM categories WHERE slug=$1', [slug])).rows[0];
    return ex ? ex.id : (await q('INSERT INTO categories (name, slug, parent_id) VALUES ($1,$2,$3) RETURNING id', [name, slug, parent])).rows[0].id;
  };
  const PARENT = await cat('RF Servicios', 'rf-servicios');
  const ELEC = await cat('Electricidad', 'rf-electricidad', PARENT);
  const TECNO = await cat('Tecnología', 'rf-tecnologia', PARENT);
  const biz = async (name, slug, o = {}) => {
    const id = (await q(`INSERT INTO businesses (name, slug, phone, whatsapp, city, verified, category_id, is_active, claim_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8) RETURNING id`, [name, slug, o.phone || null, o.whatsapp || null, o.city || 'Luque', !!o.verified, o.cat || null, o.claim_status || null])).rows[0].id;
    if (o.cat) await q('INSERT INTO business_categories (business_id, category_id, is_primary, position) VALUES ($1,$2,TRUE,0)', [id, o.cat]);
    return id;
  };
  // Verificada desde el Admin, SIN dueño (el caso de Esteban)
  const F1 = await biz('RF Ferretería Verificada', 'rf-verificada', { whatsapp: '595981771001', phone: '0981771001', verified: true, cat: ELEC });
  // Con dueño
  const F2 = await biz('RF Con Dueño', 'rf-con-dueno', { whatsapp: '595981771002', verified: true });
  const OWN = (await q(`INSERT INTO users (email, password_hash, name, role, phone) VALUES ('own@rf.test',$1,'RF Dueño','client','+595981771002') RETURNING id`, [h])).rows[0].id;
  await q('INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit) VALUES ($1,$2,TRUE,TRUE)', [OWN, F2]);
  // Sin celular (solo fijo)
  const F3 = await biz('RF Sin Celular', 'rf-sin-celular', { phone: '021 555 555' });
  // Otra ficha con celular, sin dueño (para "crear igual")
  const F4 = await biz('RF Otra Ficha', 'rf-otra', { whatsapp: '595981771004' });

  const app = express(); app.use(express.json());
  app.set('trust proxy', true);
  app.use('/api/v2/claim', require(path.join(SRC, 'routes/claim.routes')));
  app.use('/api/v2/admin', require(path.join(SRC, 'routes/admin')));
  app.use('/api/v2', require(path.join(SRC, 'routes/directory')));
  const server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const port = server.address().port;
  const ADMIN = 'Bearer ' + jwt.sign({ id: ADM, role: 'admin' }, process.env.JWT_SECRET);
  let ipN = 1;
  // 2026-10-28: registro, reclamo y alta exigen la casilla de Términos (acepta_terminos).
  const ACEPTA = /\/(auth\/register|claim\/confirm|claim\/alta)$/;
  const withTerms = (p, body) => (body && ACEPTA.test(p) && body.acepta_terminos === undefined) ? { ...body, acepta_terminos: true } : body;
  const call = (method, p, body, auth = null) => new Promise((resolve, reject) => {
    body = withTerms(p, body);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, path: p, method,
      headers: { 'X-Forwarded-For': '10.9.0.' + (ipN++ % 250), ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...(auth ? { Authorization: auth } : {}) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) {} resolve({ status: res.statusCode, body: j }); }); });
    req.on('error', reject); if (data) req.write(data); req.end();
  });

  // ── 1) Ficha: datos para la pantalla ──────────────────────────────────────
  let r = await call('GET', '/api/v2/claim/ficha?slug=rf-verificada');
  check('ficha verificada SIN dueño: se puede reclamar (antes: "ya fue verificada")', r.status === 200 && r.body.data.name === 'RF Ferretería Verificada', JSON.stringify(r.body));
  check('ficha: muestra el WhatsApp de la ficha y que se puede probar por WhatsApp', r.body.data.fichaWhatsapp === '0981 771 001' && r.body.data.canWhatsapp === true);
  r = await call('GET', '/api/v2/claim/ficha?slug=rf-con-dueno');
  check('ficha CON dueño → 409 ALREADY_CLAIMED', r.status === 409 && r.body.code === 'ALREADY_CLAIMED');
  r = await call('GET', '/api/v2/claim/ficha?slug=rf-sin-celular');
  check('ficha sin celular: no ofrece WhatsApp (va a revisión)', r.status === 200 && r.body.data.fichaWhatsapp === null && r.body.data.canWhatsapp === false);

  // ── 2) Prueba por WhatsApp ────────────────────────────────────────────────
  r = await call('POST', '/api/v2/claim/ficha/request', { slug: 'rf-verificada', kind: 'whatsapp' });
  const code = r.body && r.body.data && r.body.data.code;
  check('pedido por WhatsApp: código RP-#### y link a NUESTRO WhatsApp con el código', r.status === 200 && /^RP-\d{4}$/.test(code)
        && r.body.data.waUrl.startsWith('https://wa.me/595986484905?text=') && decodeURIComponent(r.body.data.waUrl).includes(code)
        && decodeURIComponent(r.body.data.waUrl).includes('RF Ferretería Verificada'), JSON.stringify(r.body));
  r = await call('POST', '/api/v2/claim/ficha/request', { slug: 'rf-verificada', kind: 'whatsapp' });
  check('tocar de nuevo: MISMO código (no duplica el pedido)', r.body.data.code === code && (await q("SELECT count(*)::int n FROM claim_requests WHERE business_id=$1", [F1])).rows[0].n === 1);
  r = await call('POST', '/api/v2/claim/ficha/request', { slug: 'rf-sin-celular', kind: 'whatsapp' });
  check('ficha sin celular + kind whatsapp → 400 NO_FICHA_WA', r.status === 400 && r.body.code === 'NO_FICHA_WA');
  r = await call('POST', '/api/v2/claim/ficha/request', { slug: 'rf-con-dueno', kind: 'whatsapp' });
  check('ficha con dueño → 409', r.status === 409);
  check('aviso al equipo por correo (claimAdminAlert)', mails.some(m => m.tpl === 'claimAdminAlert' && /RP-\d{4}/.test(m.data.userName)));

  // ── 3) Revisión (otro número) ─────────────────────────────────────────────
  r = await call('POST', '/api/v2/claim/ficha/request', { slug: 'rf-sin-celular', kind: 'revision', whatsapp: '021 555', name: 'Ana' });
  check('revisión: WhatsApp inválido → 400', r.status === 400 && r.body.code === 'whatsapp_invalid');
  r = await call('POST', '/api/v2/claim/ficha/request', { slug: 'rf-sin-celular', kind: 'revision', whatsapp: '0985 771 333', name: ' Ana  Gómez ', email: 'ana@rf.test', message: 'Soy la dueña, RUC 800' });
  const rev = (await q("SELECT * FROM claim_requests WHERE business_id=$1", [F3])).rows[0];
  check('revisión: queda el pedido con nombre limpio, número, correo y mensaje', r.status === 200 && rev && rev.kind === 'revision' && rev.phone === '595985771333' && rev.name === 'Ana Gómez' && rev.email === 'ana@rf.test' && /RUC/.test(rev.message));

  // ── 4) Admin: pedidos y "Mandar link" ─────────────────────────────────────
  r = await call('GET', '/api/v2/admin/claim-requests', null, ADMIN);
  const rows = (r.body && r.body.data) || [];
  check('Admin: los 2 pedidos (código y revisión) con su ficha', rows.length >= 2 && rows.some(x => x.code === code && x.business === 'RF Ferretería Verificada') && rows.some(x => x.kind === 'revision' && x.name === 'Ana Gómez'));
  r = await call('GET', '/api/v2/admin/claim-requests', null, null);
  check('Admin sin sesión → 401', r.status === 401);
  const reqW = rows.find(x => x.code === code);
  r = await call('POST', `/api/v2/admin/claim-requests/${reqW.id}/link`, {}, ADMIN);
  const tok = (await q('SELECT claim_token FROM businesses WHERE id=$1', [F1])).rows[0].claim_token;
  check('Mandar link: al WhatsApp de la FICHA, con el link de reclamo de siempre', r.status === 200 && r.body.data.wa === '595981771001' && r.body.data.url.includes('/reclamar/?token=' + tok) && /RF Ferretería Verificada/.test(r.body.data.message), JSON.stringify(r.body));
  check('Mandar link: el pedido queda "sent"', (await q('SELECT status FROM claim_requests WHERE id=$1', [reqW.id])).rows[0].status === 'sent');
  r = await call('GET', '/api/v2/admin/dashboard', null, ADMIN).catch(() => ({}));

  // ── 5) El dueño abre el link → flujo de siempre → es suyo, verificada o no ──
  r = await call('POST', '/api/v2/claim/confirm', { token: tok, category_id: ELEC, whatsapp: '0981 771 001', name: 'RF Pedro' });
  const ownF1 = (await q('SELECT u.phone_verified_at FROM user_businesses ub JOIN users u ON u.id = ub.user_id WHERE ub.business_id=$1 AND ub.is_owner', [F1])).rows[0];
  check('confirmar con el link: la ficha VERIFICADA ya tiene dueño (sesión + Mi Portal)', r.status === 200 && !!r.body.token && !!ownF1, JSON.stringify(r.body).slice(0, 160));
  check('el WhatsApp quedó verificado (es el de la ficha)', !!(ownF1 && ownF1.phone_verified_at));
  r = await call('POST', `/api/v2/admin/claim-requests/${rows.find(x => x.kind === 'revision').id}/dismiss`, {}, ADMIN);
  check('Descartar un pedido', r.status === 200 && (await q("SELECT status FROM claim_requests WHERE business_id=$1 AND kind='revision'", [F3])).rows[0].status === 'dismissed');

  // ── 6) Formulario viejo: verificada sin dueño ya NO se rechaza ─────────────
  const F5 = await biz('RF Verificada 2', 'rf-verificada-2', { verified: true });
  r = await call('POST', '/api/v2/businesses/rf-verificada-2/claim', { contact_name: 'X', contact_email: 'x@rf.test' });
  check('POST /businesses/:slug/claim (viejo): verificada sin dueño → acepta', r.status === 200 || r.status === 201, JSON.stringify(r.body));
  r = await call('POST', '/api/v2/businesses/rf-con-dueno/claim', { contact_name: 'X', contact_email: 'x2@rf.test' });
  check('…y con dueño → 409 "ya tiene dueño"', r.status === 409 && /dueño/.test(r.body.error));

  // ── 7) Alta en una pantalla ───────────────────────────────────────────────
  // Ciudad: tiene que ser de la lista (tabla cities). Sin ciudades cargadas no se bloquea.
  await q(`INSERT INTO cities (name, department, slug) VALUES ('Luque','Central','rf-city-luque'), ('Asunción','Capital','rf-city-asuncion')`);
  r = await call('POST', '/api/v2/claim/alta', { business_name: 'RF Taller Nuevo', category_id: ELEC, city: 'Luqe', whatsapp: '0981 771 900', name: 'RF Juan' });
  check('alta: ciudad mal escrita ("Luqe") → 400 city_invalid "Elegí la ciudad de la lista"', r.status === 400 && r.body.code === 'city_invalid', JSON.stringify(r.body));
  check('…y no se creó nada', !(await q("SELECT 1 FROM businesses WHERE name='RF Taller Nuevo'")).rows.length);
  r = await call('POST', '/api/v2/claim/alta', { business_name: 'RF Taller Ciudad', category_id: ELEC, city: 'asuncion', whatsapp: '0981 771 940', name: 'RF Ciudad' });
  const nbc = (await q("SELECT city FROM businesses WHERE name='RF Taller Ciudad'")).rows[0];
  check('alta: "asuncion" (sin tilde, minúscula) → se guarda el nombre de la lista "Asunción"', r.status === 201 && nbc && nbc.city === 'Asunción', JSON.stringify({ s: r.status, nbc }));
  r = await call('POST', '/api/v2/claim/alta', { business_name: 'RF Taller Nuevo', category_id: PARENT, city: 'Luque', whatsapp: '0981 771 900', name: 'RF Juan' });
  check('alta: rubro que no es "hoja" → 400', r.status === 400 && r.body.code === 'rubro_missing');
  r = await call('POST', '/api/v2/claim/alta', { business_name: 'RF Taller Nuevo', category_id: ELEC, city: 'Luque', whatsapp: '0981 771 004', name: 'RF Juan' });
  check('alta con el celular de una ficha existente → 409 "¿Es esta tu ficha?"', r.status === 409 && r.body.code === 'FICHA_EXISTS' && r.body.fichas[0].slug === 'rf-otra' && r.body.fichas[0].has_owner === false, JSON.stringify(r.body));
  r = await call('POST', '/api/v2/claim/alta', { business_name: 'RF Taller Nuevo', category_id: ELEC, city: 'Luque', whatsapp: '0981 771 001', name: 'RF Juan', force: true });
  check('alta con un WhatsApp que YA tiene cuenta → 409 ACCOUNT_EXISTS (no se entra sin prueba)', r.status === 409 && r.body.code === 'ACCOUNT_EXISTS');
  r = await call('POST', '/api/v2/claim/alta', { business_name: 'RF Taller Nuevo', category_id: ELEC, city: 'Luque', whatsapp: '0981 771 900', name: 'RF Juan', email: 'own@rf.test' });
  check('alta con un correo que ya tiene cuenta → 409 email_exists', r.status === 409 && r.body.code === 'email_exists');
  r = await call('POST', '/api/v2/claim/alta', { business_name: '  RF Taller   Nuevo ', category_id: ELEC, city: 'Luque', whatsapp: '0981 771 900', name: ' RF  Juan ', email: 'juan@rf.test', user_id: OWN });
  const nb = r.body && (await q("SELECT b.*, (SELECT user_id FROM user_businesses WHERE business_id=b.id AND is_owner) AS owner FROM businesses b WHERE slug=$1", [r.body.slug])).rows[0];
  const nu = nb && (await q('SELECT * FROM users WHERE id=$1', [nb.owner])).rows[0];
  check('alta OK: 201 + sesión + redirect a Mi Portal', r.status === 201 && !!r.body.token && r.body.redirect === '/cliente/', JSON.stringify(r.body).slice(0, 200));
  check('alta: ficha con nombre limpio, rubro, ciudad, WhatsApp y teléfono', nb && nb.name === 'RF Taller Nuevo' && nb.category_id === ELEC && nb.city === 'Luque' && nb.whatsapp === '595981771900' && nb.phone === '0981771900' && nb.verified === false);
  check('alta: el user_id del body se IGNORA (dueño = la cuenta nueva, no la ajena)', nb && nb.owner !== OWN && nu && nu.phone === '+595981771900' && nu.name === 'RF Juan' && !nu.password_set_at);
  const lead = nb && (await q("SELECT * FROM service_leads WHERE business_id=$1", [nb.id])).rows[0];
  check('alta: entra a Captación como lead "pending" (web_registration)', lead && lead.status === 'pending' && lead.service_type === 'basic' && JSON.parse(lead.notes).source === 'web_registration');
  check('alta: correo de bienvenida con confirmación + aviso al equipo', mails.some(m => m.to === 'juan@rf.test' && m.tpl === 'claimWelcome'));
  r = await call('POST', '/api/v2/claim/alta', { business_name: 'RF Otro Negocio', category_id: ELEC, city: 'Luque', whatsapp: '0981 771 004', name: 'RF María', force: true });
  check('"No, es otro negocio: crear igual" (force) → crea', r.status === 201);

  // Con sesión
  const SESS = 'Bearer ' + jwt.sign({ id: nu.id, role: 'client' }, process.env.JWT_SECRET);
  r = await call('POST', '/api/v2/claim/alta', { business_name: 'RF Segundo', category_id: ELEC, city: 'Luque', whatsapp: '0981 771 950' }, SESS);
  check('con sesión y ya tiene su ficha gratis → 403 FREE_LIMIT', r.status === 403 && r.body.code === 'FREE_LIMIT');
  const U2 = (await q(`INSERT INTO users (email, password_hash, name, role, phone) VALUES ('u2@rf.test',$1,'RF Sin Negocio','client','+595981771960') RETURNING id`, [h])).rows[0].id;
  r = await call('POST', '/api/v2/claim/alta', { business_name: 'RF De Sesion', category_id: ELEC, city: 'Luque', whatsapp: '0981 771 961', user_id: OWN },
                 'Bearer ' + jwt.sign({ id: U2, role: 'client' }, process.env.JWT_SECRET));
  const sb = (await q("SELECT (SELECT user_id FROM user_businesses WHERE business_id=b.id AND is_owner) AS owner FROM businesses b WHERE slug=$1", [r.body.slug])).rows[0];
  check('con sesión: la ficha es de la cuenta de la SESIÓN y no se emite otro token', r.status === 201 && sb.owner === U2 && !r.body.token);

  // ── 8) Orden de búsqueda: relevancia y, dentro, verificada ────────────────
  const qb = async (name, slug, verified, catId) => biz(name, slug, { verified, cat: catId, city: 'Asunción' });
  await qb('RF Electricista Domiciliario Lambaré', 'rf-e-lambare', false, ELEC);
  await qb('RF Electricista Domiciliario Luque', 'rf-e-luque', true, ELEC);
  await qb('RF Técnico en Refrigeración', 'rf-tecnico', true, ELEC);
  await qb('RF Consorcio Electrico', 'rf-consorcio', true, TECNO);
  r = await call('GET', '/api/v2/businesses?q=' + encodeURIComponent('Electricista') + '&limit=50&sort=relevance');
  const names = ((r.body && r.body.data) || []).map(x => x.name).filter(n => /^RF (Electricista|Técnico|Consorcio)/.test(n));
  const pos = n => names.indexOf(n);
  check('búsqueda "Electricista": la VERIFICADA va antes que la no verificada del mismo escalón', pos('RF Electricista Domiciliario Luque') >= 0 && pos('RF Electricista Domiciliario Luque') < pos('RF Electricista Domiciliario Lambaré'), JSON.stringify(names));
  check('…el rubro "Electricidad" cuenta como coincidencia (Técnico verificado antes que la no verificada)', pos('RF Técnico en Refrigeración') >= 0 && pos('RF Técnico en Refrigeración') < pos('RF Electricista Domiciliario Lambaré'), JSON.stringify(names));
  check('…y lo de otro rubro sin el nombre queda después', pos('RF Consorcio Electrico') === -1 || pos('RF Consorcio Electrico') > pos('RF Electricista Domiciliario Lambaré'), JSON.stringify(names));

  await cleanup();
  await q("DELETE FROM users WHERE id = $1", [U2]).catch(() => {});
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  server.close(); await pool.end(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
