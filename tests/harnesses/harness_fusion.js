// FUSIÓN DE FICHAS (2026-10-14): reproduce el caso "Maxi Refrigeración" con el
// ALTA WEB REAL (POST /directory/leads) y prueba asistente, vista previa, fusión,
// redirección del link, Leads, revertir exacto, descartar y guardas.
// admin.js + directory.js REALES contra Postgres efímero (esquema de prod + migraciones).
// Uso: node harness_fusion.js <ROOT del repo (…/opt/retopa)>
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
mock('config/mail', { sendEmail: async (to, tpl) => { mails.push({ to, tpl }); return { success: true }; }, renderTemplate: async () => ({}) });

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: 'retopa', user: 'retopa' });
  const q = (s, p) => pool.query(s, p);
  const express = require('express'), jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs');

  // ── Limpieza (autocontenido) ───────────────────────────────────────────────
  const old = (await q("SELECT id FROM businesses WHERE slug LIKE 'maxi-refrigeracion%' OR slug LIKE 'fz-%'")).rows.map(r => r.id);
  if (old.length) {
    await q('DELETE FROM business_merges WHERE survivor_id = ANY($1) OR duplicate_id = ANY($1)', [old]);
    await q('DELETE FROM service_leads WHERE business_id = ANY($1)', [old]);
    await q('DELETE FROM businesses WHERE id = ANY($1)', [old]);
  }
  await q("DELETE FROM users WHERE email LIKE '%@fz.test'");
  { const ex = (await q("SELECT id FROM businesses WHERE slug LIKE 'fzx-%' OR name LIKE 'FZX %'")).rows.map(r => r.id);
    if (ex.length) { await q('DELETE FROM business_merges WHERE survivor_id = ANY($1) OR duplicate_id = ANY($1)', [ex]);
      await q('DELETE FROM service_leads WHERE business_id = ANY($1)', [ex]); await q('DELETE FROM businesses WHERE id = ANY($1)', [ex]); } }
  const h = await bcrypt.hash('x', 4);
  const ADM = (await q(`INSERT INTO users (email, password_hash, name, role) VALUES ('adm@fz.test',$1,'FZ Admin','admin') RETURNING id`, [h])).rows[0].id;
  let CAT = (await q("SELECT id FROM categories WHERE slug='fz-aire'")).rows[0];
  CAT = CAT ? CAT.id : (await q("INSERT INTO categories (name, slug) VALUES ('Aire acondicionado','fz-aire') RETURNING id")).rows[0].id;
  let CAT2 = (await q("SELECT id FROM categories WHERE slug='fz-electro'")).rows[0];
  CAT2 = CAT2 ? CAT2.id : (await q("INSERT INTO categories (name, slug) VALUES ('Electricidad','fz-electro') RETURNING id")).rows[0].id;

  // ── La ficha ORIGINAL (como la 15223): reclamada por enlace, nunca entró ──
  const ORIG = (await q(`INSERT INTO businesses (name, slug, city, address, phone, whatsapp, category_id, plan_type, is_active,
                           claim_status, claim_method, claimed_at, created_at)
     VALUES ('Maxi Refrigeración, Electricidad y Lavarropas','maxi-refrigeracion-electricidad-y-lavarropas','Asunción',
             'Luis A. de Herrera 1569','0981595042','595981595042',$1,'basic',TRUE,'approved','token',NOW() - interval '5 days',
             NOW() - interval '400 days') RETURNING id, slug`, [CAT])).rows[0];
  await q('INSERT INTO business_categories (business_id, category_id, is_primary, position) VALUES ($1,$2,TRUE,0)', [ORIG.id, CAT]);
  const U = (await q(`INSERT INTO users (email, password_hash, name, role, is_active, email_verified, phone)
     VALUES ('dure@fz.test','!no-password!','Julio Duré','client',TRUE,FALSE,'+595981595042') RETURNING id`)).rows[0].id;
  await q('INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit) VALUES ($1,$2,TRUE,TRUE)', [U, ORIG.id]);
  for (let i = 0; i < 21; i++) await q(`INSERT INTO business_views (business_id) VALUES ($1)`, [ORIG.id]);
  for (let i = 0; i < 2; i++) await q(`INSERT INTO business_clicks (business_id, click_type) VALUES ($1,'whatsapp')`, [ORIG.id]).catch(() => q(`INSERT INTO business_clicks (business_id) VALUES ($1)`, [ORIG.id]));
  const G0 = (await q(`INSERT INTO business_gallery (business_id, image_url, position) VALUES ($1,'https://x/orig.jpg',0) RETURNING id`, [ORIG.id])).rows[0].id;

  // Señuelos: nombre parecido con OTRO celular; y otra ficha que comparte un FIJO.
  await q(`INSERT INTO businesses (name, slug, city, phone, is_active, created_at)
           VALUES ('Maxi Refrigeración Lambaré','fz-maxi-lambare','Lambaré','0982111222',TRUE, NOW() - interval '90 days')`);

  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.headers['x-forwarded-for'] = '10.0.0.' + Math.floor(Math.random() * 200); next(); });
  app.use('/api/v2/admin', require(path.join(SRC, 'routes/admin')));
  app.use('/api/v2/directory', require(path.join(SRC, 'routes/directory')));
  const server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const port = server.address().port;
  const ADMIN = 'Bearer ' + jwt.sign({ id: ADM, role: 'admin' }, process.env.JWT_SECRET);
  const call = (method, p, body, auth = ADMIN) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, path: p, method,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...(auth ? { Authorization: auth } : {}) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) {} resolve({ status: res.statusCode, body: j }); }); });
    req.on('error', reject); if (data) req.write(data); req.end();
  });

  // ── El ALTA WEB duplicada, por el endpoint real ────────────────────────────
  let r = await call('POST', '/api/v2/directory/leads', {
    plan_type: 'basic', name: 'Maxi Refrigeracion electricidad y Lavarropas', phone: '595981595042', email: 'dure@fz.test',
    contact_name: 'Julio César Duré', contact_email: 'dure@fz.test', city: 'Asunción', category_id: CAT2,
    description: 'Reparación de aires, heladeras y lavarropas a domicilio.', image_url: 'https://x/logo-nuevo.png',
  }, null);
  check('alta web: crea la ficha nueva (como pasó en prod)', r.status === 201, JSON.stringify(r.body && r.body.error));
  const DUP = r.body.data.business;
  const LEAD = (await q('SELECT id, status FROM service_leads WHERE business_id=$1', [DUP.id])).rows[0];
  check('alta web: entra como Lead de captación "pending"', LEAD && LEAD.status === 'pending');
  const G1 = (await q(`INSERT INTO business_gallery (business_id, image_url, position) VALUES ($1,'https://x/nueva1.jpg',0) RETURNING id`, [DUP.id])).rows[0].id;
  for (let i = 0; i < 3; i++) await q(`INSERT INTO business_views (business_id) VALUES ($1)`, [DUP.id]);
  // Que la cuenta del alta engancha (si estuviera verificada) — simulamos que ya lo engancha:
  await q(`INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit) VALUES ($1,$2,TRUE,TRUE) ON CONFLICT DO NOTHING`, [U, DUP.id]);

  // ── Asistente: candidatos con evidencia y FUENTE ───────────────────────────
  r = await call('GET', '/api/v2/admin/merges/candidates');
  const cands = (r.body && r.body.data) || [];
  const c = cands.find(x => x.new_id === DUP.id);
  check('asistente: propone el par alta nueva → ficha original', !!c && c.old_id === ORIG.id, JSON.stringify(cands.map(x => [x.new_id, x.old_id])));
  check('asistente: un solo candidato para esa alta (los señuelos no entran)', cands.filter(x => x.new_id === DUP.id).length === 1);
  const kinds = new Set((c && c.evidence || []).map(e => e.kind));
  check('evidencia: mismo celular + mismo correo + nombre parecido', kinds.has('cel') && kinds.has('mail') && kinds.has('nombre'), JSON.stringify(c && c.evidence.map(e => e.label)));
  const cel = c.evidence.find(e => e.kind === 'cel');
  check('evidencia: el celular dice de DÓNDE sale en cada ficha', /0981 595 042/.test(cel.label) && /en el alta: .*formulario de alta/.test(cel.label) && /en la original: .*WhatsApp/.test(cel.label) && c.evidence.filter(e => e.kind === 'cel').length === 1, cel.label);
  const mail = c.evidence.find(e => e.kind === 'mail');
  check('evidencia: el correo coincide con el de la CUENTA dueña de la original', /en la original: cuenta dueña/.test(mail.label), mail.label);
  check('candidato: trae visitas/clics de la original para decidir', c.original.views === 21 && c.original.clicks === 2 && c.nuevo.views === 3);
  r = await call('GET', `/api/v2/admin/merges/candidates?business_id=${DUP.id}`);
  check('asistente por ficha (para el modal del lead)', r.body.data.length === 1);

  // ── Vista previa ───────────────────────────────────────────────────────────
  r = await call('GET', `/api/v2/admin/merges/preview?survivor_id=${ORIG.id}&duplicate_id=${DUP.id}`);
  const pv = r.body.data;
  const F = Object.fromEntries(pv.fields.map(f => [f.field, f]));
  check('preview: correo, descripción y logo se traen (la original los tiene vacíos)', F.email.suggest === 'duplicate' && F.description.suggest === 'duplicate' && F.image_url.suggest === 'duplicate');
  check('preview: nombre y rubro se mantienen (las dos los tienen)', F.name.suggest === 'survivor' && F.category_id.suggest === 'survivor' && F.category_id.duplicate === 'Electricidad');
  check('preview: cada sugerencia explica por qué', /no lo tiene/.test(F.email.reason) && /Las dos/.test(F.name.reason));
  check('preview: lo que se mueve (1 foto, 3 visitas)', pv.moves.photos === 1 && pv.moves.views === 3);
  check('preview: incluye la evidencia y el lead', pv.evidence.length >= 2 && pv.lead_id === LEAD.id);
  check('preview: el mismo celular escrito distinto (0981… / 595981…) NO aparece como dato distinto', !F.phone && !F.whatsapp, JSON.stringify(Object.keys(F)));
  check('preview: sin bloqueos ni advertencias (misma cuenta)', !pv.blocked && pv.warnings.length === 0, JSON.stringify(pv.warnings));

  // ── Guardas ────────────────────────────────────────────────────────────────
  r = await call('POST', '/api/v2/admin/merges/apply', { survivor_id: ORIG.id, duplicate_id: ORIG.id });
  check('guarda: misma ficha → 400', r.status === 400);
  r = await call('POST', '/api/v2/admin/merges/apply', { survivor_id: ORIG.id, duplicate_id: DUP.id }, null);
  check('guarda: sin sesión admin → 401', r.status === 401);

  // ── Fusionar ───────────────────────────────────────────────────────────────
  const take = pv.fields.filter(f => f.suggest === 'duplicate').map(f => f.field).concat(['phone_raw_inexistente']);
  r = await call('POST', '/api/v2/admin/merges/apply', { survivor_id: ORIG.id, duplicate_id: DUP.id, take, evidence: pv.evidence, lead_id: pv.lead_id });
  check('fusionar: OK', r.status === 200 && r.body.success, JSON.stringify(r.body));
  const MID = r.body.data.merge_id;
  const nt = r.body.notify || {};
  check('aviso al dueño: WhatsApp del dueño + mensaje "no tenés que cargar nada" + link de acceso',
        nt.wa === '595981595042' && /no tenés que cargar nada/.test(nt.message) && /\/negocio\/maxi-refrigeracion-electricidad-y-lavarropas/.test(nt.message) && /\?acceso=/.test(nt.message), JSON.stringify(nt));
  check('aviso: le mandamos el correo "Unimos … a tu ficha de siempre" y el panel lo dice (emailed)',
        nt.emailed === true && nt.email === 'dure@fz.test' && mails.some(m => m.to === 'dure@fz.test' && m.tpl === 'fichasFusionadas'), JSON.stringify(mails.slice(-3)));
  check('aviso: el link de acceso quedó guardado (hash) para ese usuario', !!(await q('SELECT access_token_hash FROM users WHERE id=$1', [U])).rows[0].access_token_hash);
  check('fusionar: columnas fuera de la lista se ignoran', !r.body.data.fields.includes('phone_raw_inexistente'));
  let s = (await q('SELECT * FROM businesses WHERE id=$1', [ORIG.id])).rows[0];
  let d = (await q('SELECT * FROM businesses WHERE id=$1', [DUP.id])).rows[0];
  check('la original queda con correo, descripción y logo del alta', s.email === 'dure@fz.test' && /lavarropas a domicilio/.test(s.description) && s.image_url === 'https://x/logo-nuevo.png');
  check('la original conserva nombre, slug, rubro y su historial', s.name.startsWith('Maxi Refrigeración,') && s.slug === ORIG.slug && s.category_id === CAT && s.is_active);
  const vs = (await q('SELECT count(*)::int n FROM business_views WHERE business_id=$1', [ORIG.id])).rows[0].n;
  check('visitas: 21 + 3 = 24 en la original', vs === 24, String(vs));
  const gal = (await q('SELECT id, position FROM business_gallery WHERE business_id=$1 ORDER BY position', [ORIG.id])).rows;
  check('fotos: la del alta pasa DESPUÉS de las existentes', gal.length === 2 && gal[0].id === G0 && gal[1].id === G1 && gal[1].position === 1, JSON.stringify(gal));
  check('la duplicada: inactiva, merged_into = original, NO borrada', d && d.is_active === false && d.merged_into === ORIG.id && !!d.merged_at);
  const ubs = (await q('SELECT business_id FROM user_businesses WHERE user_id=$1 ORDER BY business_id', [U])).rows.map(x => x.business_id);
  check('el dueño queda con UNA ficha (la original) en Mi Portal', ubs.length === 1 && ubs[0] === ORIG.id, JSON.stringify(ubs));
  check('lead del alta → "fusionado"', (await q('SELECT status FROM service_leads WHERE id=$1', [LEAD.id])).rows[0].status === 'fusionado');
  const m = (await q('SELECT * FROM business_merges WHERE id=$1', [MID])).rows[0];
  check('registro: autor, evidencia, valores previos de las dos', m.created_by === ADM && m.evidence.length >= 2 && m.survivor_before.email === null && m.duplicate_before.is_active === true && m.status === 'aplicada');

  // ── El link de la duplicada lleva a la original ────────────────────────────
  r = await call('GET', `/api/v2/directory/businesses/${DUP.slug}`, null, null);
  check('link de la ficha fusionada → muestra la original', r.status === 200 && r.body.data.slug === ORIG.slug && r.body.data.id === ORIG.id, JSON.stringify(r.body && r.body.data && r.body.data.slug));
  r = await call('GET', `/api/v2/directory/businesses/fz-no-existe`, null, null);
  check('un slug inexistente sigue dando 404', r.status === 404);

  // ── Leads: sale de Activos, aparece en Archivados con la marca ─────────────
  r = await call('GET', '/api/v2/admin/leads?limit=200&view=active');
  check('Leads/Activos: el alta fusionada ya no está', !r.body.data.some(l => l.id === LEAD.id));
  r = await call('GET', '/api/v2/admin/leads?limit=200&view=archived');
  const la = r.body.data.find(l => l.id === LEAD.id);
  check('Leads/Archivados: está, con business_merged_into', la && la.status === 'fusionado' && la.business_merged_into === ORIG.id);
  r = await call('GET', '/api/v2/admin/merges/candidates');
  check('asistente: ese par ya no se propone', !(r.body.data || []).some(x => x.new_id === DUP.id));
  r = await call('POST', '/api/v2/admin/merges/apply', { survivor_id: ORIG.id, duplicate_id: DUP.id, take: [] });
  check('guarda: fusionar de nuevo la misma → 409', r.status === 409);
  r = await call('GET', '/api/v2/admin/merges');
  check('historial: la fusión con nombres y autor', r.body.data[0].id === MID && r.body.data[0].created_by_name === 'FZ Admin' && /Maxi/.test(r.body.data[0].duplicate_name));

  // ── Revertir exacto (respetando lo que el dueño cambió después) ────────────
  await q(`UPDATE businesses SET description = 'Lo escribió el dueño después' WHERE id = $1`, [ORIG.id]);
  r = await call('POST', `/api/v2/admin/merges/${MID}/revert`, {});
  check('revertir: OK e informa el campo que NO pisó', r.status === 200 && r.body.data.kept.includes('description') && r.body.data.restored.includes('email'), JSON.stringify(r.body));
  s = (await q('SELECT * FROM businesses WHERE id=$1', [ORIG.id])).rows[0];
  d = (await q('SELECT * FROM businesses WHERE id=$1', [DUP.id])).rows[0];
  check('revertir: correo y logo vuelven a vacío; la descripción del dueño queda', s.email === null && s.image_url === null && s.description === 'Lo escribió el dueño después');
  check('revertir: la duplicada vuelve activa y sin merged_into', d.is_active === true && d.merged_into === null);
  const vs2 = (await q('SELECT business_id, count(*)::int n FROM business_views WHERE business_id = ANY($1) GROUP BY 1', [[ORIG.id, DUP.id]])).rows;
  check('revertir: visitas 21 / 3 como antes', vs2.find(x => x.business_id === ORIG.id).n === 21 && vs2.find(x => x.business_id === DUP.id).n === 3);
  const g2 = (await q('SELECT id, business_id, position FROM business_gallery WHERE id = ANY($1) ORDER BY id', [[G0, G1]])).rows;
  check('revertir: la foto vuelve a su ficha y a su posición', g2.find(x => x.id === G1).business_id === DUP.id && g2.find(x => x.id === G1).position === 0 && g2.find(x => x.id === G0).position === 0);
  const ubs2 = (await q('SELECT business_id FROM user_businesses WHERE user_id=$1 ORDER BY business_id', [U])).rows.map(x => x.business_id);
  check('revertir: el vínculo de la cuenta con la duplicada vuelve', ubs2.length === 2);
  check('revertir: el lead vuelve a "pending"', (await q('SELECT status FROM service_leads WHERE id=$1', [LEAD.id])).rows[0].status === 'pending');
  check('revertir: el registro queda "revertida" con autor', (await q('SELECT status, reverted_by FROM business_merges WHERE id=$1', [MID])).rows[0].reverted_by === ADM);
  r = await call('POST', `/api/v2/admin/merges/${MID}/revert`, {});
  check('guarda: revertir dos veces → 409', r.status === 409);
  r = await call('GET', '/api/v2/admin/merges/candidates');
  check('tras revertir, el asistente la vuelve a proponer', (r.body.data || []).some(x => x.new_id === DUP.id));

  // ── Rubro: si se elige el del alta, queda UNO (ficha gratis = un rubro) ────
  r = await call('POST', '/api/v2/admin/merges/apply', { survivor_id: ORIG.id, duplicate_id: DUP.id, take: ['email', 'category_id'] });
  const M2 = r.body.data && r.body.data.merge_id;
  const bc = (await q('SELECT category_id, is_primary FROM business_categories WHERE business_id=$1', [ORIG.id])).rows;
  check('rubro del alta: queda uno solo, principal', r.status === 200 && bc.length === 1 && bc[0].category_id === CAT2 && bc[0].is_primary);
  r = await call('POST', `/api/v2/admin/merges/${M2}/revert`, {});
  const bc2 = (await q('SELECT category_id FROM business_categories WHERE business_id=$1', [ORIG.id])).rows;
  s = (await q('SELECT category_id FROM businesses WHERE id=$1', [ORIG.id])).rows[0];
  check('revertir rubro: vuelve el de antes', r.status === 200 && bc2.length === 1 && bc2[0].category_id === CAT && s.category_id === CAT);

  // ── "No es la misma" ───────────────────────────────────────────────────────
  r = await call('POST', '/api/v2/admin/merges/discard', { old_id: ORIG.id, new_id: DUP.id, lead_id: LEAD.id, evidence: [{ kind: 'cel' }] });
  check('descartar: queda registrado', r.status === 200);
  r = await call('GET', '/api/v2/admin/merges/candidates');
  check('descartado: no se vuelve a proponer', !(r.body.data || []).some(x => x.new_id === DUP.id));
  await q("DELETE FROM business_merges WHERE status='descartada' AND duplicate_id=$1", [DUP.id]);

  // ── Otra cuenta dueña: advertencia y no pasa como dueña ────────────────────
  const V = (await q(`INSERT INTO users (email, password_hash, name, role) VALUES ('otro@fz.test',$1,'Otro','client') RETURNING id`, [h])).rows[0].id;
  await q('DELETE FROM user_businesses WHERE business_id=$1', [DUP.id]);
  await q('INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit) VALUES ($1,$2,TRUE,TRUE)', [V, DUP.id]);
  r = await call('GET', `/api/v2/admin/merges/preview?survivor_id=${ORIG.id}&duplicate_id=${DUP.id}`);
  check('preview: avisa que la nueva es de OTRA cuenta', r.body.data.warnings.some(w => /otra cuenta/.test(w)), JSON.stringify(r.body.data.warnings));
  r = await call('POST', '/api/v2/admin/merges/apply', { survivor_id: ORIG.id, duplicate_id: DUP.id, take: [] });
  const ownersS = (await q('SELECT user_id FROM user_businesses WHERE business_id=$1 AND is_owner', [ORIG.id])).rows.map(x => x.user_id);
  check('otra cuenta: la original sigue con SU dueño solamente', r.status === 200 && ownersS.length === 1 && ownersS[0] === U);
  await call('POST', `/api/v2/admin/merges/${r.body.data.merge_id}/revert`, {});

  // ── Fichas de prueba del EQUIPO: no son duplicados ─────────────────────────
  await q(`INSERT INTO users (email, password_hash, name, role, phone) VALUES ('staff@fz.test',$1,'FZ Staff','godmode','+595991000111')`, [h]);
  await q(`INSERT INTO businesses (name, slug, phone, email, is_active, created_at) VALUES ('FZX Empresa del staff','fzx-staff','0991000111','staff@fz.test',TRUE, NOW() - interval '30 days')`);
  r = await call('POST', '/api/v2/directory/leads', { plan_type: 'basic', name: 'FZX Otra prueba', phone: '0991 000 111', email: 'staff@fz.test',
    contact_name: 'Staff', contact_email: 'staff@fz.test' }, null);
  const STF = r.body.data.business.id;
  r = await call('GET', '/api/v2/admin/merges/candidates');
  check('equipo: un alta con el celular/correo de un admin/GodMode NO se propone', !(r.body.data || []).some(x => x.new_id === STF), JSON.stringify((r.body.data || []).map(x => [x.new_id, x.old_id])));

  // ── Un celular en 3+ fichas (dueño de varios negocios): solo con nombre parecido ──
  for (const [nm, sl] of [['FZX Panadería Lucía Centro', 'fzx-pan1'], ['FZX Ferretería Lucía', 'fzx-fer'], ['FZX Librería Lucía', 'fzx-lib']]) {
    await q(`INSERT INTO businesses (name, slug, phone, is_active, created_at) VALUES ($1,$2,'0971222333',TRUE, NOW() - interval '60 days')`, [nm, sl]);
  }
  r = await call('POST', '/api/v2/directory/leads', { plan_type: 'basic', name: 'FZX Gomería San Roque', phone: '0971 222 333', email: 'gom@fz.test',
    contact_name: 'X', contact_email: 'gom@fz.test' }, null);
  const GOM = r.body.data.business.id;
  r = await call('POST', '/api/v2/directory/leads', { plan_type: 'basic', name: 'FZX Panaderia Lucia', phone: '0971222333', email: 'pan@fz.test',
    contact_name: 'Y', contact_email: 'pan@fz.test' }, null);
  const PAN = r.body.data.business.id;
  r = await call('GET', '/api/v2/admin/merges/candidates');
  const cs = r.body.data || [];
  check('dato compartido (3+ fichas) y nombre distinto → NO se propone', !cs.some(x => x.new_id === GOM), JSON.stringify(cs.filter(x => x.new_id === GOM).map(x => x.original.name)));
  const pc = cs.filter(x => x.new_id === PAN);
  check('dato compartido + nombre parecido → se propone SOLO la del nombre parecido', pc.length === 1 && /Panadería Lucía Centro/.test(pc[0].original.name), JSON.stringify(pc.map(x => x.original.name)));
  check('…y la evidencia avisa en cuántas fichas está el dato', pc[0] && pc[0].evidence.some(e => e.weak && /ese dato está en \d+ fichas/.test(e.label)), JSON.stringify(pc[0] && pc[0].evidence.map(e => e.label)));

  // ── Pagos: no se fusiona a ciegas ──────────────────────────────────────────
  const hasPG = (await q("SELECT to_regclass('public.plan_grants') IS NOT NULL ok")).rows[0].ok;
  if (hasPG) {
    const cols = (await q(`SELECT column_name, is_nullable, column_default, data_type FROM information_schema.columns WHERE table_name='plan_grants'`)).rows;
    const req = cols.filter(x => x.is_nullable === 'NO' && !x.column_default && x.column_name !== 'business_id');
    const vals = req.map(x => /int|numeric/.test(x.data_type) ? 1 : /timestamp|date/.test(x.data_type) ? 'NOW()' : /bool/.test(x.data_type) ? 'TRUE' : `'premium'`);
    await q(`INSERT INTO plan_grants (business_id${req.map(x => ', ' + x.column_name).join('')}) VALUES (${DUP.id}${vals.map(v => ', ' + v).join('')})`);
    r = await call('POST', '/api/v2/admin/merges/apply', { survivor_id: ORIG.id, duplicate_id: DUP.id, take: [] });
    check('guarda: la nueva con plan_grants → 409 (a mano)', r.status === 409 && /pagos/.test(r.body.error));
    await q('DELETE FROM plan_grants WHERE business_id=$1', [DUP.id]);
  }

  // Limpieza: que los demás harnesses no cuenten estas fichas (claims "a revisar", leads…).
  { const ids = (await q("SELECT id FROM businesses WHERE slug LIKE 'maxi-refrigeracion%' OR slug LIKE 'fz-%' OR slug LIKE 'fzx-%' OR name LIKE 'FZX %'")).rows.map(r => r.id);
    if (ids.length) { await q('DELETE FROM business_merges WHERE survivor_id = ANY($1) OR duplicate_id = ANY($1)', [ids]);
      await q('DELETE FROM service_leads WHERE business_id = ANY($1)', [ids]); await q('DELETE FROM businesses WHERE id = ANY($1)', [ids]); }
    await q("DELETE FROM users WHERE email LIKE '%@fz.test' OR email LIKE '%@fzu.test'"); }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  server.close(); await pool.end(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
