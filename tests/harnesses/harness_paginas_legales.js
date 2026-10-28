// PÁGINAS LEGALES (2026-10-28): backend REAL (legal.routes, auth-public, claim,
// directory) contra Postgres efímero con el esquema de prod + la migración, y el
// frontend/server.js REAL como proceso aparte (páginas, formularios, crawlers).
// Uso: NODE_PATH=<node_modules del backend> node harness_paginas_legales.js <ROOT> <node_modules del frontend>
//   (Postgres en PGHOST/PGPORT, default 127.0.0.1:5499, base y usuario "retopa").
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const ROOT = process.argv[2] || '/opt/retopa';
const FRONT_NM = process.argv[3] || '';
const SRC = path.join(ROOT, 'backend/src');
process.env.DB_HOST = process.env.PGHOST || '127.0.0.1'; process.env.DB_PORT = process.env.PGPORT || '5499';
process.env.DB_NAME = 'retopa'; process.env.DB_USER = 'retopa'; process.env.DB_PASSWORD = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-secret-0123456789abcdef';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

// Plantillas REALES de mail.js (para probar el render) antes de reemplazarlo por el mock.
const realMail = require(path.join(SRC, 'config/mail'));
delete require.cache[require.resolve(path.join(SRC, 'config/mail'))];
const sent = [];
const mock = (rel, exports) => { const p = require.resolve(path.join(SRC, rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
mock('config/redis', { get: async () => null, setEx: async () => {}, set: async () => {}, keys: async () => [], del: async () => {}, on: () => {} });
mock('config/mail', { sendEmail: async (to, tpl, data) => { sent.push({ to, tpl, data }); return { success: true }; }, renderTemplate: async () => ({}) });
mock('helpers/notifyOwner', { notifyOwner: async () => {}, LIKE_MILESTONES: [] });

const req = (port, method, p, body, headers = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers } }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (e) {} resolve({ status: res.statusCode, headers: res.headers, body: j, text: d }); });
    });
    r.on('error', reject); if (payload) r.write(payload); r.end();
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    const { Pool } = require('pg');
    const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: 'retopa', user: 'retopa' });
    const q = (s, p) => pool.query(s, p);
    const express = require('express'), jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs');
    const legal = require(path.join(SRC, 'routes/legal.routes'));

    // ── Estado legal limpio: borrar y volver a aplicar la migración (idempotente) ──
    await q("DELETE FROM site_config WHERE key LIKE 'legal\\_%'");
    await q('DELETE FROM legal_versions').catch(() => {});
    await q(require('fs').readFileSync(path.join(ROOT, 'sql/2026-10-28_paginas_legales.sql'), 'utf8'));

    // ── Datos ────────────────────────────────────────────────────────────────
    await q("DELETE FROM legal_requests"); await q("DELETE FROM user_businesses WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@lg.test' OR name LIKE 'LG %')");
    await q("DELETE FROM claim_snapshots WHERE business_id IN (SELECT id FROM businesses WHERE slug LIKE 'lg-%')").catch(() => {});
    await q("DELETE FROM service_leads WHERE business_id IN (SELECT id FROM businesses WHERE slug LIKE 'lg-%')");
    await q("DELETE FROM business_categories WHERE business_id IN (SELECT id FROM businesses WHERE slug LIKE 'lg-%')");
    await q("DELETE FROM reviews WHERE business_id IN (SELECT id FROM businesses WHERE slug LIKE 'lg-%')");
    await q("DELETE FROM businesses WHERE slug LIKE 'lg-%'");
    await q("DELETE FROM users WHERE email LIKE '%@lg.test' OR name LIKE 'LG %'");
    await q("INSERT INTO site_config (key, value) VALUES ('leads_emails','equipo@lg.test, otro@lg.test'),('site_url','https://retopa.test'),('site_name','RetoPA'),('plan_grace_days','7') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value");
    const h = await bcrypt.hash('x', 4);
    const ADM = (await q(`INSERT INTO users (email, password_hash, name, role) VALUES ('adm@lg.test',$1,'LG Admin','admin') RETURNING id`, [h])).rows[0].id;
    const ADMIN = 'Bearer ' + jwt.sign({ id: ADM, role: 'admin' }, process.env.JWT_SECRET);
    const CLIENT = 'Bearer ' + jwt.sign({ id: ADM, role: 'client' }, process.env.JWT_SECRET);
    const cat = (await q(`INSERT INTO categories (name, slug) VALUES ('LG Ferretería','lg-ferreteria') ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`)).rows[0].id;
    const bizDNCP = (await q(`INSERT INTO businesses (name, slug, is_active, source, category_id, created_at, whatsapp)
        VALUES ('LG Ferretería Pública SA','lg-dncp',TRUE,'DNCP',$1,'2026-05-19 10:00','0981111222') RETURNING id`, [cat])).rows[0].id;
    await q(`INSERT INTO businesses (name, slug, is_active, source, category_id) VALUES ('LG Dueño Propio','lg-manual',TRUE,'web_registration',$1)`, [cat]);
    await q(`INSERT INTO businesses (name, slug, is_active, source, category_id) VALUES ('LG Lista','lg-hilagro',TRUE,'import_hilagro',$1)`, [cat]);
    await q(`INSERT INTO reviews (business_id, author_name, author_email, rating, comment, is_approved) VALUES ($1,'Rita','rita-secreta@lg.test',5,'Muy bueno',TRUE)`, [bizDNCP]);
    const TOKEN = 'lgtoken' + Date.now();
    const bizClaim = (await q(`INSERT INTO businesses (name, slug, is_active, source, category_id, claim_token, whatsapp)
        VALUES ('LG Para Reclamar','lg-reclamo',TRUE,'DNCP',$1,$2,'0982333444') RETURNING id`, [cat, TOKEN])).rows[0].id;

    // ── Backend ──────────────────────────────────────────────────────────────
    const app = express(); app.set('trust proxy', 1); app.use(express.json());
    app.use('/api/v2/legal', legal.publicRouter);
    app.use('/api/v2/admin/legal', legal.adminRouter);
    app.use('/api/v2/auth', require(path.join(SRC, 'routes/auth-public')));
    app.use('/api/v2/claim', require(path.join(SRC, 'routes/claim.routes')));
    app.use('/api/v2', require(path.join(SRC, 'routes/directory')));
    const server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
    const P = server.address().port;
    const api = (m, p, b, hd) => req(P, m, '/api/v2' + p, b, hd);

    // ── 1) Render público con variables ──────────────────────────────────────
    let r = await api('GET', '/legal/page/terminos');
    const t = r.body && r.body.data;
    check('terminos: 200 y versión 2.0', r.status === 200 && t.version === '2.0', t && t.version);
    check('terminos: variables reemplazadas (sin {{…}})', t && !/\{\{/.test(t.html));
    check('terminos: razón social y RUC', t && t.html.includes('HEPTA E.A.S.') && t.html.includes('80117760-0'));
    check('terminos: marcador <<…>> no se publica crudo', t && !t.html.includes('&lt;&lt;') && t.html.includes('[pendiente de completar]'));
    check('terminos: índice con 16 secciones', t && t.toc.length === 16, t && t.toc.length);
    check('terminos: anclas (#responsable, #representante, #denuncia)', t && ['responsable', 'representante', 'denuncia'].every(id => t.html.includes(`id="${id}"`)));
    check('terminos: plan_grace_days = 7 en §5', t && /plazo de gracia de 7 días/.test(t.html));
    r = await api('GET', '/legal/page/privacidad');
    const pv = r.body && r.body.data;
    check('privacidad: 200, 14 secciones, sin {{…}}', r.status === 200 && pv.toc.length === 14 && !/\{\{/.test(pv.html), pv && pv.toc.length);
    check('privacidad: tabla de orígenes renderizada', pv && pv.html.includes('<table>') && pv.html.includes('<th>Origen</th>'));
    check('página inexistente → 404', (await api('GET', '/legal/page/cookies')).status === 404);

    // ── 2) Admin: permisos y datos del responsable ──────────────────────────
    check('admin sin token → 401', (await api('GET', '/admin/legal/config')).status === 401);
    check('admin con rol client → 403', (await api('GET', '/admin/legal/config', undefined, { Authorization: CLIENT })).status === 403);
    r = await api('GET', '/admin/legal/config', undefined, { Authorization: ADMIN });
    check('admin config: 4 marcadores pendientes', r.status === 200 && r.body.data.placeholders.length === 4, r.body && JSON.stringify(r.body.data.placeholders));
    const put = b => api('PUT', '/admin/legal/config', b, { Authorization: ADMIN });
    check('RUC con DV malo → 400', (await put({ legal_ruc: '80117760-5' })).status === 400);
    check('RUC sin guion → 400', (await put({ legal_ruc: '801177600' })).status === 400);
    check('correo inválido → 400', (await put({ legal_email: 'legal@' })).status === 400);
    check('días de gracia 0 → 400', (await put({ legal_gracia_dias: '0' })).status === 400);
    check('días de gracia 366 → 400', (await put({ legal_gracia_dias: '366' })).status === 400);
    check('días de gracia 9.5 → 400', (await put({ legal_gracia_dias: '9.5' })).status === 400);
    check('fuentes JSON inválido → 400', (await put({ legal_fuentes_publicas: '[1,2]' })).status === 400);
    r = await put({ legal_domicilio: 'Av. Siempreviva 742, Asunción', legal_email: 'legal@retopa.test', legal_ruc: '80117760-0',
                    legal_representante_nombre: 'Ana Benítez', legal_representante_email: 'ana@retopa.test', legal_gracia_dias: '90' });
    check('datos válidos → 200', r.status === 200, JSON.stringify(r.body));
    r = await api('GET', '/legal/page/terminos');
    check('página pública se actualiza al instante (caché invalidada)', r.body.data.html.includes('Av. Siempreviva 742') && r.body.data.html.includes('Ana Benítez'));

    // ── 3) Sanitización ──────────────────────────────────────────────────────
    const evil = '# T\n\n## 1. Hola\nTexto <script>alert(1)</script> <img src=x onerror=alert(2)> [clic](javascript:alert(3)) [ok](https://a.test/?x=1&y=2)\n\n| a |\n|---|\n| <b onmouseover=x>b</b> |\n\n' + 'relleno '.repeat(10);
    r = await api('POST', '/admin/legal/preview', { page: 'terminos', md: evil }, { Authorization: ADMIN });
    const ph = r.body.data.html;
    check('sanitización: <script> no sale como tag', !/<script/i.test(ph) && ph.includes('&lt;script&gt;'));
    check('sanitización: sin atributos on* reales', !/<[^>]+\son\w+=/i.test(ph));
    check('sanitización: link javascript: descartado', !/href="javascript:/i.test(ph));
    check('sanitización: link https se mantiene', ph.includes('href="https://a.test/?x=1&amp;y=2"'));

    // ── 4) Publicar, versionar, historial, restaurar ─────────────────────────
    const pub = (page, md, sust) => api('POST', '/admin/legal/page/' + page, { md, sustancial: sust }, { Authorization: ADMIN });
    const base = (await api('GET', '/admin/legal/page/terminos', undefined, { Authorization: ADMIN })).body.data.md;
    check('publicar con variable desconocida → 400', (await pub('terminos', base + '\n{{inventada}}', false)).status === 400);
    check('publicar texto vacío → 400', (await pub('terminos', '   ', false)).status === 400);
    r = await pub('terminos', base.replace('# Términos y Condiciones de Uso', '# Términos y Condiciones de Uso\n\nCAMBIO MENOR UNO.'), false);
    check('publicar minor → 2.1', r.status === 200 && r.body.data.version === '2.1', JSON.stringify(r.body));
    r = await api('GET', '/legal/page/terminos');
    check('pública muestra 2.1 y el texto nuevo', r.body.data.version === '2.1' && r.body.data.html.includes('CAMBIO MENOR UNO.'));
    let cfg = (await api('GET', '/admin/legal/config', undefined, { Authorization: ADMIN })).body.data;
    check('minor: sin banner ni aviso', !cfg.banner && !cfg.aviso.id);
    r = await pub('terminos', base.replace('# Términos y Condiciones de Uso', '# Términos y Condiciones de Uso\n\nCAMBIO SUSTANCIAL.'), true);
    check('publicar sustancial → 3.0', r.body.data && r.body.data.version === '3.0');
    cfg = (await api('GET', '/admin/legal/config', undefined, { Authorization: ADMIN })).body.data;
    const in15 = new Date(Date.now() - 3 * 3600e3 + 15 * 86400e3).toISOString().slice(0, 10);
    check('sustancial: banner hasta hoy+15', cfg.banner === in15, cfg.banner + ' vs ' + in15);
    check('sustancial: aviso preparado', /terminos-3\.0$/.test(cfg.aviso.id), cfg.aviso.id);
    r = await api('GET', '/admin/legal/versions/terminos', undefined, { Authorization: ADMIN });
    const vers = r.body.data;
    check('historial: 3 versiones, la última primero', vers.length === 3 && vers[0].version === '3.0' && vers[2].version === '2.0', vers.map(v => v.version).join(','));
    r = await api('GET', '/legal/page/terminos?v=2.0');
    check('historial público ?v=2.0: versión vieja, no vigente', r.body.data.version === '2.0' && r.body.data.isCurrent === false && !r.body.data.html.includes('CAMBIO'));
    check('historial público: versión inexistente → 404', (await api('GET', '/legal/page/terminos?v=9.9')).status === 404);
    r = await api('POST', `/admin/legal/version/${vers[2].id}/restore`, {}, { Authorization: ADMIN });
    check('restaurar 2.0 → se publica como 3.1', r.body.data && r.body.data.version === '3.1');
    r = await api('GET', '/legal/page/terminos');
    check('restaurado: texto de la 2.0 vigente', r.body.data.version === '3.1' && !r.body.data.html.includes('CAMBIO'));
    check('pública: lista de versiones anteriores', r.body.data.versions.length === 4);

    // ── 5) Pedidos de baja / denuncia ───────────────────────────────────────
    sent.length = 0;
    const baja = b => api('POST', '/legal/baja', b);
    check('baja sin vínculo → 400', (await baja({ tipo: 'baja', business_url: 'x', nombre: 'Juan', contacto: 'juan@lg.test', detalle: 'cerró el local' })).status === 400);
    check('baja contacto inválido → 400', (await baja({ tipo: 'baja', business_url: 'x', nombre: 'Juan', contacto: 'nada', vinculo: 'dueño', detalle: 'cerró el local' })).status === 400);
    r = await baja({ tipo: 'baja', business_url: 'https://retopa.test/negocios/ferreteria/asuncion/lg-dncp', nombre: 'Juan <b>Pérez</b>', contacto: '0981 111 222', vinculo: 'soy el dueño', detalle: 'Cerré el local en 2025.' });
    check('baja válida → 200 con id', r.status === 200 && r.body.id > 0, JSON.stringify(r.body));
    const row = (await q('SELECT * FROM legal_requests WHERE id=$1', [r.body.id])).rows[0];
    check('baja: fila creada, ficha resuelta por URL, estado pendiente', row && row.business_id === bizDNCP && row.estado === 'pendiente' && row.tipo === 'baja');
    await sleep(150);
    check('baja: correo a los 2 buzones de leads', sent.filter(s => s.tpl === 'legalRequestAlert').map(s => s.to).sort().join(',') === 'equipo@lg.test,otro@lg.test', JSON.stringify(sent.map(s => s.to)));
    check('honeypot: éxito falso sin fila', (await baja({ website: 'spam', tipo: 'baja' })).status === 200);
    const den = b => api('POST', '/legal/denuncia', b);
    check('denuncia sin buena fe → 400', (await den({ business_url: '/negocio/lg-dncp', nombre: 'Rita', contacto: 'rita@lg.test', detalle: 'la reseña X', derecho: 'mi honor y mis datos' })).status === 400);
    r = await den({ business_url: '/?empresa=lg-dncp', nombre: 'Rita', contacto: 'rita@lg.test', detalle: 'la reseña X', derecho: 'mi honor y mis datos', buena_fe: true });
    const drow = r.body.id && (await q('SELECT * FROM legal_requests WHERE id=$1', [r.body.id])).rows[0];
    check('denuncia válida → tipo retiro + buena_fe + derecho en el detalle', drow && drow.tipo === 'retiro' && drow.buena_fe === true && /Derecho afectado: mi honor/.test(drow.detalle) && drow.business_id === bizDNCP);
    // /baja ya recibió 4 (2 con 400, 1 válida, honeypot): el límite es 8 por hora por IP.
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await baja({ tipo: 'baja', business_url: 'x', nombre: 'J', contacto: 'nada', vinculo: 'd', detalle: 'cerró el local' })).status);
    r = await baja({ tipo: 'baja', business_url: 'x', nombre: 'Juan', contacto: 'juan@lg.test', vinculo: 'dueño', detalle: 'cerró el local' });
    check('rate limit: 8 por hora por IP → el 9.º es 429', codes.join(',') === '400,400,400,400,429' && r.status === 429, codes.join(',') + ' / ' + r.status);
    check('rate limit: /denuncia tiene su propio contador', (await den({ business_url: 'x', nombre: 'R', contacto: 'nada', detalle: 'xxxxx', derecho: 'xxxxx', buena_fe: true })).status === 400);
    check('rate limit: mensaje en castellano', r.body && /muchos pedidos/.test(r.body.error));

    r = await api('GET', '/admin/legal/requests?estado=pendiente', undefined, { Authorization: ADMIN });
    check('admin: lista pendientes (2)', r.body.data.length === 2, String(r.body.data.length));
    r = await api('PATCH', `/admin/legal/requests/${row.id}`, { estado: 'resuelta', notas: 'Dada de baja el 28/10' }, { Authorization: ADMIN });
    const rrow = (await q('SELECT estado, notas, resolved_at FROM legal_requests WHERE id=$1', [row.id])).rows[0];
    check('admin: resolver guarda estado, notas y fecha', r.status === 200 && rrow.estado === 'resuelta' && rrow.notas && rrow.resolved_at);
    check('admin: estado inválido → 400', (await api('PATCH', `/admin/legal/requests/${row.id}`, { estado: 'borrada' }, { Authorization: ADMIN })).status === 400);
    r = await api('GET', '/admin/legal/requests?estado=resuelta', undefined, { Authorization: ADMIN });
    check('admin: filtro resuelta (1)', r.body.data.length === 1 && r.body.data[0].business_name === 'LG Ferretería Pública SA');

    // ── 6) Registro: aceptación obligatoria y opt-in separado ───────────────
    const reg = b => api('POST', '/auth/register', { name: 'LG Uno', password: 'secreta123', ...b });
    r = await reg({ email: 'uno@lg.test' });
    check('registro sin aceptar → 400 TERMS_REQUIRED', r.status === 400 && r.body.code === 'TERMS_REQUIRED');
    check('registro sin aceptar: no crea la cuenta', !(await q("SELECT 1 FROM users WHERE email='uno@lg.test'")).rows.length);
    r = await reg({ email: 'uno@lg.test', acepta_terminos: true });
    let u = (await q("SELECT terms_accepted_version, terms_accepted_at, marketing_opt_in, marketing_opt_in_at FROM users WHERE email='uno@lg.test'")).rows[0];
    check('registro: guarda versión aceptada T3.1/P2.0', r.status === 200 && u && u.terms_accepted_version === 'T3.1/P2.0' && u.terms_accepted_at, u && u.terms_accepted_version);
    check('registro: marketing_opt_in por defecto FALSE', u && u.marketing_opt_in === false && !u.marketing_opt_in_at);
    r = await reg({ email: 'dos@lg.test', acepta_terminos: true, marketing_opt_in: true });
    u = (await q("SELECT marketing_opt_in, marketing_opt_in_at FROM users WHERE email='dos@lg.test'")).rows[0];
    check('registro: opt-in marcado → TRUE con fecha', u && u.marketing_opt_in === true && u.marketing_opt_in_at);
    r = await reg({ email: 'tres@lg.test', acepta_terminos: 'true' });
    check('registro: "true" como texto no alcanza (tiene que ser la casilla)', r.status === 400);

    // ── 7) Reclamo por enlace: aceptación obligatoria ───────────────────────
    const conf = b => api('POST', '/claim/confirm', { token: TOKEN, category_id: cat, whatsapp: '0982333444', name: 'LG Dueña', ...b });
    r = await conf({});
    check('reclamo sin aceptar → 400 terms_required', r.status === 400 && r.body.code === 'terms_required', JSON.stringify(r.body));
    check('reclamo sin aceptar: la ficha sigue sin dueño', !(await q('SELECT 1 FROM user_businesses WHERE business_id=$1', [bizClaim])).rows.length);
    r = await conf({ acepta_terminos: true, marketing_opt_in: false });
    const cu = (await q(`SELECT u.terms_accepted_version, u.marketing_opt_in FROM users u JOIN user_businesses ub ON ub.user_id=u.id WHERE ub.business_id=$1`, [bizClaim])).rows[0];
    check('reclamo: dueño creado con versión aceptada y sin opt-in', r.status === 200 && cu && cu.terms_accepted_version === 'T3.1/P2.0' && cu.marketing_opt_in === false, JSON.stringify(r.body).slice(0, 160));
    r = await api('POST', '/claim/alta', { business_name: 'LG Nueva', category_id: cat, city: 'Asunción', whatsapp: '0983999888', name: 'LG Alta' });
    check('alta sin aceptar → 400 terms_required', r.status === 400 && r.body.code === 'terms_required', JSON.stringify(r.body));

    // ── 8) Aviso por correo en tandas ────────────────────────────────────────
    sent.length = 0;
    for (const e of ['t1@lg.test', 't2@lg.test', 't3@lg.test'])
        await q(`INSERT INTO users (email, password_hash, name, role, is_active) VALUES ($1,'x','LG Titular','client',TRUE)`, [e]);
    const before = (await api('GET', '/admin/legal/config', undefined, { Authorization: ADMIN })).body.data.aviso.pendientes;
    check('aviso: 5 titulares con correo pendientes', before === 5, String(before));
    r = await api('POST', '/admin/legal/aviso/send', { limit: 2 }, { Authorization: ADMIN });
    check('aviso: manda una tanda de 2 con legal_update', r.status === 200 && r.body.data.sent === 2 && sent.filter(s => s.tpl === 'legal_update').length === 2, JSON.stringify(r.body));
    check('aviso: pendientes bajan en 2', r.body.data.pendientes === before - 2, `${before} → ${r.body.data.pendientes}`);
    check('aviso: no le manda a admins', !sent.some(s => s.to === 'adm@lg.test'));
    const first = sent.filter(s => s.tpl === 'legal_update').map(s => s.to);
    sent.length = 0;
    await api('POST', '/admin/legal/aviso/send', { limit: 50 }, { Authorization: ADMIN });
    const second = sent.filter(s => s.tpl === 'legal_update');
    check('aviso: la segunda tanda no repite destinatarios', !second.some(s => first.includes(s.to)) && second.length === before - 2, `${second.length} vs ${before - 2}`);

    // ── 9) Plantillas de correo reales ───────────────────────────────────────
    const t1 = await realMail.renderTemplate('legal_update', { name: 'Ana <b>x</b>', siteName: 'RetoPA', siteUrl: 'https://retopa.test', terminosVersion: '3.0', privacidadVersion: '2.0' }).catch(e => ({ err: e.message }));
    check('plantilla legal_update: asunto y enlaces', t1.subject && /Términos/.test(t1.subject) && t1.html.includes('https://retopa.test/terminos.html'), t1.err || '');
    check('plantilla legal_update: nombre escapado', t1.html && t1.html.includes('Ana') && !t1.html.includes('<b>x'));
    const t2 = await realMail.renderTemplate('legalRequestAlert', { id: 7, tipo: 'baja', nombre: '<script>x</script>', contacto: 'a@b.c', detalle: 'l1\nl2', businessUrl: 'u', businessName: 'Ferre' }).catch(e => ({ err: e.message }));
    check('plantilla legalRequestAlert: escapa lo que manda el público', t2.html && !t2.html.includes('<script>x') && t2.html.includes('&lt;script&gt;'), t2.err || '');

    // ── 10) Ficha: fuente pública y correo de reseñas ───────────────────────
    r = await api('GET', '/businesses/lg-dncp');
    check('ficha DNCP: publicSource con fuente y fecha', r.body.data.publicSource && r.body.data.publicSource.fuente === 'DNCP — contrataciones.gov.py' && r.body.data.publicSource.fecha === '2026-05-19', JSON.stringify(r.body.data.publicSource));
    check('ficha: no expone el source crudo', !('_source' in r.body.data) && !('source' in r.body.data));
    check('reseñas: el correo del autor ya no es público', r.body.data.reviews.length === 1 && !('authorEmail' in r.body.data.reviews[0]) && !r.text.includes('rita-secreta'));
    check('ficha creada por el dueño: sin atribución', (await api('GET', '/businesses/lg-manual')).body.data.publicSource === null);
    check('ficha import_hilagro: sin atribución (no es registro público)', (await api('GET', '/businesses/lg-hilagro')).body.data.publicSource === null);
    r = await api('GET', '/site-config');
    check('site-config público: razón social, RUC, versiones y banner', r.body.data.legal_razon_social === 'HEPTA E.A.S.' && r.body.data.legal_ruc === '80117760-0' && r.body.data.legal_terminos_version === '3.1' && r.body.data.legal_banner_hasta === in15);

    // ── 11) Frontend real (server.js) ────────────────────────────────────────
    if (!FRONT_NM) { console.log('SKIP frontend: falta el node_modules del frontend'); }
    else {
        const FPORT = 30000 + Math.floor(Math.random() * 20000);
        const fe = spawn(process.execPath, [path.join(ROOT, 'frontend/server.js')], {
            env: { ...process.env, NODE_PATH: FRONT_NM, PORT: String(FPORT), BACKEND_HOST: '127.0.0.1', BACKEND_PORT: String(P), SITE_URL: 'https://retopa.test' },
            stdio: ['ignore', 'pipe', 'pipe'] });
        let feLog = ''; fe.stdout.on('data', d => feLog += d); fe.stderr.on('data', d => feLog += d);
        for (let i = 0; i < 50; i++) { await sleep(100); try { await req(FPORT, 'GET', '/robots.txt'); break; } catch (e) {} }
        const g = (p, hd) => req(FPORT, 'GET', p, undefined, hd);
        r = await g('/terminos.html');
        check('fe /terminos.html: 200 desde site_config', r.status === 200 && r.text.includes('Versión 3.1') && r.text.includes('Ana Benítez'), r.status + ' ' + feLog.slice(-200));
        check('fe /terminos.html: Cache-Control public, max-age=300', r.headers['cache-control'] === 'public, max-age=300', r.headers['cache-control']);
        check('fe /terminos.html: indexable + canonical', r.text.includes('content="index, follow"') && r.text.includes('<link rel="canonical" href="https://retopa.test/terminos.html">'));
        check('fe /terminos.html: título y meta description', /<title>Términos y Condiciones de Uso — RetoPA<\/title>/.test(r.text) && r.text.includes('name="description"'));
        check('fe /terminos.html: índice y banner de cambio', r.text.includes('class="toc"') && r.text.includes('Los cambios importantes rigen desde'));
        check('fe /terminos.html: pie con baja, denuncia y operador', r.text.includes('href="/legal/baja"') && r.text.includes('href="/legal/denuncia"') && r.text.includes('marca operada por HEPTA E.A.S. · RUC 80117760-0'));
        r = await g('/terminos.html?v=2.0');
        check('fe versión vieja: aviso "ya no está vigente" + noindex', r.text.includes('ya no está vigente') && r.text.includes('noindex, follow'));
        r = await g('/privacidad.html');
        check('fe /privacidad.html: 200 + cache 300', r.status === 200 && r.headers['cache-control'] === 'public, max-age=300' && r.text.includes('Política de Privacidad'));
        r = await g('/legal/baja?ficha=lg-dncp');
        check('fe /legal/baja: noindex, follow (meta y header)', r.status === 200 && r.text.includes('content="noindex, follow"') && r.headers['x-robots-tag'] === 'noindex, follow');
        check('fe /legal/baja: formulario con prefill escapado', r.text.includes('value="lg-dncp"') && r.text.includes("fetch('/api/v2/legal/baja'"));
        r = await g('/legal/baja?ficha=%22%3E%3Cscript%3Ealert(1)%3C/script%3E');
        check('fe /legal/baja: prefill malicioso escapado', !r.text.includes('"><script>alert(1)'));
        r = await g('/legal/denuncia');
        check('fe /legal/denuncia: declaración de buena fe', r.text.includes('actúo de buena fe') && r.text.includes('noindex, follow'));
        r = await g('/legal-pages.js');
        check('fe: /legal-pages.js no se expone', r.status === 404);
        const BOT = { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' };
        r = await g('/negocio/lg-dncp', BOT);
        check('crawler ficha DNCP: línea de atribución', r.text.includes('Datos de contacto iniciales obtenidos de registros públicos (DNCP — contrataciones.gov.py, 19/05/2026)'), r.status + ' ' + r.text.slice(0, 120));
        check('crawler ficha DNCP: enlaces reclamar y corrección', r.text.includes('/reclamar/?ficha=lg-dncp') && r.text.includes('/legal/baja?ficha='));
        check('crawler ficha: pie legal', r.text.includes('href="/legal/denuncia"'));
        r = await g('/negocio/lg-manual', BOT);
        check('crawler ficha del dueño: sin atribución', r.status === 200 && !r.text.includes('registros públicos'));
        // backend caído → .html estático
        server.close(); await sleep(200);
        r = await g('/privacidad.html');
        check('fe: backend caído → sirve el privacidad.html estático', r.status === 200 && r.text.includes('Última actualización: 17 de septiembre de 2026'), String(r.status));
        fe.kill();
    }

    console.log(`\n${pass}/${pass + fail} OK`);
    await pool.end();
    try { server.close(); } catch (e) {}
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
