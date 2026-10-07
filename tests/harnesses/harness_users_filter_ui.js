// Usuarios (UI) — filtro "sin acceso" alimenta inactive_days en la URL, y las
// plantillas nuevas aparecen en el modal de "Enviar correo" por usuario.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const BASE = '/root/work/opt/retopa/frontend/admin';
const CONFIG = fs.readFileSync(BASE + '/js/config.js', 'utf8');
const TEMPLATES = fs.readFileSync(BASE + '/js/templates.js', 'utf8');
const USERS = fs.readFileSync(BASE + '/js/users.js', 'utf8');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

// Página con TODOS los elementos que loadAdminUsers toca + los controles del toolbar.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <span id="adminName"></span><span id="adminRole"></span><span id="adminAvatar"></span><span id="pageTitle"></span>
  <input id="userSearch" value="">
  <select id="userFilterRole"><option value="" selected></option><option value="user">user</option></select>
  <select id="userFilterStatus"><option value="" selected></option></select>
  <select id="userFilterInactive">
    <option value="" selected>Cualquier acceso</option>
    <option value="7">+7</option><option value="30">+30</option><option value="90">+90</option>
  </select>
  <span id="userStatTotal"></span><span id="userStatActive"></span><span id="userStatClient"></span><span id="userStatAdmin"></span><span id="userStatGod"></span>
  <table><tbody id="usersTable"></tbody></table>
  <span id="userPaginationInfo"></span><span id="userPaginationControls"></span>
  <script>${CONFIG}</script>
  <script>${TEMPLATES}</script>
  <script>${USERS}</script>
  <script>
    window.__urls = [];
    window.apiAdminGet = async (url) => { window.__urls.push(url); return { success:true, data:[], stats:{total:0,active:0,clients:0,admins:0,godmode:0}, pagination:{page:1,limit:25,total:0,pages:1} }; };
    window.showToast = () => {};
    window.formatDateShort = () => '—';
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

  // ── Filtro "sin acceso" alimenta inactive_days ────────────────────────────
  let res = await p.evaluate(async () => { window.__urls = []; await loadAdminUsers(); return window.__urls[0]; });
  check('sin filtro → URL sin inactive_days', !/inactive_days/.test(res), res);

  res = await p.evaluate(async () => {
    document.getElementById('userFilterInactive').value = '30';
    window.__urls = []; await loadAdminUsers();
    return window.__urls[0];
  });
  check('filtro +30 → URL con inactive_days=30', /[?&]inactive_days=30\b/.test(res), res);

  res = await p.evaluate(async () => {
    document.getElementById('userFilterInactive').value = '90';
    document.getElementById('userFilterRole').value = 'user';
    window.__urls = []; await loadAdminUsers();
    return window.__urls[0];
  });
  check('combina role=user + inactive_days=90', /inactive_days=90/.test(res) && /role=user/.test(res), res);

  res = await p.evaluate(async () => {
    document.getElementById('userFilterInactive').value = '';
    window.__urls = []; await loadAdminUsers();
    return window.__urls[0];
  });
  check('volver a "cualquier acceso" → sin inactive_days', !/inactive_days/.test(res), res);

  // ── Modal de envío: las plantillas nuevas están en el picker ──────────────
  const modal = await p.evaluate(() => {
    openSendEmailToUser(9, 'ana@x.com', 'Ana', 'ficha-ana');
    const sel = document.getElementById('userEmailTemplate');
    const vals = sel ? Array.from(sel.options).map(o => o.value) : [];
    return { count: vals.length, hasTips: vals.includes('tipsFicha'), hasReact: vals.includes('reactivation'), hasFirst: vals.includes('firstSteps') };
  });
  check('modal picker incluye tipsFicha', modal.hasTips);
  check('modal picker incluye reactivation', modal.hasReact);
  check('modal picker incluye firstSteps', modal.hasFirst);
  check('picker tiene todas las plantillas (>15)', modal.count > 15, 'count=' + modal.count);

  await browser.close(); server.close();

  // Contrato sobre el fuente
  const U = fs.readFileSync(BASE + '/js/users.js', 'utf8');
  const H = fs.readFileSync(BASE + '/index.html', 'utf8');
  check('src: loadAdminUsers lee userFilterInactive', /getElementById\('userFilterInactive'\)/.test(U));
  check('src: agrega &inactive_days= a la URL', /inactive_days=\$\{encodeURIComponent\(inactive\)\}/.test(U));
  check('src: index.html tiene el <select id="userFilterInactive">', /id="userFilterInactive"/.test(H));
  check('src: opciones de +7/+30/+90 días', /value="7"/.test(H) && /value="30"/.test(H) && /value="90"/.test(H));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
