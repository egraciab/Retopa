// REGISTRO z-index — verifica que el modal de registro quede POR ENCIMA de la
// ficha (#profileModal z-85) y de la barra de acciones (.rp-ficha-actions z-86).
// Reproduce el bug "el formulario queda detrás de la ficha" y prueba el fix.
// Uso: node harness_registro_zindex.js <frontend_dir>
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path');
const FE = process.argv[2] || '.';
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

// --- 1) Chequeo estático del index.html editado ---
const html = fs.readFileSync(path.join(FE, 'index.html'), 'utf8');
const regLine = (html.split('\n').find(l => /id="registroModal"/.test(l)) || '');
const zMatch = regLine.match(/z-index:\s*(\d+)/);
check('index.html: #registroModal ya NO está en z-[70]', !/z-\[70\]/.test(regLine), regLine.trim().slice(0, 90));
check('index.html: #registroModal con z-index alto (>86)', !!zMatch && Number(zMatch[1]) > 86, 'z=' + (zMatch ? zMatch[1] : '?'));
const Z = zMatch ? Number(zMatch[1]) : 10000;

// --- 2) Prueba de apilamiento en vivo (mismos z que producción) ---
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font-family:system-ui,sans-serif}
  .fixed{position:fixed}.inset-0{inset:0}.hidden{display:none}
  .rp-ficha-actions{position:fixed;left:0;right:0;bottom:0;z-index:86;display:flex;gap:8px;padding:10px 12px;background:#fff;border-top:1px solid #e5e7eb}
  .rp-fa{flex:1;min-height:48px;display:flex;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:12px}
</style></head><body>
  <!-- Ficha abierta: MISMO z que producción -->
  <div id="profileModal" style="position:fixed;inset:0;z-index:85">
    <div style="position:absolute;inset:0;background:#fff"></div>
    <div style="position:absolute;inset:8px;background:#eef;border-radius:16px">Ficha HEPTA STORE…</div>
    <div class="rp-ficha-actions"><a class="rp-fa">Llamar</a><a class="rp-fa">WhatsApp</a><a class="rp-fa">Llegar</a></div>
  </div>
  <!-- Modal de registro con el z del fix -->
  <div id="registroModal" class="fixed inset-0 hidden" style="z-index:${Z}">
    <div style="position:absolute;inset:0;background:rgba(0,0,0,.6)"></div>
    <div style="position:absolute;inset:6% 5%;background:#fff;border-radius:16px">Formulario de registro…</div>
  </div>
</body></html>`;

(async () => {
  const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(PAGE); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });

  // Con el modal OCULTO, al centro está la ficha (sanity)
  const beforeCenter = await p.evaluate(() => { const el = document.elementFromPoint(195, 300); return !!(el && el.closest('#profileModal')); });
  check('oculto: al centro se ve la ficha (sanity)', beforeCenter === true);

  // Abrir el registro (como openRegistroModal: quita 'hidden')
  await p.evaluate(() => document.getElementById('registroModal').classList.remove('hidden'));
  const R = await p.evaluate(() => {
    const center = document.elementFromPoint(195, 300);
    const bottom = document.elementFromPoint(195, 820); // donde está la barra de acciones
    return {
      centerInReg: !!(center && center.closest('#registroModal')),
      centerInProfile: !!(center && center.closest('#profileModal') && !center.closest('#registroModal')),
      bottomInReg: !!(bottom && bottom.closest('#registroModal')),
    };
  });
  check('sin errores de script', errs.length === 0, errs.join(' | '));
  check('abierto: al centro, arriba está el REGISTRO (no la ficha)', R.centerInReg && !R.centerInProfile);
  check('abierto: al pie, el registro tapa la barra de acciones', R.bottomInReg);

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
