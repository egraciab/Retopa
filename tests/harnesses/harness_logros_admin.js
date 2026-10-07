// LOGROS (admin) — carga el achievements.js REAL, mockea apiAdminGet/apiAdminPost
// y verifica: render del editor, editar on/off + umbral, guardar (payload PUT),
// restablecer. Además chequea el CONTRATO: no manda umbral en métricas booleanas.
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http');
const ACH = fs.readFileSync('/root/work/opt/retopa/frontend/admin/js/achievements.js', 'utf8');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const SAVED = JSON.stringify([{ id:'querido', label:'Fans', threshold:5, order:0 }, { id:'ficha_completa', order:1 }]);

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <div id="logrosSection"></div>
  <script>
    window.__posts = [];
    window.__saved = ${JSON.stringify(SAVED)};
    window.apiAdminGet = async (ep) => ({ success:true, data:{ achievements_config: window.__saved } });
    window.apiAdminPost = async (ep, data, method) => { window.__posts.push({ ep, data, method }); return { success:true }; };
    window.escapeHtml = (t) => String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    window.showToast = () => {};
  </script>
  <script>${ACH}</script>
</body></html>`;

(async () => {
  const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(PAGE); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });

  await p.evaluate(() => initLogrosSection());
  await p.waitForTimeout(120);
  check('sin errores de script', errs.length === 0, errs.join(' | '));

  const R = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#logrosList [data-lg]')];
    const queridoRow = document.querySelector('[data-lg="querido"]');
    const queridoLabel = queridoRow ? queridoRow.querySelector('input[type="text"]').value : '';
    // ¿la fila booleana (verificado) NO tiene input de umbral number?
    const verifRow = document.querySelector('[data-lg="verificado"]');
    const verifNums = verifRow ? verifRow.querySelectorAll('input[type="number"]').length : -1;
    // ¿bien_valorado tiene 2 números (rating + reseñas)?
    const bvRow = document.querySelector('[data-lg="bien_valorado"]');
    const bvNums = bvRow ? bvRow.querySelectorAll('input[type="number"]').length : -1;
    return { nRows: rows.length, queridoLabel, verifNums, bvNums, order0: rows[0]?.getAttribute('data-lg') };
  });
  check('editor: 7 filas', R.nRows === 7, 'n=' + R.nRows);
  check('editor: config cargada (Querido → "Fans")', R.queridoLabel === 'Fans', R.queridoLabel);
  check('editor: Querido quedó primero (order del config)', R.order0 === 'querido', R.order0);
  check('editor: métrica booleana (Verificado) SIN input de umbral', R.verifNums === 0, 'nums=' + R.verifNums);
  check('editor: Bien valorado con 2 umbrales (rating+reseñas)', R.bvNums === 2, 'nums=' + R.bvNums);

  // Editar: apagar Verificado, umbral Querido=8, mover Impulso arriba
  await p.evaluate(() => {
    logrosSet('verificado', 'enabled', false);
    logrosSet('querido', 'threshold', 8);
    logrosSet('querido', 'label', 'Fanáticos');
  });
  await p.evaluate(() => { window.__posts = []; logrosSave(); });
  await p.waitForTimeout(80);

  const S = await p.evaluate(() => {
    const post = window.__posts[0];
    let cfg = null; try { cfg = JSON.parse(post.data.achievements_config); } catch (e) {}
    const byId = {}; (cfg || []).forEach(o => byId[o.id] = o);
    return {
      ep: post ? post.ep : '', method: post ? post.method : '',
      count: cfg ? cfg.length : -1,
      verificadoEnabled: byId.verificado ? byId.verificado.enabled : null,
      queridoThreshold: byId.querido ? byId.querido.threshold : null,
      queridoLabel: byId.querido ? byId.querido.label : null,
      verificadoHasThreshold: byId.verificado ? ('threshold' in byId.verificado) : null,
      impulsoHasThreshold: byId.impulso_activo ? ('threshold' in byId.impulso_activo) : null,
      bvHasMinReviews: byId.bien_valorado ? ('minReviews' in byId.bien_valorado) : null,
      allHaveOrder: (cfg || []).every((o, i) => o.order === i),
    };
  });
  check('guardar: PUT a /site-config', S.ep === '/site-config' && S.method === 'PUT', S.ep + ' ' + S.method);
  check('guardar: payload con los 7 logros', S.count === 7, 'n=' + S.count);
  check('guardar: Verificado apagado', S.verificadoEnabled === false);
  check('guardar: Querido umbral=8 y label editado', S.queridoThreshold === 8 && S.queridoLabel === 'Fanáticos', JSON.stringify([S.queridoThreshold, S.queridoLabel]));
  check('guardar: métrica booleana SIN threshold en el payload', S.verificadoHasThreshold === false && S.impulsoHasThreshold === false);
  check('guardar: Bien valorado CON minReviews', S.bvHasMinReviews === true);
  check('guardar: orden contiguo 0..6', S.allHaveOrder === true);

  // Restablecer → Querido vuelve a "Querido"
  await p.evaluate(() => logrosReset());
  const reset = await p.evaluate(() => document.querySelector('[data-lg="querido"] input[type="text"]').value);
  check('restablecer: vuelve a defaults (Querido)', reset === 'Querido', reset);

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
