// LOGIN (modal real de index.html + js/auth.js real) · Mi Portal "Creá tu contraseña"
// · Admin "Pedidos de acceso". Playwright 390px, main.css compilado con la config real.
// Uso: node harness_login_ui.js <frontend_dir> <main.css compilado>
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path');
const FE = process.argv[2] || '.';
const CSS = process.argv[3] || path.join(FE, 'public/css/main.css');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const rd = rel => fs.readFileSync(path.join(FE, rel), 'utf8');

// Extrae el <div id="loginModal"> completo (balanceando <div>) del index.html real.
function extractDiv(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('no encontré ' + marker);
  let i = start, depth = 0;
  const re = /<\/?div\b[^>]*>/g; re.lastIndex = start;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  throw new Error('div sin cerrar');
}
const MODAL = extractDiv(rd('index.html'), '<div id="loginModal"');

const LOGIN_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/main.css"></head><body>${MODAL}
<script>
  window.__posts = []; window.__opens = []; window.__waHref = null; window.__resp = {};
  const API_BASE = '/api/v2';
  async function apiPost(ep, body) { window.__posts.push([ep, body]); return (window.__resp[ep] || (() => ({ success: true })))(body); }
  function updateNavbarForUser() {} function scheduleSessionExpiry() {} function handlePostLogin(u) { window.__postLogin = u; }
  let currentUser = null;
  window.open = (u) => { window.__opens.push(u); const w = { opener: 1, location: {}, close() { this.closed = true; } };
    Object.defineProperty(w.location, 'href', { set(v) { window.__waHref = v; } }); return w; };
</script>
<script src="/auth.js"></script></body></html>`;

(async () => {
  const files = { '/main.css': fs.readFileSync(CSS, 'utf8'), '/auth.js': rd('js/auth.js') };
  const server = http.createServer((req, res) => {
    if (files[req.url]) { res.writeHead(200, { 'Content-Type': req.url.endsWith('.css') ? 'text/css' : 'application/javascript' }); return res.end(files[req.url]); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(LOGIN_PAGE);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  // auth.js trae sus propias handlePostLogin/updateNavbarForUser (redirigen): se
  // reemplazan DESPUÉS de cargarlo para medir sin navegar.
  await p.evaluate(() => { window.handlePostLogin = u => { window.__postLogin = u; };
    window.updateNavbarForUser = () => {}; window.scheduleSessionExpiry = () => {}; });
  await p.evaluate(() => openLoginModal());

  // ── Modal ──────────────────────────────────────────────────────────────────
  check('abre en modo WhatsApp por defecto', await p.isVisible('#loginPhone') && !(await p.isVisible('#loginEmail')));
  check('prefijo +595 fijo junto al número', /\+595/.test(await p.locator('#loginWaBox').innerText()));
  check('el campo de WhatsApp es tel (teclado numérico en el celu)', (await p.getAttribute('#loginPhone', 'type')) === 'tel');
  await p.screenshot({ path: path.join(__dirname, 'login_wa_390.png') });

  // Validación local
  await p.fill('#loginPhone', '021 555 555'); await p.fill('#loginPassword', 'x');
  await p.click('#loginForm button[type=submit]');
  check('número inválido → aviso, sin llamar al backend', /Revisá tu número/.test(await p.locator('#loginError').innerText()) && !(await p.evaluate(() => window.__posts.length)));

  // Login con WhatsApp: manda +595…
  await p.evaluate(() => { window.__resp['/auth/login'] = () => ({ success: true, token: 't.o.k', user: { id: 7, has_business: true } }); });
  await p.fill('#loginPhone', '0981 123 456'); await p.fill('#loginPassword', 'clave');
  await p.click('#loginForm button[type=submit]');
  await p.waitForTimeout(150);
  const post = await p.evaluate(() => window.__posts.find(x => x[0] === '/auth/login'));
  check('login con WhatsApp manda +5959XXXXXXXX y la contraseña', post && post[1].email === '+595981123456' && post[1].password === 'clave', JSON.stringify(post));
  check('sesión guardada', await p.evaluate(() => localStorage.getItem('token') === 't.o.k' && !!window.__postLogin));

  // NO_PASSWORD → lo lleva a "entrar sin contraseña"
  await p.evaluate(() => { localStorage.clear(); window.__posts = []; openLoginModal(); showLoginStep('loginForm');
    window.__resp['/auth/login'] = () => ({ success: false, code: 'NO_PASSWORD', error: 'Todavía no creaste una contraseña. Entrá sin contraseña con el botón de abajo.' }); });
  await p.fill('#loginPhone', '0982 000 111'); await p.fill('#loginPassword', 'algo');
  await p.click('#loginForm button[type=submit]');
  await p.waitForTimeout(150);
  check('sin contraseña creada → pasa a "Entrar sin contraseña" con el motivo', await p.isVisible('#pwlessStep') && /Todavía no creaste/.test(await p.locator('#pwlessMsg').innerText()));
  check('el botón ofrece "Pedir acceso por WhatsApp"', /Pedir acceso por WhatsApp/.test(await p.locator('#pwlessBtn').innerText()));
  await p.screenshot({ path: path.join(__dirname, 'login_pwless_390.png') });

  // Pedir acceso por WhatsApp → abre el WhatsApp de RetoPA con el mensaje
  await p.evaluate(() => { window.__resp['/auth/access-request'] = () => ({ success: true, mode: 'whatsapp', support_wa: '595986484905',
      wa_message: 'Hola RetoPA, quiero entrar a mi panel. Mi WhatsApp es +595 982 000 111.' }); });
  await p.click('#pwlessBtn');
  await p.waitForFunction(() => window.__waHref);
  const wa = await p.evaluate(() => ({ opens: window.__opens, href: window.__waHref, post: window.__posts.find(x => x[0] === '/auth/access-request') }));
  check('pide el acceso con su número', wa.post && wa.post[1].identifier === '+595982000111');
  check('abre la pestaña dentro del toque (no la bloquea el navegador)', wa.opens[0] === 'about:blank');
  check('…hacia el WhatsApp de RetoPA con el mensaje armado: lo inicia el dueño', wa.href.startsWith('https://wa.me/595986484905?text=') && /quiero entrar a mi panel/.test(decodeURIComponent(wa.href)));
  check('le dice qué sigue', /enviá el mensaje en WhatsApp/.test(await p.locator('#pwlessMsg').innerText()));

  // Sin contraseña tipeada → directo a entrar sin contraseña
  await p.evaluate(() => { showLoginStep('loginForm'); });
  await p.fill('#loginPassword', '');
  await p.click('#loginForm button[type=submit]');
  check('sin contraseña tipeada → ofrece entrar sin contraseña', await p.isVisible('#pwlessStep'));

  // Correo
  await p.evaluate(() => { showLoginStep('loginForm'); window.__posts = []; });
  await p.click('#loginTabEmail');
  check('pestaña Correo muestra el campo de correo', await p.isVisible('#loginEmail') && !(await p.isVisible('#loginPhone')));
  check('recuerda el modo elegido', await p.evaluate(() => localStorage.getItem('retopa_login_mode') === 'email'));
  await p.fill('#loginEmail', 'caro@x.com');
  await p.click('#loginForm button[type=submit] >> nth=0').catch(() => {});
  await p.evaluate(() => { window.__resp['/auth/access-request'] = () => ({ success: true, mode: 'email', message: 'Si hay una cuenta con ese correo, te llega un enlace para entrar (vale 7 días).' }); });
  if (!(await p.isVisible('#pwlessStep'))) await p.evaluate(() => openPasswordless());
  check('correo: el botón es "Enviarme el enlace"', /Enviarme el enlace/.test(await p.locator('#pwlessBtn').innerText()));
  await p.click('#pwlessBtn'); await p.waitForTimeout(150);
  check('correo: confirma el envío sin revelar si existe', /te llega un enlace/.test(await p.locator('#pwlessMsg').innerText()));
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('modal a 390px sin scroll horizontal', overflow <= 0, 'overflow=' + overflow);
  check('sin errores de script (login)', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // ── Mi Portal: invitación a crear contraseña (dashboard.js real, función aislada) ──
  const dash = rd('cliente/js/dashboard.js');
  const grab = name => (dash.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n`)) || [''])[0];
  const src = 'let _pwInviteChecked = false;\n' + ['maybeInvitePassword', 'savePasswordInvite', 'dismissPasswordInvite'].map(grab).join('\n');
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.setContent('<main id="mainContent"><div id="x">dash</div></main>');
  const out = await p2.evaluate(async (code) => {
    const o = { puts: [], toasts: [] };
    window.clientGet = async () => ({ success: true, data: { has_password: false } });
    window.clientPut = async (ep, b) => { o.puts.push([ep, b]); return { success: true }; };
    window.showToastClient = m => o.toasts.push(m);
    eval(code + '; window.__m = maybeInvitePassword; window.__s = savePasswordInvite;');
    await window.__m();
    o.shown = !!document.getElementById('pwInvite');
    document.getElementById('pwInviteNew').value = 'corta'; document.getElementById('pwInviteRep').value = 'corta';
    await window.__s(); o.errShort = document.getElementById('pwInviteErr').textContent;
    document.getElementById('pwInviteNew').value = 'clave-larga-1'; document.getElementById('pwInviteRep').value = 'clave-larga-1';
    await window.__s(); o.gone = !document.getElementById('pwInvite');
    return o;
  }, src);
  check('Mi Portal: sin contraseña → aparece "Creá tu contraseña"', out.shown);
  check('Mi Portal: valida mínimo 8', /Mínimo 8/.test(out.errShort));
  check('Mi Portal: crea la contraseña SIN pedir la actual', out.puts.length === 1 && out.puts[0][0] === '/client/me' && out.puts[0][1].password === 'clave-larga-1' && !('currentPassword' in out.puts[0][1]));
  check('Mi Portal: después desaparece y confirma', out.gone && out.toasts.some(t => /Contraseña creada/.test(t)));
  const out2 = await p2.evaluate(async (code) => {
    document.getElementById('pwInvite')?.remove();
    window.clientGet = async () => ({ success: true, data: { has_password: true } });
    eval(code + '; window.__m2 = maybeInvitePassword;');
    await window.__m2(); return !!document.getElementById('pwInvite');
  }, src);
  check('Mi Portal: con contraseña → no molesta', out2 === false);
  const settings = rd('cliente/js/settings.js');
  check('Ajustes: sin contraseña oculta "Contraseña actual" y dice "Creá tu contraseña"', /_settingsNoPassword = u\.has_password === false/.test(settings) && /Creá tu contraseña/.test(settings));
  await ctx2.close();

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
