// PROSPECTOS (admin frontend) — carga el prospects.js REAL con mocks de
// apiAdminGet/apiAdminPost y verifica: render + agrupación, plantilla con
// placeholders, botón WhatsApp (wa.me + PATCH 'enviado'), estado, contadores,
// aviso ≥30, filas "sin WhatsApp".
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http');
const PROSPECTS = fs.readFileSync('/root/work/opt/retopa/frontend/admin/js/prospects.js', 'utf8');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const mkFicha = (id, name, rubro, rubroSlug, ciudad, slug) => ({ id, name, trade_name: name, slug, rubro, rubro_slug: rubroSlug, ciudad, ficha_url: 'https://retopa.com.py/negocio/' + slug });
const GROUPS = [
  { whatsapp: '595981111111', estado: 'pendiente', fecha_contacto: null, notas: null, count: 4, fichas: [
      mkFicha(1, 'Cerrajería Nabil Centro', 'Cerrajería', 'cerrajeria', 'Asunción', 'nabil-centro'),
      mkFicha(2, 'Cerrajería Nabil Luque', 'Cerrajería', 'cerrajeria', 'Luque', 'nabil-luque'),
      mkFicha(3, 'Cerrajería Nabil SL', 'Cerrajería', 'cerrajeria', 'San Lorenzo', 'nabil-sl'),
      mkFicha(4, 'Cerrajería Nabil Capiatá', 'Cerrajería', 'cerrajeria', 'Capiatá', 'nabil-cap') ] },
  { whatsapp: '595982222222', estado: 'pendiente', fecha_contacto: null, notas: null, count: 1, fichas: [ mkFicha(5, 'Farmacia Guaraní', 'Farmacia', 'farmacia', 'Luque', 'farma-guarani') ] },
  { whatsapp: '595983333333', estado: 'respondio', fecha_contacto: null, notas: 'ya respondió', count: 1, fichas: [ mkFicha(6, 'Taller Don José', 'Taller', 'taller', 'Luque', 'taller-jose') ] },
  { whatsapp: null, estado: 'pendiente', fecha_contacto: null, notas: null, count: 1, fichas: [ mkFicha(7, 'Sin Whats Uno', 'Cerrajería', 'cerrajeria', 'Asunción', 'sinwa-1') ] },
  { whatsapp: null, estado: 'pendiente', fecha_contacto: null, notas: null, count: 1, fichas: [ mkFicha(8, 'Sin Whats Dos', 'Farmacia', 'farmacia', 'Luque', 'sinwa-2') ] },
];

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
  <div id="pageTitle"></div>
  <div id="prospectsSection"></div>
  <script>
    window.__posts = [];
    window.__opened = [];
    window.apiAdminGet = async (endpoint) => {
      if (/\\/prospects\\/sources/.test(endpoint)) return { success:true, data:[{source:'prospeccion_agente',count:8},{source:'manual',count:1}] };
      if (/\\/prospects\\?source=/.test(endpoint)) return JSON.parse(JSON.stringify(window.__dataset || { success:true, data:[], summary:null }));
      return { success:true, data:[] };
    };
    window.apiAdminPost = async (endpoint, data, method) => {
      window.__posts.push({ endpoint, data, method });
      const wa = endpoint.split('/').pop();
      return { success:true, data:{ whatsapp: wa, estado: data.estado, fecha_contacto: data.estado === 'enviado' ? new Date().toISOString() : null, notas: (data.notas !== undefined ? data.notas : null) } };
    };
    window.showToast = () => {};
    const _open = window.open; window.open = (u) => { window.__opened.push(u); return null; };
  </script>
  <script>${PROSPECTS}</script>
</body></html>`;

(async () => {
  const server = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(PAGE); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'load' });

  // Cargar dataset normal e inicializar.
  await p.evaluate((groups) => {
    window.__dataset = { success: true, data: groups, summary: { total_grupos: groups.length, enviados_hoy: 0 } };
  }, GROUPS);
  await p.evaluate(() => initProspectsSection());
  await p.waitForTimeout(150);

  check('sin errores de script', errs.length === 0, errs.join(' | '));

  const R = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#prospTableBody tr')];
    const nabilRow = rows.find(r => r.getAttribute('data-wa') === '595981111111');
    const sinWaRows = rows.filter(r => /sin WhatsApp/i.test(r.textContent));
    const sourceSel = document.getElementById('prospSource');
    const tpl = document.getElementById('prospTemplate');
    const disabledWaBtns = [...document.querySelectorAll('#prospTableBody button[disabled]')].length;
    return {
      nRows: rows.length,
      nabilHasMulti: nabilRow ? /×4/.test(nabilRow.textContent) : false,
      sinWaCount: sinWaRows.length,
      sinWaDisabled: disabledWaBtns,
      sourceOptions: sourceSel ? sourceSel.options.length : 0,
      sourceValue: sourceSel ? sourceSel.value : '',
      tplHasPlaceholders: tpl ? (/\{nombre\}/.test(tpl.value) && /\{link_ficha\}/.test(tpl.value)) : false,
      counters: (document.getElementById('prospCounters') || {}).textContent || '',
      rubroOpts: (document.getElementById('prospRubro') || {}).innerHTML || '',
      ciudadOpts: (document.getElementById('prospCiudad') || {}).innerHTML || '',
    };
  });
  check('render: 5 filas (grupos)', R.nRows === 5, 'n=' + R.nRows);
  check('grupo Nabil marcado ×4 (una sola fila)', R.nabilHasMulti === true);
  check('2 filas "sin WhatsApp" con botón deshabilitado', R.sinWaCount === 2 && R.sinWaDisabled === 2, `sinWa=${R.sinWaCount} disabled=${R.sinWaDisabled}`);
  check('dropdown de origen con 2 opciones, prospeccion_agente por defecto', R.sourceOptions === 2 && R.sourceValue === 'prospeccion_agente');
  check('plantilla con placeholders {nombre}/{link_ficha}', R.tplHasPlaceholders === true);
  check('contador "Enviados hoy" presente', /Enviados hoy: 0/.test(R.counters), R.counters);
  check('dropdowns rubro/ciudad poblados', /Cerrajer/.test(R.rubroOpts) && /Farmacia/.test(R.rubroOpts) && /Luque/.test(R.ciudadOpts));

  // WhatsApp: abre wa.me con el mensaje renderizado + PATCH 'enviado'
  const wa = await p.evaluate(() => {
    window.__opened = []; window.__posts = [];
    prospectWhatsApp('595981111111');
    return new Promise(res => setTimeout(() => res({ opened: window.__opened, posts: window.__posts }), 60));
  });
  const openedUrl = wa.opened[0] || '';
  check('WhatsApp abre wa.me con el número', /^https:\/\/wa\.me\/595981111111\?text=/.test(openedUrl), openedUrl.slice(0, 60));
  check('mensaje renderiza {nombre} (ficha principal)', /Cerrajer%C3%ADa%20Nabil%20Centro/.test(openedUrl));
  check('mensaje renderiza {link_ficha} (URL real de la ficha)', /negocio%2Fnabil-centro/.test(openedUrl));
  check('mensaje NO deja placeholders sin reemplazar', !/%7Bnombre%7D/.test(openedUrl) && !/%7Blink_ficha%7D/.test(openedUrl));
  check('al enviar → PATCH /outreach con estado "enviado"', wa.posts.some(x => /\/prospects\/outreach\/595981111111$/.test(x.endpoint) && x.method === 'PATCH' && x.data.estado === 'enviado'), JSON.stringify(wa.posts));

  const afterSend = await p.evaluate(() => ({
    counters: document.getElementById('prospCounters').textContent,
    nabilEstado: (() => { const r = [...document.querySelectorAll('#prospTableBody tr')].find(x => x.getAttribute('data-wa') === '595981111111'); const s = r && r.querySelector('select'); return s ? s.value : ''; })(),
  }));
  check('tras enviar: "Enviados hoy: 1"', /Enviados hoy: 1/.test(afterSend.counters), afterSend.counters);
  check('tras enviar: el grupo queda "enviado"', afterSend.nabilEstado === 'enviado', afterSend.nabilEstado);

  // Cambio manual de estado por dropdown → PATCH
  const manual = await p.evaluate(() => {
    window.__posts = [];
    prospectSetEstado('595982222222', 'respondio');
    return new Promise(res => setTimeout(() => res(window.__posts), 60));
  });
  check('dropdown de estado dispara PATCH (respondio)', manual.some(x => /outreach\/595982222222$/.test(x.endpoint) && x.data.estado === 'respondio' && x.method === 'PATCH'));

  // Notas → PATCH con notas
  const notas = await p.evaluate(() => {
    window.__posts = [];
    prospectSaveNotas('595983333333', 'llamar el lunes');
    return new Promise(res => setTimeout(() => res(window.__posts), 60));
  });
  check('guardar notas dispara PATCH con notas', notas.some(x => /outreach\/595983333333$/.test(x.endpoint) && x.data.notas === 'llamar el lunes'));

  // Plantilla persiste en localStorage
  const persisted = await p.evaluate(() => {
    const t = document.getElementById('prospTemplate'); t.value = 'MI PLANTILLA {nombre}'; prospectSaveTemplate();
    return localStorage.getItem('retopa_prospect_template');
  });
  check('plantilla se persiste en localStorage', persisted === 'MI PLANTILLA {nombre}');

  // Aviso anti-ban ≥30: dataset con 31 grupos enviados hoy
  const warn = await p.evaluate(() => {
    const many = [];
    const now = new Date().toISOString();
    for (let i = 0; i < 31; i++) many.push({ whatsapp: '59598' + (1000000 + i), estado: 'enviado', fecha_contacto: now, notas: null, count: 1, fichas: [{ id: i, name: 'N' + i, trade_name: 'N' + i, slug: 'n' + i, rubro: 'Cerrajería', rubro_slug: 'cerrajeria', ciudad: 'Luque', ficha_url: 'https://retopa.com.py/negocio/n' + i }] });
    window.__dataset = { success: true, data: many, summary: { total_grupos: 31, enviados_hoy: 31 } };
    return initProspectsSection().then(() => {
      const w = document.getElementById('prospWarn');
      return { hidden: w.classList.contains('hidden'), text: w.textContent };
    });
  });
  check('aviso anti-ban visible con ≥30 enviados hoy', warn.hidden === false && /31/.test(warn.text), warn.text);

  // ── EMOJIS: saneo de U+FFFD + inserción de emoji real + chips ────────────────
  const emo = await p.evaluate((groups) => {
    window.__dataset = { success: true, data: groups, summary: { total_grupos: groups.length, enviados_hoy: 0 } };
    return initProspectsSection().then(() => {
      const chips = [...document.querySelectorAll('#prospectsSection button')].filter(b => /^[\u{1F000}-\u{1FAFF}☀-➿]/u.test(b.textContent.trim()));
      const t = document.getElementById('prospTemplate');
      t.value = 'Hola � {nombre} 👋'; prospectSaveTemplate();
      window.__opened = []; window.__posts = [];
      prospectWhatsApp('595981111111');
      t.value = 'Base'; t.selectionStart = t.selectionEnd = 4;
      prospectInsertEmoji('✅');
      return new Promise(res => setTimeout(() => res({
        chipCount: chips.length,
        opened: window.__opened[0] || '',
        stored: localStorage.getItem('retopa_prospect_template') || '',
        tplAfterInsert: document.getElementById('prospTemplate').value,
      }), 60));
    });
  }, GROUPS);
  check('barra de emojis: hay chips para insertar', emo.chipCount >= 6, 'chips=' + emo.chipCount);
  check('mensaje saneado: NO va el carácter roto (%EF%BF%BD) a WhatsApp', emo.opened && !/%EF%BF%BD/.test(emo.opened), emo.opened.slice(0, 70));
  check('mensaje conserva el emoji real 👋 (%F0%9F%91%8B)', /%F0%9F%91%8B/.test(emo.opened));
  check('plantilla guardada queda sin carácter roto (saneada)', !/�/.test(emo.stored), JSON.stringify(emo.stored));
  check('insertar emoji: chip agrega el código real en el cursor', emo.tplAfterInsert === 'Base✅', JSON.stringify(emo.tplAfterInsert));

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
