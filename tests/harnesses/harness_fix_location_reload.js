// FIX — al conceder/actualizar la ubicación, "Abiertos ahora" también se recarga
// (antes solo se veía la distancia tras refrescar la página). 390×844.
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
  await p.waitForTimeout(600);

  const myErrs = errs.filter(e => /rpReloadLocationDependent|_reloadForLocation|Maximum call stack|SyntaxError|is not defined/.test(e));
  check('sin errores de script propios', myErrs.length === 0, myErrs.join(' | '));

  // 1) rpReloadLocationDependent llama a AMBOS (resultados + Abiertos ahora).
  const spy = await p.evaluate(() => {
    const _lb = window.loadBusinesses, _ab = window.loadAbiertosAhora;
    window.__calls = { lb: 0, ab: 0 };
    window.loadBusinesses = () => { window.__calls.lb++; };
    window.loadAbiertosAhora = () => { window.__calls.ab++; };
    rpReloadLocationDependent();
    const after1 = { ...window.__calls };
    // 2) _reloadForLocation (distance.js) delega en rpReloadLocationDependent.
    _reloadForLocation();
    const after2 = { ...window.__calls };
    window.loadBusinesses = _lb; window.loadAbiertosAhora = _ab;
    return { after1, after2 };
  });
  check('rpReloadLocationDependent recarga resultados Y "Abiertos ahora"', spy.after1.lb === 1 && spy.after1.ab === 1, JSON.stringify(spy.after1));
  check('_reloadForLocation (distance.js) delega y recarga ambos', spy.after2.lb === 2 && spy.after2.ab === 2, JSON.stringify(spy.after2));

  // 3) Integración: loadAbiertosAhora manda lat/lng SÓLO si hay ubicación → distancia.
  const integ = await p.evaluate(async () => {
    const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const allOpen = {}; DAYS.forEach(d => allOpen[d] = { open: '00:00', close: '23:59' });
    window.__urls = [];
    window.apiGet = async (u) => {
      window.__urls.push(u);
      const hasLoc = /lat=/.test(u);
      const biz = { slug:'a', name:'Farmacia', tradeName:'Farmacia', categoryName:'Farmacia', city:'Luque', verified:true, reviewCount:1, rating:5, phone:'0981000000', whatsapp:'595981000000', hoursJson: JSON.stringify(allOpen) };
      if (hasLoc) { biz.distance_m = 32100; biz.coordIsReal = false; }
      return { success:true, data:[biz], total:1 };
    };

    // Sin ubicación:
    window.getUserLocation = () => null;
    await loadAbiertosAhora();
    const urlNoLoc = window.__urls[window.__urls.length - 1];
    const distNoLoc = /km|~/.test(document.getElementById('abiertosAhora').textContent);

    // Con ubicación (como al conceder "Cerca de mí"):
    window.getUserLocation = () => ({ lat: -25.29, lng: -57.61, ts: Date.now() });
    await loadAbiertosAhora();
    const urlLoc = window.__urls[window.__urls.length - 1];
    const distLoc = /km/.test(document.getElementById('abiertosAhora').textContent);

    return { urlNoLoc, urlLoc, distNoLoc, distLoc };
  });
  check('sin ubicación: la consulta de "Abiertos ahora" NO manda lat/lng', !/lat=/.test(integ.urlNoLoc), integ.urlNoLoc);
  check('sin ubicación: no se muestran distancias', integ.distNoLoc === false);
  check('con ubicación: la consulta manda lat/lng', /lat=/.test(integ.urlLoc) && /lng=/.test(integ.urlLoc), integ.urlLoc);
  check('con ubicación: ahora SÍ aparece la distancia (km)', integ.distLoc === true);

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
