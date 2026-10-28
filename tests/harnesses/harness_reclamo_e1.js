// E1 — RECLAMO EN UNA PANTALLA, SIN CONTRASEÑA (2026-10-13)
// Routers REALES (claim, admin, client, auth-public, prospects) contra Postgres
// efímero con el esquema de prod + migraciones claim_events y reclamo_e1.
// Verifica el circuito completo: link → ¿es tuyo? → rubro/WhatsApp/nombre →
// sesión → Mi Portal; "No es mío"; cambios sensibles a revisión; Confirmar;
// Revertir al valor anterior; link de acceso de un uso; {link_reclamo}.
// Uso: node harness_reclamo_e1.js <ROOT del repo (…/opt/retopa)>
const path = require('path');
const http = require('http');
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
mock('config/redis', { get: async () => null, setEx: async () => {}, set: async () => {}, keys: async () => [], del: async () => {}, isReady: false, on: () => {} });
mock('utils/kit-pdf', { buildKitBatchPdf: async () => Buffer.from(''), buildKitPdf: async () => Buffer.from('') });
mock('utils/sysnet', { getNetworkStats: async () => ({}) });
mock('helpers/notifyOwner', { notifyOwner: async () => {} });
mock('helpers/verifyFicha', { runVerifyFicha: async () => ({}) });
mock('config/mail', { sendEmail: async (to, template, data) => { sent.push({ to, template, data }); return { success: true }; }, renderTemplate: async () => ({}) });

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: 'retopa', user: 'retopa' });
  const q = (s, p) => pool.query(s, p);
  const express = require('express');
  const jwt = require('jsonwebtoken');

  // ── Unidad: helpers/claimFlow ──────────────────────────────────────────────
  const { mobilePY, mobileLocal, suggestRubro } = require(path.join(SRC, 'helpers/claimFlow'));
  check('mobilePY: 0981 123 456 → 595981123456', mobilePY('0981 123 456') === '595981123456');
  check('mobilePY: +595 982-000-111', mobilePY('+595 982-000-111') === '595982000111');
  check('mobilePY: fijo 021 555 555 → null', mobilePY('021 555 555') === null);
  check('mobileLocal: 595981123456 → 0981 123 456', mobileLocal('595981123456') === '0981 123 456');
  const R = [{ id: 101, name: 'Ferreterías', grupo: 'Tiendas y Comercios' }, { id: 102, name: 'Panaderías', grupo: 'Tiendas y Comercios' },
             { id: 201, name: 'Cerrajerías', grupo: 'Servicios Profesionales' }, { id: 202, name: 'Abogados', grupo: 'Servicios Profesionales' },
             { id: 300, name: 'Veterinarias', grupo: null }, { id: 301, name: 'Panadería y Confitería', grupo: null }];
  let sg = suggestRubro({ name: 'Cerrajería Lopez' }, R, [201]);
  check('sugerencia 1: rubro hoja actual, con su fuente', sg && sg.id === 201 && /figura hoy/.test(sg.reason), JSON.stringify(sg));
  sg = suggestRubro({ name: 'Ferretería Sur SA' }, R, [100]);
  check('sugerencia 2: por el nombre, citando la palabra', sg && sg.id === 101 && sg.reason.includes('«Ferretería»'), JSON.stringify(sg));
  sg = suggestRubro({ name: 'Panadería Doña Rosa' }, R, []);
  check('sugerencia ambigua (2 rubros) → se abstiene', sg === null, JSON.stringify(sg));
  sg = suggestRubro({ name: 'Servicios Generales del Paraguay' }, R, [200]);
  check('palabras genéricas → se abstiene', sg === null);
  sg = suggestRubro({ name: 'Kiosco Pepe' }, R, []);
  check('sin coincidencia → se abstiene (nunca por verosimilitud)', sg === null);

  // ── Datos ──────────────────────────────────────────────────────────────────
  await q(`TRUNCATE claim_events, claim_snapshots, owner_change_requests`);
  await q(`DELETE FROM user_businesses; DELETE FROM service_leads; DELETE FROM business_categories; DELETE FROM business_gallery;
           DELETE FROM prospect_wa_outreach; DELETE FROM users WHERE email LIKE '%@harness.test' OR email IS NULL;
           DELETE FROM businesses WHERE slug LIKE 'h-%'; DELETE FROM categories WHERE id BETWEEN 100 AND 399`);
  await q(`INSERT INTO categories (id, slug, name, parent_id) VALUES
           (100,'h-tiendas','Tiendas y Comercios',NULL),(101,'h-ferreterias','Ferreterías',100),(102,'h-panaderias','Panaderías',100),
           (200,'h-servicios','Servicios Profesionales',NULL),(201,'h-cerrajerias','Cerrajerías',200),(300,'h-veterinarias','Veterinarias',NULL)`);
  await q("INSERT INTO site_config (key, value) VALUES ('site_url','https://dev.retopa.test'),('leads_emails','leads@retopa.test') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value");
  const mk = async (o) => (await q(
    `INSERT INTO businesses (name, trade_name, slug, is_active, whatsapp, phone, email, city, description, category_id, claim_token, claim_expires_at, claim_status, verified)
     VALUES ($1,$2,$3,TRUE,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE) RETURNING id`,
    [o.name, o.trade || null, o.slug, o.wa || null, o.phone || null, o.email || null, o.city || 'Luque', o.desc || 'Descripción original',
     o.cat || null, o.token || null, o.exp || null, o.status || null])).rows[0].id;
  const T1 = 'a1'.repeat(32), T2 = 'b2'.repeat(32), T3 = 'c3'.repeat(32), T4 = 'd4'.repeat(32);
  const B1 = await mk({ name: 'Ferretería Sur SA', slug: 'h-ferre', wa: '595981123456', email: 'ficha@harness.test', cat: 100, token: T1 });
  await q('INSERT INTO business_categories (business_id, category_id, is_primary, position) VALUES ($1,100,TRUE,0)', [B1]);
  const B2 = await mk({ name: 'Kiosco Dos', slug: 'h-dos', phone: '0983 999 888', token: T2 });
  const B3 = await mk({ name: 'Taller Tres', slug: 'h-tres', wa: '595982000111', token: T3, status: 'pending' });
  const B4 = await mk({ name: 'No Es De Él', slug: 'h-noes', wa: '595984444444', token: T4 });
  const B5 = await mk({ name: 'Vencida Cinco', slug: 'h-cinco', wa: '595985555555', token: 'e5'.repeat(32), exp: new Date(Date.now() - 864e5) });
  await q("INSERT INTO prospect_wa_outreach (whatsapp, estado) VALUES ('595981123456','enviado'),('595984444444','enviado')");
  await q("INSERT INTO users (email, password_hash, name, role) VALUES ('existe@harness.test','x','Ya Existe','client')");

  // ── Servidor con los routers reales ────────────────────────────────────────
  const app = express();
  app.use(express.json());
  app.use('/api/v2/claim', require(path.join(SRC, 'routes/claim.routes')));
  app.use('/api/v2/auth', require(path.join(SRC, 'routes/auth-public')));
  app.use('/api/v2/client', require(path.join(SRC, 'routes/client')));
  app.use('/api/v2/admin/prospects', require(path.join(SRC, 'routes/prospects.routes')));
  app.use('/api/v2/admin', require(path.join(SRC, 'routes/admin')));
  const server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const port = server.address().port;
  const ADMIN = 'Bearer ' + jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
  // 2026-10-28: registro, reclamo y alta exigen la casilla de Términos (acepta_terminos).
  const ACEPTA = /\/(auth\/register|claim\/confirm|claim\/alta)$/;
  const withTerms = (p, body) => (body && ACEPTA.test(p) && body.acepta_terminos === undefined) ? { ...body, acepta_terminos: true } : body;
  const call = (method, p, body, auth) => new Promise((resolve, reject) => {
    body = withTerms(p, body);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, path: p, method,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...(auth ? { Authorization: auth } : {}) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) {} resolve({ status: res.statusCode, body: j }); }); });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
  const ev = async (where, p = []) => (await q(`SELECT * FROM claim_events WHERE ${where} ORDER BY id`, p)).rows;

  // ── /info ──────────────────────────────────────────────────────────────────
  let r = await call('GET', `/api/v2/claim/info?token=${T1}&src=wa&v=vis1`);
  const info = (r.body && r.body.data) || {};
  check('/info → 200', r.status === 200);
  check('/info: rubros = solo HOJAS (sin los cajones padre)', info.rubros && info.rubros.some(x => x.id === 101) && !info.rubros.some(x => [100, 200].includes(x.id)), (info.rubros || []).map(x => x.id).join(','));
  check('/info: rubros con su grupo', (info.rubros || []).find(x => x.id === 101).grupo === 'Tiendas y Comercios');
  check('/info: sugerencia con fuente (cajón actual → por el nombre)', info.suggestion && info.suggestion.id === 101 && /«Ferretería»/.test(info.suggestion.reason), JSON.stringify(info.suggestion));
  check('/info: WhatsApp precargado en formato local', info.whatsappPrefill === '0981 123 456', info.whatsappPrefill);
  r = await call('GET', `/api/v2/claim/info?token=${T2}`);
  check('/info: sin rubro ni coincidencia → sin sugerencia; celular tomado de phone', r.body.data.suggestion === null && r.body.data.whatsappPrefill === '0983 999 888');
  r = await call('GET', `/api/v2/claim/info?token=${'e5'.repeat(32)}`);
  check('/info: link vencido → 410', r.status === 410);

  // ── /confirm: validaciones ─────────────────────────────────────────────────
  const base = { token: T1, category_id: 101, whatsapp: '0981 123 456', name: 'Ana Pérez', src: 'wa', v: 'vis1' };
  r = await call('POST', '/api/v2/claim/confirm', { ...base, category_id: null });
  check('confirm sin rubro → 400 rubro_missing', r.status === 400 && r.body.code === 'rubro_missing');
  r = await call('POST', '/api/v2/claim/confirm', { ...base, category_id: 100 });
  check('confirm con un cajón padre → 400 (solo hojas)', r.status === 400 && r.body.code === 'rubro_missing');
  r = await call('POST', '/api/v2/claim/confirm', { ...base, whatsapp: '021 555 555' });
  check('confirm con fijo → 400 whatsapp_invalid', r.status === 400 && r.body.code === 'whatsapp_invalid');
  r = await call('POST', '/api/v2/claim/confirm', { ...base, name: ' ' });
  check('confirm sin nombre → 400 name_missing', r.status === 400 && r.body.code === 'name_missing');
  r = await call('POST', '/api/v2/claim/confirm', { ...base, email: 'mal@' });
  check('confirm correo inválido → 400', r.status === 400 && r.body.code === 'email_invalid');
  r = await call('POST', '/api/v2/claim/confirm', { ...base, email: 'EXISTE@harness.test' });
  check('confirm con correo de otra cuenta → 409 (no se engancha sin prueba)', r.status === 409 && r.body.code === 'email_exists');
  check('ningún error dejó cambios a medias', (await q('SELECT claim_status FROM businesses WHERE id=$1', [B1])).rows[0].claim_status === null
        && (await q('SELECT count(*)::int n FROM claim_snapshots')).rows[0].n === 0);

  // ── /confirm OK ────────────────────────────────────────────────────────────
  sent.length = 0;
  r = await call('POST', '/api/v2/claim/confirm', base);
  check('confirm OK → 200 con sesión', r.status === 200 && r.body.success && r.body.token && r.body.redirect === '/cliente/', JSON.stringify(r.body).slice(0, 140));
  const sess = jwt.verify(r.body.token, process.env.JWT_SECRET);
  check('sesión: JWT de cliente con loginAt (igual que el login)', sess.role === 'client' && sess.id && sess.loginAt);
  const U1 = sess.id;
  const u1 = (await q('SELECT * FROM users WHERE id=$1', [U1])).rows[0];
  check('cuenta sin correo (identidad por WhatsApp)', u1.email === null && u1.phone === '+595981123456', JSON.stringify({ e: u1.email, p: u1.phone }));
  check('WhatsApp verificado: es el número de la ficha al que le escribimos', !!u1.phone_verified_at);
  check('sin contraseña usable (no es el placeholder de altas)', u1.password_hash && u1.password_hash.startsWith('$2') && u1.password_hash !== '!pending-no-password!');
  const b1 = (await q('SELECT * FROM businesses WHERE id=$1', [B1])).rows[0];
  check('ficha: aprobada AUTOMÁTICA y provisoria', b1.claim_status === 'approved' && b1.claim_method === 'token' && !b1.claim_reviewed_at && b1.claimed_by === U1);
  check('ficha: "verificado" queda como estaba hasta la revisión', b1.verified === false);
  const bc = (await q('SELECT * FROM business_categories WHERE business_id=$1', [B1])).rows;
  check('rubro: exactamente uno, primario, el elegido; category_id derivado', bc.length === 1 && bc[0].category_id === 101 && bc[0].is_primary && b1.category_id === 101);
  const sn = (await q('SELECT * FROM claim_snapshots WHERE business_id=$1', [B1])).rows[0];
  check('foto previa guardada (valor anterior: rubro 100 y su M2M)', sn && sn.snapshot.category_id === 100 && sn.categories.length === 1 && sn.categories[0].category_id === 100 && sn.user_id === U1);
  check('dueño vinculado', (await q('SELECT 1 FROM user_businesses WHERE user_id=$1 AND business_id=$2 AND is_owner', [U1, B1])).rows.length === 1);
  check('lead "claim" en won (no infla badges)', (await q("SELECT status FROM service_leads WHERE business_id=$1 AND service_type='claim'", [B1])).rows[0].status === 'won');
  check('Prospectos: el número queda en "reclamo"', (await q("SELECT estado FROM prospect_wa_outreach WHERE whatsapp='595981123456'")).rows[0].estado === 'reclamo');
  await sleep(150);
  check('embudo: submit_ok + auto_approved', (await ev("business_id=$1 AND event IN ('submit_ok','auto_approved')", [B1])).length === 2);
  check('aviso al correo de la FICHA (otro canal)', sent.some(s => s.template === 'claimNoticeFicha' && s.to === 'ficha@harness.test'));
  check('alerta al equipo marcada como automática', sent.some(s => s.template === 'claimAdminAlert' && s.data.auto === true));

  r = await call('POST', '/api/v2/claim/confirm', base);
  check('el enlace no sirve dos veces → 409', r.status === 409 && r.body.code === 'already_claimed');
  r = await call('GET', `/api/v2/claim/info?token=${T1}`);
  check('/info de una ficha ya reclamada → 409 ALREADY_CLAIMED', r.status === 409 && r.body.code === 'ALREADY_CLAIMED');

  // Otro número (no el de la ficha) → no verificado; ficha con reclamo "pendiente" por formulario se puede tomar
  r = await call('POST', '/api/v2/claim/confirm', { token: T3, category_id: 201, whatsapp: '0971 222 333', name: 'Beto', email: 'beto@harness.test' });
  check('ficha con reclamo pendiente (formulario) → el enlace la resuelve', r.status === 200);
  const U3 = jwt.verify(r.body.token, process.env.JWT_SECRET).id;
  check('número distinto al de la ficha → WhatsApp NO verificado', (await q('SELECT phone_verified_at, email FROM users WHERE id=$1', [U3])).rows[0].phone_verified_at === null);
  await sleep(150);
  const u3 = (await q('SELECT verify_token, verify_token_expires, email_verified FROM users WHERE id=$1', [U3])).rows[0];
  check('con correo: token de confirmación (7 días)', /^[a-f0-9]{64}$/.test(u3.verify_token || '') && new Date(u3.verify_token_expires) > new Date(Date.now() + 6 * 864e5));
  const welcome = sent.find(x => x.template === 'claimWelcome');
  check('con correo: le llega "¡Ya es tuyo!" con el botón de confirmar', welcome && welcome.to === 'beto@harness.test' && welcome.data.verifyUrl === `https://dev.retopa.test/?verify=${u3.verify_token}`, JSON.stringify(welcome && welcome.data));
  r = await call('POST', '/api/v2/auth/verify-email', { token: u3.verify_token });
  check('el botón confirma el correo y da sesión', r.status === 200 && r.body.token && (await q('SELECT email_verified FROM users WHERE id=$1', [U3])).rows[0].email_verified === true, JSON.stringify(r.body).slice(0, 120));
  check('sin correo (Ana) → no se manda bienvenida', !sent.some(x => x.template === 'claimWelcome' && !x.to));

  // ── /not-mine ──────────────────────────────────────────────────────────────
  r = await call('POST', '/api/v2/claim/not-mine', { token: T4, src: 'wa' });
  check('No es mío → 200', r.status === 200 && r.body.success);
  check('No es mío: el enlace muere', (await q('SELECT claim_token FROM businesses WHERE id=$1', [B4])).rows[0].claim_token === null);
  const ow = (await q("SELECT * FROM prospect_wa_outreach WHERE whatsapp='595984444444'")).rows[0];
  check('No es mío: Prospectos marca "no_es" con nota', ow.estado === 'no_es' && /No es suyo: No Es De Él/.test(ow.notas || ''), JSON.stringify(ow));
  await sleep(100);
  check('No es mío: evento not_mine', (await ev("event='not_mine' AND business_id=$1", [B4])).length === 1);
  r = await call('POST', '/api/v2/claim/not-mine', { token: 'f'.repeat(64) });
  check('No es mío con enlace inexistente → mismo 200 (no filtra)', r.status === 200);

  // ── Mi Portal: cambios sensibles a revisión ────────────────────────────────
  const OWNER = 'Bearer ' + r.body && ('Bearer ' + jwt.sign({ id: U1, role: 'client', loginAt: Math.floor(Date.now() / 1000) }, process.env.JWT_SECRET));
  r = await call('PUT', '/api/v2/client/businesses/h-ferre',
    { name: 'Ferretería Sur SA', phone: '', whatsapp: '0981-123-456', description: 'Nueva descripción del dueño' }, OWNER);
  check('guardar sin cambios sensibles reales → nada a revisión (formatos distintos)', r.status === 200 && r.body.success && (r.body.pending_review || []).length === 0, JSON.stringify(r.body));
  check('descripción se aplica al toque', (await q('SELECT description FROM businesses WHERE id=$1', [B1])).rows[0].description === 'Nueva descripción del dueño');
  r = await call('PUT', '/api/v2/client/businesses/h-ferre',
    { name: 'Ferretería Sur SA', whatsapp: '0991 777 888', description: 'Nueva descripción del dueño' }, OWNER);
  check('cambiar el WhatsApp de la ficha → a revisión', r.status === 200 && JSON.stringify(r.body.pending_review) === '["whatsapp"]', JSON.stringify(r.body));
  const b1b = (await q('SELECT whatsapp FROM businesses WHERE id=$1', [B1])).rows[0];
  check('…y NO se aplicó', b1b.whatsapp === '595981123456', b1b.whatsapp);
  const cr = (await q("SELECT * FROM owner_change_requests WHERE business_id=$1 AND status='pending'", [B1])).rows;
  check('solicitud con valor anterior y nuevo', cr.length === 1 && cr[0].old_value === '595981123456' && cr[0].new_value === '+595991777888', JSON.stringify(cr[0] || {}));
  await q("INSERT INTO business_gallery (business_id, image_url) VALUES ($1, '/uploads/foto-del-dueno.jpg')", [B1]).catch(e => console.log('   (gallery insert: ' + e.message + ')'));

  // ── Admin: Claims ──────────────────────────────────────────────────────────
  r = await call('GET', '/api/v2/admin/claims?status=review', null, ADMIN);
  const row1 = (r.body.data || []).find(x => x.id === B1) || {};
  check('Claims "A revisar": la ficha aparece, origen enlace', r.status === 200 && row1.to_review === true && row1.origin === 'enlace', JSON.stringify(row1).slice(0, 160));
  check('Claims: trae el cambio pedido y el WhatsApp', row1.change_requests && row1.change_requests.length === 1 && row1.wa === '595981123456');
  check('Claims: stats.to_review = 2', r.body.stats.to_review === 2, JSON.stringify(r.body.stats));
  r = await call('GET', '/api/v2/admin/dashboard', null, ADMIN);
  check('badge de Claims cuenta los automáticos a revisar', r.body.stats.pending_claims >= 2, String(r.body.stats.pending_claims));

  r = await call('POST', '/api/v2/admin/claims/change-request', { id: cr[0].id, decision: 'approve' }, ADMIN);
  check('aprobar el cambio → se aplica en la ficha', r.status === 200 && (await q('SELECT whatsapp FROM businesses WHERE id=$1', [B1])).rows[0].whatsapp === '+595991777888');
  const n1 = r.body.notify || {};
  check('cambio aprobado → aviso listo para WhatsApp (dueño sin correo)', n1.wa === '595981123456' && /Ya actualizamos el WhatsApp de Ferretería Sur SA/.test(n1.message) && n1.email === null, JSON.stringify(n1));

  sent.length = 0;
  r = await call('POST', '/api/v2/admin/claims/confirm-auto', { business_id: B3 }, ADMIN);
  const b3 = (await q('SELECT verified, claim_reviewed_at FROM businesses WHERE id=$1', [B3])).rows[0];
  check('Confirmar → verificada y revisada', r.status === 200 && b3.verified === true && !!b3.claim_reviewed_at);
  const n3 = r.body.notify || {};
  const conf = sent.find(x => x.template === 'claimConfirmed');
  check('Confirmar → correo "ya está verificado" al dueño (tenía correo)', conf && conf.to === 'beto@harness.test' && n3.emailed === true && /\?acceso=[a-f0-9]{64}$/.test(conf.data.accessUrl), JSON.stringify(conf && conf.data));
  check('Confirmar → mensaje de WhatsApp con ficha y link de acceso', n3.wa === '595971222333' && /ya está verificado/.test(n3.message) && n3.message.includes(conf.data.accessUrl) && /\/negocio\/h-tres/.test(n3.message), n3.message);
  r = await call('PUT', '/api/v2/client/businesses/h-tres', { whatsapp: '0971 000 000' },
    'Bearer ' + jwt.sign({ id: U3, role: 'client' }, process.env.JWT_SECRET));
  check('ya confirmada → los cambios sensibles se aplican directo', r.status === 200 && (r.body.pending_review || []).length === 0);

  // Revertir B1: vuelve EXACTAMENTE a como estaba
  r = await call('POST', '/api/v2/admin/claims/revert', { business_id: B1 }, ADMIN);
  check('Revertir → 200', r.status === 200, JSON.stringify(r.body));
  const b1r = (await q('SELECT * FROM businesses WHERE id=$1', [B1])).rows[0];
  check('revertida: descripción, WhatsApp y rubro originales', b1r.description === 'Descripción original' && b1r.whatsapp === '595981123456' && b1r.category_id === 100,
    JSON.stringify({ d: b1r.description, w: b1r.whatsapp, c: b1r.category_id }));
  check('revertida: sin reclamo, sin dueño, sin enlace viejo', b1r.claim_status === null && b1r.claimed_by === null && b1r.claim_method === null && b1r.claim_token === null);
  check('revertida: M2M original', (await q('SELECT category_id FROM business_categories WHERE business_id=$1', [B1])).rows.map(x => x.category_id).join() === '100');
  check('revertida: el que reclamó pierde el acceso', (await q('SELECT 1 FROM user_businesses WHERE business_id=$1', [B1])).rows.length === 0);
  check('revertida: fotos subidas después del reclamo, fuera', (await q('SELECT 1 FROM business_gallery WHERE business_id=$1', [B1])).rows.length === 0);
  check('revertida: la foto previa queda marcada', !!(await q('SELECT reverted_at FROM claim_snapshots WHERE business_id=$1', [B1])).rows[0].reverted_at);
  r = await call('POST', '/api/v2/admin/claims/revert', { business_id: B1 }, ADMIN);
  check('revertir dos veces → 404 (nada que revertir)', r.status === 404);

  // ── Link de acceso de un uso ───────────────────────────────────────────────
  r = await call('POST', `/api/v2/admin/users/${U3}/access-link`, {}, ADMIN);
  check('generar link de acceso → url con token y WhatsApp', r.status === 200 && /\/\?acceso=[a-f0-9]{64}$/.test(r.body.url) && r.body.wa === '595971222333', JSON.stringify(r.body));
  const raw = r.body.url.split('acceso=')[1];
  const stored = (await q('SELECT access_token_hash FROM users WHERE id=$1', [U3])).rows[0].access_token_hash;
  check('en la base queda SOLO el hash', stored && stored !== raw && stored.length === 64);
  r = await call('POST', '/api/v2/auth/access-link', { token: raw });
  check('entrar con el link → sesión del dueño', r.status === 200 && r.body.token && r.body.user.id === U3 && r.body.user.has_business === true);
  r = await call('POST', '/api/v2/auth/access-link', { token: raw });
  check('el link no sirve dos veces → 401', r.status === 401);
  r = await call('POST', '/api/v2/admin/users/' + U3 + '/access-link', {}, ADMIN);
  await q("UPDATE users SET access_token_expires = NOW() - interval '1 minute' WHERE id=$1", [U3]);
  r = await call('POST', '/api/v2/auth/access-link', { token: r.body.url.split('acceso=')[1] });
  check('link vencido → 401', r.status === 401);
  r = await call('POST', '/api/v2/auth/access-link', { token: "' OR 1=1 --" });
  check('token con formato inválido → 400', r.status === 400);
  r = await call('POST', '/api/v2/admin/users/1/access-link', {}, 'Bearer ' + jwt.sign({ id: 9, role: 'client' }, process.env.JWT_SECRET));
  check('generar link exige admin → 403', r.status === 403);
  r = await call('POST', '/api/v2/auth/login', { password: 'x' });
  check('login sin identificador → 4xx con mensaje (no 500)', (r.status === 400 || r.status === 401) && r.body && r.body.error);

  // ── Prospectos: {link_reclamo} ─────────────────────────────────────────────
  r = await call('POST', `/api/v2/admin/prospects/claim-link/${B5}`, {}, ADMIN);
  const b5 = (await q('SELECT claim_token, claim_expires_at FROM businesses WHERE id=$1', [B5])).rows[0];
  check('link_reclamo: token vencido → uno nuevo, SIN vencimiento', r.status === 200 && b5.claim_token !== 'e5'.repeat(32) && b5.claim_expires_at === null);
  check('link_reclamo: url /reclamar con utm_source=wa', r.body.url === `https://dev.retopa.test/reclamar/?token=${b5.claim_token}&utm_source=wa&utm_campaign=prospectos`, r.body.url);
  const r2 = await call('POST', `/api/v2/admin/prospects/claim-link/${B5}`, {}, ADMIN);
  check('link_reclamo: reusa el vigente', r2.body.url === r.body.url);
  r = await call('POST', `/api/v2/admin/prospects/claim-link/${B3}`, {}, ADMIN);
  check('link_reclamo: ficha con dueño → manda la ficha pública', r.body.claimed === true && /\/negocio\/h-tres$/.test(r.body.url));
  r = await call('PATCH', '/api/v2/admin/prospects/outreach/595984444444', { estado: 'no_es' }, ADMIN);
  check('Prospectos acepta el estado "no_es"', r.status === 200, JSON.stringify(r.body));

  // ── Embudo ─────────────────────────────────────────────────────────────────
  r = await call('GET', '/api/v2/admin/claims/funnel?days=30', null, ADMIN);
  check('embudo: aprobados incluye automáticos (2) y "no es suyo" (1)', r.body.total.aprobados === 2 && r.body.total.no_es_suyo === 1, JSON.stringify(r.body.total));
  check('embudo: "no es suyo" no figura como abandono', !(r.body.abandonos || []).some(x => x.id === B4));

  server.close(); await pool.end();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
