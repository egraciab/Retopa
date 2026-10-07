// Plantillas — agrupación en PESTAÑAS. Verifica que cada plantilla cae en un
// grupo (sin huérfanas ni duplicadas), que la pestaña activa filtra las tarjetas,
// y que las tarjetas conservan sus acciones (Guardar/Prueba/Preview).
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const BASE = '/root/work/opt/retopa/frontend/admin';
const CONFIG = fs.readFileSync(BASE + '/js/config.js', 'utf8');
const TEMPLATES = fs.readFileSync(BASE + '/js/templates.js', 'utf8');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <span id="adminName"></span><span id="adminRole"></span><span id="adminAvatar"></span><span id="pageTitle"></span>
  <input id="testEmailTo2" value="">
  <div id="templatesContainer" class="space-y-4"></div>
  <script>${CONFIG}</script>
  <script>${TEMPLATES}</script>
  <script>
    window.apiAdminGet = async (url) => ({ success:true, data:{} });
    window.showToast = () => {};
  </script>
</body></html>`;

(async () => {
  const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(PAGE); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/login';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { localStorage.setItem('token', 'h.e.s'); localStorage.setItem('user', JSON.stringify({ name: 'T', role: 'admin', email: 'a@x.com' })); });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(40);

  await p.evaluate(() => initTemplatesSection());
  await p.waitForTimeout(60);

  check('carga sin errores', errs.length === 0, errs.join(' | '));

  // ── Cobertura: cada plantilla en exactamente un grupo ──────────────────────
  const cov = await p.evaluate(() => {
    const keys = TEMPLATE_DEFS.map(t => t.key);
    const orphans = keys.filter(k => !TPL_GROUPS.some(g => g.keys.includes(k)));
    const dups = keys.filter(k => TPL_GROUPS.filter(g => g.keys.includes(k)).length > 1);
    return { total: keys.length, orphans, dups };
  });
  check('sin plantillas huérfanas (todas en un grupo)', cov.orphans.length === 0, 'orphans=' + cov.orphans);
  check('sin plantillas duplicadas en 2 grupos', cov.dups.length === 0, 'dups=' + cov.dups);

  // ── Pestañas renderizadas ──────────────────────────────────────────────────
  const tabs = await p.evaluate(() => {
    const bar = document.getElementById('tplTabs');
    return { exists: !!bar, count: bar ? bar.querySelectorAll('button').length : 0,
             labels: bar ? Array.from(bar.querySelectorAll('button')).map(b => b.textContent.trim()) : [] };
  });
  check('barra de pestañas existe', tabs.exists);
  check('hay 6 grupos (uso/actividad/planes/reclamos/captación/cuenta)', tabs.count === 6, 'n=' + tabs.count + ' → ' + tabs.labels.join(' | '));

  // ── Grupo activo por defecto = "uso": muestra welcome, NO planRequested ─────
  let vis = await p.evaluate(() => ({
    welcome: !!document.getElementById('tplCard_welcome'),
    tips: !!document.getElementById('tplCard_tipsFicha'),
    reactivation: !!document.getElementById('tplCard_reactivation'),
    planReq: !!document.getElementById('tplCard_planRequested'),
    claim: !!document.getElementById('tplCard_claimReceived'),
  }));
  check('grupo "uso" muestra welcome + tipsFicha + reactivation', vis.welcome && vis.tips && vis.reactivation);
  check('grupo "uso" NO muestra planRequested ni claimReceived', !vis.planReq && !vis.claim);

  // ── Cambiar a "planes" ──────────────────────────────────────────────────────
  vis = await p.evaluate(() => {
    switchTplGroup('planes');
    return {
      planReq: !!document.getElementById('tplCard_planRequested'),
      founder: !!document.getElementById('tplCard_founderGranted'),
      welcome: !!document.getElementById('tplCard_welcome'),
    };
  });
  check('grupo "planes" muestra planRequested + founderGranted', vis.planReq && vis.founder);
  check('grupo "planes" oculta welcome (ya no está en el DOM)', !vis.welcome);

  // ── Cambiar a "reclamos" ────────────────────────────────────────────────────
  vis = await p.evaluate(() => {
    switchTplGroup('reclamos');
    return { claim: !!document.getElementById('tplCard_claimReceived'), planReq: !!document.getElementById('tplCard_planRequested') };
  });
  check('grupo "reclamos" muestra claimReceived, oculta planRequested', vis.claim && !vis.planReq);

  // ── Las tarjetas conservan sus acciones ────────────────────────────────────
  const card = await p.evaluate(() => {
    const el = document.getElementById('tplCard_claimReceived');
    return el ? el.innerHTML : '';
  });
  check('la tarjeta conserva Guardar/Prueba/Preview', /saveTemplate\('claimReceived'\)/.test(card) && /setActiveTest\('claimReceived'\)/.test(card) && /previewTemplate\('claimReceived'\)/.test(card));

  await browser.close(); server.close();

  // ── Contrato de fuente (grouping + renames) ────────────────────────────────
  const T = fs.readFileSync(BASE + '/js/templates.js', 'utf8');
  const H = fs.readFileSync(BASE + '/index.html', 'utf8');
  const C = fs.readFileSync(BASE + '/js/claims.js', 'utf8');
  check('src: templates.js define TPL_GROUPS + renderTemplatesUI + switchTplGroup', /const TPL_GROUPS/.test(T) && /function renderTemplatesUI/.test(T) && /function switchTplGroup/.test(T));
  check('src: Semáforo KPI dice "Visitas a fichas" con tooltip', /Visitas a fichas/.test(H) && /business_views/.test(H));
  check('src: panel Claims titula "Reclamos de empresas"', /Reclamos de empresas/.test(C));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
