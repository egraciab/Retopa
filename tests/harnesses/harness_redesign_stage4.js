// Rediseño mobile — ETAPA 4 (Ficha): barra de acciones FIJA (Llamar/WhatsApp/
// Llegar ≥48px), rating "Sin reseñas aún" (sin "0.0"), redes sociales presentes.
// Usa el openProfile REAL de profile.js. 390×844.
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

  // Instalar mock de apiGet ANTES de abrir la ficha.
  await p.evaluate(() => {
    window.__biz = null;
    window.apiGet = async (u) => {
      const pathOnly = String(u).split('?')[0];
      if (/\/businesses\/[^/]+$/.test(pathOnly)) return { success: true, data: window.__biz };
      return { success: true, data: [] };
    };
  });

  const bizNoRev = {
    slug: 'ferreteria-norte', name: 'Ferretería Norte', tradeName: 'Ferretería Norte',
    categoryName: 'Ferretería', categorySlug: 'ferreteria', city: 'Asunción', address: 'Av. España 123',
    verified: true, planType: 'premium', reviewCount: 0, rating: 0,
    phone: '0981 620 195', whatsapp: '595981620195', lat: -25.29, lng: -57.61,
    socialInstagram: 'ferrenorte', socialFacebook: 'ferrenorte',
    hoursJson: null, gallery: [], tags: ['Herramientas','Pinturas'],
  };

  const A = await p.evaluate(async (biz) => {
    window.__biz = biz;
    await openProfile(biz.slug);
    await new Promise(r => setTimeout(r, 500));
    const modal = document.getElementById('profileModal');
    const bar = document.querySelector('#profileModal .rp-ficha-actions');
    const barRect = bar ? bar.getBoundingClientRect() : null;
    const acts = bar ? [...bar.querySelectorAll('.rp-fa')] : [];
    const minH = acts.length ? Math.min(...acts.map(a => Math.round(a.getBoundingClientRect().height))) : 0;
    const labels = acts.map(a => a.textContent.replace(/\s+/g,' ').trim());
    const href = re => { const a = acts.find(x => re.test(x.textContent)); return a ? a.getAttribute('href') : ''; };
    const modalText = document.getElementById('modalContent').textContent;
    const socials = [...document.querySelectorAll('#modalContent a[href*="instagram.com"], #modalContent a[href*="facebook.com"]')].map(a => a.getAttribute('href'));
    const spacer = !!document.querySelector('#modalContent .lg\\:hidden[aria-hidden="true"]');
    const zClass = modal.className;
    return {
      modalOpen: modal && !modal.classList.contains('hidden'),
      zRaised: /z-\[85\]/.test(zClass),
      barExists: !!bar, barBottom: barRect ? Math.round(barRect.bottom) : 0, barDisplay: bar ? getComputedStyle(bar).display : 'none',
      minH, labels,
      callHref: href(/Llamar/), waHref: href(/WhatsApp/), mapsHref: href(/Llegar/),
      sinResenas: /Sin reseñas aún/.test(modalText),
      hasZeroZero: /\b0\.0\b/.test(modalText),
      socialsCount: socials.length, socials,
      spacer,
    };
  }, bizNoRev);

  check('la ficha (modal) se abre', A.modalOpen === true);
  check('modal por encima de la barra inferior (z-[85])', A.zRaised === true);
  check('barra de acciones FIJA presente y visible', A.barExists && A.barDisplay === 'flex');
  check('barra fijada al pie (bottom ≈ viewport)', A.barBottom >= 820, 'bottom=' + A.barBottom);
  check('acciones ≥48px de alto', A.minH >= 48, 'minH=' + A.minH);
  check('acciones: Llamar + WhatsApp + Llegar', A.labels.some(l=>/Llamar/.test(l)) && A.labels.some(l=>/WhatsApp/.test(l)) && A.labels.some(l=>/Llegar/.test(l)), A.labels.join(' | '));
  check('Llamar tel: / WhatsApp wa / Llegar maps', /^tel:/.test(A.callHref) && /wa\.me|whatsapp/.test(A.waHref) && /google\.com\/maps/.test(A.mapsHref), `${A.callHref} · ${A.waHref} · ${A.mapsHref}`);
  check('CRITERIO #4: rating "Sin reseñas aún" (sin "0.0")', A.sinResenas === true && A.hasZeroZero === false);
  check('redes sociales presentes (Instagram + Facebook, plan premium)', A.socialsCount >= 2, 'n=' + A.socialsCount);
  check('espaciador para que la barra no tape el contenido', A.spacer === true);

  // Escenario B: con reseñas → muestra el número, no "Sin reseñas aún".
  const B = await p.evaluate(async (biz) => {
    window.__biz = biz;
    await openProfile(biz.slug);
    await new Promise(r => setTimeout(r, 300));
    const t = document.getElementById('modalContent').textContent;
    return { showsRating: /4\.6/.test(t), noSinResenas: !/Sin reseñas aún/.test(t), noZero: !/\b0\.0\b/.test(t) };
  }, { ...bizNoRev, slug: 'con-rev', reviewCount: 8, rating: 4.6 });
  check('con reseñas muestra el rating (4.6) y no "Sin reseñas aún"', B.showsRating && B.noSinResenas && B.noZero);

  // Escenario C: plan básico → 0 redes sociales (gating de monetización preservado).
  const C = await p.evaluate(async (biz) => {
    window.__biz = biz;
    await openProfile(biz.slug);
    await new Promise(r => setTimeout(r, 300));
    const socials = [...document.querySelectorAll('#modalContent a[href*="instagram.com"], #modalContent a[href*="facebook.com"]')];
    const bar = document.querySelector('#profileModal .rp-ficha-actions');
    return { socials: socials.length, barExists: !!bar };
  }, { ...bizNoRev, slug: 'basico', planType: 'basic' });
  check('plan básico: 0 redes (gating preservado) pero la barra de acciones sigue', C.socials === 0 && C.barExists === true, 'socials=' + C.socials);

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
