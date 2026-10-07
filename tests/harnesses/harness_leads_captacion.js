// UI de Leads — reetiquetado a CAPTACIÓN (Nuevo → Verificado/Descartado) +
// botón "Verificar ficha". Carga config.js + leads.js REALES en el navegador
// (Playwright) y verifica el render y el POST /leads/:id/verify-ficha.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const BASE = '/root/work/opt/retopa/frontend/admin';
const CONFIG = fs.readFileSync(BASE + '/js/config.js', 'utf8');
const LEADS = fs.readFileSync(BASE + '/js/leads.js', 'utf8');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

// DOM mínimo que config.js toca al cargar + contenedores de leads.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <span id="adminName"></span><span id="adminRole"></span><span id="adminAvatar"></span><span id="pageTitle"></span>
  <table><tbody id="leadsTable"></tbody></table>
  <div id="leadDetailModal" class="hidden"><div id="leadDetailContent"></div></div>
  <div id="leadsPaginationInfo"></div><div id="leadsPaginationControls"></div>
  <!-- filtros -->
  <select id="leadFilterOrigin"><option value=""></option><option value="captacion"></option><option value="venta"></option></select>
  <select id="leadFilterStatus"><option value=""></option><option value="pending"></option><option value="verificado"></option><option value="descartado"></option><option value="contacted"></option><option value="negotiating"></option><option value="won"></option><option value="lost"></option><option value="follow_up"></option></select>
  <!-- KPI captación -->
  <h4 id="capKpiPorVerificar"></h4><p id="capKpiPorVerificarDelta"></p>
  <h4 id="capKpiVerificados"></h4><p id="capKpiVerificadosDelta"></p>
  <h4 id="capKpiTasa"></h4><p id="capKpiTasaDelta"></p>
  <h4 id="capKpiDescartados"></h4><p id="capKpiDescartadosDelta"></p>
  <!-- KPI venta -->
  <h4 id="ventaKpiPipeline"></h4><p id="ventaKpiPipelineDelta"></p>
  <h4 id="ventaKpiContactados"></h4><p id="ventaKpiContactadosDelta"></p>
  <h4 id="ventaKpiGanados"></h4><p id="ventaKpiGanadosDelta"></p>
  <h4 id="ventaKpiPerdidos"></h4><p id="ventaKpiPerdidosDelta"></p>
  <script>${CONFIG}</script>
  <script>${LEADS}</script>
  <script>
    // Interceptar la red DESPUÉS de cargar los reales.
    window.__posts = [];
    window.apiAdminPost = async (endpoint, data, method='POST') => { window.__posts.push({ endpoint, data, method }); return { success:true, verified:true, opportunity_created:true }; };
    window.apiAdminGet = async (endpoint) => {
      if (/^\\/leads\\/\\d+$/.test(endpoint)) return { success:true, data: window.__leadById || null };
      if (endpoint.startsWith('/leads')) return { success:true, data: [] };
      return { success:true, data: [] }; // categories, cities, etc.
    };
    window.updateBatchBar = () => {};
    window.showToast = () => {};
    window.__loadAdminLeadsCalls = 0;
    window.loadAdminLeads = async () => { window.__loadAdminLeadsCalls++; };
    window.__setLeadViewCalls = [];
    window.setLeadView = (v) => { window.__setLeadViewCalls.push(v); window.currentLeadView = v; };
    window.loadCategoriesCache = async () => {};
    window.loadCitiesCache = async () => {};
  </script>
</body></html>`;

(async () => {
  const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(PAGE); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  // path con 'login' → checkAdminAuth() hace return temprano (no redirige).
  const url = 'http://127.0.0.1:' + server.address().port + '/login';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    localStorage.setItem('token', 'h.e.s');
    localStorage.setItem('user', JSON.stringify({ name: 'Tester', role: 'admin' }));
  });
  const p = await ctx.newPage();
  p.on('dialog', d => d.accept()); // aceptar confirm()
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(80);

  check('config.js + leads.js cargan sin errores', errs.length === 0, errs.join(' | '));
  check('funciones expuestas (isCaptacionLead, renderLeadsTable, verifyFichaFromLead, filterLeadsBy)',
    await p.evaluate(() => typeof isCaptacionLead === 'function' && typeof renderLeadsTable === 'function' && typeof verifyFichaFromLead === 'function' && typeof openLeadModal === 'function' && typeof filterLeadsBy === 'function' && typeof loadLeadsStats === 'function'));

  // ── A) Discriminador de captación ────────────────────────────────────────
  check('A web_register en notes → captación', await p.evaluate(() => isCaptacionLead({ notes: '{"source":"web_register"}' }) === true));
  check('A source directo → captación', await p.evaluate(() => isCaptacionLead({ source: 'web_register' }) === true));
  check('A ficha gratis (basic) SIN source → captación (caso Syrocco)', await p.evaluate(() => isCaptacionLead({ service_type: 'basic', notes: '{"ruc":"800"}' }) === true));
  check('A sin plan (service_type vacío) → captación', await p.evaluate(() => isCaptacionLead({ business_name: 'X', notes: '{}' }) === true));
  check('A lead de venta (featured) → NO captación', await p.evaluate(() => isCaptacionLead({ service_type: 'featured', notes: '{}' }) === false));
  check('A premium → NO captación', await p.evaluate(() => isCaptacionLead({ service_type: 'premium', notes: '{}' }) === false));
  check('A general → NO captación', await p.evaluate(() => isCaptacionLead({ service_type: 'general', notes: '{}' }) === false));
  check('A claim → NO captación', await p.evaluate(() => isCaptacionLead({ service_type: 'claim', notes: '{"source":"claim_request"}' }) === false));

  // ── B) Badges de estado nuevos ───────────────────────────────────────────
  check('B badge "verificado" → "Verificado"', await p.evaluate(() => getStatusBadge('verificado').includes('Verificado')));
  check('B badge "descartado" → "Descartado"', await p.evaluate(() => getStatusBadge('descartado').includes('Descartado')));

  // ── C) Fila de captación en la tabla ─────────────────────────────────────
  const capRow = await p.evaluate(() => {
    const lead = { id: 11, contact_name: 'Keyla Rico', contact_email: 'k@x.com', business_name: 'Panadería Rico', service_type: 'basic', status: 'pending', created_at: '2026-01-01', notes: '{"source":"web_register","ruc":"800-1"}' };
    renderLeadsTable([lead], '');
    return document.getElementById('leadsTable').innerHTML;
  });
  check('C captación: botón "Verificar ficha" (verifyFichaFromLead)', /verifyFichaFromLead\(11\)/.test(capRow));
  check('C captación: badge "Nuevo · por verificar"', capRow.includes('Nuevo · por verificar'));
  check('C captación: NO muestra botón Ganado (won)', !/updateLeadStatus\(11, 'won'\)/.test(capRow));
  check('C captación: ofrece Descartar', /updateLeadStatus\(11, 'descartado'\)/.test(capRow));

  // ── D) Fila de venta en la tabla ─────────────────────────────────────────
  const saleRow = await p.evaluate(() => {
    const lead = { id: 22, contact_name: 'Cliente Pago', contact_email: 'c@x.com', business_name: 'Empresa SA', service_type: 'featured', status: 'contacted', created_at: '2026-01-01', notes: '{}' };
    renderLeadsTable([lead], '');
    return document.getElementById('leadsTable').innerHTML;
  });
  check('D venta: mantiene botón Ganado (won)', /updateLeadStatus\(22, 'won'\)/.test(saleRow));
  check('D venta: NO muestra "Verificar ficha"', !/verifyFichaFromLead\(22\)/.test(saleRow));

  // ── E) Modal de captación ────────────────────────────────────────────────
  const capModal = await p.evaluate(async () => {
    window.__leadById = { id: 33, contact_name: 'Nuevo Prospecto', contact_email: 'n@x.com', business_name: 'Ferretería', service_type: 'basic', status: 'pending', created_at: '2026-01-01', notes: '{"source":"web_register"}' };
    await openLeadModal(33);
    return document.getElementById('leadDetailContent').innerHTML;
  });
  check('E modal captación: banner "Etapa de captación"', capModal.includes('Etapa de captación'));
  check('E modal captación: botón "Verificar ficha"', capModal.includes('Verificar ficha'));
  check('E modal captación: pipeline con "Verificado"', capModal.includes('Verificado'));
  check('E modal captación: sin paso "Negociando"', !capModal.includes('Negociando'));

  // ── F) Modal de venta ────────────────────────────────────────────────────
  const saleModal = await p.evaluate(async () => {
    window.__leadById = { id: 44, contact_name: 'Cliente Pago', contact_email: 'c@x.com', business_name: 'Empresa SA', service_type: 'featured', status: 'contacted', created_at: '2026-01-01', notes: '{}' };
    await openLeadModal(44);
    return document.getElementById('leadDetailContent').innerHTML;
  });
  check('F modal venta: pipeline comercial (Negociando)', saleModal.includes('Negociando'));
  check('F modal venta: incluye "Ganado"', saleModal.includes('Ganado'));
  check('F modal venta: SIN banner de captación', !saleModal.includes('Etapa de captación'));

  // ── G) verifyFichaFromLead → POST /leads/:id/verify-ficha ────────────────
  const posts = await p.evaluate(async () => {
    window.__posts = [];
    await verifyFichaFromLead(77);
    return window.__posts;
  });
  check('G llama exactamente 1 POST', posts.length === 1, 'n=' + posts.length);
  check('G endpoint = /leads/77/verify-ficha', posts[0] && posts[0].endpoint === '/leads/77/verify-ficha');
  check('G método POST', posts[0] && (posts[0].method === 'POST' || posts[0].method === undefined));

  // ── H) KPIs dinámicos: captación vs venta + tasa + deltas ────────────────
  const kpi = await p.evaluate(async () => {
    const nowISO = new Date().toISOString();
    const oldISO = '2020-01-01T00:00:00Z';
    const cap = (status, created) => ({ status, service_type: 'basic', created_at: created, notes: '{"source":"web_register"}' });
    const vta = (status, created) => ({ status, service_type: 'featured', created_at: created, notes: '{}' });
    const data = [
      cap('pending', nowISO), cap('pending', nowISO), cap('pending', oldISO),  // porVerificar=3 (+2 en 7d)
      cap('verificado', nowISO), cap('verificado', oldISO),                     // verificados=2
      cap('descartado', nowISO),                                                // descartados=1 → tasa 2/3
      vta('pending', nowISO), vta('contacted', nowISO), vta('negotiating', nowISO), // pipeline=3, contactados=1
      vta('won', nowISO), vta('won', oldISO), vta('lost', nowISO),              // ganados=2, perdidos=1
    ];
    window.apiAdminGet = async () => ({ success: true, data });
    await loadLeadsStats();
    const t = id => document.getElementById(id).textContent;
    return {
      porVerificar: t('capKpiPorVerificar'), porVerificarDelta: t('capKpiPorVerificarDelta'),
      verificados: t('capKpiVerificados'), tasa: t('capKpiTasa'), tasaDelta: t('capKpiTasaDelta'),
      descartados: t('capKpiDescartados'), pipeline: t('ventaKpiPipeline'),
      contactados: t('ventaKpiContactados'), ganados: t('ventaKpiGanados'), perdidos: t('ventaKpiPerdidos'),
    };
  });
  check('H por verificar = 3', kpi.porVerificar === '3', kpi.porVerificar);
  check('H delta "+2 nuevas · 7 días"', /\+2/.test(kpi.porVerificarDelta), kpi.porVerificarDelta);
  check('H verificados = 2', kpi.verificados === '2');
  check('H tasa de verificación = 67%', kpi.tasa === '67%', kpi.tasa);
  check('H tasa sub "de 3 resueltos"', /3 resueltos/.test(kpi.tasaDelta), kpi.tasaDelta);
  check('H descartados = 1', kpi.descartados === '1');
  check('H pipeline de venta = 3', kpi.pipeline === '3', kpi.pipeline);
  check('H contactados venta = 1', kpi.contactados === '1');
  check('H ganados = 2', kpi.ganados === '2');
  check('H perdidos = 1', kpi.perdidos === '1');

  // ── I) filterLeadsBy: setea filtros + vista y recarga ────────────────────
  const flt = await p.evaluate(async () => {
    window.currentLeadView = 'active'; window.__setLeadViewCalls = []; window.__loadAdminLeadsCalls = 0;
    filterLeadsBy({ origin: 'captacion', status: 'verificado', view: 'archived' });
    const a = { origin: document.getElementById('leadFilterOrigin').value, status: document.getElementById('leadFilterStatus').value, views: [...window.__setLeadViewCalls] };
    window.currentLeadView = 'active'; window.__setLeadViewCalls = []; window.__loadAdminLeadsCalls = 0;
    filterLeadsBy({ origin: 'venta', status: '', view: 'active' });
    const b = { views: [...window.__setLeadViewCalls], reloads: window.__loadAdminLeadsCalls };
    return { a, b };
  });
  check('I setea origen=captacion', flt.a.origin === 'captacion');
  check('I setea estado=verificado', flt.a.status === 'verificado');
  check('I cambia a vista archived vía setLeadView', flt.a.views.length === 1 && flt.a.views[0] === 'archived');
  check('I misma vista → recarga sin setLeadView', flt.b.views.length === 0 && flt.b.reloads === 1);

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
