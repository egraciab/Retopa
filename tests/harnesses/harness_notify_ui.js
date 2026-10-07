// Notificar empresas (UI) — "Recalcular" y "Iniciar campaña" mandan los
// parámetros correctos (fuente/ciudad/score/tope/cooldown) al backend.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const BASE = '/root/work/opt/retopa/frontend/admin';
const CONFIG = fs.readFileSync(BASE + '/js/config.js', 'utf8');
const NOTIFY = fs.readFileSync(BASE + '/js/notify.js', 'utf8');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <span id="adminName"></span><span id="adminRole"></span><span id="adminAvatar"></span><span id="pageTitle"></span>
  <select id="campSource"><option value="" selected></option><option value="MIC">MIC</option></select>
  <input id="campCity" value="">
  <input id="campMinScore" value="">
  <input id="campLimit" value="">
  <input type="checkbox" id="campIncludeCooldown" checked>
  <div id="campaignResult" class="hidden"></div>
  <script>${CONFIG}</script>
  <script>${NOTIFY}</script>
  <script>
    window.__posts = [];
    window.apiAdminPost = async (endpoint, data) => {
      window.__posts.push({ endpoint, data });
      if (endpoint === '/notify/campaign-preview')
        return { success:true, total_eligible:4, to_send:2, cap:(data.limit||null), include_cooldown:data.include_cooldown, sample:[{name:'Ana',city:'Asunción',quality_score:50}] };
      if (endpoint === '/notify/campaign')
        return { success:true, sent:2, failed:0, remaining:2, capped:(data.limit||null) };
      return { success:true };
    };
    window.showToast = () => {};
    window.loadNotifyCandidates = async () => {};  // no tocar la tabla en el test
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
  p.on('dialog', d => d.accept()); // confirm() → OK
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(60);

  check('carga sin errores', errs.length === 0, errs.join(' | '));
  check('funciones expuestas (recalcularCampaign, launchCampaign, _campaignParams)',
    await p.evaluate(() => typeof recalcularCampaign === 'function' && typeof launchCampaign === 'function' && typeof _campaignParams === 'function'));

  // ── Recalcular con parámetros ──────────────────────────────────────────────
  const rec = await p.evaluate(async () => {
    document.getElementById('campSource').value = 'MIC';
    document.getElementById('campCity').value = 'Luque';
    document.getElementById('campMinScore').value = '30';
    document.getElementById('campLimit').value = '2';
    document.getElementById('campIncludeCooldown').checked = false;
    window.__posts = [];
    await recalcularCampaign();
    return { posts: window.__posts, resultHtml: document.getElementById('campaignResult').innerHTML, hidden: document.getElementById('campaignResult').classList.contains('hidden') };
  });
  check('recalcular → 1 POST a /notify/campaign-preview', rec.posts.length === 1 && rec.posts[0].endpoint === '/notify/campaign-preview');
  const rp = rec.posts[0].data;
  check('recalcular envía source=MIC', rp.source === 'MIC');
  check('recalcular envía city=Luque', rp.city === 'Luque');
  check('recalcular envía min_score=30 (número)', rp.min_score === 30);
  check('recalcular envía limit=2 (número)', rp.limit === 2);
  check('recalcular envía include_cooldown=false (checkbox off)', rp.include_cooldown === false);
  check('recalcular muestra el resultado (no oculto)', rec.hidden === false);
  check('recalcular muestra "Se enviarían 2"', /Se enviar[íi]an\s*<[^>]*>\s*2/.test(rec.resultHtml) || /enviar[íi]an[^0-9]*2/.test(rec.resultHtml), rec.resultHtml.slice(0,120));

  // ── Campos vacíos → no se mandan esas claves ───────────────────────────────
  const bare = await p.evaluate(async () => {
    document.getElementById('campSource').value = '';
    document.getElementById('campCity').value = '';
    document.getElementById('campMinScore').value = '';
    document.getElementById('campLimit').value = '';
    document.getElementById('campIncludeCooldown').checked = true;
    return _campaignParams();
  });
  check('sin filtros → payload solo con include_cooldown=true', !('source' in bare) && !('city' in bare) && !('min_score' in bare) && !('limit' in bare) && bare.include_cooldown === true, JSON.stringify(bare));

  // ── Iniciar campaña → preview + campaign con los mismos params ─────────────
  const launch = await p.evaluate(async () => {
    document.getElementById('campSource').value = 'MIC';
    document.getElementById('campLimit').value = '300';
    document.getElementById('campIncludeCooldown').checked = true;
    window.__posts = [];
    await launchCampaign();
    return window.__posts;
  });
  check('lanzar → 2 POST (preview + campaign)', launch.length === 2, 'n=' + launch.length);
  check('lanzar → 1o /campaign-preview, 2o /campaign', launch[0]?.endpoint === '/notify/campaign-preview' && launch[1]?.endpoint === '/notify/campaign');
  check('lanzar → campaign lleva source=MIC y limit=300', launch[1]?.data.source === 'MIC' && launch[1]?.data.limit === 300);
  check('lanzar → campaign include_cooldown=true', launch[1]?.data.include_cooldown === true);

  await browser.close(); server.close();

  // Contrato sobre el fuente
  const H = fs.readFileSync(BASE + '/index.html', 'utf8');
  check('src: index.html tiene los controles de campaña', /id="campSource"/.test(H) && /id="campCity"/.test(H) && /id="campMinScore"/.test(H) && /id="campLimit"/.test(H) && /id="campIncludeCooldown"/.test(H));
  check('src: botón Recalcular llama recalcularCampaign()', /onclick="recalcularCampaign\(\)"/.test(H));
  check('src: notify.js manda campaign-preview', /\/notify\/campaign-preview/.test(NOTIFY));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
