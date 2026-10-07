// Rediseño mobile — ETAPA 3 (Resultados): tarjeta COMPACTA con acciones
// Llamar/WhatsApp/Llegar (≥44px), rating "Sin reseñas aún" (nunca "0.0"),
// ≥3 tarjetas por pantalla. Usa el renderBusinessCard REAL de search.js. 390×844.
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

  const myErrs = errs.filter(e => /renderBusinessCard|rpMapsUrl|SyntaxError|is not defined|is not a function/.test(e));
  check('sin errores de script propios', myErrs.length === 0, myErrs.join(' | '));

  // Renderiza 4 negocios reales con renderBusinessCard dentro del #resultsList.
  const R = await p.evaluate(() => {
    const BIZ = [
      { slug:'con-resenas', name:'Cerrajería El Rápido', tradeName:'Cerrajería El Rápido', categorySlug:'cerrajeria', categoryName:'Cerrajería', city:'Asunción', verified:true, reviewCount:12, rating:4.6, phone:'0981 620 195', whatsapp:'595981620195', lat:-25.3, lng:-57.6, hoursJson:null },
      { slug:'sin-resenas', name:'Taller Don José', tradeName:'Taller Don José', categorySlug:'taller', categoryName:'Taller mecánico', city:'Luque', verified:false, reviewCount:0, rating:0, phone:'0971 111 222', whatsapp:'', lat:null, lng:null, address:'Av. Aviadores', hoursJson:null },
      { slug:'sin-tel', name:'Veterinaria Patitas', tradeName:'Veterinaria Patitas', categorySlug:'veterinaria', categoryName:'Veterinaria', city:'San Lorenzo', verified:true, reviewCount:3, rating:5, phone:'', whatsapp:'', hoursJson:null },
      { slug:'cuatro', name:'Farmacia Norte', tradeName:'Farmacia Norte', categorySlug:'farmacia', categoryName:'Farmacia', city:'Capiatá', verified:false, reviewCount:0, rating:0, phone:'0982 333 444', whatsapp:'595982333444', hoursJson:null },
    ];
    const list = document.getElementById('resultsList');
    list.className = 'space-y-4 results-section';
    list.innerHTML = BIZ.map(renderBusinessCard).join('');

    const cards = [...document.querySelectorAll('#resultsList .rp-card')];
    const firstThumb = document.querySelector('#resultsList .rp-card-thumb');
    const thumbW = firstThumb ? Math.round(firstThumb.getBoundingClientRect().width) : 0;
    const acts = [...document.querySelectorAll('#resultsList .rp-act')];
    const actMinH = acts.length ? Math.min(...acts.map(a => Math.round(a.getBoundingClientRect().height))) : 0;
    const cardH = cards.length ? Math.round(cards[0].getBoundingClientRect().height) : 0;

    // Textos por card
    const cardText = i => cards[i] ? cards[i].textContent.replace(/\s+/g,' ').trim() : '';
    // Acciones por card (labels)
    const actLabels = i => [...cards[i].querySelectorAll('.rp-act')].map(a => a.textContent.trim());
    const waHref = (() => { const a = cards[0].querySelector('.rp-act-wa'); return a ? a.getAttribute('href') : ''; })();
    const callHref = (() => { const a = [...cards[0].querySelectorAll('.rp-act')].find(x => /Llamar/.test(x.textContent)); return a ? a.getAttribute('href') : ''; })();
    const mapsHref = (() => { const a = [...cards[0].querySelectorAll('.rp-act')].find(x => /Llegar/.test(x.textContent)); return a ? a.getAttribute('href') : ''; })();

    // stopPropagation: click en acción NO abre perfil; click en card SÍ.
    window.__open = 0; window.openProfile = () => { window.__open++; };
    const prevent = e => e.preventDefault();
    window.addEventListener('click', prevent, true);
    // click en una acción (Llegar, siempre presente)
    const someAct = cards[0].querySelector('.rp-act');
    someAct.click();
    const openAfterAct = window.__open;
    // click en el cuerpo de la card
    cards[1].click();
    const openAfterCard = window.__open;
    window.removeEventListener('click', prevent, true);

    return {
      n: cards.length, thumbW, actMinH, cardH,
      text0: cardText(0), text1: cardText(1), text3: cardText(3),
      labels0: actLabels(0), labels2: actLabels(2),
      waHref, callHref, mapsHref,
      openAfterAct, openAfterCard,
      anyZeroRating: /\b0\.0\b/.test(document.getElementById('resultsList').textContent),
    };
  });

  check('renderiza 4 tarjetas .rp-card', R.n === 4, 'n=' + R.n);
  check('miniatura de 64px (mobile)', R.thumbW === 64, 'w=' + R.thumbW);
  check('acciones ≥44px de alto', R.actMinH >= 44, 'minH=' + R.actMinH);
  check('CRITERIO #2: tarjeta compacta (≤190px → ≥3 por pantalla)', R.cardH > 0 && R.cardH <= 190, 'h=' + R.cardH);
  check('CRITERIO #4: sin "0.0" en ningún lado', R.anyZeroRating === false);
  check('card sin reseñas muestra "Sin reseñas aún"', /Sin reseñas aún/.test(R.text1), R.text1);
  check('card con reseñas muestra el rating (4.6)', /4\.6/.test(R.text0), R.text0);
  check('acciones de card completa: Llamar + WhatsApp + Llegar',
    R.labels0.some(l=>/Llamar/.test(l)) && R.labels0.some(l=>/WhatsApp/.test(l)) && R.labels0.some(l=>/Llegar/.test(l)), R.labels0.join(' | '));
  check('card sin teléfono/whatsapp: solo "Llegar"',
    R.labels2.length === 1 && /Llegar/.test(R.labels2[0]), R.labels2.join(' | '));
  check('WhatsApp apunta a wa.me/api.whatsapp', /wa\.me|whatsapp/.test(R.waHref), R.waHref);
  check('Llamar es un tel:', /^tel:/.test(R.callHref), R.callHref);
  check('Llegar es un link de Google Maps', /google\.com\/maps/.test(R.mapsHref), R.mapsHref);
  check('tocar una acción NO abre el perfil (stopPropagation)', R.openAfterAct === 0, 'open=' + R.openAfterAct);
  check('tocar la tarjeta SÍ abre el perfil', R.openAfterCard === 1, 'open=' + R.openAfterCard);

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
