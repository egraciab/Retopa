// LOGROS (cliente) — carga el dashboard.js REAL y prueba renderAchievements con
// config del Admin (achievements_config), con defaults y con config inválida.
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http');
const DASH = fs.readFileSync('/root/work/opt/retopa/frontend/cliente/js/dashboard.js', 'utf8');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const BIZ = { completion: { completion: 100 }, rating: 4.6, review_count: 5, like_count: 12, views_30d: 150, verified: true, boosted: false };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <div id="out"></div>
  <script>
    // stubs de deps que dashboard.js podría tocar (solo se usan dentro de otras fns)
    window.clientGet = async () => ({ success:true, data:[] });
    window.showToast = () => {};
  </script>
  <script>${DASH}</script>
</body></html>`;

(async () => {
  const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(PAGE); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  check('dashboard.js carga sin errores', errs.length === 0, errs.join(' | '));

  // Helper: renderiza con una config dada y devuelve un resumen inspeccionable
  const renderWith = (cfg, biz) => p.evaluate(({ cfg, biz }) => {
    window._retopaSiteConfig = cfg === undefined ? {} : { achievements_config: cfg };
    const html = renderAchievements(biz);
    const box = document.getElementById('out'); box.innerHTML = html;
    const tiles = [...box.querySelectorAll('.grid > div')];
    const items = tiles.map(t => {
      const label = t.querySelector('span') ? t.querySelector('span').textContent : '';
      const circle = t.querySelector('div');
      const bg = circle ? circle.style.background || circle.style.backgroundColor : '';
      // "logrado" = el círculo tiene color (no el gris #f1f5f9)
      const done = bg && !/241|242|247|f1f5f9/i.test(bg);
      return { label, done };
    });
    const det = box.querySelector('details');
    return { html, labels: items.map(i => i.label), done: items.filter(i => i.done).map(i => i.label), n: items.length, headerCount: (box.textContent.match(/(\d+)\/(\d+)/) || [null])[0], explain: det ? det.textContent : '' };
  }, { cfg, biz });

  // A) SIN config → 7 defaults, 6 logrados (todos menos Impulso activo)
  const A = await renderWith(undefined, BIZ);
  check('defaults: 7 logros', A.n === 7, 'n=' + A.n + ' ' + JSON.stringify(A.labels));
  check('defaults: 6 logrados (falta Impulso activo)', A.done.length === 6 && !A.done.includes('Impulso activo'), JSON.stringify(A.done));
  check('defaults: contador 6/7', A.headerCount === '6/7', A.headerCount);

  // B) Config: apagar Verificado, subir orden de Querido, umbral Querido=5 y relabel "Fans"
  const cfgB = JSON.stringify([
    { id:'verificado', enabled:false },
    { id:'querido', order:0, threshold:5, label:'Fans' },
  ]);
  const B = await renderWith(cfgB, BIZ);
  check('config: Verificado apagado (no aparece)', !B.labels.includes('Verificado') && B.n === 6, 'n=' + B.n + ' ' + JSON.stringify(B.labels));
  check('config: Querido renombrado a "Fans" (presente)', B.labels.includes('Fans'), JSON.stringify(B.labels));
  check('config: "Fans" logrado con umbral 5 (12>=5)', B.done.includes('Fans'));

  // B3) ORDEN con config COMPLETA (como la guarda el Admin: order 0..6 en todos)
  const idsDef = ['ficha_completa','verificado','bien_valorado','con_resenas','querido','en_movimiento','impulso_activo'];
  const cfgOrder = JSON.stringify(idsDef.slice().reverse().map((id, i) => ({ id, order: i })));
  const F = await renderWith(cfgOrder, BIZ);
  check('config: orden completo respetado (Impulso activo primero)', F.labels[0] === 'Impulso activo' && F.labels[6] === 'Ficha completa', JSON.stringify(F.labels));

  // B2) Umbral que NO se cumple: Querido threshold 50 → no logrado
  const cfgB2 = JSON.stringify([{ id:'querido', threshold:50 }]);
  const B2 = await renderWith(cfgB2, BIZ);
  check('config: umbral alto (50) → Querido NO logrado', !B2.done.includes('Querido'), JSON.stringify(B2.done));

  // C) Config inválida → defaults (7)
  const C1 = await renderWith('esto no es json', BIZ);
  const C2 = await renderWith(JSON.stringify({ no:'array' }), BIZ);
  check('config basura (no-JSON) → defaults 7', C1.n === 7);
  check('config no-array → defaults 7', C2.n === 7);

  // D) Round-trip: payload estilo Admin (sólo algunos campos) se completa con defaults
  const adminPayload = JSON.stringify([
    { id:'ficha_completa', enabled:true, label:'100%!', icon:'fa-clipboard-check', color:'#22c55e', threshold:100, order:0 },
    { id:'bien_valorado', enabled:true, label:'Top', icon:'fa-star', color:'#f59e0b', threshold:4.5, minReviews:3, order:1 },
    // el resto no viene → deben aparecer con sus defaults
  ]);
  const D = await renderWith(adminPayload, BIZ);
  check('round-trip: sigue habiendo 7 (los faltantes por default)', D.n === 7, 'n=' + D.n);
  check('round-trip: labels editados presentes', D.labels.includes('100%!') && D.labels.includes('Top'), JSON.stringify(D.labels));

  // G) EXPLICACIÓN "¿Qué significa cada logro?" sincroniza con la config
  //    G1) default: {umbral} sustituido (Querido → "Sumá 10")
  check('explicación default: {umbral} sustituido (Sumá 10)', /Sumá\s*10\s*[""]?me gusta/.test(A.explain) || /Sumá\s*10/.test(A.explain), A.explain.match(/Sumá[^.]*/)?.[0]);
  check('explicación default: NO quedan placeholders {umbral}', !/\{umbral\}/.test(A.explain) && !/\{min_reviews\}/.test(A.explain));
  //    G2) cambiar umbral de Querido a 25 → la explicación dice 25 (no 10)
  const G = await renderWith(JSON.stringify([{ id:'querido', threshold:25 }]), BIZ);
  check('explicación sigue el umbral: Querido dice 25', /Sumá\s*25/.test(G.explain) && !/Sumá\s*10/.test(G.explain), G.explain.match(/Sumá[^.]*/)?.[0]);
  //    G3) pista custom con {umbral} → se sustituye
  const G2 = await renderWith(JSON.stringify([{ id:'querido', threshold:7, hint:'Conseguí {umbral} corazones', label:'Corazones' }]), BIZ);
  check('explicación: pista custom con {umbral} sustituida', /Conseguí\s*7\s*corazones/.test(G2.explain), G2.explain.match(/Conseguí[^.]*/)?.[0]);
  check('explicación: label editado aparece en la explicación', /Corazones:/.test(G2.explain));
  //    G4) bien_valorado con {umbral} y {min_reviews}
  const G3 = await renderWith(JSON.stringify([{ id:'bien_valorado', threshold:4, minReviews:5 }]), BIZ);
  check('explicación: {min_reviews} sustituido (Promedio 4+ con 5)', /Promedio\s*4\+\s*con\s*5/.test(G3.explain), G3.explain.match(/Promedio[^.]*/)?.[0]);

  // E) Apagar TODOS → panel vacío (string vacío)
  const allOff = JSON.stringify(['ficha_completa','verificado','bien_valorado','con_resenas','querido','en_movimiento','impulso_activo'].map(id => ({ id, enabled:false })));
  const E = await p.evaluate((cfg) => { window._retopaSiteConfig = { achievements_config: cfg }; return renderAchievements({ completion:{completion:100} }); }, allOff);
  check('todos apagados → no se renderiza el panel', E === '' , JSON.stringify(E).slice(0,40));

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
