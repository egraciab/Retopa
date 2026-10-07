// Panel de Claims (UI) — filtro por estado, búsqueda y paginación son server-side
// (alimentan la URL) y las tarjetas usan las stats globales del backend.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const BASE = '/root/work/opt/retopa/frontend/admin';
const CONFIG = fs.readFileSync(BASE + '/js/config.js', 'utf8');
const CLAIMS = fs.readFileSync(BASE + '/js/claims.js', 'utf8');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const SAMPLE = { id: 1, name: 'Alfa SA', trade_name: 'Alfa', city: 'Asunción', origin: 'formulario',
  contact_name: 'Ana', contact_email: 'ana@x.com', contact_phone: '0981', claimed_at: new Date().toISOString(),
  slug: 'alfa', claim_status: 'pending', user_id: null };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <span id="adminName"></span><span id="adminRole"></span><span id="adminAvatar"></span><span id="pageTitle"></span>
  <span id="claimsBadge" class="hidden"></span>
  <div id="claimsSection"></div>
  <script>${CONFIG}</script>
  <script>${CLAIMS}</script>
  <script>
    window.__urls = [];
    window.apiAdminGet = async (url) => {
      window.__urls.push(url);
      return { success:true, data:[${JSON.stringify(SAMPLE)}],
        stats:{ total:8, pending:5, approved:2, rejected:1 },
        pagination:{ page: (url.match(/page=(\\d+)/)||[])[1] ? parseInt(url.match(/page=(\\d+)/)[1]) : 1, limit:25, total:60, pages:3 } };
    };
    window.apiAdminPost = async () => ({ success:true });
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
  await p.waitForTimeout(60);

  // init
  await p.evaluate(() => { window.__urls = []; return initClaimsSection(); });
  await p.waitForTimeout(60);
  check('carga sin errores', errs.length === 0, errs.join(' | '));
  check('render: search + stats + paginación existen',
    await p.evaluate(() => !!document.getElementById('claimSearch') && !!document.getElementById('claimsStats') && !!document.getElementById('claimsPagination')));
  check('primera carga: URL con page=1, sin status ni q',
    await p.evaluate(() => { const u = window.__urls[0]||''; return /page=1/.test(u) && !/status=/.test(u) && !/[?&]q=/.test(u); }), await p.evaluate(()=>window.__urls[0]));

  // tarjetas usan stats globales
  check('tarjeta "Todos" muestra el total global (8)',
    await p.evaluate(() => { const t = document.getElementById('claimsStats').textContent; return t.includes('8') && t.includes('Todos'); }));
  check('badge del menú usa pending global (5)',
    await p.evaluate(() => document.getElementById('claimsBadge').textContent === '5'));

  // filtro por estado
  let u = await p.evaluate(async () => { window.__urls = []; await filterClaims('pending'); return window.__urls[0]; });
  check('filterClaims(pending) → URL status=pending & page=1', /status=pending/.test(u) && /page=1/.test(u), u);

  u = await p.evaluate(async () => { window.__urls = []; await filterClaims('approved'); return window.__urls[0]; });
  check('filterClaims(approved) → URL status=approved', /status=approved/.test(u), u);

  // búsqueda con debounce
  u = await p.evaluate(async () => {
    window.__urls = [];
    doClaimSearch('gamma');
    await new Promise(r => setTimeout(r, 350));
    return window.__urls[window.__urls.length - 1] || '';
  });
  check('doClaimSearch("gamma") → URL con q=gamma (debounced)', /[?&]q=gamma/.test(u), u);

  // paginación directa
  u = await p.evaluate(async () => { window.__urls = []; await loadClaims(3); return window.__urls[0]; });
  check('loadClaims(3) → URL page=3', /page=3/.test(u), u);
  check('paginación renderizada (pages=3 → botones)',
    await p.evaluate(() => document.getElementById('claimsPagination').querySelectorAll('button').length > 0));

  await browser.close(); server.close();

  const C = fs.readFileSync(BASE + '/js/claims.js', 'utf8');
  check('src: loadClaims arma /claims con status/q/page', /apiAdminGet\(`\/claims\?\$\{params\}`\)/.test(C));
  check('src: input de búsqueda llama doClaimSearch', /oninput="doClaimSearch/.test(C));
  check('src: renderClaimsPagination existe', /function renderClaimsPagination/.test(C));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
