// HOJA DE PRODUCTO / PROMO en celular (2026-10-15): en iPhone la cabecera (X,
// Compartir) quedaba fuera de pantalla y no había cómo salir.
// index.html + profile.js REALES, API simulada. Playwright 390px (táctil).
// Uso: node harness_hoja_producto_ui.js <frontend_dir> <main.css compilado>
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path');
const FE = process.argv[2] || '.';
const CSS = process.argv[3];
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const tall = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1400"><rect width="1000" height="1400" fill="#334155"/><text x="500" y="700" font-size="120" text-anchor="middle" fill="#fff">iPhone</text></svg>');
const desc = 'El iPhone 17 Pro Max representa la máxima expresión. '.repeat(25);
const BIZ = { id: 1, slug: 'tienda', name: 'Tienda Demo', tradeName: 'Tienda Demo', city: 'Luque', phone: '0981111222', whatsapp: '595981111222',
  planType: 'premium', verified: true, categoryName: 'Tecnología', categorySlug: 'tecnologia', reviews: [], categories: [],
  gallery: [
    { id: 11, image_url: tall, caption: 'iPhone 17 ProMax 256GB', price: 9140000, price_label: 'Gs.', description: desc, link_url: 'https://tienda.example', link_label: 'Ver tienda' },
    { id: 12, image_url: tall, caption: 'AirPods', price: 1500000, description: desc },
  ] };

(async () => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (type, body) => { res.writeHead(200, { 'Content-Type': type }); res.end(body); };
    if (u.pathname.startsWith('/api/')) {
      const p = u.pathname.replace(/^\/api\/v2(\/directory)?/, '');
      if (p === '/businesses/tienda') return send('application/json', JSON.stringify({ success: true, data: BIZ }));
      if (p === '/businesses') return send('application/json', JSON.stringify({ success: true, count: 0, total: 0, data: [] }));
      return send('application/json', JSON.stringify({ success: true, data: [] }));
    }
    if (u.pathname === '/public/css/main.css') return send('text/css', fs.readFileSync(CSS));
    const f = path.join(FE, u.pathname === '/' ? 'index.html' : u.pathname);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return send(f.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8', fs.readFileSync(f));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(FE, 'index.html')));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + '/', { waitUntil: 'load' });
  await p.waitForTimeout(600);
  await p.evaluate(() => openProfile('tienda'));
  await p.waitForFunction(() => window._currentBiz && window._currentBiz.slug === 'tienda', null, { timeout: 5000 }).catch(() => {});
  const histBase = await p.evaluate(() => history.length);

  const rect = sel => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; }, sel);
  const openP = async (i) => { await p.evaluate(i => openProductDrawer(i), i); await p.waitForTimeout(700); };
  const xBtn = '#_drawerPanel button[onclick^="closeProductDrawer"]';
  const shareBtn = '#_drawerPanel button[onclick^="shareProduct"]';

  // 1) Imagen alta + descripción larga: cabecera y botones adentro de la pantalla
  await openP(0);
  let x = await rect(xBtn), s = await rect(shareBtn), cta = await rect('#_drawerPanel a[href^="https://wa.me"]');
  check('producto: la X y Compartir se ven (dentro de la pantalla)', x && x.top >= 0 && s && s.top >= 0, JSON.stringify({ x, s }));
  check('producto: los botones de abajo también se ven', cta && cta.bottom <= cta.h + 1, JSON.stringify(cta));
  await p.screenshot({ path: path.join(__dirname, 'hoja_producto_390.png') });

  // 2) Como en iPhone: el área VISIBLE es más chica que el alto "de diseño"
  await p.evaluate(() => closeProductDrawer());
  await p.waitForTimeout(500);
  await p.evaluate(() => { Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 520 }); });
  await openP(0);
  x = await rect(xBtn);
  const panel = await rect('#_drawerPanel');
  check('con la barra de Safari (área visible 520 de 664): la hoja mide ≤ el área visible y la X queda en ella',
        panel && (panel.bottom - panel.top) <= 520 && x.top >= 664 - 520, JSON.stringify({ panel, x }));
  await p.evaluate(() => { delete window.visualViewport.height; });

  // 3) "Atrás" del celular cierra la hoja (y no la ficha)
  check('al abrir la hoja se agrega UNA entrada de historial (misma URL)', (await p.evaluate(() => history.state && history.state.rpSheet)) === 1);
  await p.goBack(); await p.waitForTimeout(600);
  check('"Atrás" cierra la hoja…', !(await p.$('#_productDrawer')));
  check('…y la ficha sigue abierta', await p.evaluate(() => !document.getElementById('profileModal').classList.contains('hidden')));

  // 4) La X cierra y consume su entrada de historial
  await openP(0);
  await p.click(xBtn); await p.waitForTimeout(700);
  check('la X cierra la hoja y saca su entrada del historial', !(await p.$('#_productDrawer')) && !(await p.evaluate(() => history.state && history.state.rpSheet)));

  // 5) Anterior/Siguiente no apila historial
  await openP(0);
  await p.evaluate(() => openProductDrawer(1)); await p.waitForTimeout(500);
  await p.evaluate(() => openProductDrawer(0)); await p.waitForTimeout(500);
  await p.goBack(); await p.waitForTimeout(600);
  check('Siguiente/Anterior: un solo "Atrás" cierra la hoja', !(await p.$('#_productDrawer')) && await p.evaluate(() => !document.getElementById('profileModal').classList.contains('hidden')));

  // 6) Arrastrar hacia abajo cierra
  await openP(0);
  await p.evaluate(() => {
    const g = document.querySelector('#_drawerPanel [data-sheet-grip]');
    const t = (y) => new Touch({ identifier: 1, target: g, clientX: 195, clientY: y });
    g.dispatchEvent(new TouchEvent('touchstart', { touches: [t(80)], bubbles: true }));
    g.dispatchEvent(new TouchEvent('touchmove', { touches: [t(160)], bubbles: true }));
    g.dispatchEvent(new TouchEvent('touchmove', { touches: [t(240)], bubbles: true }));
    g.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
  });
  await p.waitForTimeout(800);
  check('arrastrar la hoja hacia abajo la cierra', !(await p.$('#_productDrawer')));
  await openP(0);
  await p.evaluate(() => {
    const g = document.querySelector('#_drawerPanel [data-sheet-grip]');
    const t = (y) => new Touch({ identifier: 1, target: g, clientX: 195, clientY: y });
    g.dispatchEvent(new TouchEvent('touchstart', { touches: [t(80)], bubbles: true }));
    g.dispatchEvent(new TouchEvent('touchmove', { touches: [t(110)], bubbles: true }));
    g.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
  });
  await p.waitForTimeout(600);
  check('un arrastre corto NO la cierra (vuelve a su lugar)', !!(await p.$('#_productDrawer')) && (await p.evaluate(() => document.getElementById('_drawerPanel').style.transform)) === 'translateY(0px)');
  await p.evaluate(() => closeProductDrawer()); await p.waitForTimeout(600);

  // 7) Promo: misma hoja, mismo arreglo
  await p.evaluate((img) => openPromoDrawer({ id: 5, title: 'Promo larga', image_url: img, description: 'x '.repeat(900), whatsapp: '595981111222', business_name: 'Tienda Demo' }, 'profile'), tall);
  await p.waitForTimeout(700);
  const px = await rect('#_promoDrawerPanel button[onclick^="closePromoDrawer"]');
  check('promo: la X se ve', px && px.top >= 0, JSON.stringify(px));
  await p.goBack(); await p.waitForTimeout(600);
  check('promo: "Atrás" la cierra', !(await p.$('#_promoDrawer')));

  // 8) "Atrás" con la ficha abierta (y la URL ya fuera de la ficha) cierra la ficha
  await p.goBack(); await p.waitForTimeout(600);
  check('otro "Atrás" cierra la ficha', await p.evaluate(() => document.getElementById('profileModal').classList.contains('hidden')), await p.evaluate(() => location.pathname));
  check('sin errores de JS', errs.length === 0, errs.join(' | '));

  await browser.close(); server.close();
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
