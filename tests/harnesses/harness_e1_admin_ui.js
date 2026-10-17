// E1 — piezas de Admin (Claims, Prospectos, Usuarios) + ?acceso= público + aviso en Mi Portal.
// Playwright 390px con los JS reales, main.css compilado con la config real y una API simulada.
// Uso: node harness_e1_admin_ui.js <frontend_dir> <main.css compilado>
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path');
const FE = process.argv[2] || '.';
const CSS = process.argv[3] || path.join(FE, 'public/css/main.css');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const rd = rel => fs.readFileSync(path.join(FE, rel), 'utf8');

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/main.css"></head><body class="bg-gray-50"><main class="p-3">
<div id="claimsSection"></div><div id="prospectsSection"></div></main>
<span id="claimsBadge" class="hidden">0</span>
<script>
  window.__calls = []; window.__toasts = []; window.__opens = []; window.__waHref = null; window.__clip = null;
  window.__claims = null; window.__access = { success: true, url: 'https://dev.retopa.test/?acceso=' + 'f'.repeat(64), wa: '595981123456', name: 'Ana', business: 'Ferretería Sur', expires_days: 7 };
  async function apiAdminGet(ep) {
    window.__calls.push(['GET', ep]);
    if (ep.startsWith('/claims/funnel')) return { success: true, ready: false, days: 30 };
    if (ep === '/access-requests') return window.__ar || { success: true, data: [] };
    if (ep.startsWith('/claims')) return window.__claims;
    if (ep === '/prospects/sources') return { success: true, data: [{ source: 'prueba_steve', count: 1 }] };
    if (ep.startsWith('/prospects?')) return { success: true, data: [
      { whatsapp: '595981123456', estado: 'pendiente', fichas: [{ id: 55, name: 'Prueba Steve', trade_name: null, slug: 'prueba-steve', rubro: 'Ferreterías', rubro_slug: 'ferreterias', ciudad: 'Asunción', ficha_url: 'https://dev.retopa.test/negocio/prueba-steve' }], count: 1 },
      { whatsapp: '595984444444', estado: 'no_es', fichas: [{ id: 56, name: 'Otra', slug: 'otra', ciudad: 'Luque', ficha_url: 'https://dev.retopa.test/negocio/otra' }], count: 1 }],
      summary: null };
    return { success: true };
  }
  async function apiAdminPost(ep, body, method) {
    window.__calls.push([method || 'POST', ep, body]);
    if (ep.startsWith('/users/')) return window.__access;
    if (ep === '/claims/confirm-auto') return { success: true, notify: { wa: '595971222333', email: 'beto@x.com', emailed: true,
        message: '¡Hola Beto! Revisamos tu reclamo: Taller ya está verificado en RetoPA.\\nPara entrar a tu panel: https://dev.retopa.test/?acceso=' + 'e'.repeat(64) } };
    if (ep === '/claims/change-request') return { success: true, notify: { wa: null, email: null, emailed: false, message: 'x' } };
    if (ep.startsWith('/prospects/claim-link/')) return { success: true, claimed: false, url: 'https://dev.retopa.test/reclamar/?token=' + 'c'.repeat(64) + '&utm_source=wa&utm_campaign=prospectos' };
    return { success: true };
  }
  function showToast(m, t) { window.__toasts.push([t, m]); }
  function escapeHtml(text) { if (!text) return ''; const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
  window.confirm = () => true; window.prompt = () => '';
  window.open = (u) => { window.__opens.push(u); const w = { closed: false, opener: 1, location: {}, close() { this.closed = true; } };
    Object.defineProperty(w.location, 'href', { set(v) { window.__waHref = v; } }); return w; };
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__clip = t; } } });
</script>
<script src="/claims.js"></script><script src="/claim-funnel.js"></script><script src="/prospects.js"></script>
</body></html>`;

const CLAIMS = {
  success: true,
  stats: { total: 3, pending: 1, approved: 2, rejected: 0, to_review: 1 },
  pagination: { total: 3, page: 1, limit: 25, pages: 1 },
  data: [
    { id: 11, name: 'Ferretería <script>window.__xss=1</script> Sur', trade_name: null, slug: 'h-ferre', city: 'Luque', claim_status: 'approved',
      claimed_at: new Date().toISOString(), claim_method: 'token', claim_reviewed_at: null, to_review: true, origin: 'enlace',
      user_id: 7, user_name: 'Ana', contact_name: 'Ana', contact_email: null, contact_phone: '+595981123456', user_phone_verified_at: new Date().toISOString(),
      wa: '595981123456', message: '', evidence_url: '',
      change_requests: [{ id: 91, field: 'whatsapp', old_value: '595981123456', new_value: '+595991777888' }] },
    { id: 12, name: 'Kiosco Viejo', trade_name: null, slug: 'h-viejo', city: 'Asunción', claim_status: 'approved', origin: 'cuenta', to_review: false,
      user_id: 8, contact_name: 'Beto', contact_email: 'beto@x.com', contact_phone: null, change_requests: [] },
    { id: 13, name: 'Pendiente Form', trade_name: null, slug: 'h-pend', claim_status: 'pending', origin: 'formulario', to_review: false, user_id: null, change_requests: [] },
  ],
};

(async () => {
  const files = { '/main.css': fs.readFileSync(CSS, 'utf8'), '/claims.js': rd('admin/js/claims.js'), '/claim-funnel.js': rd('admin/js/claim-funnel.js'), '/prospects.js': rd('admin/js/prospects.js') };
  const server = http.createServer((req, res) => {
    if (files[req.url]) { res.writeHead(200, { 'Content-Type': req.url.endsWith('.css') ? 'text/css' : 'application/javascript' }); return res.end(files[req.url]); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });

  // ── Claims ─────────────────────────────────────────────────────────────────
  await p.evaluate(c => { window.__claims = c; initClaimsSection(); }, CLAIMS);
  await p.waitForFunction(() => document.querySelectorAll('#claimsList > div').length === 3);
  const stats = await p.locator('#claimsStats').innerText();
  check('Claims: tarjeta "A revisar" con 1', /1\s*A revisar/.test(stats), stats.replace(/\n/g, ' | '));
  check('badge del menú = pendientes + a revisar (2)', (await p.locator('#claimsBadge').innerText()) === '2');
  const card1 = p.locator('#claimsList > div').nth(0);
  const t1 = await card1.innerText();
  check('reclamo automático: etiqueta "Aprobado automáticamente · revisar" y origen Enlace', /Aprobado automáticamente · revisar/.test(t1) && /Enlace/.test(t1));
  check('WhatsApp marcado como verificado', /✓ verificado/.test(t1));
  check('botones Confirmar, Revertir y Link de acceso', /Confirmar/.test(t1) && /Revertir/.test(t1) && /Link de acceso/.test(t1));
  check('no ofrece "Reenviar activación" por correo a un reclamo por enlace', !/Reenviar activación/.test(t1));
  check('cambio pedido: campo, valor anterior → nuevo', /WhatsApp/.test(t1) && /595981123456/.test(t1) && /\+595991777888/.test(t1));
  check('nombre escapado (sin XSS)', await p.evaluate(() => !window.__xss));
  const t2 = await p.locator('#claimsList > div').nth(1).innerText();
  check('reclamo viejo por cuenta: sigue con su "Reenviar activación"', /Reenviar activación/.test(t2) && !/Revertir/.test(t2));

  await card1.locator('button', { hasText: 'Confirmar' }).click();
  await p.waitForTimeout(100);
  check('Confirmar → POST /claims/confirm-auto', await p.evaluate(() => window.__calls.some(c => c[1] === '/claims/confirm-auto' && c[2].business_id === 11)));
  check('Confirmar → panel "¿le avisamos?" con el correo enviado', await p.isVisible('#notifyOwnerPanel') && /Le mandamos un correo a beto@x\.com/.test(await p.locator('#notifyOwnerPanel').innerText()));
  const nHref = await p.getAttribute('#notifyOwnerWa', 'href');
  check('"Avisar por WhatsApp" es un enlace real al número con el mensaje y el acceso', nHref && nHref.startsWith('https://wa.me/595971222333?text=') && decodeURIComponent(nHref).includes('?acceso=' + 'e'.repeat(64)), (nHref || '').slice(0, 60));
  const nBox = await p.locator('#notifyOwnerPanel').boundingBox();
  check('panel de aviso entra en la pantalla a 390px', nBox && nBox.x >= 0 && nBox.x + nBox.width <= 390, JSON.stringify(nBox));
  await p.locator('#claimsList > div').nth(0).locator('button', { hasText: 'Revertir' }).click();
  await p.waitForTimeout(100);
  check('Revertir → pide confirmación y POST /claims/revert', await p.evaluate(() => window.__calls.some(c => c[1] === '/claims/revert' && c[2].business_id === 11)));
  await p.locator('#claimsList > div').nth(0).locator('[data-cr-box] button', { hasText: '✓' }).click();
  await p.waitForTimeout(100);
  check('✓ en el cambio → POST /claims/change-request approve', await p.evaluate(() => window.__calls.some(c => c[1] === '/claims/change-request' && c[2].id === 91 && c[2].decision === 'approve')));
  check('cambio resuelto sin celular ni correo → lo dice, sin botón de WhatsApp', /No dejó correo/.test(await p.locator('#notifyOwnerPanel').innerText()) && (await p.locator('#notifyOwnerWa').count()) === 0);
  await p.evaluate(() => document.getElementById('notifyOwnerPanel')?.remove());

  await p.locator('#claimsList > div').nth(0).locator('button', { hasText: 'Link de acceso' }).click();
  await p.waitForFunction(() => window.__waHref);
  const wa = await p.evaluate(() => ({ opens: window.__opens, href: window.__waHref, clip: window.__clip }));
  const waMsg = decodeURIComponent(wa.href.split('text=')[1] || '');
  check('Link de acceso: abre la pestaña dentro del toque (no la bloquea el navegador)', wa.opens[0] === 'about:blank');
  check('Link de acceso: WhatsApp del dueño con el link y el aviso de 7 días', wa.href.startsWith('https://wa.me/595981123456?text=') && waMsg.includes('?acceso=' + 'f'.repeat(64)) && /7 días/.test(waMsg) && /¡Hola Ana!/.test(waMsg), waMsg.slice(0, 120));
  check('Link de acceso: también queda copiado', wa.clip === waMsg);
  await p.evaluate(() => { window.__access = Object.assign({}, window.__access, { wa: null }); window.__waHref = null; window.__opens = []; });
  await p.evaluate(() => sendAccessLink(8));
  check('sin celular: no abre WhatsApp, copia y avisa', await p.evaluate(() => !window.__waHref && window.__toasts.some(t => /quedó copiado/.test(t[1]))));
  let overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('Claims a 390px sin scroll horizontal', overflow <= 0, 'overflow=' + overflow);
  await p.screenshot({ path: path.join(__dirname, 'claims_e1_390.png'), fullPage: false });

  // ── Pedidos de acceso por WhatsApp (login sin contraseña) ───────────────────
  await p.evaluate(() => { window.__ar = { success: true, data: [
      { id: 1, phone: '+595982000111', created_at: new Date(Date.now() - 5 * 60000).toISOString(), user_id: 21, user_name: 'Beto', business: 'Taller Beto', wa: '595982000111' },
      { id: 2, phone: '+595989999999', created_at: new Date().toISOString(), user_id: null, user_name: null, business: null, wa: '595989999999' }] };
    window.__access = { success: true, url: 'https://dev.retopa.test/?acceso=' + 'a'.repeat(64), wa: '595982000111', name: 'Beto', business: 'Taller Beto' };
    window.__calls = []; window.__waHref = null; window.__opens = []; return loadAccessRequests(); });
  const arTxt = await p.locator('#arCard').innerText();
  check('Claims: "Pedidos de acceso · 2" con nombre, negocio y número', /Pedidos de acceso · 2/.test(arTxt) && /Beto/.test(arTxt) && /Taller Beto/.test(arTxt) && /\+595982000111/.test(arTxt));
  check('pedido de un número sin cuenta: lo dice y solo ofrece descartar', /Sin cuenta con ese número/.test(arTxt) && (await p.locator('.ar-row').nth(1).locator('button', { hasText: 'Mandar link' }).count()) === 0);
  await p.locator('.ar-row').nth(0).locator('button', { hasText: 'Mandar link' }).click();
  await p.waitForFunction(() => window.__waHref);
  const ar = await p.evaluate(() => ({ href: window.__waHref, calls: window.__calls }));
  check('"Mandar link" → WhatsApp del dueño con su link de acceso', ar.href.startsWith('https://wa.me/595982000111?text=') && decodeURIComponent(ar.href).includes('?acceso=' + 'a'.repeat(64)));
  check('…y lo marca atendido', ar.calls.some(c => c[1] === '/access-requests/handled' && c[2].phone === '+595982000111'));
  await p.evaluate(() => { window.__ar = { success: true, data: [] }; return loadAccessRequests(); });
  check('sin pedidos → el bloque no aparece', (await p.locator('#arCard').count()) === 0);

  // ── Prospectos ─────────────────────────────────────────────────────────────
  await p.evaluate(() => { document.getElementById('claimsSection').innerHTML = '';
    try { localStorage.setItem(PROSPECT_TEMPLATE_KEY, 'Hola {nombre}! Mirá tu ficha: {link_ficha}'); } catch (e) {} });
  await p.evaluate(() => initProspectsSection());
  await p.waitForFunction(() => document.querySelectorAll('#prospTableBody tr').length >= 1);
  check('plantilla vieja con {link_ficha} → aviso para pasar a {link_reclamo}', await p.isVisible('#prospTplHint'));
  await p.click('#prospTplHint button');
  check('"Usar {link_reclamo}" reemplaza el placeholder y guarda', /\{link_reclamo\}/.test(await p.inputValue('#prospTemplate')) && !(await p.isVisible('#prospTplHint'))
        && await p.evaluate(() => /\{link_reclamo\}/.test(localStorage.getItem(PROSPECT_TEMPLATE_KEY))));
  check('estado "No es suyo" disponible en Prospectos', /No es suyo/.test(await p.locator('#prospectsSection').innerText()));
  await p.evaluate(() => { window.__waHref = null; window.__opens = []; window.__calls = []; });
  await p.evaluate(() => prospectWhatsApp('595981123456'));
  await p.waitForFunction(() => window.__waHref);
  const pw = await p.evaluate(() => ({ opens: window.__opens, href: window.__waHref, calls: window.__calls }));
  const pmsg = decodeURIComponent(pw.href.split('text=')[1] || '');
  check('WhatsApp con {link_reclamo}: pestaña abierta en el toque', pw.opens[0] === 'about:blank');
  check('pide el enlace de la ficha principal (id 55)', pw.calls.some(c => c[1] === '/prospects/claim-link/55'));
  check('mensaje con el enlace de RECLAMO (no la ficha pública)', pmsg.includes('/reclamar/?token=' + 'c'.repeat(64) + '&utm_source=wa') && !pmsg.includes('/negocio/prueba-steve'), pmsg);
  check('marca el número como "enviado"', pw.calls.some(c => c[0] === 'PATCH' && c[1] === '/prospects/outreach/595981123456' && c[2].estado === 'enviado'));
  overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('Prospectos a 390px: la página no se desborda', overflow <= 0, 'overflow=' + overflow);
  check('sin errores de script (admin)', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // ── Público: ?acceso= (js/auth.js real, función aislada) ───────────────────
  const authJs = rd('js/auth.js');
  const fn = authJs.match(/async function handleAccessLink\(token\) \{[\s\S]*?\n\}\n/);
  check('auth.js: maneja ?acceso= al iniciar', /get\('acceso'\)/.test(authJs) && /handleAccessLink\(accesoToken\)/.test(authJs));
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await p2.goto(url + '?acceso=' + 'f'.repeat(64));
  const res2 = await p2.evaluate(async (src) => {
    const out = { toasts: [], redirect: null, posted: null };
    window.apiPost = async (ep, body) => { out.posted = [ep, body]; return { success: true, token: 'jwt.x.y', user: { id: 7, has_business: true } }; };
    window.showToastPublic = (m, t) => out.toasts.push([t, m]);
    window.currentUser = null;
    const realSetTimeout = window.setTimeout; window.setTimeout = (f) => { out.redirectFn = String(f); };
    eval(src + '; window.__h = handleAccessLink;');
    await window.__h('f'.repeat(64));
    out.url = location.search; out.token = localStorage.getItem('token');
    window.setTimeout = realSetTimeout;
    return out;
  }, fn ? fn[0] : '');
  check('acceso: llama a /auth/access-link con el token', res2.posted && res2.posted[0] === '/auth/access-link' && res2.posted[1].token === 'f'.repeat(64));
  check('acceso: borra el token de la barra de direcciones', res2.url === '');
  check('acceso: guarda la sesión y saluda', res2.token === 'jwt.x.y' && res2.toasts.some(t => /Entrando a tu panel/.test(t[1])));
  check('acceso: va a Mi Portal', /\/cliente\//.test(res2.redirectFn || ''));
  await ctx2.close();

  // ── Mi Portal: tras guardar, recarga desde el servidor y re-pinta el Dashboard ─
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await ctx3.newPage();
  await p3.goto(url);
  const r3 = await p3.evaluate(async (src) => {
    const out = { reloads: 0, dash: 0, toasts: [] };
    const _gid = document.getElementById.bind(document);
    document.getElementById = id => _gid(id) || Object.assign(document.createElement('input'), { value: '' });
    window.clientPut = async () => ({ success: true, slug: 'nuevo-slug', pending_review: [] });
    window.showToastClient = m => out.toasts.push(m);
    window.renderBusinessList = () => {}; window.closeEditModal = () => { editingSlug = null; };
    window.reloadMyBusinesses = async () => { out.reloads++; };
    window.loadDashboard = () => { out.dash++; };
    eval(src + `; window.__save = saveBizEdit; window.__set = (s) => { editingSlug = s; };`);
    window._currentSection = 'dashboard'; window.activeDashBiz = 'viejo-slug';
    var _currentSection = 'dashboard', activeDashBiz = 'viejo-slug';
    window.__set('viejo-slug');
    await window.__save();
    out.active = activeDashBiz;
    return out;
  }, (rd('cliente/js/businesses.js').match(/let editingSlug[^\n]*\n/) || [''])[0] + 'let _selectedCatIds = [];\nlet myBusinesses = [{ slug: "viejo-slug" }];\n' +
     (rd('cliente/js/businesses.js').match(/async function saveBizEdit\(\) \{[\s\S]*?\n\}\n/) || [''])[0]);
  check('Mi Portal: al guardar recarga las empresas del servidor', r3.reloads === 1, JSON.stringify(r3));
  check('Mi Portal: y re-pinta el Dashboard con lo nuevo', r3.dash === 1);
  check('Mi Portal: si cambió el slug, el Dashboard sigue a la ficha', r3.active === 'nuevo-slug');
  await ctx3.close();

  // ── Mi Portal: aviso de cambios en revisión (estático) ─────────────────────
  const biz = rd('cliente/js/businesses.js');
  check('Mi Portal: no muestra como aplicado lo que quedó en revisión', /pending\.forEach\(f => \{ delete applied\[f\]; \}\)/.test(biz) && /Object\.assign\(myBusinesses\[idx\], applied\)/.test(biz));
  check('Mi Portal: avisa "lo revisamos y te avisamos"', /lo revisamos y te avisamos/.test(biz));

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
