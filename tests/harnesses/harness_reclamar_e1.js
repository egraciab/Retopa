// /reclamar E1 — "¿Es tu negocio?" en una pantalla, sin contraseña. Playwright 390px.
// Sirve frontend/reclamar/index.html real con una API simulada y recorre:
// Sí → rubro sugerido con fuente → cambiar rubro (lista, nunca a mano) →
// WhatsApp precargado → nombre → sesión + Mi Portal; validaciones; correo
// ya usado; "No, no es mío"; ficha con dueño; sin sugerencia; escape; medición.
// Uso: node harness_reclamar_e1.js <frontend_dir>
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path');
const FE = process.argv[2] || '.';
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const html = fs.readFileSync(path.join(FE, 'reclamar/index.html'), 'utf8');
const TOK = 'a'.repeat(64);
const RUBROS = [
  { id: 101, name: 'Ferreterías', grupo: 'Tiendas y Comercios' }, { id: 102, name: 'Panaderías', grupo: 'Tiendas y Comercios' },
  { id: 201, name: 'Cerrajerías', grupo: 'Servicios Profesionales' }, { id: 300, name: 'Veterinarias', grupo: null },
];
const INFO = (o = {}) => ({ success: true, data: Object.assign({ id: 1, name: 'Ferretería <img src=x onerror="window.__xss=1">Sur', slug: 'h-ferre', city: 'Luque',
  phone: '0981 123 456', whatsappPrefill: '0981 123 456', rubros: RUBROS,
  suggestion: { id: 101, name: 'Ferreterías', reason: 'Porque el nombre dice «Ferretería»' } }, o) });

function startServer(mode = {}) {
  const log = { info: [], events: [], confirm: [], notMine: [] };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const json = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (u.pathname === '/api/v2/claim/info') {
        log.info.push(Object.fromEntries(u.searchParams));
        if (mode.claimed) return json(409, { success: false, code: 'ALREADY_CLAIMED', error: 'x' });
        return json(200, INFO(mode.noSuggestion ? { suggestion: null, whatsappPrefill: '' } : {}));
      }
      if (u.pathname === '/api/v2/claim/event') { log.events.push(JSON.parse(body || '{}')); res.writeHead(204); return res.end(); }
      if (u.pathname === '/api/v2/claim/confirm') {
        const b = JSON.parse(body || '{}'); log.confirm.push(b);
        if (mode.emailExists && b.email) return json(409, { success: false, code: 'email_exists', error: 'Ese correo ya tiene cuenta en RetoPA. Dejalo vacío para seguir, o entrá con tu cuenta.' });
        return json(200, { success: true, token: 'jwt.tok.en', user: { id: 7, name: b.name, role: 'client', has_business: true }, redirect: '/cliente/' });
      }
      if (u.pathname === '/api/v2/claim/not-mine') { log.notMine.push(JSON.parse(body || '{}')); return json(200, { success: true }); }
      if (u.pathname.startsWith('/reclamar')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html); }
      if (u.pathname.startsWith('/cliente')) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<p id="portal">Mi Portal</p>'); }
      res.writeHead(404); res.end();
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, log, port: server.address().port })));
}

async function open(browser, mode, qs = `?token=${TOK}&utm_source=wa&utm_campaign=prospectos`) {
  const s = await startServer(mode);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${s.port}/reclamar/${qs}`, { waitUntil: 'load' });
  return { ...s, ctx, p, errs };
}
const vis = (p, sel) => p.isVisible(sel);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // ── 1) Camino feliz ─────────────────────────────────────────────────────────
  {
    const { server, log, ctx, p, errs } = await open(browser, {});
    await p.waitForSelector('#stateClaim:not(.hide)');
    check('muestra su ficha y la pregunta "¿Es tu negocio?"', await vis(p, '#bizCard') && /¿Es tu negocio\?/.test(await p.locator('#askCard').innerText()));
    check('el formulario NO aparece antes de decir que sí', !(await vis(p, '#formCard')));
    check('nombre escapado (sin XSS)', await p.evaluate(() => !window.__xss && !document.querySelector('#bizCard img')));
    check('/info recibe origen y visita', log.info[0].src === 'wa' && log.info[0].v && log.info[0].v.length >= 8);
    check('sin form_started antes del "Sí"', log.events.length === 0);
    const yesBox = await p.locator('#btnYes').boundingBox();
    check('botón "Sí, es mío" grande (≥ 48px)', yesBox && yesBox.height >= 48, JSON.stringify(yesBox));
    check('no pide contraseña en ningún lado', (await p.locator('input[type=password]').count()) === 0);
    await p.screenshot({ path: path.join(__dirname, 'reclamar_e1_pregunta.png'), fullPage: true });

    await p.click('#btnYes');
    await p.waitForSelector('#formCard:not(.hide)');
    await p.waitForTimeout(150);
    check('"Sí" → aparece el formulario y se mide form_started (una vez)', log.events.filter(e => e.event === 'form_started').length === 1);
    check('rubro sugerido preseleccionado', (await p.locator('#rubroChosenName').innerText()) === 'Ferreterías');
    check('la sugerencia muestra su FUENTE', /porque el nombre dice «Ferretería»/.test(await p.locator('#rubroSource').innerText()));
    check('WhatsApp precargado', (await p.inputValue('#inputWa')) === '981 123 456');
    check('correo visible y marcado como opcional', await vis(p, '#inputEmail') && /opcional/i.test(await p.locator('label[for=inputEmail]').innerText()));
    await p.screenshot({ path: path.join(__dirname, 'reclamar_e1_form.png'), fullPage: true });

    // Validación local: falta el nombre
    await p.click('#btnSubmit'); await p.waitForTimeout(150);
    check('sin nombre → aviso en el campo, no envía', await vis(p, '#errName') && log.confirm.length === 0);
    check('sin nombre → form_error name_missing', log.events.some(e => e.event === 'form_error' && e.reason === 'name_missing'));

    // Cambiar rubro: de una lista con buscador, nunca escrito a mano
    await p.click('#rubroChosen .link');
    check('"Cambiar" abre el buscador de rubros', await vis(p, '#rubroSearch'));
    await p.fill('#rubroSearch', 'cerra');
    const opts = await p.$$eval('#rubroList .opt', els => els.map(e => e.innerText.split('\n')[0]));
    check('buscar "cerra" filtra a Cerrajerías (sin tildes ni mayúsculas)', opts.length === 1 && opts[0] === 'Cerrajerías', opts.join(','));
    await p.fill('#rubroSearch', 'servicios');
    check('buscar por grupo también encuentra', (await p.$$eval('#rubroList .opt', els => els.length)) === 1);
    await p.fill('#rubroSearch', 'cerra');
    await p.click('#rubroList .opt');
    check('elegido de la lista → pill con el rubro, sin "fuente"', (await p.locator('#rubroChosenName').innerText()) === 'Cerrajerías' && !(await vis(p, '#rubroSource')));

    await p.fill('#inputName', 'Ana Pérez');
    await p.click('#btnSubmit');
    await p.waitForSelector('#portal', { timeout: 4000 }).catch(() => {});
    const c = log.confirm[0] || {};
    check('envía rubro elegido, WhatsApp, nombre, origen y visita', c.token === TOK && c.category_id === 201 && c.whatsapp === '981123456' && c.name === 'Ana Pérez' && c.src === 'wa' && c.v === log.info[0].v, JSON.stringify(c));
    check('correo vacío no se manda como dato (es opcional)', !c.email);
    check('entra a Mi Portal', p.url().endsWith('/cliente/') && await vis(p, '#portal'), p.url());
    const ls = await p.evaluate(() => ({ t: localStorage.getItem('token'), u: localStorage.getItem('user'), w: localStorage.getItem('retopa_welcome') }));
    check('deja la sesión y activa el asistente/tour de Mi Portal', ls.t === 'jwt.tok.en' && /Ana Pérez/.test(ls.u) && ls.w === '1', JSON.stringify(ls));
    check('sin errores de script', errs.length === 0, errs.join(' | '));
    await ctx.close(); server.close();
  }

  // ── 2) WhatsApp inválido y correo ya usado ──────────────────────────────────
  {
    const { server, log, ctx, p } = await open(browser, { emailExists: true });
    await p.waitForSelector('#stateClaim:not(.hide)');
    await p.click('#btnYes');
    await p.fill('#inputWa', '021 555 555'); await p.fill('#inputName', 'Beto');
    await p.click('#btnSubmit'); await p.waitForTimeout(150);
    check('teléfono fijo → aviso de WhatsApp y form_error whatsapp_invalid', await vis(p, '#errWa') && log.events.some(e => e.reason === 'whatsapp_invalid') && log.confirm.length === 0);
    await p.fill('#inputWa', '0982 000 111');
    await p.fill('#inputEmail', 'ya@usado.com');
    await p.click('#btnSubmit'); await p.waitForTimeout(300);
    check('correo de otra cuenta → mensaje claro bajo el correo, sigue en la página', /Dejalo vacío para seguir/.test(await p.locator('#errEmail').innerText()) && await vis(p, '#formCard'));
    check('el botón vuelve a estar disponible', await p.isEnabled('#btnSubmit'));
    await ctx.close(); server.close();
  }

  // ── 3) "No, no es mío" ──────────────────────────────────────────────────────
  {
    const { server, log, ctx, p } = await open(browser, {});
    await p.waitForSelector('#stateClaim:not(.hide)');
    await p.click('#btnNo');
    check('"No" pide confirmación (sin diálogos del navegador)', await vis(p, '#notMineConfirm'));
    await p.click('#notMineConfirm .btn-main');
    await p.waitForSelector('#stateNotMine:not(.hide)');
    check('confirma → avisa al backend con token y origen', log.notMine.length === 1 && log.notMine[0].token === TOK && log.notMine[0].src === 'wa');
    check('pantalla de agradecimiento', /Gracias por avisarnos/.test(await p.locator('#stateNotMine').innerText()));
    await ctx.close(); server.close();
  }

  // ── 4) Ya tiene dueño / sin sugerencia / sin token ─────────────────────────
  {
    let s = await open(browser, { claimed: true });
    await s.p.waitForSelector('#stateError:not(.hide)');
    check('ficha con dueño → "ya tiene dueño" + Entrar a mi panel', /ya tiene dueño/.test(await s.p.locator('#stateError').innerText()) && (await s.p.getAttribute('#errorCta', 'href')) === '/?login=1');
    await s.ctx.close(); s.server.close();

    s = await open(browser, { noSuggestion: true });
    await s.p.waitForSelector('#stateClaim:not(.hide)');
    await s.p.click('#btnYes');
    check('sin sugerencia → buscador visible de entrada, sin preselección', await vis(s.p, '#rubroSearch') && !(await vis(s.p, '#rubroChosen')));
    check('sin celular en la ficha → WhatsApp vacío para completar', (await s.p.inputValue('#inputWa')) === '');
    await s.p.fill('#inputName', 'Caro'); await s.p.fill('#inputWa', '0971 111 222');
    await s.p.click('#btnSubmit'); await s.p.waitForTimeout(150);
    check('sin rubro elegido → aviso y form_error rubro_missing', await vis(s.p, '#errRubro') && s.log.events.some(e => e.reason === 'rubro_missing') && s.log.confirm.length === 0);
    const overflow = await s.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('390px sin scroll horizontal', overflow <= 0, 'overflow=' + overflow);
    await s.p.screenshot({ path: path.join(__dirname, 'reclamar_e1_390.png'), fullPage: true });
    await s.ctx.close(); s.server.close();

    s = await open(browser, {}, '');
    await s.p.waitForSelector('#stateError:not(.hide)');
    check('sin token → explica que falta el enlace', /Falta el enlace/.test(await s.p.locator('#stateError').innerText()));
    await s.ctx.close(); s.server.close();
  }

  await browser.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
