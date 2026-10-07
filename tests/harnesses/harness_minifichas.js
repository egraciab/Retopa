// MINI-FICHAS — renderBusinessCard REAL con likes + aro de completitud.
// Verifica (390px, mobile-first): aro presente/ausente según completitud, color
// por umbral, % correcto, likes solo si ≥1. Toma screenshot para revisión visual.
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http');
const SEARCH = fs.readFileSync('/root/work/opt/retopa/frontend/js/search.js', 'utf8');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const biz = (o) => Object.assign({
  name: 'Negocio', tradeName: o.tradeName || 'Negocio', slug: o.slug || 's', city: 'Luque',
  categoryName: 'Tiendas y Comercios', categorySlug: 'tiendas', verified: true,
  rating: 4.7, reviewCount: 3, phone: '0981000000', whatsapp: '595981000000',
}, o);
const DATA = [
  biz({ tradeName: 'PopPochinga',   slug: 'pop',   completion: { completion: 95 }, likeCount: 12, reviewCount: 3, rating: 4.7 }),
  biz({ tradeName: 'HEPTA GROUP',   slug: 'hepta', completion: { completion: 62 }, likeCount: 4,  reviewCount: 2, rating: 5.0 }),
  biz({ tradeName: 'Taller Nuevo',  slug: 'tall',  completion: { completion: 25 }, likeCount: 0,  reviewCount: 0 }),
  biz({ tradeName: 'Sin Aro Ni Likes', slug: 'sin', completion: null,             likeCount: 0,  reviewCount: 1, rating: 5.0 }),
];

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  :root{--rp-border:#e5e7eb;--rp-ink:#111827;--rp-ink-2:#6b7280;--rp-bg:#f8fafc;--rp-wa:#0F7A43}
  body{font-family:-apple-system,system-ui,sans-serif;background:#f1f5f9;margin:0;padding:12px}
  .rp-card{display:flex;gap:12px;padding:12px;background:#fff;border:1px solid var(--rp-border);border-radius:16px;cursor:pointer;align-items:flex-start;margin-bottom:12px}
  .rp-card-thumb{width:64px;height:64px;border-radius:12px;flex-shrink:0;overflow:hidden;position:relative;background:var(--rp-bg)}
  .rp-card-thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .rp-thumb-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:24px;color:#fff}
  .rp-card-body{flex:1;min-width:0}
  .rp-card-title{font-weight:800;color:var(--rp-ink);font-size:15px;line-height:1.25;display:flex;align-items:center;gap:6px}
  .rp-card-title .rp-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
  .rp-card-meta{color:var(--rp-ink-2);font-size:12.5px;margin-top:2px;line-height:1.35;display:flex;align-items:center;flex-wrap:wrap;gap:2px 0}
  .rp-card-status{font-size:12px;margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .rp-card-actions{display:flex;gap:8px;margin-top:10px}
  .rp-act{flex:1;min-height:44px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:700;font-size:13px;text-decoration:none;border:1px solid var(--rp-border);background:#fff;color:var(--rp-ink);padding:0 6px}
  .rp-act-wa{background:var(--rp-wa);color:#fff;border-color:var(--rp-wa)}
  /* Sustitutos de FontAwesome solo para el screenshot */
  .fas,.fab{font-style:normal}
  .fa-heart::before{content:"♥"} .fa-star::before{content:"★"} .fa-phone::before{content:"📞"}
  .fa-whatsapp::before{content:"🟢"} .fa-diamond-turn-right::before{content:"➤"} .fa-circle-check::before{content:"✔"}
</style></head><body>
  <div id="list"></div>
  <script>${SEARCH}</script>
  <script>
    // Stubs mínimos de dependencias externas a search.js:
    if (typeof buildWaUrl !== 'function') window.buildWaUrl = (b) => 'https://wa.me/' + (b.whatsapp || '');
    if (typeof imgFallback !== 'function') window.imgFallback = function(){};
    // Fijamos el estado de horario para aislar el test al aro/likes:
    window.renderHoursCompact = () => '<span style="color:#16a34a;font-weight:700">Abierto 24h</span>';
    document.getElementById('list').innerHTML = window.__DATA.map(renderBusinessCard).join('');
  </script>
</body></html>`;

(async () => {
  const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(PAGE); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1')) return route.continue();
    return route.fulfill({ status: 200, body: '' });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((d) => { window.__DATA = d; }, DATA);
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(200);

  check('sin errores de script', errs.length === 0, errs.join(' | '));

  const R = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.rp-card')];
    const info = cards.map(c => {
      const ring = c.querySelector('.rp-card-thumb > div[aria-label]');
      const ringPct = ring ? ring.textContent.trim() : null;
      const ringStroke = ring ? (ring.querySelector('svg circle:last-child')?.getAttribute('stroke') || '') : '';
      const heart = c.querySelector('.rp-card-status .fa-heart');
      const likeTxt = heart ? heart.parentElement.textContent.trim() : null;
      return { name: c.querySelector('.rp-name')?.textContent, ringPct, ringStroke, likeTxt };
    });
    return info;
  });
  const byName = n => R.find(x => x.name === n) || {};

  check('aro 95% presente y verde', byName('PopPochinga').ringPct === '95' && byName('PopPochinga').ringStroke === '#22c55e', JSON.stringify(byName('PopPochinga')));
  check('aro 62% presente y ámbar', byName('HEPTA GROUP').ringPct === '62' && byName('HEPTA GROUP').ringStroke === '#E8B84B', JSON.stringify(byName('HEPTA GROUP')));
  check('aro 25% presente y gris', byName('Taller Nuevo').ringPct === '25' && byName('Taller Nuevo').ringStroke === '#94a3b8', JSON.stringify(byName('Taller Nuevo')));
  check('sin completitud → sin aro', byName('Sin Aro Ni Likes').ringPct === null);
  check('likes 12 visibles', /12/.test(byName('PopPochinga').likeTxt || ''), byName('PopPochinga').likeTxt);
  check('likes 4 visibles', /4/.test(byName('HEPTA GROUP').likeTxt || ''));
  check('likeCount 0 → sin corazón (Taller)', byName('Taller Nuevo').likeTxt === null);
  check('likeCount 0 → sin corazón (Sin Aro)', byName('Sin Aro Ni Likes').likeTxt === null);

  await p.screenshot({ path: '/root/work/minifichas_390.png', fullPage: true });
  console.log('screenshot → /root/work/minifichas_390.png');
  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
