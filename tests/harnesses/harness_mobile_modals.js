// Auditoría mobile — ningún modal CENTRADO del panel cliente debe quedar sin
// tope de altura (si no, sus botones se van de pantalla, como pasaba en el
// recorte de logo). Escanea el fuente + prueba en navegador el caso "muchas
// empresas" del selector de boost.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const DIR = '/root/work/opt/retopa/frontend/cliente/js';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

// ── (a) Escaneo del fuente: todo overlay fixed+center → card con tope ────────
function scanFile(file) {
  const src = fs.readFileSync(`${DIR}/${file}`, 'utf8');
  // overlays centrados (align-items:center) con position:fixed
  const re = /position:fixed[^"'`]*align-items:center[^"'`]*/g;
  let m, n = 0, capped = 0;
  while ((m = re.exec(src))) {
    n++;
    // mirar los ~500 chars siguientes: debe aparecer un tope de altura antes del próximo cierre
    const after = src.slice(m.index, m.index + 900);
    if (/max-height:\s*\d+(dvh|vh)|max-h-\[\d+/.test(after)) capped++;
  }
  return { n, capped };
}
for (const f of ['businesses.js', 'promotions.js', 'dashboard.js']) {
  const r = scanFile(f);
  check(`src ${f}: los ${r.n} modal(es) centrado(s) tienen tope de altura`, r.n === 0 || r.capped === r.n, `capped=${r.capped}/${r.n}`);
}
// Contratos específicos de los dos fixes de hoy
const PROMO = fs.readFileSync(`${DIR}/promotions.js`, 'utf8');
const DASH = fs.readFileSync(`${DIR}/dashboard.js`, 'utf8');
const BIZ = fs.readFileSync(`${DIR}/businesses.js`, 'utf8');
check('boostBizModal: card con tope vh+dvh + overflow-y:auto (fallback robusto)', /max-width:400px;padding:24px;max-height:88vh;max-height:88dvh;overflow-y:auto/.test(PROMO));
check('welcomeWizard: card con tope vh+dvh + overflow-y:auto (fallback robusto)', /max-width:440px;width:100%;max-height:90vh;max-height:90dvh;overflow-y:auto/.test(DASH));
check('cropper (fix previo) sigue con 92dvh + columna flex', /max-height:92dvh;display:flex;flex-direction:column/.test(BIZ));
// Fallback vh presente ANTES de cada dvh (para navegadores sin soporte dvh).
for (const [name, src] of [['businesses.js', BIZ], ['promotions.js', PROMO], ['dashboard.js', DASH]]) {
  const dvhs = [...src.matchAll(/max-height:(\d+)dvh/g)];
  const allHaveFallback = dvhs.every(mm => src.slice(Math.max(0, mm.index - 40), mm.index).includes(`max-height:${mm[1]}vh`));
  check(`${name}: cada max-height dvh tiene fallback vh antes`, allHaveFallback, `dvh=${dvhs.length}`);
}

// Extraer el estilo real de la card del boost para la prueba de navegador.
const boostCardStyle = (PROMO.match(/id="boostBizModal"[\s\S]*?<div style="(background:white;border-radius:20px;width:100%;max-width:400px;padding:24px;max-height:88vh;max-height:88dvh;overflow-y:auto)"/) || [])[1];

(async () => {
  check('src: se extrajo el estilo real de la card del boost', !!boostCardStyle);

  // ── (b) Navegador: boost con MUCHAS empresas → "Cancelar" dentro de pantalla ─
  const items = Array.from({ length: 15 }, (_, i) =>
    `<button style="display:block;width:100%;padding:14px;margin-bottom:8px;border:1px solid #e2e8f0;border-radius:12px;background:#fff">Empresa ${i + 1}</button>`).join('');
  const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">
    <div id="boostBizModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
      <div style="${boostCardStyle}">
        <h3 style="font-size:16px;font-weight:800;margin:0 0 16px">Para qué empresa?</h3>
        ${items}
        <button id="boostCancel" style="width:100%;padding:10px;border:none;background:none;color:#94a3b8">Cancelar</button>
      </div>
    </div></body></html>`;

  const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(PAGE); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(80);

  const res = await p.evaluate(() => {
    const card = document.querySelector('#boostBizModal > div');
    const cancel = document.getElementById('boostCancel');
    // el botón Cancelar es alcanzable scrolleando dentro de la card
    cancel.scrollIntoView({ block: 'nearest' });
    const cb = cancel.getBoundingClientRect();
    return { cardH: card.getBoundingClientRect().height, cancelBottom: cb.bottom, cancelTop: cb.top, scrollable: card.scrollHeight > card.clientHeight + 2 };
  });
  check('boost con 15 empresas: la card ENTRA en la pantalla (tope aplicado)', res.cardH <= 844 - 16, `cardH=${Math.round(res.cardH)} (viewport 844)`);
  check('boost: la card es scrolleable (no corta contenido)', res.scrollable);
  check('boost: "Cancelar" queda DENTRO de la pantalla tras scroll', res.cancelBottom <= 844 && res.cancelTop >= 0, `bottom=${Math.round(res.cancelBottom)}`);

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
