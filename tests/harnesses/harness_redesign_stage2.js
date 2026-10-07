// Rediseño mobile — ETAPA 2 (Home hero opción A: buscador arriba del pliegue,
// H1 "¿Qué necesitás hoy?", chips de rubro, bloque dorado). 390×844.
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

  const myErrs = errs.filter(e => /SyntaxError|rpRubro|rpBottomNav|Unexpected/.test(e));
  check('sin errores de script propios', myErrs.length === 0, myErrs.join(' | '));

  const R = await p.evaluate(() => {
    const q = s => document.querySelector(s);
    const rect = el => el ? el.getBoundingClientRect() : null;
    const h1s = [...document.querySelectorAll('h1')];
    const input = q('#mainSearch');
    const ir = rect(input);
    const hero = q('#inicio');
    const heroBg = hero ? getComputedStyle(hero).backgroundColor : '';
    const buscar = [...document.querySelectorAll('#inicio button')].find(b => /performSearch/.test(b.getAttribute('onclick')||''));
    const chips = [...document.querySelectorAll('.rp-chip')].filter(c => /rpRubro/.test(c.getAttribute('onclick') || ''));
    const chipLabels = chips.map(c => c.textContent.trim());
    const combos = q('#cityComboWrapper');
    const combosVisible = combos ? getComputedStyle(combos.closest('.hidden') || combos).display !== 'none' : null;
    const cityWrapDisplay = combos ? getComputedStyle(combos.parentElement).display : '';
    const golden = [...document.querySelectorAll('button')].find(b => /Registrar mi negocio gratis/.test(b.textContent));
    const verPlanes = [...document.querySelectorAll('a')].find(a => /Ver planes/.test(a.textContent));
    const abiertos = q('#abiertosAhoraSection');
    const nearMe = q('#nearMeBtn'), citySel = q('#citySelect'), catSel = q('#categorySelect'), sugg = q('#searchSuggestions');
    return {
      h1count: h1s.length, h1text: h1s[0] ? h1s[0].textContent.replace(/\s+/g,' ').trim() : '',
      inputExists: !!input, inputBottom: ir ? Math.round(ir.bottom) : null, inputTop: ir ? Math.round(ir.top) : null,
      heroBg,
      buscarExists: !!buscar, buscarBg: buscar ? getComputedStyle(buscar).backgroundColor : '',
      chipCount: chips.length, chipLabels,
      cityWrapDisplay,
      golden: !!golden, verPlanes: !!verPlanes,
      abiertosExists: !!abiertos, abiertosHidden: abiertos ? getComputedStyle(abiertos).display === 'none' : null,
      keepIds: !!nearMe && !!citySel && !!catSel && !!sugg,
      rpRubro: typeof rpRubro === 'function', performSearch: typeof performSearch === 'function',
    };
  });

  check('exactamente un <h1>', R.h1count === 1, 'n=' + R.h1count);
  check('H1 = "¿Qué necesitás hoy?"', /¿Qué necesitás hoy\?/.test(R.h1text), 'h1="' + R.h1text + '"');
  check('CRITERIO #1: buscador visible SIN scroll (bottom ≤ 844)', R.inputExists && R.inputBottom !== null && R.inputBottom <= 844, `bottom=${R.inputBottom}`);
  check('el buscador está bien arriba (top < 400)', R.inputTop !== null && R.inputTop < 400, 'top=' + R.inputTop);
  check('hero con fondo navy #1B3A6B', R.heroBg === 'rgb(27, 58, 107)', R.heroBg);
  check('botón "Buscar" dorado (#E8B84B)', R.buscarExists && R.buscarBg === 'rgb(232, 184, 75)', R.buscarBg);
  check('6 chips de rubro', R.chipCount === 6, 'n=' + R.chipCount);
  check('chips esperados (Cerrajería/Taller/Veterinaria/Farmacia/Plomería/Electricista)',
    /Cerrajer/.test(R.chipLabels.join()) && /Taller/.test(R.chipLabels.join()) && /Veterinaria/.test(R.chipLabels.join()) && /Farmacia/.test(R.chipLabels.join()) && /Plomer/.test(R.chipLabels.join()) && /Electricista/.test(R.chipLabels.join()), R.chipLabels.join(' | '));
  check('combos ciudad/categoría OCULTOS en mobile (hidden lg:flex)', R.cityWrapDisplay === 'none', 'display=' + R.cityWrapDisplay);
  check('bloque dorado con "Registrar mi negocio gratis" + "Ver planes"', R.golden && R.verPlanes);
  check('sección "Abiertos ahora" presente (oculta hasta etapa 3)', R.abiertosExists && R.abiertosHidden === true);
  check('ids funcionales preservados (nearMeBtn/citySelect/categorySelect/searchSuggestions)', R.keepIds);
  check('helpers presentes (rpRubro + performSearch)', R.rpRubro && R.performSearch);

  // Un chip dispara búsqueda (mainSearch se llena)
  const chipVal = await p.evaluate(() => {
    document.querySelector('.rp-chip').click();
    return document.getElementById('mainSearch').value;
  });
  check('click en chip llena el buscador (rpRubro)', /Cerrajer/.test(chipVal), 'val=' + chipVal);

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
