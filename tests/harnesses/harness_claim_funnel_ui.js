// CLAIM FUNNEL (UI Admin) + BADGE — Playwright a 390px (mobile-first) y 1280px.
// Sirve admin/js/claim-funnel.js y admin/js/dashboard.js reales con el main.css
// compilado (Tailwind, config real) y una API simulada.
// Uso: node harness_claim_funnel_ui.js <frontend_dir> [main.css compilado]
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path');
const FE = process.argv[2] || '.';
const CSS = process.argv[3] || path.join(FE, 'public/css/main.css');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const TOKEN_URL = 'https://retopa.test/reclamar/?token=' + '1'.repeat(64) + '&utm_source=wa_seguimiento';
const FUNNEL = days => ({
  success: true, ready: true, days,
  activacion: { total: 39, con_ficha: 33, entraron_alguna_vez: 12, correo_verificado: 2, alta_sin_activar: 2, link_activacion_vencido: 13 },
  total: { origen: 'TOTAL', visitas: 5, fichas_vistas: 4, links_muertos: 1, iniciaron_form: 2, frenados_validacion: 1, enviaron: 2, aprobados: 1, dueno_entro: 1 },
  embudo: [
    { origen: 'wa', visitas: 4, fichas_vistas: 3, links_muertos: 0, iniciaron_form: 2, frenados_validacion: 1, enviaron: 1, aprobados: 1, dueno_entro: 1 },
    { origen: 'notify', visitas: 1, fichas_vistas: 1, links_muertos: 1, iniciaron_form: 0, frenados_validacion: 0, enviaron: 0, aprobados: 0, dueno_entro: 0 },
    { origen: 'boton_ficha', visitas: 0, fichas_vistas: 0, links_muertos: 0, iniciaron_form: 0, frenados_validacion: 0, enviaron: 1, aprobados: 0, dueno_entro: 0 },
  ],
  motivos: [{ reason: 'password_short', n: 3 }, { reason: 'email_invalid', n: 1 }],
  abandonos: [
    { id: 1, nombre: 'Ferretería <img src=x onerror="window.__xss=1">Uno', slug: 'h-uno', ciudad: 'Luque', primera: new Date(Date.now() - 7.2e6).toISOString(), ultima: new Date(Date.now() - 5.4e6).toISOString(), visitas: 2, ultimo_paso: 'form_error', origen: 'wa', wa: '595981123456', claim_url: TOKEN_URL },
    { id: 2, nombre: 'Panadería Dos', slug: 'h-dos', ciudad: null, primera: new Date(Date.now() - 1.8e7).toISOString(), ultima: new Date(Date.now() - 1.8e7).toISOString(), visitas: 1, ultimo_paso: 'link_opened', origen: 'notify', wa: null, claim_url: null },
    ...Array.from({ length: 5 }, (_, i) => ({ id: 10 + i, nombre: `Extra Negocio Con Un Nombre Bastante Largo Para Probar El Truncado ${i}`, slug: 'x' + i, ciudad: 'Asunción', primera: new Date(Date.now() - 8.64e7 * (i + 2)).toISOString(), ultima: new Date(Date.now() - 8.64e7 * (i + 2)).toISOString(), visitas: 1, ultimo_paso: 'link_opened', origen: 'wa', wa: '595983000000', claim_url: TOKEN_URL })),
  ],
});

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/main.css"></head><body class="bg-gray-50">
<main class="p-4"><div id="claimFunnel" class="mb-6"></div></main>
<span id="leadsBadge" class="hidden">0</span><span id="claimsBadge" class="hidden">0</span><span id="notifBadge" class="hidden"></span>
<script>
  window.__calls = []; window.__mode = 'ok';
  async function apiAdminGet(ep) {
    window.__calls.push(ep);
    if (ep.startsWith('/claims/funnel')) {
      const d = parseInt(new URLSearchParams(ep.split('?')[1]).get('days'), 10);
      if (window.__mode === 'notready') return { success: true, ready: false, days: d };
      if (window.__mode === 'empty') return { success: true, ready: true, days: d, activacion: { total: 0, entraron_alguna_vez: 0 }, total: null, embudo: [], motivos: [], abandonos: [] };
      if (window.__mode === 'fail') return { success: false };
      return window.__FUNNEL(d);
    }
    if (ep === '/dashboard') return { success: true, stats: window.__DASH };
    return { success: true };
  }
  function showToast() {}
  // Para dashboard.js: cualquier id que no exista en esta página devuelve un elemento suelto.
  const _gid = document.getElementById.bind(document);
  document.getElementById = id => _gid(id) || document.createElement('div');
  window.__FUNNEL = ${FUNNEL.toString()};
  window.TOKEN_URL = ${JSON.stringify(TOKEN_URL)};
</script>
<script src="/claim-funnel.js"></script>
</body></html>`;

(async () => {
  const funnelJs = fs.readFileSync(path.join(FE, 'admin/js/claim-funnel.js'), 'utf8');
  const dashJs = fs.readFileSync(path.join(FE, 'admin/js/dashboard.js'), 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const server = http.createServer((req, res) => {
    if (req.url === '/main.css') { res.writeHead(200, { 'Content-Type': 'text/css' }); return res.end(css); }
    if (req.url === '/claim-funnel.js') { res.writeHead(200, { 'Content-Type': 'application/javascript' }); return res.end(funnelJs); }
    if (req.url === '/dashboard.js') { res.writeHead(200, { 'Content-Type': 'application/javascript' }); return res.end(dashJs); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(url, { waitUntil: 'load' });
    await p.evaluate(() => loadClaimFunnel());
    await p.waitForSelector('#cfCard');
    const tag = `[${width}px]`;

    if (width === 390) {
      check(`${tag} pide 30 días por defecto`, await p.evaluate(() => window.__calls[0] === '/claims/funnel?days=30'));
      const tiles = await p.locator('#cfTiles').innerText();
      check(`${tag} tarjetas: 39 cuentas, 12 entraron (31%), 27 nunca, 13 link vencido`,
        /39/.test(tiles) && /12/.test(tiles) && /31%/.test(tiles) && /27/.test(tiles) && /13/.test(tiles), tiles.replace(/\n/g, ' | '));
      const steps = await p.$$eval('[data-step]', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
      check(`${tag} embudo: 6 pasos con % sobre "vieron"`, steps.length === 6 && /Vieron su ficha 4 · 100%/.test(steps[0]) && /Enviaron el reclamo 2 · 50%/.test(steps[3]) && /entró a su panel 1 · 25%/.test(steps[5]), steps.join(' / '));
      const barBg = await p.$eval('[data-step] .bg-sky-500', el => getComputedStyle(el).backgroundColor);
      check(`${tag} Tailwind compiló las clases nuevas (barra con color)`, barBg && barBg !== 'rgba(0, 0, 0, 0)', barBg);
      check(`${tag} links muertos informados`, /1 intento con link vencido o inválido/.test(await p.locator('#cfCard').innerText()));
      const mot = await p.locator('#cfMotivos').innerText();
      check(`${tag} motivos legibles`, /Contraseña corta ×3/.test(mot) && /Correo inválido ×1/.test(mot), mot.replace(/\n/g, ' '));

      // Abandonos
      check(`${tag} abandonos: título con el total (7)`, /Abrieron y no terminaron · 7/i.test(await p.locator('#cfAbandonos').innerText()));
      check(`${tag} abandonos: muestra 5 y el resto plegado`, (await p.locator('#cfAbandonos > div.space-y-2 > .cf-ab').count()) === 5 && /Ver 2 más/.test(await p.locator('#cfAbandonos details summary').innerText()));
      const href = await p.locator('.cf-wa').first().getAttribute('href');
      const msg = decodeURIComponent((href.split('text=')[1] || ''));
      check(`${tag} WhatsApp: número correcto`, href.startsWith('https://wa.me/595981123456?text='), href.slice(0, 40));
      check(`${tag} WhatsApp: mensaje con el negocio y su link vigente`, msg.includes('*Ferretería <img') && msg.includes(await p.evaluate(() => window.TOKEN_URL)), msg.slice(0, 90));
      check(`${tag} WhatsApp: sin emojis en el mensaje`, !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(msg));
      check(`${tag} sin celular → "Sin celular", sin botón`, (await p.locator('.cf-nowa').count()) === 1);
      check(`${tag} link vencido señalado`, /link vencido/.test(await p.locator('.cf-ab').nth(1).innerText()));
      check(`${tag} nombre escapado (sin XSS)`, await p.evaluate(() => !window.__xss && !document.querySelector('#cfAbandonos img')));
      check(`${tag} último paso legible`, /Lo frenó la validación/.test(await p.locator('.cf-ab').first().innerText()));

      // Por origen (desplegable) — scrollea dentro de su caja, no la página
      await p.click('#cfCard details summary');
      const ori = await p.locator('#cfOrigenWrap').innerText();
      check(`${tag} por origen: nombres legibles`, /WhatsApp \(prospectos\)/.test(ori) && /Correo \(Notificar\)/.test(ori) && /Botón en la ficha/.test(ori));
      await p.click('#cfAbandonos details summary');
    }

    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${tag} sin scroll horizontal de página`, overflow <= 0, 'overflow=' + overflow);
    const btnBox = await p.locator('.cf-wa').first().boundingBox();
    check(`${tag} botón WhatsApp visible dentro de la pantalla`, btnBox && btnBox.x + btnBox.width <= width && btnBox.height >= 30, JSON.stringify(btnBox));

    if (width === 390) {
      await p.screenshot({ path: path.join(__dirname, 'claim_funnel_390.png'), fullPage: true });
      // Cambio de período
      await p.click('[data-days="7"]');
      await p.waitForFunction(() => window.__calls.includes('/claims/funnel?days=7'));
      await p.waitForSelector('#cfCard');
      check(`${tag} botón 7 d pide days=7 y queda activo`, await p.evaluate(() => document.querySelector('[data-days="7"]').className.includes('bg-[#1B3A6B]')));
      check(`${tag} texto del período actualizado`, /últimos 7 días/i.test(await p.locator('#cfCard').innerText()));
      // Estados alternativos
      await p.evaluate(() => { window.__mode = 'notready'; return loadClaimFunnel(); });
      check(`${tag} sin migración → aviso claro`, /Falta correr la migración/.test(await p.locator('#claimFunnel').innerText()));
      await p.evaluate(() => { window.__mode = 'empty'; return loadClaimFunnel(); });
      check(`${tag} sin datos → estado vacío amable`, (await p.locator('#cfEmpty').count()) === 1 && /Nadie quedó a mitad de camino/.test(await p.locator('#claimFunnel').innerText()));
      await p.evaluate(() => { window.__mode = 'fail'; return loadClaimFunnel(); });
      check(`${tag} error de API → mensaje, sin romper`, /No se pudo cargar el embudo/.test(await p.locator('#claimFunnel').innerText()));

      check(`${tag} sin errores de script (embudo)`, errs.length === 0, errs.join(' | '));
      // Badge del menú vía dashboard.js real. Sus otros cargadores en paralelo
      // (monetización, banner) reciben datos stub y pueden quejarse: no son de esta entrega.
      errs.length = 0;
      await p.addScriptTag({ url: '/dashboard.js' });
      await p.evaluate(() => { window.__DASH = { pending_leads: 0, pending_claims: 2 }; return loadDashboard().catch(() => {}); });
      const b = await p.evaluate(() => ({
        leads: document.getElementById('leadsBadge').className.includes('hidden'),
        claimsHidden: document.getElementById('claimsBadge').className.includes('hidden'),
        claimsTxt: document.getElementById('claimsBadge').textContent,
        notif: !document.getElementById('notifBadge').className.includes('hidden'),
      }));
      check(`${tag} badge: claim pendiente prende "Claims" (2), no "Leads"`, b.leads && !b.claimsHidden && b.claimsTxt === '2' && b.notif, JSON.stringify(b));
      await p.evaluate(() => { window.__DASH = { pending_leads: 1, pending_claims: 0 }; return loadDashboard().catch(() => {}); });
      const b2 = await p.evaluate(() => ({ leadsHidden: document.getElementById('leadsBadge').className.includes('hidden'), claimsHidden: document.getElementById('claimsBadge').className.includes('hidden') }));
      check(`${tag} badge: lead real prende "Leads" y apaga "Claims"`, !b2.leadsHidden && b2.claimsHidden, JSON.stringify(b2));
    }
    if (width !== 390) check(`${tag} sin errores de script`, errs.length === 0, errs.join(' | '));
    else check(`${tag} dashboard.js: ningún error viene del bloque de badges`, !errs.some(e => /claims|pending_claims|leadsBadge/i.test(e)), errs.join(' | '));
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
