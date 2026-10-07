// Pulso del directorio (UI) — dropdown de rango + granularidad adaptativa.
// Carga config.js + dashboard.js REALES en el navegador y verifica loadGrowth()
// y el formato de etiquetas de renderGrowthChart() según el bucket.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const BASE = '/root/work/opt/retopa/frontend/admin';
const CONFIG = fs.readFileSync(BASE + '/js/config.js', 'utf8');
const DASH = fs.readFileSync(BASE + '/js/dashboard.js', 'utf8');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <span id="adminName"></span><span id="adminRole"></span><span id="adminAvatar"></span><span id="pageTitle"></span>
  <h3>Pulso <span id="growthSubtitle"></span></h3>
  <select id="growthRange"><option value="1w"></option><option value="1m" selected></option><option value="3m"></option><option value="6m"></option></select>
  <canvas id="growthChart"></canvas>
  <script>${CONFIG}</script>
  <script>${DASH}</script>
  <script>
    // Chart stub que captura la última config.
    window.__lastChart = null;
    window.Chart = function(el, cfg){ window.__lastChart = cfg; return { destroy(){} }; };
    // apiAdminGet stub que registra la URL y devuelve datos canónicos por rango.
    window.__lastUrl = null;
    const DATA = {
      '1w': { bucket:'day',   rows:[{period:'2026-08-20',count:1},{period:'2026-08-27',count:2}] },
      '6m': { bucket:'month', rows:[{period:'2026-03-01',count:11000},{period:'2026-08-01',count:5}] },
    };
    window.apiAdminGet = async (url) => {
      window.__lastUrl = url;
      const m = url.match(/range=([^&]+)/);
      const d = DATA[m && m[1]] || DATA['1w'];
      return { success:true, range: m&&m[1], bucket:d.bucket, label:'x', rows:d.rows };
    };
  </script>
</body></html>`;

(async () => {
  const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(PAGE); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/login';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    localStorage.setItem('token', 'h.e.s');
    localStorage.setItem('user', JSON.stringify({ name: 'Tester', role: 'admin' }));
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(60);

  check('config.js + dashboard.js cargan sin errores', errs.length === 0, errs.join(' | '));
  check('funciones expuestas (loadGrowth, renderGrowthChart)',
    await p.evaluate(() => typeof loadGrowth === 'function' && typeof renderGrowthChart === 'function'));

  // ── 1 semana → por día ───────────────────────────────────────────────────
  const w = await p.evaluate(async () => {
    await loadGrowth('1w');
    return {
      url: window.__lastUrl,
      subtitle: document.getElementById('growthSubtitle').textContent,
      selVal: document.getElementById('growthRange').value,
      labels: window.__lastChart.data.labels,
      values: window.__lastChart.data.datasets[0].data,
    };
  });
  check('1w: pega a /dashboard/growth?range=1w', w.url === '/dashboard/growth?range=1w', w.url);
  check('1w: subtítulo "(altas por día)"', w.subtitle === '(altas por día)', w.subtitle);
  check('1w: sincroniza el dropdown', w.selVal === '1w');
  check('1w: etiquetas por día (contiene "ago")', w.labels.length === 2 && /ago/i.test(w.labels[1]), JSON.stringify(w.labels));
  check('1w: valores correctos [1,2]', JSON.stringify(w.values) === '[1,2]');

  // ── 6 meses → por mes ────────────────────────────────────────────────────
  const m = await p.evaluate(async () => {
    await loadGrowth('6m');
    return {
      subtitle: document.getElementById('growthSubtitle').textContent,
      labels: window.__lastChart.data.labels,
      values: window.__lastChart.data.datasets[0].data,
    };
  });
  check('6m: subtítulo "(altas por mes)"', m.subtitle === '(altas por mes)', m.subtitle);
  check('6m: etiquetas por mes (mar/ago + 26)', /mar/i.test(m.labels[0]) && /26/.test(m.labels[0]), JSON.stringify(m.labels));
  check('6m: pico de importación presente (11000)', m.values.includes(11000));

  // ── Compatibilidad: filas viejas {month:'YYYY-MM'} ───────────────────────
  const legacy = await p.evaluate(() => {
    renderGrowthChart([{ month: '2026-07', count: 3 }], 'month');
    return window.__lastChart.data.labels;
  });
  check('compat: filas viejas {month} siguen formateando (jul 26)', /jul/i.test(legacy[0]) && /26/.test(legacy[0]), JSON.stringify(legacy));

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
