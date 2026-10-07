// RECLAMO (claim) — verifica que el modal de reclamo quede POR ENCIMA de la
// ficha (#profileModal z-85) y de la barra de acciones fija (.rp-ficha-actions
// z-index:86). Reproduce el bug "queda detrás de la ficha" y prueba el fix.
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http');
const INTER = fs.readFileSync('/root/work/opt/retopa/frontend/js/interactions.js', 'utf8');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font-family:system-ui,sans-serif}
  /* shim mínimo de utilidades usadas por el modal de reclamo */
  .fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}
  .inset-0{inset:0}.z-10{z-index:10}
  .flex{display:flex}.items-center{align-items:center}.justify-center{justify-content:center}.p-4{padding:1rem}
  .bg-black\\/60{background:rgba(0,0,0,.6)}
  /* barra de acciones fija REAL (Etapa 4) */
  .rp-ficha-actions{position:fixed;left:0;right:0;bottom:0;z-index:86;display:flex;gap:8px;padding:10px 12px;background:#fff;border-top:1px solid #e5e7eb}
  .rp-fa{flex:1;min-height:48px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:12px}
  .btn-brand{background:#1B3A6B}
</style></head><body>
  <!-- Ficha abierta: MISMOS z-index que producción -->
  <div id="profileModal" style="position:fixed;inset:0;z-index:85">
    <div style="position:absolute;inset:0;background:#fff"></div>
    <div style="position:absolute;inset:8px;background:#fff;border-radius:16px">Ficha de la empresa…</div>
    <div class="rp-ficha-actions">
      <a class="rp-fa">Llamar</a><a class="rp-fa">WhatsApp</a><a class="rp-fa">Llegar</a>
    </div>
  </div>
  <script>
    window.apiPost = async () => ({ success: true });
    window.apiGet  = async () => ({ success: true, data: [] });
    window.showToast = () => {};
    window.trackClick = () => {};
  </script>
  <script>${INTER}</script>
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

  const R = await p.evaluate(() => {
    openClaimModal('cerrajeria-gb', 'Cerrajería GB 24 Horas');
    const modal = document.getElementById('claimModal');
    const panel = modal.querySelector('.relative');
    const cs = getComputedStyle(modal);
    // ¿Qué elemento está ARRIBA en el centro y en el fondo (donde está la barra)?
    const centerEl = document.elementFromPoint(195, 422);
    const bottomEl = document.elementFromPoint(195, 820);
    return {
      exists: !!modal,
      zIndex: cs.zIndex,
      position: cs.position,
      centerInClaim: !!(centerEl && centerEl.closest('#claimModal')),
      centerInProfile: !!(centerEl && centerEl.closest('#profileModal') && !centerEl.closest('#claimModal')),
      bottomInClaim: !!(bottomEl && bottomEl.closest('#claimModal')),
      panelOverflow: panel ? getComputedStyle(panel).overflowY : '',
      panelMaxH: panel ? panel.style.maxHeight : '',
      leadingQuote: /^\s*"/.test((panel && panel.textContent) || ''),
    };
  });

  check('sin errores de script', errs.length === 0, errs.join(' | '));
  check('el modal de reclamo existe y es fixed', R.exists && R.position === 'fixed');
  check('z-index del reclamo = 10000 (por encima de ficha 85 y barra 86)', R.zIndex === '10000', 'z=' + R.zIndex);
  check('al centro, lo de arriba es el reclamo (no la ficha)', R.centerInClaim && !R.centerInProfile);
  check('al pie, el reclamo tapa la barra de acciones fija', R.bottomInClaim);
  check('panel scrolleable en mobile (overflow-y:auto + max-height)', R.panelOverflow === 'auto' && /vh/.test(R.panelMaxH), R.panelOverflow + ' / ' + R.panelMaxH);
  check('sin comilla suelta al inicio del panel (no se coló un ")', R.leadingQuote === false);

  await p.screenshot({ path: '/root/work/claim_fix_390.png' });
  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
