// Recorte de imagen (mobile) — con una foto VERTICAL grande, los botones
// Cancelar / Guardar imagen deben quedar DENTRO de la pantalla. Usa el markup
// REAL del modal extraído de cliente/js/businesses.js.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const SRC = fs.readFileSync('/root/work/opt/retopa/frontend/cliente/js/businesses.js', 'utf8');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

// Extraer el markup real del modal (cssText + innerHTML) del fuente.
const css = (SRC.match(/modal\.style\.cssText\s*=\s*'([^']+)'/) || [])[1];
const html = (SRC.match(/modal\.innerHTML\s*=\s*`([\s\S]*?)`;/) || [])[1];
check('src: se extrajo el markup del modal', !!css && !!html);
// Contratos del fix sobre el fuente
check('src: la tarjeta tiene tope de altura (dvh) y es columna flex', /max-height:92dvh/.test(html) && /flex-direction:column/.test(html));
check('src: la imagen limita max-height (no solo max-width)', /id="cropperImg"[^>]*max-height:100%/.test(html));
check('src: el área de imagen es flexible y recorta el overflow', /flex:1 1 auto;min-height:0;[^"]*overflow:hidden/.test(html));

// Imagen vertical grande (relación 1:5) como data-URI SVG.
const TALL = "data:image/svg+xml," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='1500'><rect width='300' height='1500' fill='%23fbbf24'/></svg>");

// Control "VIEJO" (markup previo al fix) para demostrar el bug.
const OLD_HTML = `
  <div style="background:white;border-radius:20px;overflow:hidden;max-width:600px;width:100%">
    <div style="padding:16px 20px;border-bottom:1px solid #f1f5f9">Ajustar imagen</div>
    <div style="padding:16px;background:#0f172a"><img id="oldImg" style="max-width:100%;display:block"></div>
    <div style="padding:16px 20px;display:flex;gap:10px;justify-content:flex-end">
      <button id="oldCancel">Cancelar</button>
      <button id="oldSave">Guardar imagen</button>
    </div>
  </div>`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0">
  <div id="cropperModal" style="${css.replace('display:none', 'display:flex')}">${html}</div>
  <div id="oldModal" style="position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:20px">${OLD_HTML}</div>
</body></html>`;

(async () => {
  const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(PAGE); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  // Viewport tipo iPhone
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'load' });

  // Cargar la foto vertical en ambos modales
  await p.evaluate((tall) => {
    document.getElementById('cropperImg').src = tall;
    document.getElementById('oldImg').src = tall;
  }, TALL);
  await p.waitForTimeout(150);

  const vh = 844;

  // ── NUEVO: botones dentro de la pantalla ────────────────────────────────────
  const neu = await p.evaluate(() => {
    // ocultar el control viejo para medir el nuevo sin solaparse
    document.getElementById('oldModal').style.display = 'none';
    const btns = [...document.querySelectorAll('#cropperModal button')].filter(b => /Guardar imagen|Cancelar/.test(b.textContent));
    const card = document.querySelector('#cropperModal > div');
    const r = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: b.height }; };
    return { save: r(btns.find(b => /Guardar/.test(b.textContent))), cancel: r(btns.find(b => /Cancelar/.test(b.textContent))), cardH: card.getBoundingClientRect().height };
  });
  check('NUEVO: botón "Guardar imagen" DENTRO de la pantalla', neu.save.bottom <= vh && neu.save.top >= 0, `bottom=${Math.round(neu.save.bottom)} vh=${vh}`);
  check('NUEVO: botón "Cancelar" DENTRO de la pantalla', neu.cancel.bottom <= vh && neu.cancel.top >= 0, `bottom=${Math.round(neu.cancel.bottom)}`);
  check('NUEVO: la tarjeta no supera ~92dvh', neu.cardH <= vh * 0.93 + 1, `cardH=${Math.round(neu.cardH)}`);
  check('NUEVO: botones son tocables (altura ≥ 40px)', neu.save.h >= 40, `h=${Math.round(neu.save.h)}`);

  // ── VIEJO (control): el botón se va abajo de la pantalla ─────────────────────
  const old = await p.evaluate(() => {
    document.getElementById('oldModal').style.display = 'flex';
    document.getElementById('cropperModal').style.display = 'none';
    const b = document.getElementById('oldSave').getBoundingClientRect();
    return { bottom: b.bottom };
  });
  check('VIEJO (bug reproducido): "Guardar imagen" quedaba FUERA de la pantalla', old.bottom > vh, `bottom=${Math.round(old.bottom)} vh=${vh}`);

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
