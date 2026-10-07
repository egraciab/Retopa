// Rediseño mobile — ETAPA 3.3a: selector de TODAS las categorías (modal buscable
// desde "Ver todas las categorías"). 390×844.
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

  const myErrs = errs.filter(e => /rpOpenCatPicker|rpRenderCatList|rpPickCategory|SyntaxError|is not defined/.test(e));
  check('sin errores de script propios', myErrs.length === 0, myErrs.join(' | '));

  // Chip "Ver todas las categorías" existe y abre el modal.
  const R = await p.evaluate(async () => {
    // Mock del endpoint de categorías.
    const CATS = [
      { slug:'farmacia', name:'Farmacia', icon:'fa-pills', color:'#1B3A6B', businessCount:40 },
      { slug:'cerrajeria', name:'Cerrajería', icon:'fa-key', color:'#C9951F', businessCount:12 },
      { slug:'veterinaria', name:'Veterinaria', icon:'fa-paw', color:'#1B3A6B', businessCount:25 },
      { slug:'gastronomia', name:'Gastronomía', icon:'fa-utensils', color:'#ef4444', businessCount:80 },
      { slug:'panaderia', name:'Panadería', icon:'fa-bread-slice', color:'#f59e0b', businessCount:15 },
    ];
    window.apiGet = async (u) => (/\/categories/.test(u) ? { success:true, data: CATS } : { success:true, data: [] });

    const chip = [...document.querySelectorAll('button')].find(b => /Ver todas las categor/i.test(b.textContent));
    const chipExists = !!chip;

    await rpOpenCatPicker();
    const modal = document.getElementById('catPickerModal');
    const modalOpen = modal && !modal.classList.contains('hidden');
    const items = () => [...document.querySelectorAll('#catPickerList button')];
    const firstName = items()[0] ? items()[0].textContent.replace(/\s+/g,' ').trim() : '';
    const count = items().length;
    // ordenado por cantidad desc → Gastronomía (80) primero
    const orderedOk = /Gastronom/.test(firstName);

    // Buscar "pan" → solo Panadería
    rpRenderCatList('pan');
    const afterSearch = items().map(b => b.textContent.replace(/\s+/g,' ').trim());

    // Elegir una categoría → filterByCategory + cierra modal
    window.__picked = null;
    window.filterByCategory = (slug) => { window.__picked = slug; };
    rpRenderCatList(''); // reset lista
    // click en Cerrajería
    const cerr = items().find(b => /Cerrajer/.test(b.textContent));
    cerr.click();
    const closedAfterPick = document.getElementById('catPickerModal').classList.contains('hidden');

    return { chipExists, modalOpen, count, orderedOk, afterSearch, picked: window.__picked, closedAfterPick };
  });

  check('existe el chip "Ver todas las categorías"', R.chipExists);
  check('el modal se abre', R.modalOpen === true);
  check('lista todas las categorías (5)', R.count === 5, 'n=' + R.count);
  check('ordenadas por cantidad (Gastronomía primero)', R.orderedOk);
  check('buscar "pan" filtra a 1 (Panadería)', R.afterSearch.length === 1 && /Panader/.test(R.afterSearch[0]||''), R.afterSearch.join(' | '));
  check('elegir categoría llama filterByCategory con el slug', R.picked === 'cerrajeria', 'picked=' + R.picked);
  check('al elegir se cierra el modal', R.closedAfterPick === true);

  // Cerrar con la X
  const closed = await p.evaluate(() => { rpOpenCatPicker(); rpCloseCatPicker(); return document.getElementById('catPickerModal').classList.contains('hidden'); });
  check('rpCloseCatPicker cierra el modal', closed === true);

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
