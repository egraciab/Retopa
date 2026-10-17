// SITIO PÚBLICO (2026-10-14): resultados de búsqueda con la tarjeta compacta en 2
// columnas, dirección en vez de "Sin horario", distancia aunque el servidor no la
// mande, pastillas "Buscá por rubro" → filtro por RUBRO, y "Rubros" en vez de
// "Categorías". index.html + js REALES, API simulada. Playwright 390px y 1280px.
// Uso: node harness_busqueda_ui.js <frontend_dir> <main.css compilado> [tag para capturas]
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path');
const FE = process.argv[2] || '.';
const CSS = process.argv[3];
const TAG = process.argv[4] || 'after';
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const svg = (bg, t) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${bg}"/><text x="40" y="52" font-size="34" text-anchor="middle" fill="#fff" font-family="Arial">${t}</text></svg>`);
const H = Object.fromEntries(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => [d, { h24: true }]));  // a cualquier hora del día
const BIZ = [
  { id: 1, slug: 'full-color', name: 'Industria Grafica Full Color S.a.', categoryName: 'Publicidad y Marketing', city: 'Asunción', address: 'Avda. Eusebio Ayala 1234 c/ Rca. Argentina', phone: '021555111', whatsapp: '595981111111', verified: true, completion: { completion: 55 }, imageUrl: svg('#0891b2', 'FC'), lat: -25.29, lng: -57.6 },
  { id: 2, slug: 'editorial-rd', name: 'Editorial Rd S.a.', categoryName: 'Publicidad y Marketing', city: 'Asunción', address: '', phone: '021555222', verified: true, completion: { completion: 55 }, imageUrl: svg('#1e3a5f', 'EN') },
  { id: 3, slug: 'dieben', name: 'DieBen Agencia Creativa', categoryName: 'Marketing digital', city: 'Luque', address: 'Gral. Aquino 50', phone: '0982333444', whatsapp: '595982333444', verified: true, completion: { completion: 90 }, imageUrl: svg('#f59e0b', 'DB'), hoursJson: H, likeCount: 7, rating: 4.7, reviewCount: 3, lat: -25.27, lng: -57.49, coordIsReal: true },
  { id: 4, slug: 'cicero', name: 'Grafica Cicero srl', categoryName: 'Publicidad y Marketing', city: 'Asunción', address: 'Mcal. López 3000', phone: '021555444', verified: true, completion: { completion: 40 } },
];
const CATS = [
  { id: 1, name: 'Cerrajería', slug: 'cerrajeria', icon: 'fa-key', businessCount: 40 },
  { id: 2, name: 'Cerrajería automotriz', slug: 'cerrajeria-automotriz', parentId: 1, businessCount: 5 },
  { id: 3, name: 'Talleres mecánicos', slug: 'talleres-mecanicos', icon: 'fa-wrench', businessCount: 80 },
  { id: 4, name: 'Veterinarias', slug: 'veterinarias', businessCount: 30 },
  { id: 5, name: 'Farmacias', slug: 'farmacias', businessCount: 60 },
  { id: 6, name: 'Electricistas matriculados', slug: 'electricistas-matriculados', businessCount: 12 },
  { id: 7, name: 'Electricistas del automotor', slug: 'electricistas-automotor', businessCount: 9 },
  { id: 8, name: 'Publicidad y Marketing', slug: 'publicidad-marketing', businessCount: 36 },
  { id: 9, name: 'Plomeros', slug: 'plomeros', businessCount: 14 },
];

(async () => {
  const reqs = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (type, body) => { res.writeHead(200, { 'Content-Type': type }); res.end(body); };
    if (u.pathname.startsWith('/api/')) {
      reqs.push(u.pathname + u.search);
      const p = u.pathname.replace(/^\/api\/v2(\/directory)?/, '');
      if (p === '/categories') return send('application/json', JSON.stringify({ success: true, data: CATS }));
      if (p === '/businesses' || p === '/businesses/semantica') {
        const featured = u.searchParams.get('featured_only') === 'true';
        const data = featured ? BIZ.filter(b => b.hoursJson) : BIZ;
        return send('application/json', JSON.stringify({ success: true, count: data.length, total: data.length, data }));
      }
      if (p === '/stats') return send('application/json', JSON.stringify({ success: true, data: { businesses: 14665 } }));
      return send('application/json', JSON.stringify({ success: true, data: [] }));
    }
    if (u.pathname === '/public/css/main.css') return send('text/css', fs.readFileSync(CSS));
    const f = path.join(FE, u.pathname === '/' ? 'index.html' : u.pathname);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return send(f.endsWith('.js') ? 'application/javascript' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', fs.readFileSync(f));
    res.writeHead(404); res.end('');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  for (const width of [390, 1280]) {
    const tag = `[${width}px]`;
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await ctx.addInitScript(() => { try { sessionStorage.setItem('retopa_userLocation', JSON.stringify({ lat: -25.28, lng: -57.5, ts: Date.now() })); } catch (e) {} });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(base + '/', { waitUntil: 'load' });
    await p.waitForTimeout(800);

    // ── "Rubros" en vez de "Categorías" ──────────────────────────────────────
    const body = await p.evaluate(() => document.body.innerText);
    check(`${tag} "Ver todos los rubros" (no "categorías")`, /Ver todos los rubros/i.test(body) && !/Ver todas las categor/i.test(body));
    if (width === 1280) check(`${tag} combo de rubro: "Todos los rubros"`, await p.getAttribute('#catComboInput', 'placeholder') === 'Todos los rubros');

    // ── Búsqueda de texto: tarjetas ───────────────────────────────────────────
    await p.fill('#mainSearch', 'marketin');
    await p.evaluate(() => performSearch());
    await p.waitForFunction(() => document.querySelectorAll('#resultsList .rp-card').length === 4, null, { timeout: 4000 }).catch(() => {});
    const cards = p.locator('#resultsList .rp-card');
    check(`${tag} 4 tarjetas de resultado`, await cards.count() === 4);
    const t0 = await cards.nth(0).innerText();
    check(`${tag} ficha sin horario: muestra su DIRECCIÓN, no "Sin horario"`, /Eusebio Ayala/.test(t0) && !/Sin horario/.test(t0), t0.replace(/\n/g, ' | '));
    const t1 = await cards.nth(1).innerText();
    check(`${tag} ficha sin horario ni dirección: no muestra "Sin horario"`, !/Sin horario/.test(t1) && /Sin reseñas aún/.test(t1));
    const t2 = await cards.nth(2).innerText();
    check(`${tag} ficha con horario: "Abierto…", rating y likes`, /Abierto|Cierra pronto/.test(t2) && /4\.7/.test(t2) && /7/.test(t2), t2.replace(/\n/g, " | "));
    check(`${tag} distancia aunque el servidor no la mande (calculada con la ubicación)`, /~\d+(\.\d)? km/.test(t0) && /\d+(\.\d)? km|\d+ m/.test(t2), (t0.match(/~[\d.]+ k?m/) || [''])[0]);
    const pos = await cards.evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) }; }));
    if (width === 1280) check(`${tag} escritorio: 2 columnas, tarjetas de ~ancho de "Abiertos ahora"`, pos[0].top === pos[1].top && pos[1].left > pos[0].left && pos[0].w < 560, JSON.stringify(pos.slice(0, 2)));
    else check(`${tag} mobile: una columna`, pos[1].top > pos[0].top && pos[0].left === pos[1].left);
    const ov = await p.evaluate(() => ({ dw: document.documentElement.scrollWidth, vw: innerWidth }));
    check(`${tag} sin scroll horizontal`, ov.dw <= ov.vw + 1, JSON.stringify(ov));
    await p.locator('#resultsList').scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(__dirname, `busqueda_${TAG}_${width}.png`) });

    // ── Pastillas "Buscá por rubro" ──────────────────────────────────────────
    const lastBiz = () => reqs.filter(r => /\/businesses\?/.test(r) && !/featured_only=true/.test(r)).slice(-1)[0] || '';
    reqs.length = 0;
    await p.locator('button.rp-chip', { hasText: 'Cerrajería' }).first().click();
    await p.waitForTimeout(500);
    let r = lastBiz();
    check(`${tag} "Cerrajería" filtra por RUBRO (category=cerrajeria), sin texto libre`, /category=cerrajeria(&|$)/.test(r) && !/[?&]q=/.test(r), r);
    check(`${tag} …la barra de búsqueda queda vacía`, await p.inputValue('#mainSearch') === '');
    const af = await p.locator('#activeFilters').innerText().catch(() => '');
    check(`${tag} …chip de filtro "Rubro: Cerrajería"`, /Rubro: Cerrajería/.test(af), af.replace(/\n/g, ' '));
    check(`${tag} …título "Empresas — Cerrajería"`, /Empresas — Cerrajería/.test(await p.locator('#resultsTitle').innerText().catch(() => '')));
    if (width === 1280) check(`${tag} …el combo de rubro muestra "Cerrajería"`, await p.inputValue('#catComboInput') === 'Cerrajería');

    reqs.length = 0;
    await p.locator('button.rp-chip', { hasText: 'Taller mecánico' }).first().click();
    await p.waitForTimeout(500);
    r = lastBiz();
    check(`${tag} "Taller mecánico" → rubro "Talleres mecánicos" (singular/plural, sin tildes)`, /category=talleres-mecanicos/.test(r), r);

    reqs.length = 0;
    await p.locator('button.rp-chip', { hasText: 'Electricista' }).first().click();
    await p.waitForTimeout(500);
    const picker = await p.locator('#catPickerModal').isVisible().catch(() => false);
    const plist = picker ? await p.locator('#catPickerList').innerText() : '';
    check(`${tag} "Electricista" con 2 rubros posibles → abre "Elegí un rubro" ya filtrado (no adivina)`, picker && /Electricistas matriculados/.test(plist) && /Electricistas del automotor/.test(plist) && !/Farmacias/.test(plist) && !lastBiz(), plist.replace(/\n/g, ' | '));
    if (picker) {
      await p.locator('#catPickerList button', { hasText: 'Electricistas del automotor' }).click();
      await p.waitForTimeout(500);
      check(`${tag} …al elegir, filtra por ese rubro`, /category=electricistas-automotor/.test(lastBiz()), lastBiz());
    }

    reqs.length = 0;
    await p.locator('button.rp-chip', { hasText: 'Plomería' }).first().click();
    await p.waitForTimeout(500);
    r = lastBiz();
    check(`${tag} "Plomería" sin palabra en común → rubro de nombre parecido "Plomeros" (como Electricista ↔ Electricidad)`, /category=plomeros/.test(r) && !/[?&]q=/.test(r), r);

    reqs.length = 0;
    await p.evaluate(() => rpRubro('Gomería'));
    await p.waitForTimeout(500);
    r = lastBiz();
    check(`${tag} término sin ningún rubro parecido → búsqueda de texto (como antes), sin rubro pegado`, /[?&]q=Gomer/.test(r) && !/category=/.test(r) && await p.inputValue('#mainSearch') === 'Gomería', r);

    check(`${tag} sin errores de JS`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
