// Envío en lote (UI) — el modal lee los filtros del listado y manda el payload
// correcto a /users/bulk-email (preview y envío real).
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const BASE = '/root/work/opt/retopa/frontend/admin';
const CONFIG = fs.readFileSync(BASE + '/js/config.js', 'utf8');
const TEMPLATES = fs.readFileSync(BASE + '/js/templates.js', 'utf8');
const USERS = fs.readFileSync(BASE + '/js/users.js', 'utf8');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <span id="adminName"></span><span id="adminRole"></span><span id="adminAvatar"></span><span id="pageTitle"></span>
  <input id="userSearch" value="">
  <select id="userFilterRole"><option value="" selected></option><option value="user">user</option><option value="client">client</option></select>
  <select id="userFilterStatus"><option value="" selected></option><option value="true">act</option><option value="false">inact</option></select>
  <select id="userFilterInactive"><option value="" selected></option><option value="7">7</option><option value="30">30</option><option value="90">90</option></select>
  <script>${CONFIG}</script>
  <script>${TEMPLATES}</script>
  <script>${USERS}</script>
  <script>
    window.__posts = [];
    window.apiAdminPost = async (endpoint, data) => {
      window.__posts.push({ endpoint, data });
      if (data && data.preview) return { success:true, preview:true, matched:6, eligible:5, skipped_cooldown:1, would_send:5, cooldown_days:data.cooldown_days, sample:[{name:'Beto', owned_name:'Ferre Beto'}] };
      return { success:true, sent:5, failed:0, remaining:0, cooldown_days:data.cooldown_days };
    };
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
  p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(60);

  check('carga sin errores', errs.length === 0, errs.join(' | '));
  check('funciones expuestas (openBulkEmailModal, recalcBulk, sendBulk, _bulkParams)',
    await p.evaluate(() => ['openBulkEmailModal','recalcBulk','sendBulk','_bulkParams'].every(f => typeof window[f] === 'function')));

  // Set filtros del listado + abrir modal (dispara recalc automático)
  const opened = await p.evaluate(async () => {
    document.getElementById('userFilterInactive').value = '30';
    document.getElementById('userFilterRole').value = 'user';
    window.__posts = [];
    openBulkEmailModal();
    await new Promise(r => setTimeout(r, 50));
    const sel = document.getElementById('bulkTemplate');
    return { exists: !!document.getElementById('bulkEmailModal'), tpl: sel ? sel.value : null, autoPosts: window.__posts.length,
             segment: document.getElementById('bulkEmailModal').innerHTML.includes('sin acceso +30') };
  });
  check('abre el modal', opened.exists);
  check('plantilla por defecto = reactivation', opened.tpl === 'reactivation', 'tpl=' + opened.tpl);
  check('recalcula automáticamente al abrir (1 preview)', opened.autoPosts === 1);
  check('muestra el segmento (sin acceso +30 · rol user)', opened.segment);

  // Recalcular con cooldown/límite propios
  const rec = await p.evaluate(async () => {
    document.getElementById('bulkCooldown').value = '14';
    document.getElementById('bulkLimit').value = '100';
    window.__posts = [];
    await recalcBulk();
    return { post: window.__posts[0], result: document.getElementById('bulkResult').innerHTML };
  });
  check('recalcular → POST /users/bulk-email', rec.post && rec.post.endpoint === '/users/bulk-email');
  check('payload preview:true', rec.post && rec.post.data.preview === true);
  check('payload template=reactivation', rec.post && rec.post.data.template === 'reactivation');
  check('payload inactive_days=30', rec.post && rec.post.data.inactive_days === '30');
  check('payload role=user', rec.post && rec.post.data.role === 'user');
  check('payload cooldown_days=14 (número)', rec.post && rec.post.data.cooldown_days === 14);
  check('payload limit=100 (número)', rec.post && rec.post.data.limit === 100);
  check('resultado muestra "Se enviarían 5"', /Se enviar[íi]an[\s\S]*5/.test(rec.result), rec.result.slice(0,80));

  // Enviar → preview + real
  const sent = await p.evaluate(async () => {
    window.__posts = [];
    await sendBulk();
    return window.__posts;
  });
  check('enviar → 2 POST (preview + real)', sent.length === 2, 'n=' + sent.length);
  check('enviar → 1o preview, 2o real (sin preview)', sent[0]?.data.preview === true && !sent[1]?.data.preview);
  check('enviar → real lleva template/inactive_days/role/cooldown', sent[1]?.data.template === 'reactivation' && sent[1]?.data.inactive_days === '30' && sent[1]?.data.role === 'user' && sent[1]?.data.cooldown_days === 14);

  await browser.close(); server.close();

  const U = fs.readFileSync(BASE + '/js/users.js', 'utf8');
  const H = fs.readFileSync(BASE + '/index.html', 'utf8');
  check('src: botón "Enviar al segmento" llama openBulkEmailModal', /onclick="openBulkEmailModal\(\)"/.test(H));
  check('src: sendBulk confirma con would_send antes de enviar', /pre\.would_send/.test(U));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
