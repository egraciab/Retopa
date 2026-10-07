// Rediseño mobile — ETAPA 3.3b: filtros chip sticky (mobile), "Ver más
// resultados" (reemplaza paginación numerada), bloque "¿No encontrás?". 390×844.
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

  const myErrs = errs.filter(e => /rpToggleFilter|rpSetFilterChipsState|rpMobileSort|loadMore|SyntaxError|is not defined/.test(e));
  check('sin errores de script propios', myErrs.length === 0, myErrs.join(' | '));

  // Layout mobile: aside oculto, barra de filtros presente, paginación numerada oculta.
  const layout = await p.evaluate(() => {
    const aside = document.querySelector('#directorio ~ section aside') || document.querySelector('aside');
    const bar = document.getElementById('rpFilterBar');
    const pag = document.getElementById('paginationContainer');
    return {
      asideHidden: aside ? getComputedStyle(aside).display === 'none' : null,
      barExists: !!bar,
      chips: ['rpChipNear','rpChipVerified','rpChipRating','rpSortMobile'].every(id => !!document.getElementById(id)),
      pagHidden: pag ? (getComputedStyle(pag).display === 'none' || pag.classList.contains('hidden')) : null,
    };
  });
  check('aside de filtros oculto en mobile', layout.asideHidden === true);
  check('barra de filtros sticky presente con sus chips', layout.barExists && layout.chips);
  check('paginación numerada oculta', layout.pagHidden === true);

  // Mock del endpoint /businesses con control de "total".
  const mk = i => ({ slug:'b'+i, name:'Negocio '+i, tradeName:'Negocio '+i, categoryName:'Rubro', city:'Asunción', verified:true, reviewCount:3, rating:4.2, phone:'0981000000', whatsapp:'595981000000', hoursJson:null });
  await p.evaluate(() => {
    window.__urls = [];
    window.__total = 25;
    window.apiGet = async (u) => {
      window.__urls.push(u);
      const off = parseInt((u.match(/offset=(\d+)/)||[])[1] || '0');
      const remaining = Math.max(0, window.__total - off);
      const n = Math.min(10, remaining);
      const data = Array.from({length:n}, (_, k) => ({ slug:'b'+(off+k), name:'Negocio '+(off+k), tradeName:'Negocio '+(off+k), categoryName:'Rubro', city:'Asunción', verified:true, reviewCount:3, rating:4.2, phone:'0981000000', whatsapp:'595981000000', hoursJson:null }));
      return { success:true, data, total: window.__total, count: window.__total };
    };
  });

  // Cargar resultados con total=25 → "Ver más" visible.
  const more1 = await p.evaluate(async () => {
    currentSearch = 'x'; currentOffset = 0;
    await loadBusinesses(true, 'resultsList');
    const wrap = document.getElementById('loadMoreWrap');
    return { cards: document.querySelectorAll('#resultsList .rp-card').length, moreVisible: wrap && !wrap.classList.contains('hidden') };
  });
  check('carga 10 tarjetas', more1.cards === 10, 'n=' + more1.cards);
  check('"Ver más resultados" visible cuando hay más', more1.moreVisible === true);

  // loadMore() agrega y, al agotar, oculta el botón.
  const more2 = await p.evaluate(async () => {
    await loadMore(); // +10 → 20
    await loadMore(); // +5  → 25 (fin)
    const wrap = document.getElementById('loadMoreWrap');
    return { cards: document.querySelectorAll('#resultsList .rp-card').length, moreHidden: wrap && wrap.classList.contains('hidden') };
  });
  check('"Ver más" agrega resultados (25 en total)', more2.cards === 25, 'n=' + more2.cards);
  check('al agotar, "Ver más" se oculta', more2.moreHidden === true);

  // Chip Verificados: togglea el checkbox real y queda activo + manda verified=true.
  const verif = await p.evaluate(async () => {
    window.__urls = [];
    rpToggleFilter('verified');
    await new Promise(r => setTimeout(r, 30));
    return {
      checked: document.getElementById('filterVerified').checked,
      active: document.getElementById('rpChipVerified').classList.contains('active'),
      sentVerified: window.__urls.some(u => /verified=true/.test(u)),
    };
  });
  check('chip Verificados togglea el filtro real', verif.checked === true);
  check('chip Verificados queda activo', verif.active === true);
  check('la búsqueda envía verified=true', verif.sentVerified === true);

  // Chip 4+: togglea el radio de rating.
  const rat = await p.evaluate(async () => {
    window.__urls = [];
    rpToggleFilter('rating');
    await new Promise(r => setTimeout(r, 30));
    return {
      radio: document.querySelector('input[name="rating"][value="4"]').checked,
      active: document.getElementById('rpChipRating').classList.contains('active'),
      sentMin: window.__urls.some(u => /minRating=4/.test(u)),
    };
  });
  check('chip 4+ togglea el rating y queda activo', rat.radio === true && rat.active === true);
  check('la búsqueda envía minRating=4', rat.sentMin === true);

  // Orden mobile → cambia sortOrder y recarga con sort=recent.
  const sort = await p.evaluate(async () => {
    window.__urls = [];
    rpMobileSort('recent');
    await new Promise(r => setTimeout(r, 30));
    return { deskSort: document.getElementById('sortOrder').value, sentSort: window.__urls.some(u => /sort=recent/.test(u)) };
  });
  check('orden mobile sincroniza el sort real (recent)', sort.deskSort === 'recent' && sort.sentSort === true);

  // Bloque "¿No encontrás?" con CTA Registrar + Escribinos.
  const noEnc = await p.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find(x => /No encontr[aá]s lo que busc/i.test(x.textContent));
    const box = h ? h.closest('div') : null;
    const btns = box ? [...box.querySelectorAll('button')].map(b => b.textContent.replace(/\s+/g,' ').trim()) : [];
    return { exists: !!h, hasRegistrar: btns.some(t=>/Registrar mi negocio/.test(t)), hasEscribinos: btns.some(t=>/Escribinos/.test(t)) };
  });
  check('bloque "¿No encontrás?" presente', noEnc.exists);
  check('bloque con CTA Registrar + Escribinos', noEnc.hasRegistrar && noEnc.hasEscribinos);

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
