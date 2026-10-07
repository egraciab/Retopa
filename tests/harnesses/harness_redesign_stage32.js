// Rediseño mobile — ETAPA 3.2 (home): orden (Abiertos → Promos → Negocio),
// "Abiertos ahora" con tarjeta compacta (filtra abiertos), promos alineadas a
// mobile. 390×844.
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

  const myErrs = errs.filter(e => /loadAbiertosAhora|rpIsOpenNow|SyntaxError|is not defined/.test(e));
  check('sin errores de script propios', myErrs.length === 0, myErrs.join(' | '));

  // ── Orden del home: Abiertos → Promos → Negocio ──
  const order = await p.evaluate(() => {
    const ab = document.getElementById('abiertosAhoraSection');
    const pr = document.getElementById('homePromos');
    const gold = [...document.querySelectorAll('section h2')].find(h => /Ten[eé]s un negocio/i.test(h.textContent));
    const goldSec = gold ? gold.closest('section') : null;
    const FOLLOW = Node.DOCUMENT_POSITION_FOLLOWING;
    return {
      have: !!ab && !!pr && !!goldSec,
      abBeforePr: ab && pr ? !!(ab.compareDocumentPosition(pr) & FOLLOW) : false,
      prBeforeGold: pr && goldSec ? !!(pr.compareDocumentPosition(goldSec) & FOLLOW) : false,
    };
  });
  check('existen las 3 secciones (Abiertos, Promos, Negocio)', order.have);
  check('orden: Abiertos ANTES que Promos', order.abBeforePr);
  check('orden: Promos ANTES que Negocio', order.prBeforeGold);

  // ── rpIsOpenNow: abierto todo el día = true; cerrado = false; sin horario = false ──
  const openLogic = await p.evaluate(() => {
    const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const allOpen = {}; DAYS.forEach(d => allOpen[d] = { open: '00:00', close: '23:59' });
    const allClosed = {}; DAYS.forEach(d => allClosed[d] = { closed: true });
    return {
      open: rpIsOpenNow({ hoursJson: JSON.stringify(allOpen) }),
      closed: rpIsOpenNow({ hoursJson: JSON.stringify(allClosed) }),
      none: rpIsOpenNow({ }),
    };
  });
  check('rpIsOpenNow: abierto → true', openLogic.open === true);
  check('rpIsOpenNow: cerrado → false', openLogic.closed === false);
  check('rpIsOpenNow: sin horario → false', openLogic.none === false);

  // ── loadAbiertosAhora: muestra solo los abiertos, con tarjeta compacta ──
  const ab = await p.evaluate(async () => {
    const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const allOpen = {}; DAYS.forEach(d => allOpen[d] = { open: '00:00', close: '23:59' });
    const mk = (slug, name, open) => ({ slug, name, tradeName: name, categorySlug:'x', categoryName:'Rubro', city:'Asunción', verified:true, reviewCount: open?4:0, rating: open?4.5:0, phone:'0981000000', whatsapp:'595981000000', hoursJson: open ? JSON.stringify(allOpen) : null });
    const dataset = [ mk('a','Abierto Uno',true), mk('b','Cerrado Uno',false), mk('c','Abierto Dos',true), mk('d','Cerrado Dos',false), mk('e','Abierto Tres',true) ];
    window.apiGet = async () => ({ success: true, data: dataset, total: dataset.length });
    await loadAbiertosAhora();
    const section = document.getElementById('abiertosAhoraSection');
    const cards = [...document.querySelectorAll('#abiertosAhora .rp-card')];
    return {
      visible: section && !section.classList.contains('hidden'),
      nCards: cards.length,
      texts: cards.map(c => c.textContent.replace(/\s+/g,' ').trim()).join(' || '),
    };
  });
  check('Abiertos ahora se muestra cuando hay abiertos', ab.visible === true);
  check('solo se listan los ABIERTOS (3 de 5)', ab.nCards === 3, 'n=' + ab.nCards);
  check('no aparece ningún cerrado en Abiertos ahora', !/Cerrado/.test(ab.texts), ab.texts);

  // ── loadAbiertosAhora: si NO hay abiertos, queda oculta ──
  const abNone = await p.evaluate(async () => {
    const mk = (slug, name) => ({ slug, name, tradeName: name, categoryName:'Rubro', city:'Asunción', hoursJson: null });
    document.getElementById('abiertosAhoraSection').classList.add('hidden');
    document.getElementById('abiertosAhora').innerHTML = '';
    window.apiGet = async () => ({ success: true, data: [ mk('x','Sin Horario') ] });
    await loadAbiertosAhora();
    const section = document.getElementById('abiertosAhoraSection');
    return { hidden: section.classList.contains('hidden') };
  });
  check('sin abiertos → la sección queda oculta', abNone.hidden === true);

  // ── Promos alineadas a mobile: fondo blanco y subtítulo oculto a 390px ──
  const promoStyle = await p.evaluate(() => {
    const pr = document.getElementById('homePromos');
    pr.classList.remove('hidden'); // forzar visible para medir estilos
    const cs = getComputedStyle(pr);
    const sub = pr.querySelector('.rp-hp-sub');
    const subDisplay = sub ? getComputedStyle(sub).display : 'none';
    return { bg: cs.backgroundColor, hasClass: pr.classList.contains('rp-homepromos'), subDisplay };
  });
  check('promos tiene la clase rp-homepromos', promoStyle.hasClass);
  check('promos: fondo blanco en mobile', /rgb\(255, 255, 255\)/.test(promoStyle.bg), promoStyle.bg);
  check('promos: subtítulo oculto en mobile', promoStyle.subDisplay === 'none', 'display=' + promoStyle.subDisplay);

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
