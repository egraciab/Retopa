// Rediseño mobile — Incremento 1 (chrome global + barra inferior + fixes).
// Sirve el frontend REAL (con Tailwind compilado) a 390×844 y valida la spec.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = '/root/work/opt/retopa/frontend';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const MIME = { '.html':'text/html;charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json', '.ico':'image/x-icon', '.webp':'image/webp' };
function serve(req, res) {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p.startsWith('/api')) { res.writeHead(404); return res.end('{}'); }
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
}

(async () => {
  const server = http.createServer(serve);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // Recursos externos (Google Fonts, cdnjs) no tunelan por el proxy del harness y
  // colgarían el parser. Se responden vacíos: no afectan el layout (Tailwind y las
  // clases rp-* son locales). En producción cargan normalmente.
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1')) return route.continue();
    const t = route.request().resourceType();
    if (t === 'stylesheet') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (t === 'script')     return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    if (t === 'font')       return route.fulfill({ status: 200, contentType: 'font/woff2', body: '' });
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + '/', { waitUntil: 'load' });
  await p.waitForTimeout(300);

  // Sin errores de MI código (los de backend ausente no cuentan)
  const myErrs = errs.filter(e => /SyntaxError|rp[A-Z]|rpBottomNav|Unexpected/.test(e));
  check('sin errores de script propios', myErrs.length === 0, myErrs.join(' | '));

  const R = await p.evaluate(() => {
    const q = s => document.querySelector(s);
    const gcs = el => el ? getComputedStyle(el) : null;
    const vis = el => !!el && !!el.offsetParent && gcs(el).display !== 'none';
    const rect = el => el ? el.getBoundingClientRect() : null;
    // topbar / fab
    const topbar = [...document.querySelectorAll('div')].some(d => /bg-brand-950/.test(d.className) && /Soporte|Paraguay/.test(d.textContent));
    const fab = !!document.getElementById('whatsappFab');
    // h1
    const h1s = [...document.querySelectorAll('h1')];
    // wordmark en header
    const wm = q('#navbar .font-black');
    // header height
    const hdr = q('#navbar div[style*="height:60px"]');
    // botones header
    const btns = [...document.querySelectorAll('#authButtons button')];
    const regBtn = btns.find(b => /openRegistroEmpresaCheck/.test(b.getAttribute('onclick') || ''));
    const ingBtn = btns.find(b => /openLoginModal/.test(b.getAttribute('onclick') || ''));
    // bottom nav
    const nav = q('#rpBottomNav');
    const navLinks = nav ? [...nav.querySelectorAll('a')] : [];
    const navPos = nav ? gcs(nav).position : '';
    const navRect = rect(nav);
    const bodyStyle = document.body ? getComputedStyle(document.body) : null;
    const bodyPB = bodyStyle ? (parseFloat(bodyStyle.paddingBottom) || 0) : -1;
    // links
    const term = q('a[href="/terminos.html"]'), priv = q('a[href="/privacidad.html"]');
    const footerTerm = q('footer a[href="/terminos.html"]');
    // helpers
    const fmt = (typeof rpFmtInt === 'function') ? rpFmtInt(14468) : null;
    const fmtGs = (typeof rpFmtGs === 'function') ? rpFmtGs(199000) : null;
    return {
      topbar, fab,
      h1count: h1s.length, h1id: h1s[0] ? h1s[0].id : null,
      wmTag: wm ? wm.tagName : null,
      hdrH: hdr ? Math.round(rect(hdr).height) : null,
      regHidden: regBtn ? gcs(regBtn).display === 'none' : null,
      ingVisible: vis(ingBtn), ingH: ingBtn ? Math.round(rect(ingBtn).height) : 0, ingTxt: ingBtn ? ingBtn.textContent.trim() : '',
      navExists: !!nav, navPos, navBottom: navRect ? Math.round(navRect.bottom) : null, navTop: navRect ? Math.round(navRect.top) : null,
      navLabels: navLinks.map(a => a.textContent.trim()),
      bodyPB, hasBottomNavClass: document.body.classList.contains('rp-has-bottomnav'),
      term: !!term, priv: !!priv, footerTerm: !!footerTerm,
      fmt, fmtGs, mainSearch: !!q('#mainSearch'),
    };
  });

  check('barra superior "Paraguay/Soporte" eliminada', R.topbar === false);
  check('FAB de WhatsApp eliminado', R.fab === false);
  check('exactamente un <h1> en la home (el del hero)', R.h1count === 1, `n=${R.h1count}`);
  check('el wordmark del header NO es <h1> (es DIV)', R.wmTag === 'DIV', 'tag=' + R.wmTag);
  check('header mide 60px', R.hdrH === 60, 'h=' + R.hdrH);
  check('botón "Registrar" oculto en mobile (hidden lg:flex)', R.regHidden === true, 'display none? ' + R.regHidden);
  check('"Ingresar" visible con texto y ≥44px', R.ingVisible && /Ingresar/.test(R.ingTxt) && R.ingH >= 44, `vis=${R.ingVisible} h=${R.ingH} txt="${R.ingTxt}"`);
  check('barra inferior existe y es fixed', R.navExists && R.navPos === 'fixed');
  check('barra inferior pegada al fondo (bottom ≈ 844)', R.navBottom !== null && Math.abs(R.navBottom - 844) <= 2, 'bottom=' + R.navBottom);
  check('barra inferior 4 ítems (Guardados off): Inicio/Buscar/Ofertas/Mi negocio', R.navLabels.length === 4 && /Inicio/.test(R.navLabels[0]) && /Buscar/.test(R.navLabels[1]) && /Ofertas/.test(R.navLabels[2]) && /Mi negocio/.test(R.navLabels[3]), R.navLabels.join(' | '));
  check('body reserva padding para la barra (≥70px)', R.bodyPB >= 70 && R.hasBottomNavClass, 'pb=' + R.bodyPB);
  check('barra no tapa contenido (top de la barra ≥ body padding)', R.navTop >= 844 - 72, 'top=' + R.navTop);
  check('links reales de Términos y Privacidad en el registro', R.term && R.priv);
  check('footer tiene enlace real a Términos', R.footerTerm);
  check('números es-PY: rpFmtInt(14468)="14.468"', R.fmt === '14.468', 'got=' + R.fmt);
  check('números es-PY: rpFmtGs(199000)="Gs. 199.000"', R.fmtGs === 'Gs. 199.000', 'got=' + R.fmtGs);
  check('input de búsqueda #mainSearch presente', R.mainSearch);

  // Páginas legales cargan y responden 200 con título
  for (const [pth, ttl] of [['/terminos.html', 'Términos'], ['/privacidad.html', 'Política de privacidad']]) {
    const pg = await ctx.newPage();
    const resp = await pg.goto(base + pth, { waitUntil: 'load' });
    const okTitle = await pg.evaluate(() => document.querySelector('h1') ? document.querySelector('h1').textContent : '');
    check(`${pth} responde 200 y tiene H1 "${ttl}"`, resp.status() === 200 && okTitle.includes(ttl), `status=${resp.status()} h1="${okTitle}"`);
    await pg.close();
  }

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  if (errs.length) console.log('(errores de página, informativos):\n  ' + errs.slice(0, 6).join('\n  '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
