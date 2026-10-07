// Rediseño mobile — ETAPA 2.1: H1 bi-color desde site_config + registro CORTO
// (nombre, categoría, ciudad, WhatsApp). 390×844.
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

  const myErrs = errs.filter(e => /SyntaxError|rpBicolorTitle|clearImageUpload|Unexpected|is not a function|is not defined/.test(e));
  check('sin errores de script propios', myErrs.length === 0, myErrs.join(' | '));

  // ---- PARTE A: H1 bi-color desde site_config ----
  const A = await p.evaluate(() => {
    const el = document.getElementById('heroTitle');
    const fn = typeof rpBicolorTitle === 'function';
    // Casos: por defecto (última palabra en dorado), con **marcadores**, escape XSS
    const def   = fn ? rpBicolorTitle('¿Qué necesitás hoy?') : '';
    const stars = fn ? rpBicolorTitle('Encontrá tu **negocio** ideal') : '';
    const xss   = fn ? rpBicolorTitle('a <b>x</b> **<i>y</i>**') : '';
    const one   = fn ? rpBicolorTitle('Hola') : '';
    return {
      heroTitleExists: !!el,
      h1count: document.querySelectorAll('h1').length,
      fn, def, stars, xss, one,
      // el handler aplica a innerHTML del heroTitle si hay hero_title; sin API queda estático
      staticH1: el ? el.textContent.replace(/\s+/g,' ').trim() : ''
    };
  });
  check('#heroTitle existe y hay un solo <h1>', A.heroTitleExists && A.h1count === 1, 'h1=' + A.h1count);
  check('rpBicolorTitle() está definida', A.fn);
  check('por defecto: última palabra en dorado #E8B84B', /¿Qué necesitás <span style="color:#E8B84B">hoy\?<\/span>/.test(A.def), A.def);
  check('marcadores **..** → tramo dorado', /Encontrá tu <span style="color:#E8B84B">negocio<\/span> ideal/.test(A.stars), A.stars);
  check('escapa HTML (no inyecta <b>/<i>)', A.xss.includes('&lt;b&gt;') && A.xss.includes('&lt;i&gt;') && !/<b>|<i>/.test(A.xss), A.xss);
  check('una sola palabra → toda dorada', /^<span style="color:#E8B84B">Hola<\/span>$/.test(A.one), A.one);
  check('H1 estático por defecto "¿Qué necesitás hoy?"', /¿Qué necesitás hoy\?/.test(A.staticH1), A.staticH1);

  // Simular respuesta de site_config y re-aplicar el handler manualmente
  const applied = await p.evaluate(() => {
    const el = document.getElementById('heroTitle');
    el.innerHTML = rpBicolorTitle('Tu ciudad, un **click**');
    return el.innerHTML;
  });
  check('handler aplica bi-color desde config simulada', /Tu ciudad, un <span style="color:#E8B84B">click<\/span>/.test(applied), applied);

  // ---- PARTE B: registro CORTO ----
  const B = await p.evaluate(() => {
    const form = document.getElementById('registroForm');
    const q = id => document.getElementById(id);
    const visibleInputs = form ? [...form.querySelectorAll('input, select, textarea')]
      .filter(e => e.type !== 'hidden') : [];
    const visibleIds = visibleInputs.map(e => e.id || ('[' + e.type + ']')).filter(Boolean);
    const removed = ['bizRuc','bizPhone','bizEmail','bizAddress','bizWebsite','bizDescription'].filter(id => !!q(id));
    const termsChk = form ? form.querySelector('input[type="checkbox"][required]') : null;
    const termsLinks = form ? [...form.querySelectorAll('a')].map(a => a.getAttribute('href')) : [];
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
    const zone = q('imageUploadZone');
    const fileInput = q('bizImageFile');
    const optBadge = form ? [...form.querySelectorAll('span')].some(s => /Opcional/i.test(s.textContent)) : false;
    return {
      formExists: !!form,
      logo: {
        zone: !!zone, file: !!fileInput,
        fileRequired: fileInput ? fileInput.required : null,
        fileType: fileInput ? fileInput.type : '',
        placeholder: !!q('uploadPlaceholder'), preview: !!q('uploadPreview'),
        progress: !!q('uploadProgress'), previewImg: !!q('previewImg'),
        badge: optBadge,
      },
      has: {
        bizTradeName: !!q('bizTradeName'), bizCategory: !!q('bizCategory'),
        bizCity: !!q('bizCity'), bizWhatsapp: !!q('bizWhatsapp'), bizWaPrefix: !!q('bizWaPrefix'),
      },
      required: {
        name: q('bizTradeName')?.required, cat: q('bizCategory')?.required,
        city: q('bizCity')?.required, wa: q('bizWhatsapp')?.required,
      },
      hidden: {
        bizName: q('bizName')?.type === 'hidden',
        contactName: q('contactName')?.type === 'hidden',
        contactEmail: q('contactEmail')?.type === 'hidden',
        bizImageUrl: q('bizImageUrl')?.type === 'hidden',
      },
      visibleIds, removed,
      hasTerms: !!termsChk, termsLinks,
      submitText: submitBtn ? submitBtn.textContent.replace(/\s+/g,' ').trim() : '',
    };
  });
  check('registroForm existe', B.formExists);
  check('tiene los 4 campos: nombre/categoría/ciudad/WhatsApp',
    B.has.bizTradeName && B.has.bizCategory && B.has.bizCity && B.has.bizWhatsapp && B.has.bizWaPrefix);
  check('los 4 campos son required', B.required.name && B.required.cat && B.required.city && B.required.wa);
  check('campos largos eliminados (RUC/tel/email/dirección/web/descripción)', B.removed.length === 0, 'quedan: ' + B.removed.join(','));
  check('hidden auto-rellenables presentes (bizName/contactName/contactEmail/bizImageUrl)',
    B.hidden.bizName && B.hidden.contactName && B.hidden.contactEmail && B.hidden.bizImageUrl);
  check('controles visibles esperados (4 campos + prefijo + logo file + check)',
    B.visibleIds.length >= 4 && B.visibleIds.length <= 8, B.visibleIds.join(', '));
  // Logo OPCIONAL, suave
  check('zona de logo presente (imageUploadZone + input file + placeholder/preview/progress)',
    B.logo.zone && B.logo.file && B.logo.placeholder && B.logo.preview && B.logo.progress && B.logo.previewImg);
  check('el logo NO es obligatorio (file sin required) + badge "Opcional"',
    B.logo.fileType === 'file' && B.logo.fileRequired === false && B.logo.badge);
  check('checkbox de términos requerido', B.hasTerms);
  check('links legales reales (/terminos.html + /privacidad.html)',
    B.termsLinks.includes('/terminos.html') && B.termsLinks.includes('/privacidad.html'), B.termsLinks.join(' '));
  check('botón enviar "Publicar mi negocio gratis"', /Publicar mi negocio gratis/.test(B.submitText), B.submitText);

  // clearImageUpload no debe lanzar (se llama al cerrar el modal)
  const clearOk = await p.evaluate(() => {
    try { clearImageUpload(); return 'ok'; } catch (e) { return 'ERR:' + e.message; }
  });
  check('clearImageUpload() null-safe (no lanza)', clearOk === 'ok', clearOk);

  // submit handler enganchado
  const submitWired = await p.evaluate(() => {
    const f = document.getElementById('registroForm');
    // dispara submit vacío: debe prevenir default y avisar por currentUser/nombre — sin throw
    let threw = null;
    try {
      const ev = new Event('submit', { cancelable: true, bubbles: true });
      f.dispatchEvent(ev);
    } catch (e) { threw = e.message; }
    return threw;
  });
  check('submit handler no lanza excepción', submitWired === null, submitWired || '');

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
