// Usuarios (UI) — etiqueta de "Último acceso" + acción "Enviar correo/plantilla".
// Carga config.js + templates.js (TEMPLATE_DEFS) + users.js reales en el navegador.
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
  <script>${CONFIG}</script>
  <script>${TEMPLATES}</script>
  <script>${USERS}</script>
  <script>
    window.__posts = [];
    window.apiAdminPost = async (endpoint, data, method) => { window.__posts.push({ endpoint, data, method }); return { success:true, message:'ok' }; };
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

  check('config/templates/users cargan sin errores', errs.length === 0, errs.join(' | '));
  check('funciones expuestas (userLastSeenLabel, openSendEmailToUser, sendTemplateToUser)',
    await p.evaluate(() => typeof userLastSeenLabel === 'function' && typeof openSendEmailToUser === 'function' && typeof sendTemplateToUser === 'function'));

  // ── Etiqueta de último acceso ─────────────────────────────────────────────
  const lbl = await p.evaluate(() => ({
    nunca: userLastSeenLabel(null),
    online: userLastSeenLabel(new Date().toISOString()),
    d3: userLastSeenLabel(new Date(Date.now() - 3 * 86400000).toISOString()),
    old: userLastSeenLabel(new Date(Date.now() - 400 * 86400000).toISOString()),
  }));
  check('last_seen null → "Nunca"', /Nunca/.test(lbl.nunca));
  check('last_seen ahora → "En línea"', /En l[íi]nea/.test(lbl.online));
  check('last_seen 3 días → "hace 3 días"', /hace 3 d[íi]as/.test(lbl.d3), lbl.d3);
  check('last_seen viejo → "+1 año"', /a[ñn]o/.test(lbl.old), lbl.old);

  // ── Modal de envío de plantilla ───────────────────────────────────────────
  const modal = await p.evaluate(() => {
    openSendEmailToUser(7, 'ana@x.com', 'Ana', 'ficha-ana');
    const m = document.getElementById('sendUserEmailModal');
    const sel = document.getElementById('userEmailTemplate');
    return { exists: !!m, options: sel ? sel.options.length : 0, htmlHasFicha: m ? m.innerHTML.includes('usa su ficha') : false };
  });
  check('abre el modal de envío', modal.exists);
  check('carga plantillas desde TEMPLATE_DEFS (>3 opciones)', modal.options > 3, 'opts=' + modal.options);
  check('indica que usará la ficha del usuario como datos', modal.htmlHasFicha);

  // ── Enviar → POST /notify/send-template con el payload correcto ───────────
  const post = await p.evaluate(async () => {
    window.__posts = [];
    const sel = document.getElementById('userEmailTemplate');
    sel.value = sel.options[1].value; // elegir una plantilla concreta
    const tpl = sel.value;
    await sendTemplateToUser('ana@x.com', 'ficha-ana');
    return { posts: window.__posts, tpl };
  });
  check('envía exactamente 1 POST', post.posts.length === 1);
  check('POST a /notify/send-template', post.posts[0] && post.posts[0].endpoint === '/notify/send-template');
  check('payload: template + to + business_slug', post.posts[0] && post.posts[0].data.template === post.tpl && post.posts[0].data.to === 'ana@x.com' && post.posts[0].data.business_slug === 'ficha-ana');
  check('cierra el modal tras enviar', await p.evaluate(() => !document.getElementById('sendUserEmailModal')));

  await browser.close(); server.close();

  // Contrato sobre el fuente
  const U = fs.readFileSync(BASE + '/js/users.js', 'utf8');
  const H = fs.readFileSync(BASE + '/index.html', 'utf8');
  check('src: la fila usa userLastSeenLabel(u.last_seen_at)', /userLastSeenLabel\(u\.last_seen_at\)/.test(U));
  check('src: la fila tiene la acción openSendEmailToUser', /openSendEmailToUser\(\$\{u\.id\}/.test(U));
  check('src: KPIs usan data.stats (globales)', /data\.stats/.test(U));
  check('src: header tiene "Último acceso"', /&Uacute;ltimo acceso|Último acceso/.test(H));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
