// FUSIÓN DE FICHAS — UI DE PUNTA A PUNTA: config.js + leads.js + claims.js + merge.js
// REALES contra admin.js + directory.js REALES y Postgres efímero. Reproduce el caso
// (ficha original con visitas + alta web duplicada) y lo resuelve desde Captación/Leads.
// Playwright 390px y 1280px.
// Uso: node harness_fusion_ui.js <ROOT del repo (…/opt/retopa)> <main.css compilado>
const path = require('path'), fs = require('fs'), http = require('http');
const ROOT = process.argv[2] || '/opt/retopa';
const CSS = process.argv[3];
const SRC = path.join(ROOT, 'backend/src'), FE = path.join(ROOT, 'frontend');
process.env.DB_HOST = process.env.PGHOST || '/tmp'; process.env.DB_PORT = process.env.PGPORT || '5499';
process.env.DB_NAME = 'retopa'; process.env.DB_USER = 'retopa'; process.env.DB_PASSWORD = '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'harness-secret-0123456789abcdef';
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const mock = (rel, exports) => { const p = require.resolve(path.join(SRC, rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
mock('config/redis', { get: async () => null, setEx: async () => {}, set: async () => {}, keys: async () => [], del: async () => {}, on: () => {} });
mock('utils/kit-pdf', { buildKitBatchPdf: async () => Buffer.from('') });
mock('utils/sysnet', { getNetworkStats: async () => ({}) });
mock('utils/pwa-icon', { getPwaIcon: async () => null });
mock('helpers/notifyOwner', { notifyOwner: async () => {} });
mock('helpers/verifyFicha', { runVerifyFicha: async () => ({}) });
mock('config/mail', { sendEmail: async () => ({ success: true }), renderTemplate: async () => ({}) });

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/main.css"></head><body class="bg-gray-50">
<span id="adminName"></span><span id="adminRole"></span><span id="adminAvatar"></span>
<main class="p-3">
  <div id="mergeAssistant" class="hidden mb-4"></div>
  <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
    <div id="leadsBatchBar" class="hidden"><span id="leadsSelectedCount"></span></div>
    <div class="overflow-x-auto"><table class="w-full"><thead><tr><th><input type="checkbox" id="leadSelectAll"></th></tr></thead>
      <tbody id="leadsTable" class="divide-y divide-gray-100"></tbody></table></div>
    <div><span id="leadsPaginationInfo"></span><div id="leadsPaginationControls"></div></div>
  </div>
</main>
<div id="toastContainer" class="fixed top-4 right-4 z-[80] space-y-2"></div>
<div id="leadDetailModal" class="fixed inset-0 z-[60] hidden">
  <div class="modal-overlay absolute inset-0" onclick="closeModal('leadDetailModal')"></div>
  <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
    <div class="p-6" id="leadDetailContent"></div></div></div>
<script src="/admin/js/config.js"></script>
<script src="/admin/js/leads.js"></script>
<script src="/admin/js/claims.js"></script>
<script src="/admin/js/merge.js"></script>
<script>window.confirm = () => true; window.__toasts = []; const _st = showToast; showToast = (m, t) => { window.__toasts.push([t, m]); _st(m, t); };</script>
</body></html>`;

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, database: 'retopa', user: 'retopa' });
  const q = (s, p) => pool.query(s, p);
  const express = require('express'), jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs');
  const { chromium } = require('playwright');

  const app = express(); app.use(express.json());
  app.use('/api/v2/admin', require(path.join(SRC, 'routes/admin')));
  app.use('/api/v2/directory', require(path.join(SRC, 'routes/directory')));
  app.get('/main.css', (req, res) => res.type('text/css').send(fs.readFileSync(CSS, 'utf8')));
  app.get('/admin/js/:f', (req, res) => res.type('application/javascript').send(fs.readFileSync(path.join(FE, 'admin/js', req.params.f), 'utf8')));
  app.get('/', (req, res) => res.type('html').send(PAGE));
  const server = await new Promise(res => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body) => new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const r = http.request(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d || 'null') })); });
    r.on('error', reject); r.write(data); r.end();
  });

  // ── Semilla del caso (se rehace para cada ancho) ─────────────────────────────
  const h = await bcrypt.hash('x', 4);
  async function seed() {
    const old = (await q("SELECT id FROM businesses WHERE slug LIKE 'maxi-refrigeracion%' OR slug LIKE 'fz-%'")).rows.map(r => r.id);
    if (old.length) {
      await q('DELETE FROM business_merges WHERE survivor_id = ANY($1) OR duplicate_id = ANY($1)', [old]);
      await q('DELETE FROM service_leads WHERE business_id = ANY($1)', [old]);
      await q('DELETE FROM businesses WHERE id = ANY($1)', [old]);
    }
    await q("DELETE FROM users WHERE email LIKE '%@fzu.test'");
    await q("UPDATE service_leads SET archived = TRUE WHERE NOT archived");   // que el listado muestre solo el caso
    const ADM = (await q(`INSERT INTO users (email, password_hash, name, role) VALUES ('adm@fzu.test',$1,'Steve','admin') RETURNING id`, [h])).rows[0].id;
    let CAT = (await q("SELECT id FROM categories WHERE slug='fz-aire'")).rows[0];
    CAT = CAT ? CAT.id : (await q("INSERT INTO categories (name, slug) VALUES ('Aire acondicionado','fz-aire') RETURNING id")).rows[0].id;
    const ORIG = (await q(`INSERT INTO businesses (name, slug, city, address, phone, whatsapp, category_id, plan_type, is_active, created_at)
       VALUES ('Maxi Refrigeración, Electricidad y Lavarropas','maxi-refrigeracion-electricidad-y-lavarropas','Asunción',
               'Luis A. de Herrera 1569','0981595042','595981595042',$1,'basic',TRUE, NOW() - interval '400 days') RETURNING id`, [CAT])).rows[0].id;
    const U = (await q(`INSERT INTO users (email, password_hash, name, role, is_active, email_verified, phone)
       VALUES ('dure@fzu.test','!no-password!','Julio Duré','client',TRUE,FALSE,'+595981595042') RETURNING id`)).rows[0].id;
    await q('INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit) VALUES ($1,$2,TRUE,TRUE)', [U, ORIG]);
    for (let i = 0; i < 21; i++) await q('INSERT INTO business_views (business_id) VALUES ($1)', [ORIG]);
    const r = await post('/api/v2/directory/leads', {
      plan_type: 'basic', name: 'Maxi Refrigeracion electricidad y Lavarropas', phone: '595981595042', email: 'dure@fzu.test',
      contact_name: 'Julio César Duré', contact_email: 'dure@fzu.test', city: 'Asunción',
      description: 'Reparación de aires, heladeras y lavarropas a domicilio.', image_url: 'https://x/logo-nuevo.png' });
    const DUP = r.body.data.business.id;
    await q("INSERT INTO business_gallery (business_id, image_url, position) VALUES ($1,'https://x/nueva1.jpg',0)", [DUP]);
    const tok = jwt.sign({ id: ADM, role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 }, process.env.JWT_SECRET);
    return { ORIG, DUP, U, tok, ADM };
  }

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const width of [390, 1280]) {
    const S = await seed();
    const tag = `[${width}px]`;
    const ctx = await browser.newContext({ viewport: { width, height: 860 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await ctx.addInitScript(([t]) => {
      localStorage.setItem('adminToken', t); localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify({ name: 'Steve', role: 'admin' }));
    }, [S.tok]);
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(base + '/', { waitUntil: 'load' });
    await p.evaluate(() => loadAdminLeads());
    await p.waitForSelector('#mergeAssistant [data-merge-new]', { timeout: 5000 }).catch(() => {});

    const card = await p.locator('#mergeAssistant').innerText();
    check(`${tag} asistente visible: "Posibles fichas duplicadas (1)"`, /Posibles fichas duplicadas \(1\)/.test(card), card.slice(0, 120));
    check(`${tag} asistente: nombra las dos fichas y las visitas de la original`, /Maxi Refrigeracion electricidad/.test(card) && /Maxi Refrigeración, Electricidad/.test(card) && /21 visitas/.test(card));
    check(`${tag} asistente: evidencia con fuente (celular y correo)`, /Mismo celular 0981 595 042 · en el alta: .* · en la original: /.test(card) && /Mismo correo dure@fzu\.test/.test(card));
    await p.waitForSelector('#leadsTable button:has-text("posible duplicado")', { timeout: 3000 }).catch(() => {});
    check(`${tag} fila del lead: chip "posible duplicado"`, await p.locator('#leadsTable button:has-text("posible duplicado")').count() === 1);

    if (width === 390) {
      // Desde el lead: aviso dentro del modal
      await p.locator('#leadsTable button:has-text("posible duplicado")').click();
      await p.waitForSelector('#leadMergeHint button:has-text("Revisar y fusionar")', { timeout: 4000 }).catch(() => {});
      const hint = await p.locator('#leadMergeHint').innerText().catch(() => '');
      check(`${tag} modal del lead: "Esta alta parece ser «…» (#id · 21 visitas)"`, /Esta alta parece ser «Maxi Refrigeración, Electricidad y Lavarropas» \(#\d+ · 21 visitas\)/.test(hint), hint.slice(0, 160));
      await p.locator('#leadMergeHint button:has-text("Revisar y fusionar")').click();
    } else {
      await p.locator('#mergeAssistant button:has-text("Revisar y fusionar")').click();
    }
    await p.waitForSelector('#mergeApplyBtn', { timeout: 5000 }).catch(() => {});
    const mt = await p.locator('#mergeModalContent').innerText();
    check(`${tag} modal de fusión: "Se queda" la original con sus 21 visitas`, /Se queda[\s\S]*Maxi Refrigeración, Electricidad y Lavarropas[\s\S]*21 visitas/i.test(mt));
    check(`${tag} modal: por qué parecen la misma (con fuente)`, /Por qué parecen la misma[\s\S]*Mismo celular/i.test(mt));
    const chk = async f => p.evaluate(f => document.querySelector(`input[name="mf_${f}"]:checked`)?.value, f);
    check(`${tag} modal: correo, descripción y logo vienen marcados "Traer del alta"`, await chk('email') === 'duplicate' && await chk('description') === 'duplicate' && await chk('image_url') === 'duplicate');
    check(`${tag} modal: el nombre queda el de la original`, await chk('name') === 'survivor');
    check(`${tag} modal: explica qué pasa (inactiva, no se borra, link, revertir)`, /inactiva[\s\S]*no se borra[\s\S]*link[\s\S]*revertir/i.test(mt));
    const top = await p.evaluate(() => { const b = document.getElementById('mergeApplyBtn'); b.scrollIntoView(); const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el === b || b.contains(el); });
    check(`${tag} modal de fusión por ENCIMA del modal del lead (botón clicable)`, top);
    const ov = await p.evaluate(() => { const m = document.querySelector('#mergeModal > div:last-child'); return { sw: m.scrollWidth, cw: m.clientWidth, dw: document.documentElement.scrollWidth, vw: innerWidth }; });
    check(`${tag} sin scroll horizontal`, ov.sw <= ov.cw + 1 && ov.dw <= ov.vw + 1, JSON.stringify(ov));
    await p.screenshot({ path: path.join(__dirname, `fusion_modal_${width}.png`), fullPage: false });

    if (width === 1280) {
      await p.locator('button:has-text("Intercambiar")').click();
      await p.waitForFunction(() => /Se queda[\s\S]*Maxi Refrigeracion electricidad/i.test(document.getElementById('mergeModalContent').innerText), null, { timeout: 4000 }).catch(() => {});
      const sw = await p.locator('#mergeModalContent').innerText();
      check(`${tag} Intercambiar: ahora queda el alta, y avisa que la otra tiene más visitas`, /Se queda[\s\S]*Maxi Refrigeracion electricidad/i.test(sw) && /tiene más visitas/.test(sw));
      await p.locator('button:has-text("Intercambiar")').click();
      await p.waitForFunction(() => /Se queda[\s\S]*Maxi Refrigeración, Electricidad/i.test(document.getElementById('mergeModalContent').innerText), null, { timeout: 4000 }).catch(() => {});
    }

    // Fusionar
    await p.locator('#mergeApplyBtn').click();
    await p.waitForSelector('#notifyOwnerPanel', { timeout: 5000 }).catch(() => {});
    const d = (await q('SELECT is_active, merged_into FROM businesses WHERE id=$1', [S.DUP])).rows[0];
    const s = (await q('SELECT email, description FROM businesses WHERE id=$1', [S.ORIG])).rows[0];
    check(`${tag} fusionó: el alta inactiva y apunta a la original`, d.is_active === false && d.merged_into === S.ORIG);
    check(`${tag} la original quedó con el correo y la descripción del alta`, s.email === 'dure@fzu.test' && /a domicilio/.test(s.description || ''));
    const wa = await p.locator('#notifyOwnerWa').getAttribute('href').catch(() => '');
    check(`${tag} "Avisar por WhatsApp" al 0981 595 042 con "no tenés que cargar nada"`, wa.startsWith('https://wa.me/595981595042?text=') && /no%20ten%C3%A9s%20que%20cargar%20nada/.test(wa));
    check(`${tag} toast de éxito`, await p.evaluate(() => window.__toasts.some(t => t[0] === 'success' && /Fusionadas/.test(t[1]))));
    check(`${tag} los modales se cerraron`, await p.evaluate(() => document.getElementById('mergeModal').classList.contains('hidden') && document.getElementById('leadDetailModal').classList.contains('hidden')));
    await p.waitForFunction(() => /Sin fichas duplicadas/.test(document.getElementById('mergeAssistant').innerText), null, { timeout: 4000 }).catch(() => {});
    check(`${tag} el asistente queda vacío y el lead salió de Activos`, /Sin fichas duplicadas/.test(await p.locator('#mergeAssistant').innerText()) && !/Maxi/.test(await p.locator('#leadsTable').innerText()));

    // Fusiones hechas → Revertir
    await p.evaluate(() => document.getElementById('notifyOwnerPanel')?.remove());
    await p.locator('#mergeAssistant button:has-text("Fusiones hechas")').click();
    await p.waitForSelector('#mergeHistory button:has-text("Revertir")', { timeout: 4000 }).catch(() => {});
    const hist = await p.locator('#mergeHistory').innerText();
    check(`${tag} historial: la fusión con autor y lo que se trajo`, /Maxi Refrigeracion electricidad[\s\S]*Maxi Refrigeración, Electricidad[\s\S]*Steve[\s\S]*trajo: .*correo/.test(hist), hist.slice(0, 200));
    await p.locator('#mergeHistory button:has-text("Revertir")').click();
    await p.waitForSelector('#mergeAssistant [data-merge-new]', { timeout: 5000 }).catch(() => {});
    const d2 = (await q('SELECT is_active, merged_into FROM businesses WHERE id=$1', [S.DUP])).rows[0];
    check(`${tag} Revertir: el alta vuelve activa y el asistente la propone de nuevo`, d2.is_active && d2.merged_into === null && await p.locator('#mergeAssistant [data-merge-new]').count() === 1);

    // No es la misma
    await p.locator('#mergeAssistant button:has-text("No es la misma")').click();
    await p.waitForFunction(() => /Sin fichas duplicadas/.test(document.getElementById('mergeAssistant').innerText), null, { timeout: 4000 }).catch(() => {});
    const disc = (await q("SELECT count(*)::int n FROM business_merges WHERE duplicate_id=$1 AND status='descartada' AND created_by=$2", [S.DUP, S.ADM])).rows[0].n;
    check(`${tag} "No es la misma": queda registrado con autor y deja de proponerse`, disc === 1 && /Sin fichas duplicadas/.test(await p.locator('#mergeAssistant').innerText()));
    check(`${tag} sin errores de JS`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await q("UPDATE service_leads SET archived = FALSE WHERE archived AND archived_at IS NULL");
  // Limpieza: que los demás harnesses no cuenten estas fichas (claims "a revisar", leads…).
  { const ids = (await q("SELECT id FROM businesses WHERE slug LIKE 'maxi-refrigeracion%' OR slug LIKE 'fz-%' OR slug LIKE 'fzx-%' OR name LIKE 'FZX %'")).rows.map(r => r.id);
    if (ids.length) { await q('DELETE FROM business_merges WHERE survivor_id = ANY($1) OR duplicate_id = ANY($1)', [ids]);
      await q('DELETE FROM service_leads WHERE business_id = ANY($1)', [ids]); await q('DELETE FROM businesses WHERE id = ANY($1)', [ids]); }
    await q("DELETE FROM users WHERE email LIKE '%@fz.test' OR email LIKE '%@fzu.test'"); }
  await browser.close(); server.close(); await pool.end();
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
