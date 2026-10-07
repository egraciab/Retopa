// Rediseño mobile — ETAPA 2.2: registro SIN login forzado (pide correo de
// gestión) y SIN selector de plan (abre directo al form). 390×844.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = '/root/work/opt/retopa/frontend';
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const MIME = { '.html':'text/html;charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };
function serve(req, res) {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p.startsWith('/api')) { res.writeHead(404); return res.end('{}'); }
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
}
(async () => {
  const server = http.createServer(serve);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1')) return route.continue();
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + '/', { waitUntil: 'load' });
  await p.waitForTimeout(300);

  const myErrs = errs.filter(e => /SyntaxError|openRegistro|selectPlan|is not a function|is not defined|Cannot read/.test(e));
  check('sin errores de script propios al cargar', myErrs.length === 0, myErrs.join(' | '));

  // ---- ESCENARIO A: sin sesión → abre directo al form, sin login, sin plan ----
  const A = await p.evaluate(() => {
    try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch(e){}
    if (typeof currentUser !== 'undefined') { try { currentUser = null; } catch(e){} }
    openRegistroEmpresaCheck();
    const vis = el => el && getComputedStyle(el).display !== 'none' && !el.classList.contains('hidden');
    const modal = document.getElementById('registroModal');
    const stepPlan = document.getElementById('stepPlan');
    const form = document.getElementById('registroForm');
    const login = document.getElementById('loginModal');
    const emailEl = document.getElementById('bizRegEmail');
    const cancelBtn = [...(form ? form.querySelectorAll('button') : [])].find(b => /Cancelar/i.test(b.textContent));
    return {
      modalOpen: modal ? !modal.classList.contains('hidden') : false,
      stepPlanHidden: stepPlan ? stepPlan.classList.contains('hidden') : true,
      formVisible: vis(form),
      loginHidden: login ? login.classList.contains('hidden') : true,
      emailExists: !!emailEl, emailType: emailEl ? emailEl.type : '', emailRequired: emailEl ? emailEl.required : null,
      cancelBtn: !!cancelBtn,
      backToPlanIsClose: (typeof backToPlan === 'function'),
    };
  });
  check('abre el modal de registro', A.modalOpen);
  check('el paso de PLAN queda oculto (no se muestra selector)', A.stepPlanHidden);
  check('el formulario corto se muestra directo', A.formVisible);
  check('NO se abre el modal de login', A.loginHidden);
  check('campo de correo presente (bizRegEmail, type=email, required)',
    A.emailExists && A.emailType === 'email' && A.emailRequired === true);
  check('botón "Cancelar" (ya no "Atrás")', A.cancelBtn);

  // ---- ESCENARIO B: submit SIN sesión arma el lead correcto (sin user_id) ----
  const B = await p.evaluate(async () => {
    // Capturar el POST sin tocar red
    window.__lastPost = null;
    window.apiPost = async (url, body) => { window.__lastPost = { url, body }; return { success: true }; };
    // Rellenar mínimos
    document.getElementById('bizTradeName').value = 'Cerrajería El Rápido';
    document.getElementById('bizWhatsapp').value = '981 620 195';
    document.getElementById('bizWaPrefix').value = '595';
    document.getElementById('bizRegEmail').value = 'DueNo@Correo.com';
    const chk = document.querySelector('#registroForm input[type="checkbox"]'); if (chk) chk.checked = true;
    // Disparar submit (bypassa validación nativa; corre el handler)
    document.getElementById('registroForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 60));
    const post = window.__lastPost;
    const successVisible = !document.getElementById('registroSuccess').classList.contains('hidden');
    const successEmail = (document.getElementById('successEmail')||{}).textContent || '';
    return { post, successVisible, successEmail };
  });
  check('el submit llamó a /leads', B.post && B.post.url === '/leads', B.post ? B.post.url : 'null');
  const body = (B.post && B.post.body) || {};
  check('SIN user_id (ficha sin dueño hasta engancharla)', !('user_id' in body), 'user_id=' + body.user_id);
  check('email = correo escrito (normalizado a minúsculas)', body.email === 'dueno@correo.com', 'email=' + body.email);
  check('contact_email = mismo correo', body.contact_email === 'dueno@correo.com', 'contact_email=' + body.contact_email);
  check('contact_name = nombre del negocio (sin sesión)', body.contact_name === 'Cerrajería El Rápido', 'contact_name=' + body.contact_name);
  check('phone y contact_phone = WhatsApp con prefijo', body.phone === '595981620195' && body.contact_phone === '595981620195', 'phone=' + body.phone);
  check('name/trade_name = nombre del negocio', body.name === 'Cerrajería El Rápido' && body.trade_name === 'Cerrajería El Rápido');
  check('plan_type = basic por defecto', body.plan_type === 'basic', 'plan=' + body.plan_type);
  check('pantalla de éxito muestra el correo', B.successVisible && /dueno@correo\.com/.test(B.successEmail), B.successEmail);

  // ---- ESCENARIO C: correo inválido bloquea el envío ----
  const C = await p.evaluate(async () => {
    // reabrir form
    openRegistroEmpresaCheck();
    window.__lastPost = null;
    window.apiPost = async (url, body) => { window.__lastPost = { url, body }; return { success: true }; };
    document.getElementById('bizTradeName').value = 'Test';
    document.getElementById('bizWhatsapp').value = '981000000';
    document.getElementById('bizRegEmail').value = 'no-es-un-correo';
    let alertMsg = null; const _a = window.alert; window.alert = m => { alertMsg = m; };
    document.getElementById('registroForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 40));
    window.alert = _a;
    return { posted: !!window.__lastPost, alertMsg };
  });
  check('correo inválido NO envía y avisa', C.posted === false && /correo/i.test(C.alertMsg || ''), 'alert=' + C.alertMsg);

  // ---- ESCENARIO D: con sesión, se vincula user_id ----
  const D = await p.evaluate(async () => {
    try {
      localStorage.setItem('token', 'x.y.z');
      localStorage.setItem('user', JSON.stringify({ id: 42, name: 'Ana Gómez', email: 'ana@empresa.com' }));
    } catch(e){}
    openRegistroEmpresaCheck();
    const prefilled = document.getElementById('bizRegEmail').value;
    window.__lastPost = null;
    window.apiPost = async (url, body) => { window.__lastPost = { url, body }; return { success: true }; };
    document.getElementById('bizTradeName').value = 'Panadería Ana';
    document.getElementById('bizWhatsapp').value = '971111111';
    // dejamos el correo prellenado de la sesión
    document.getElementById('registroForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 60));
    return { prefilled, body: (window.__lastPost||{}).body };
  });
  check('con sesión, prellena el correo del usuario', D.prefilled === 'ana@empresa.com', 'prefilled=' + D.prefilled);
  check('con sesión, envía user_id para enganchar la ficha', D.body && D.body.user_id === 42, 'user_id=' + (D.body||{}).user_id);
  check('con sesión, contact_name = nombre del usuario', D.body && D.body.contact_name === 'Ana Gómez', 'contact_name=' + (D.body||{}).contact_name);

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
