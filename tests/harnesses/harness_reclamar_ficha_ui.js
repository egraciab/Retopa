// /reclamar?ficha=… y /registrar (UI REAL, misma página que /reclamar) contra el
// backend REAL (claim.routes + directory) y Postgres efímero; + tarjeta "Pedidos de
// reclamo" del Admin (claims.js real, API simulada). Playwright 390px.
// Uso: node harness_reclamar_ficha_ui.js <ROOT del repo (…/opt/retopa)> <main.css compilado>
const path = require('path'), fs = require('fs'), http = require('http');
const ROOT = process.argv[2] || '/opt/retopa';
const CSS = process.argv[3];
const SRC = path.join(ROOT, 'backend/src'), FE = path.join(ROOT, 'frontend');
process.env.DB_HOST = process.env.PGHOST || '/tmp'; process.env.DB_PORT = process.env.PGPORT || '5499';
process.env.DB_NAME = 'retopa'; process.env.DB_USER = 'retopa'; process.env.DB_PASSWORD = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-secret-0123456789abcdef';
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const mock = (rel, exports) => { const p = require.resolve(path.join(SRC, rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
mock('config/redis', { get: async () => null, setEx: async () => {}, set: async () => {}, keys: async () => [], del: async () => {}, on: () => {} });
mock('utils/pwa-icon', { getPwaIcon: async () => null });
mock('helpers/notifyOwner', { notifyOwner: async () => {} });
mock('config/mail', { sendEmail: async () => ({ success: true }), renderTemplate: async () => ({}) });

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: 'retopa', user: 'retopa' });
  const q = (s, p) => pool.query(s, p);
  const express = require('express'), jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs');
  const { chromium } = require('playwright');

  async function cleanup() {
    const ids = (await q("SELECT id FROM businesses WHERE slug LIKE 'rfu-%' OR name LIKE 'RFU %'")).rows.map(r => r.id);
    if (ids.length) {
      await q('DELETE FROM claim_requests WHERE business_id = ANY($1)', [ids]);
      await q('DELETE FROM service_leads WHERE business_id = ANY($1)', [ids]);
      await q('DELETE FROM businesses WHERE id = ANY($1)', [ids]);
    }
    await q("DELETE FROM users WHERE email LIKE '%@rfu.test' OR name LIKE 'RFU %'");
    await q("DELETE FROM cities WHERE slug LIKE 'rfu-city-%'");
  }
  await cleanup();
  await q("INSERT INTO site_config (key, value) VALUES ('social_whatsapp','595986484905') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");
  let P = (await q("SELECT id FROM categories WHERE slug='rfu-servicios'")).rows[0];
  P = P ? P.id : (await q("INSERT INTO categories (name, slug) VALUES ('RFU Servicios','rfu-servicios') RETURNING id")).rows[0].id;
  let E = (await q("SELECT id FROM categories WHERE slug='rfu-electricidad'")).rows[0];
  E = E ? E.id : (await q("INSERT INTO categories (name, slug, parent_id) VALUES ('Electricidad RFU','rfu-electricidad',$1) RETURNING id", [P])).rows[0].id;
  await q(`INSERT INTO businesses (name, slug, whatsapp, phone, city, verified, is_active) VALUES
     ('RFU Ferretería Verificada','rfu-verificada','595981772001','0981772001','Luque',TRUE,TRUE),
     ('RFU Sin Celular','rfu-sin-celular',NULL,'021 555 000','Luque',FALSE,TRUE),
     ('RFU Otra','rfu-otra','595981772004',NULL,'Luque',FALSE,TRUE),
     ('RFU Con Dueño','rfu-con-dueno','595981772005',NULL,'Luque',TRUE,TRUE)`);
  await q(`INSERT INTO cities (name, department, slug) VALUES ('Luque','Central','rfu-city-luque'), ('San Lorenzo','Central','rfu-city-slorenzo'),
     ('Asunción','Capital','rfu-city-asuncion'), ('Lambaré','Central','rfu-city-lambare')`);
  const h = await bcrypt.hash('x', 4);
  const OWN = (await q(`INSERT INTO users (email, password_hash, name, role) VALUES ('own@rfu.test',$1,'RFU Dueño','client') RETURNING id`, [h])).rows[0].id;
  await q("INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit) SELECT $1, id, TRUE, TRUE FROM businesses WHERE slug='rfu-con-dueno'", [OWN]);

  const app = express(); app.use(express.json());
  app.use('/api/v2/claim', require(path.join(SRC, 'routes/claim.routes')));
  app.use('/api/v2', require(path.join(SRC, 'routes/cities')));
  app.use('/api/v2', require(path.join(SRC, 'routes/directory')));
  app.get('/public/css/main.css', (req, res) => res.type('text/css').send(fs.readFileSync(CSS, 'utf8')));
  app.get(['/reclamar', '/reclamar/', '/registrar', '/registrar/'], (req, res) => res.type('html').send(fs.readFileSync(path.join(FE, 'reclamar/index.html'), 'utf8')));
  app.get('/', (req, res) => res.type('html').send(fs.readFileSync(path.join(FE, 'index.html'), 'utf8')));
  app.get(['/cliente/', '/negocio/:s'], (req, res) => res.type('html').send('<!doctype html><title>stub</title><p id="stub">' + req.path + '</p>'));
  // Admin: claims.js real con API simulada
  app.get('/admin/js/claims.js', (req, res) => res.type('application/javascript').send(fs.readFileSync(path.join(FE, 'admin/js/claims.js'), 'utf8')));
  app.get('/admin-stub', (req, res) => res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/css/main.css"></head>
<body class="bg-gray-50"><div class="p-3"><div id="claimRequests"></div></div>
<script>
  window.__calls = []; window.__toasts = [];
  function escapeHtml(t) { if (t == null) return ''; const d = document.createElement('div'); d.textContent = String(t); return d.innerHTML; }
  function showToast(m, t) { window.__toasts.push([t, m]); }
  let ROWS = [
    { id: 11, business_id: 5, kind: 'whatsapp', phone: '595981772001', code: 'RP-4821', business: 'Maxi <b>Refrigeración</b>', city: 'Asunción', verified: true, has_owner: false, created_at: new Date(Date.now() - 5*60000).toISOString() },
    { id: 12, business_id: 6, kind: 'revision', phone: '595985000111', name: 'Ana Gómez', email: 'ana@x.com', message: 'Soy la dueña', business: 'Kiosco Ana', city: 'Luque', verified: false, has_owner: false, created_at: new Date(Date.now() - 3*3600000).toISOString() },
  ];
  async function apiAdminGet(ep) { window.__calls.push(['GET', ep]); if (ep === '/claim-requests') return { success: true, data: ROWS }; return { success: true, data: [] }; }
  async function apiAdminPost(ep, body) { window.__calls.push(['POST', ep]);
    if (/\\/claim-requests\\/11\\/link/.test(ep)) { ROWS = ROWS.filter(r => r.id !== 11); return { success: true, data: { wa: '595981772001', url: 'https://x/reclamar/?token=abc', message: '¡Hola! Recibimos tu pedido … https://x/reclamar/?token=abc' } }; }
    if (/dismiss/.test(ep)) { ROWS = ROWS.filter(r => r.id !== 12); return { success: true }; }
    return { success: true }; }
</script><script src="/admin/js/claims.js"></script></body></html>`));
  app.use(express.static(FE, { index: false }));
  app.use('/api', (req, res) => res.json({ success: true, data: [] }));
  const server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const newPage = async (init) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
    const waNav = [];
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => { if (/wa\.me/.test(r.request().url())) waNav.push(r.request().url()); r.abort(); });
    if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    return { ctx, p, errs, waNav };
  };
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const vis = (p, sel) => p.locator(sel).isVisible().catch(() => false);

  // ── FICHA con celular: prueba por WhatsApp ────────────────────────────────
  let { ctx, p, errs, waNav } = await newPage();
  await p.goto(base + '/reclamar/?ficha=rfu-verificada', { waitUntil: 'load' });
  await p.waitForSelector('#stateClaim:not(.hide)', { timeout: 5000 }).catch(() => {});
  check('ficha: muestra el negocio y "¿Es tu negocio?" (ficha VERIFICADA sin dueño)', /RFU Ferretería Verificada/.test(await p.locator('#bizCard').innerText()) && await vis(p, '#askCard'));
  await p.click('#btnYes');
  check('"Sí, es mío" → "Confirmá desde tu WhatsApp" con el número de la ficha', await vis(p, '#proofCard') && (await p.locator('#proofNumber').innerText()) === '0981 772 001' && !(await vis(p, '#formCard')));
  await p.screenshot({ path: path.join(__dirname, 'reclamo_ficha_390.png') });
  await p.waitForFunction(() => /wa\.me/.test(document.getElementById('btnProof').href), null, { timeout: 4000 }).catch(() => {});
  const href = await p.getAttribute('#btnProof', 'href');
  check('"Abrir WhatsApp" es un ENLACE real (no lo bloquea el navegador) con target nuevo', /^https:\/\/wa\.me\//.test(href) && (await p.getAttribute('#btnProof', 'target')) === '_blank');
  waNav.push(href);
  await p.locator('#btnProof').click({ modifiers: [] }).catch(() => {});
  await p.waitForTimeout(500);
  const code = (await q("SELECT code FROM claim_requests cr JOIN businesses b ON b.id = cr.business_id WHERE b.slug='rfu-verificada'")).rows[0];
  check('"Abrir WhatsApp" → abre wa.me de RetoPA con el código y queda el pedido', code && waNav.some(u => u.startsWith('https://wa.me/595986484905') && decodeURIComponent(u).includes(code.code)), JSON.stringify(waNav));
  check('…y muestra el código y qué sigue', await vis(p, '#proofSent') && (await p.locator('#proofCode').innerText()) === (code && code.code));
  check('ficha: sin scroll horizontal', await noOverflow(p));
  // "Ese no es mi número" → revisión
  await p.click('text=Ese no es mi número');
  check('"Ese no es mi número" → formulario de revisión (sin rubro, con "¿Cómo te verificamos?")', await vis(p, '#formCard') && !(await vis(p, '#rubroField')) && await vis(p, '#messageField') && await vis(p, '#revisionIntro'));
  await p.click('#btnSubmit');
  check('revisión: valida WhatsApp y nombre', await vis(p, '#errWa') && await vis(p, '#errName'));
  await p.fill('#inputWa', '0985 772 999'); await p.fill('#inputName', 'RFU Ana'); await p.fill('#inputMessage', 'Soy la dueña');
  check('WhatsApp: +595 fijo; "0985 772 999" queda "985 772 999"', (await p.inputValue('#inputWa')) === '985 772 999' && /\+595/.test(await p.locator('.wa .pre').innerText()));
  await p.click('#btnSubmit');
  await p.waitForSelector('#stateRequested:not(.hide)', { timeout: 4000 }).catch(() => {});
  const rv = (await q("SELECT cr.* FROM claim_requests cr JOIN businesses b ON b.id = cr.business_id WHERE b.slug='rfu-verificada' AND kind='revision'")).rows[0];
  check('revisión enviada: "¡Recibido!" y queda el pedido', await vis(p, '#stateRequested') && rv && rv.phone === '595985772999' && rv.name === 'RFU Ana');
  check('ficha: sin errores de JS', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // ── FICHA sin celular → directo a revisión; ficha con dueño → aviso ───────
  ({ ctx, p, errs } = await newPage());
  await p.goto(base + '/reclamar/?ficha=rfu-sin-celular', { waitUntil: 'load' });
  await p.waitForSelector('#stateClaim:not(.hide)', { timeout: 5000 }).catch(() => {});
  await p.click('#btnYes');
  check('ficha sin celular: "Sí, es mío" va directo a revisión', await vis(p, '#formCard') && !(await vis(p, '#proofCard')));
  await p.goto(base + '/reclamar/?ficha=rfu-con-dueno', { waitUntil: 'load' });
  await p.waitForSelector('#stateError:not(.hide)', { timeout: 4000 }).catch(() => {});
  check('ficha con dueño: "Este negocio ya tiene dueño" + entrar', /ya tiene dueño/.test(await p.locator('#errorTitle').innerText()));
  await ctx.close();

  // ── ALTA ──────────────────────────────────────────────────────────────────
  ({ ctx, p, errs } = await newPage());
  await p.goto(base + '/registrar', { waitUntil: 'load' });
  await p.waitForSelector('#altaCard:not(.hide)', { timeout: 5000 }).catch(() => {});
  check('/registrar: misma pantalla, "Registrá tu negocio gratis"', await vis(p, '#altaCard') && await vis(p, '#formCard') && !(await vis(p, '#askCard')) && /Crear mi negocio/.test(await p.locator('#btnSubmit').innerText()));
  await p.click('#btnSubmit');
  check('alta: valida nombre, ciudad, rubro, WhatsApp y tu nombre', await vis(p, '#errBizName') && await vis(p, '#errCity') && await vis(p, '#errRubro') && await vis(p, '#errWa') && await vis(p, '#errName'));
  await p.fill('#inputBizName', 'RFU Electricidad Pérez');
  await p.fill('#inputCity', 'Luqe');
  check('ciudad mal escrita: no hay opción para elegir y lo dice', (await p.locator('#cityList .opt').count()) === 0 && /No encontramos esa ciudad/.test(await p.locator('#cityList').innerText()));
  await p.fill('#inputCity', 'Lu');
  const cityOpts = await p.locator('#cityList .opt').allInnerTexts();
  check('ciudad: al escribir "Lu" aparece la lista (Luque primero)', cityOpts.length >= 1 && /^Luque/.test(cityOpts[0]), JSON.stringify(cityOpts));
  await p.fill('#rubroSearch', 'electricidad rfu');
  await p.locator('#rubroList .opt', { hasText: 'Electricidad RFU' }).first().click();
  await p.fill('#inputWa', '+595 981 772 004'); await p.fill('#inputName', 'RFU Pérez');
  check('WhatsApp: pegar "+595 981 772 004" queda "981 772 004"', (await p.inputValue('#inputWa')) === '981 772 004', await p.inputValue('#inputWa'));
  await p.click('#btnSubmit');
  check('ciudad ESCRITA pero no elegida de la lista → no deja seguir ("Elegí la ciudad de la lista")', await vis(p, '#errCity') && /Elegí la ciudad de la lista/.test(await p.locator('#errCity').innerText()) && !(await vis(p, '#existsCard')));
  await p.fill('#inputCity', 'lambare');
  await p.locator('#cityList .opt', { hasText: 'Lambaré' }).first().click();
  check('elegida: queda "Lambaré · Central" con "Cambiar"', /Lambaré · Central/.test(await p.locator('#cityChosen').innerText()) && !(await vis(p, '#cityPicker')));
  await p.click('#cityChosen button');
  await p.fill('#inputCity', 'luq'); await p.locator('#cityList .opt', { hasText: 'Luque' }).first().click();
  check('alta: al corregir los campos se van sus avisos de error', !(await vis(p, '#errBizName')) && !(await vis(p, '#errCity')) && !(await vis(p, '#errRubro')) && !(await vis(p, '#errWa')) && !(await vis(p, '#errName')));
  await p.screenshot({ path: path.join(__dirname, 'registrar_390.png'), fullPage: true });
  await p.click('#btnSubmit');
  await p.waitForSelector('#existsCard:not(.hide)', { timeout: 4000 }).catch(() => {});
  check('alta con el WhatsApp de otra ficha → "¿Es esta tu ficha?" con "reclamarla"', await vis(p, '#existsCard') && /RFU Otra/.test(await p.locator('#existsList').innerText())
        && (await p.locator('#existsList a', { hasText: 'reclamarla' }).getAttribute('href')) === '/reclamar/?ficha=rfu-otra');
  await p.fill('#inputWa', '0981 772 777');
  await p.click('text=No, es otro negocio: crear igual');
  await p.waitForURL(/\/cliente\//, { timeout: 5000 }).catch(() => {});
  const st = await p.evaluate(() => ({ t: !!localStorage.getItem('token'), w: localStorage.getItem('retopa_welcome'), path: location.pathname }));
  const created = (await q("SELECT b.slug, b.whatsapp, b.city, u.name FROM businesses b JOIN user_businesses ub ON ub.business_id = b.id AND ub.is_owner JOIN users u ON u.id = ub.user_id WHERE b.name = 'RFU Electricidad Pérez'")).rows[0];
  check('alta creada → sesión y directo a Mi Portal (con bienvenida)', st.t && st.w === '1' && st.path === '/cliente/' && created && created.whatsapp === '595981772777' && created.name === 'RFU Pérez' && created.city === 'Luque', JSON.stringify({ st, created }));
  check('alta: sin errores de JS', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // Con sesión: no pide nombre/correo
  const U = (await q(`INSERT INTO users (email, password_hash, name, role) VALUES ('ses@rfu.test',$1,'RFU Sesión','client') RETURNING id`, [h])).rows[0].id;
  const T = jwt.sign({ id: U, role: 'client' }, process.env.JWT_SECRET);
  ({ ctx, p, errs } = await newPage());
  await ctx.addInitScript(`localStorage.setItem('token', ${JSON.stringify(T)}); localStorage.setItem('user', JSON.stringify({ id: ${U}, name: 'RFU Sesión' }));`);
  await p.goto(base + '/registrar', { waitUntil: 'load' });
  await p.waitForSelector('#altaCard:not(.hide)', { timeout: 5000 }).catch(() => {});
  check('con sesión: no pide tu nombre ni correo y dice con qué cuenta', !(await vis(p, '#nameField')) && !(await vis(p, '#emailField')) && /RFU Sesión/.test(await p.locator('#loggedAs').innerText()));
  await ctx.close();

  // ── MODAL en el sitio (index.html REAL): registrar y reclamar sin salir ────
  const modalFrame = async (p) => { const el = await p.waitForSelector('#rpFlowModal iframe', { timeout: 4000 }); const f = await el.contentFrame(); await f.waitForLoadState('load'); return f; };
  for (const vp of [{ w: 390, h: 760, name: 'celular' }, { w: 1280, h: 860, name: 'escritorio' }]) {
    const ctx2 = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, serviceWorkers: 'block' });
    await ctx2.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const p2 = await ctx2.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
    await p2.goto(base + '/', { waitUntil: 'load' }); await p2.waitForTimeout(500);
    const hist0 = await p2.evaluate(() => history.length);
    await p2.evaluate(() => openRegistroEmpresaCheck());
    let f = await modalFrame(p2);
    await f.waitForSelector('#altaCard:not(.hide)', { timeout: 5000 }).catch(() => {});
    const geo = await p2.evaluate(() => { const r = document.querySelector('#rpFlowModal [data-rppanel]').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, w: r.width, h: innerHeight, W: innerWidth, url: location.pathname }; });
    check(`[${vp.name}] "Registrar mi negocio" abre un MODAL sobre la página (no cambia de página)`, geo.url === '/' && /\/registrar\?embed=1/.test(f.url()) && await f.locator('#altaCard').isVisible(), JSON.stringify(geo));
    check(`[${vp.name}] el modal entra en pantalla` + (vp.w < 641 ? ' (hoja desde abajo)' : ' (centrado, 480px)'), geo.top >= 0 && geo.bottom <= geo.h + 1 && (vp.w < 641 ? Math.abs(geo.bottom - geo.h) < 2 && geo.w === geo.W : geo.w === 480), JSON.stringify(geo));
    check(`[${vp.name}] adentro del modal no se repite el encabezado de la página`, !(await f.locator('header.hero-bg').isVisible().catch(() => false)) && await f.evaluate(() => document.body.classList.contains('embed')));
    if (vp.w < 641) await p2.screenshot({ path: path.join(__dirname, 'modal_registrar_390.png') });
    else await p2.screenshot({ path: path.join(__dirname, 'modal_registrar_1280.png') });
    // X cierra; Esc cierra; Atrás cierra (y la página sigue en "/")
    await p2.click('#rpFlowModal [data-rpclose]'); await p2.waitForTimeout(400);
    check(`[${vp.name}] la X cierra el modal (y saca su entrada del historial)`, !(await p2.$('#rpFlowModal')) && (await p2.evaluate(() => !(history.state && history.state.rpFlow))));
    await p2.evaluate(() => openRegistroEmpresaCheck()); f = await modalFrame(p2);
    await f.waitForSelector('#altaCard:not(.hide)', { timeout: 5000 }).catch(() => {});
    await f.focus('#inputBizName'); await p2.keyboard.press('Escape'); await p2.waitForTimeout(400);
    check(`[${vp.name}] Esc (con el foco en el formulario) cierra el modal`, !(await p2.$('#rpFlowModal')));
    await p2.evaluate(() => openRegistroEmpresaCheck()); await modalFrame(p2);
    await p2.goBack(); await p2.waitForTimeout(500);
    check(`[${vp.name}] "Atrás" del celular cierra el modal y te deja en la misma página`, !(await p2.$('#rpFlowModal')) && (await p2.evaluate(() => location.pathname)) === '/' && (await p2.evaluate(() => document.body.style.overflow)) === '');
    if (vp.w < 641) {
      // Reclamo desde la ficha: modal; "No" lo cierra
      await p2.evaluate(() => openClaimModal('rfu-otra', 'RFU Otra')); f = await modalFrame(p2);
      await f.waitForSelector('#stateClaim:not(.hide)', { timeout: 5000 }).catch(() => {});
      check('"Soy el propietario" en la ficha → modal "¿Es tu negocio?" con la ficha', /RFU Otra/.test(await f.locator('#bizCard').innerText()) && /¿Es tu negocio\?/.test(await p2.locator('#rpFlowModal [data-rptitle]').innerText()));
      await f.click('#btnNo'); await p2.waitForTimeout(500);
      check('"No, no es mío" cierra el modal (no navega)', !(await p2.$('#rpFlowModal')) && (await p2.evaluate(() => location.pathname)) === '/');
      // Con la FICHA abierta: "Atrás" cierra solo el modal, la ficha sigue
      await p2.evaluate(() => openProfile('rfu-otra'));
      await p2.waitForFunction(() => window._currentBiz && window._currentBiz.slug === 'rfu-otra', null, { timeout: 5000 }).catch(() => {});
      await p2.evaluate(() => openClaimModal('rfu-otra', 'RFU Otra')); await modalFrame(p2);
      await p2.goBack(); await p2.waitForTimeout(600);
      check('con la ficha abierta: "Atrás" cierra el modal y la ficha sigue abierta', !(await p2.$('#rpFlowModal')) && await p2.evaluate(() => !document.getElementById('profileModal').classList.contains('hidden')));
      await p2.evaluate(() => closeModal()); await p2.waitForTimeout(400);
      await p2.goto(base + '/', { waitUntil: 'load' }); await p2.waitForTimeout(400);
      // Alta completa dentro del modal → "¿Es esta tu ficha?" → reclamarla sigue DENTRO del modal
      await p2.evaluate(() => openRegistroEmpresaCheck()); f = await modalFrame(p2);
      await f.waitForSelector('#altaCard:not(.hide)', { timeout: 5000 }).catch(() => {});
      await f.fill('#inputBizName', 'RFU Modal Kiosco');
      await f.fill('#inputCity', 'san lo'); await f.locator('#cityList .opt', { hasText: 'San Lorenzo' }).first().click();
      await f.fill('#rubroSearch', 'electricidad rfu'); await f.locator('#rubroList .opt', { hasText: 'Electricidad RFU' }).first().click();
      await f.fill('#inputWa', '981772004'); await f.fill('#inputName', 'RFU Modal');
      await f.click('#btnSubmit');
      await f.waitForSelector('#existsCard:not(.hide)', { timeout: 4000 }).catch(() => {});
      await f.locator('#existsList a', { hasText: 'reclamarla' }).click();
      await f.waitForSelector('#stateClaim:not(.hide) #bizCard', { timeout: 5000 }).catch(() => {});
      await p2.waitForTimeout(300);
      check('"Sí, es esta: reclamarla" sigue dentro del modal (y el título cambia)', !!(await p2.$('#rpFlowModal')) && /ficha=rfu-otra/.test(f.url()) && /embed=1/.test(f.url())
            && /¿Es tu negocio\?/.test(await p2.locator('#rpFlowModal [data-rptitle]').innerText()) && (await p2.evaluate(() => location.pathname)) === '/', f.url());
      await p2.click('#rpFlowModal [data-rpclose]'); await p2.waitForTimeout(400);
      // Alta OK dentro del modal → la PÁGINA va a Mi Portal
      await p2.evaluate(() => openRegistroEmpresaCheck()); f = await modalFrame(p2);
      await f.waitForSelector('#altaCard:not(.hide)', { timeout: 5000 }).catch(() => {});
      await f.fill('#inputBizName', 'RFU Modal Kiosco');
      await f.fill('#inputCity', 'san lo'); await f.locator('#cityList .opt', { hasText: 'San Lorenzo' }).first().click();
      await f.fill('#rubroSearch', 'electricidad rfu'); await f.locator('#rubroList .opt', { hasText: 'Electricidad RFU' }).first().click();
      await f.fill('#inputWa', '981 772 888'); await f.fill('#inputName', 'RFU Modal');
      await f.click('#btnSubmit');
      await p2.waitForURL(/\/cliente\//, { timeout: 6000 }).catch(() => {});
      const mk = (await q("SELECT city, whatsapp FROM businesses WHERE name='RFU Modal Kiosco'")).rows[0];
      check('alta dentro del modal → la página entera va a Mi Portal con sesión', (await p2.evaluate(() => location.pathname)) === '/cliente/' && !!(await p2.evaluate(() => localStorage.getItem('token'))) && mk && mk.city === 'San Lorenzo' && mk.whatsapp === '595981772888', JSON.stringify(mk));
    }
    check(`[${vp.name}] modal: sin errores de JS`, e2.length === 0, e2.join(' | '));
    await ctx2.close();
  }

  // ── Admin: tarjeta "Pedidos de reclamo" ───────────────────────────────────
  ({ ctx, p, errs, waNav } = await newPage());
  await p.goto(base + '/admin-stub', { waitUntil: 'load' });
  await p.evaluate(() => loadClaimRequests());
  await p.waitForSelector('#crCard', { timeout: 3000 }).catch(() => {});
  const card = await p.locator('#crCard').innerText().catch(() => '');
  check('Admin: "Pedidos de reclamo desde la ficha · 2"', /Pedidos de reclamo desde la ficha · 2/.test(card), card.slice(0, 80));
  check('Admin: con código → "escribir desde 0981 772 001 con el código RP-4821"', /0981 772 001/.test(card) && /RP-4821/.test(card));
  check('Admin: revisión → nombre, número, correo, mensaje y "otro número: revisar"', /Ana Gómez/.test(card) && /0985 000 111/.test(card) && /otro número: revisar/.test(card) && /Soy la dueña/.test(card));
  check('Admin: nombre de la ficha escapado (se ve el texto, no se interpreta)', /Maxi <b>Refrigeración<\/b>/.test(card));
  await p.locator('.cr-row[data-cr="11"] button', { hasText: 'Mandar link' }).click();
  await p.waitForTimeout(500);
  check('Mandar link → abre WhatsApp al número de la ficha con el link', waNav.some(u => u.startsWith('https://wa.me/595981772001?text=') && decodeURIComponent(u).includes('/reclamar/?token=abc')), JSON.stringify(waNav));
  check('…y el pedido sale de la lista', !(await p.locator('.cr-row[data-cr="11"]').count()));
  await p.locator('.cr-row[data-cr="12"] button', { hasText: 'Descartar' }).click();
  await p.waitForTimeout(300);
  check('Descartar → lista vacía', (await p.locator('#claimRequests').innerText()).trim() === '');
  check('Admin: sin errores de JS', errs.length === 0, errs.join(' | '));
  await ctx.close();

  await cleanup();
  await browser.close(); server.close(); await pool.end();
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
