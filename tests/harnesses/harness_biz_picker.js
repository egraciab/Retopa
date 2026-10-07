// Plantillas — buscador de fichas con autocompletado (reemplaza al <select> que
// solo cargaba 200 fichas verificadas). Carga config.js + templates.js reales en
// el navegador y verifica la búsqueda server-side + el autocompletado del email.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const BASE = '/root/work/opt/retopa/frontend/admin';
const CONFIG = fs.readFileSync(BASE + '/js/config.js', 'utf8');
const TEMPLATES = fs.readFileSync(BASE + '/js/templates.js', 'utf8');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <span id="adminName"></span><span id="adminRole"></span><span id="adminAvatar"></span><span id="pageTitle"></span>
  <input type="text" id="testBizSearch2">
  <input type="hidden" id="testEmailBiz2" value="">
  <div id="bizPickerResults2" class="hidden"></div>
  <p id="bizPickerChosen2" class="hidden"></p>
  <input type="email" id="testEmailTo2" value="">
  <script>${CONFIG}</script>
  <script>${TEMPLATES}</script>
  <script>
    window.__lastUrl = null;
    window.apiAdminGet = async (url) => {
      window.__lastUrl = url;
      if (url.indexOf('/businesses') === 0) {
        return { success:true, data:[
          { slug:'farmacia-sur', name:'Farmacia Sur', trade_name:'Farmacia Sur', email:'sur@farma.com', city:'Asunción', verified:true },
          { slug:'farmacia-norte', name:'Farmacia Norte SA', trade_name:'', email:'', city:'Luque', verified:false },
        ]};
      }
      return { success:true, data:[] };
    };
  </script>
</body></html>`;

(async () => {
  const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(PAGE); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/login';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    localStorage.setItem('token', 'h.e.s');
    localStorage.setItem('user', JSON.stringify({ name: 'Tester', role: 'admin', email: 'admin@x.com' }));
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(60);

  check('config.js + templates.js cargan sin errores', errs.length === 0, errs.join(' | '));
  check('funciones expuestas (bizPickerSearch/bizPickerPick)',
    await p.evaluate(() => typeof bizPickerSearch === 'function' && typeof bizPickerPick === 'function'));

  // <2 chars → no busca, oculto
  await p.evaluate(() => { window.__lastUrl = null; bizPickerSearch('2', 'f'); });
  await p.waitForTimeout(320);
  check('1 char → NO busca (resultados ocultos)', await p.evaluate(() => window.__lastUrl === null && document.getElementById('bizPickerResults2').classList.contains('hidden')));

  // 'farma' → busca server-side sobre TODAS las fichas
  await p.evaluate(() => bizPickerSearch('2', 'farma'));
  await p.waitForTimeout(350);
  const st = await p.evaluate(() => ({
    url: window.__lastUrl,
    open: !document.getElementById('bizPickerResults2').classList.contains('hidden'),
    rows: document.querySelectorAll('#bizPickerResults2 > div').length,
    html: document.getElementById('bizPickerResults2').innerHTML,
  }));
  check('busca a /businesses?q=farma&limit=15', st.url === '/businesses?q=farma&limit=15', st.url);
  check('NO usa verified=true ni limit=200 (trae todas)', !/verified=true/.test(st.url) && !/limit=200/.test(st.url));
  check('muestra los resultados (2 fichas)', st.open && st.rows === 2, 'rows=' + st.rows);
  check('lista verificadas y NO verificadas', /Farmacia Sur/.test(st.html) && /Farmacia Norte/.test(st.html));

  // elegir una ficha con email → autocompleta slug + email
  await p.evaluate(() => bizPickerPick('2', 'farmacia-sur'));
  let r = await p.evaluate(() => ({
    slug: document.getElementById('testEmailBiz2').value,
    to: document.getElementById('testEmailTo2').value,
    search: document.getElementById('testBizSearch2').value,
    chosenShown: !document.getElementById('bizPickerChosen2').classList.contains('hidden'),
    closed: document.getElementById('bizPickerResults2').classList.contains('hidden'),
  }));
  check('al elegir → slug oculto seteado (lo lee sendReal)', r.slug === 'farmacia-sur');
  check('al elegir → autocompleta el email del destinatario', r.to === 'sur@farma.com');
  check('al elegir → muestra la ficha elegida en el buscador', r.search === 'Farmacia Sur');
  check('al elegir → cierra el desplegable + confirma elección', r.closed && r.chosenShown);

  // elegir una ficha SIN email → setea slug pero no pisa el email con vacío
  await p.evaluate(() => { document.getElementById('testEmailTo2').value = 'previo@x.com'; bizPickerPick('2', 'farmacia-norte'); });
  r = await p.evaluate(() => ({ slug: document.getElementById('testEmailBiz2').value, to: document.getElementById('testEmailTo2').value }));
  check('ficha sin email → slug ok y NO borra el email previo', r.slug === 'farmacia-norte' && r.to === 'previo@x.com');

  await browser.close(); server.close();

  // Contrato sobre el fuente
  const T = fs.readFileSync(BASE + '/js/templates.js', 'utf8');
  const H = fs.readFileSync(BASE + '/index.html', 'utf8');
  check('src: templates.js ya NO usa loadTestBizOptions para testEmailBiz2', !/loadTestBizOptions\('testEmailBiz2'\)/.test(T));
  check('src: index.html tiene el input de búsqueda (testBizSearch2)', /id="testBizSearch2"/.test(H) && /id="testEmailBiz2"[^>]*type="hidden"|type="hidden"[^>]*id="testEmailBiz2"/.test(H));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
