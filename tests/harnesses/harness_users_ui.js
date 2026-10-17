// ADMIN → USUARIOS (UI, users.js real): paginado, filas con WhatsApp y negocio,
// botón de acceso, modal de edición completo. Playwright 390px y 1280px.
// Uso: node harness_users_ui.js <frontend_dir> <main.css compilado>
const { chromium } = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path');
const FE = process.argv[2] || '.';
const CSS = process.argv[3] || path.join(FE, 'public/css/main.css');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const rd = rel => fs.readFileSync(path.join(FE, rel), 'utf8');

// JWT falso del admin logueado (users.js lee el rol del payload).
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
const ADMIN_TOKEN = `x.${b64({ id: 900, role: 'admin' })}.y`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/main.css"></head><body class="bg-gray-50"><main class="p-3">
<input id="userSearch"><select id="userFilterRole"><option value=""></option></select><select id="userFilterStatus"><option value=""></option></select><select id="userFilterInactive"><option value=""></option></select>
<span id="userStatTotal"></span><span id="userStatActive"></span><span id="userStatClient"></span><span id="userStatAdmin"></span><span id="userStatGod"></span>
<div class="overflow-x-auto"><table class="w-full"><tbody id="usersTable"></tbody></table></div>
<div><span id="userPaginationInfo"></span><div id="userPaginationControls"></div></div></main>
<script>
  localStorage.setItem('adminToken', ${JSON.stringify(ADMIN_TOKEN)});
  function getAdminToken() { return localStorage.getItem('adminToken') || ''; }
  window.__calls = []; window.__toasts = [];
  function mkUsers(page) {
    const all = [];
    for (let i = 1; i <= 30; i++) all.push({ id: i, name: 'Usuario ' + i, email: i === 3 ? null : 'u' + i + '@x.com', phone: i % 2 ? '+59598155500' + (i % 10) : null,
      wa: null, role: i === 1 ? 'godmode' : i === 2 ? 'admin' : 'client', is_active: true, created_at: new Date().toISOString(), last_seen_at: null,
      business_count: i === 5 ? 2 : (i === 8 ? 1 : 0), owned_slug: i === 5 ? 'ferre' : (i === 8 ? 'vet' : null), owned_name: i === 5 ? 'Ferre <b>Ñandutí</b>' : (i === 8 ? 'Veterinaria Capiatá' : null),
      owned_id: i === 5 ? 55 : (i === 8 ? 88 : null), owned_wa: i === 8 ? '595984111222' : null, has_password: i !== 5, city: null,
      email_verified: i === 7, phone_verified: i === 7 });
    all.push({ id: 900, name: 'Yo Admin', email: 'yo@x.com', phone: null, role: 'admin', is_active: true, created_at: new Date().toISOString(), business_count: 0, has_password: true });
    const data = all.slice((page - 1) * 25, page * 25);
    return { success: true, data, stats: { total: all.length, active: all.length, clients: 28, admins: 2, godmode: 1 },
      pagination: { total: all.length, page, limit: 25, pages: Math.ceil(all.length / 25) } };
  }
  async function apiAdminGet(ep) { window.__calls.push(['GET', ep]);
    if (ep.startsWith('/users?')) { const pg = Number(new URLSearchParams(ep.split('?')[1]).get('page') || 1); return mkUsers(pg); }
    if (/\\/users\\/\\d+\\/businesses/.test(ep)) return { success: true, data: [{ id: 77, name: 'Sucursal 2', trade_name: null, city: 'Luque', is_owner: true, plan_type: 'basic' }] };
    if (/\\/users\\/\\d+\\/contact-suggestions/.test(ep)) return { success: true, data: [{ wa: '595984111222', source: 'WhatsApp de la ficha «Veterinaria Capiatá»' }, { wa: '595985333444', source: 'Lo dejó en el formulario de reclamo' }] };
    return { success: true }; }
  async function apiAdminPost(ep, body, method) { window.__calls.push([method || 'POST', ep, body]); return window.__putResp || { success: true }; }
  function showToast(m, t) { window.__toasts.push([t, m]); }
  function escapeHtml(text) { if (!text) return ''; const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
  function formatDateShort(s) { return '13/10/2026'; }
  async function sendAccessLink(id) { window.__access = id; }
  function openBusinessModal(id) { window.__bizOpened = id; }
  window.confirm = () => true;
</script>
<script src="/users.js"></script></body></html>`;

(async () => {
  const files = { '/main.css': fs.readFileSync(CSS, 'utf8'), '/users.js': rd('admin/js/users.js') };
  const server = http.createServer((req, res) => {
    if (files[req.url]) { res.writeHead(200, { 'Content-Type': req.url.endsWith('.css') ? 'text/css' : 'application/javascript' }); return res.end(files[req.url]); }
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
    await p.evaluate(() => loadAdminUsers(1));
    const tag = `[${width}px]`;

    if (width === 390) {
      check(`${tag} pide ?page=1`, await p.evaluate(() => window.__calls.some(c => c[1].includes('page=1'))));
      await p.click('#userPaginationControls button:has(i.fa-chevron-right)');
      await p.waitForTimeout(150);
      check(`${tag} "siguiente" → pide ?page=2 y muestra la página 2`, await p.evaluate(() => window.__calls.some(c => c[1].includes('page=2'))) &&
        /Usuario 26/.test(await p.locator('#usersTable').innerText()) && !/Usuario 1\b/.test(await p.locator('#usersTable').innerText()));
      check(`${tag} texto del paginado de la página 2`, /26-31 de 31/.test(await p.locator('#userPaginationInfo').innerText()), await p.locator('#userPaginationInfo').innerText());
      await p.evaluate(() => loadAdminUsers(1));

      const t = await p.locator('#usersTable').innerText();
      check(`${tag} fila: WhatsApp formateado`, /\+595 981 555 001/.test(t));
      check(`${tag} fila: negocio principal (escapado)`, /Ferre <b>Ñandutí<\/b>/.test(t) && (await p.locator('#usersTable b').count()) === 0);
      check(`${tag} fila: "sin contraseña" visible`, /sin contraseña/.test(t));
      const r7 = await p.locator('#usersTable tr').filter({ hasText: 'Usuario 7' }).first();
      const r9 = await p.locator('#usersTable tr').filter({ hasText: 'Usuario 9' }).first();
      check(`${tag} correo confirmado: tilde verde; sin confirmar: "sin confirmar"`, (await r7.locator('i.fa-circle-check[title="Correo confirmado"]').count()) === 1 && /sin confirmar/.test(await r9.innerText()) && !/sin confirmar/.test(await r7.innerText()));
      check(`${tag} WhatsApp probado: tilde junto al número`, (await r7.locator('i.fa-circle-check[title^="WhatsApp probado"]').count()) === 1);
      const r8 = await p.locator('#usersTable tr').filter({ hasText: 'Usuario 8' }).first();
      await r8.locator('button', { hasText: 'usar' }).click();
      await p.waitForTimeout(200);
      const putU = await p.evaluate(() => window.__calls.find(c => c[0] === 'PUT' && c[1] === '/users/8'));
      check(`${tag} "usar": guarda el WhatsApp de la ficha en la cuenta (mismo PUT del modal)`, putU && putU[2].phone === '+595984111222' && putU[2].name === 'Usuario 8' && putU[2].role === 'client', JSON.stringify(putU));
      await p.evaluate(() => { window.__calls = []; });
      const rowGod = p.locator('#usersTable tr').filter({ hasText: 'Usuario 1' }).first();
      check(`${tag} admins/GodMode: botón de WhatsApp deshabilitado con explicación`, await rowGod.locator('button[disabled] i.fa-whatsapp').count() === 1);
      const rowCli = p.locator('#usersTable tr').filter({ hasText: 'Usuario 7' }).first();
      await rowCli.locator('button:has(i.fa-whatsapp)').click();
      check(`${tag} clientes: el botón manda el link de acceso`, await p.evaluate(() => window.__access === 7));
      check(`${tag} admin no ve la opción GodMode en clientes`, (await rowCli.locator('option[value="godmode"]').count()) === 0);
      check(`${tag} el rol de un GodMode no se puede cambiar (siendo admin)`, await rowGod.locator('select').isDisabled());

      // Negocio clicable en la lista (columna Negocio en escritorio / línea en el celu)
      const rowVet = p.locator('#usersTable tr').filter({ hasText: 'Usuario 8' }).first();
      check(`${tag} fila sin WhatsApp propio: muestra el de la FICHA rotulado`, /ficha: \+595 984 111 222/.test(await rowVet.innerText()));
      await rowVet.locator('button', { hasText: 'Veterinaria Capiatá' }).filter({ visible: true }).first().click();
      check(`${tag} tocar el negocio abre el modal de la ficha (id 88)`, await p.evaluate(() => window.__bizOpened === 88));
      check(`${tag} columna Negocio: "+1 más" si tiene varias`, /\+1 más/.test(await p.locator('#usersTable tr').filter({ hasText: 'Usuario 5' }).first().innerHTML()));

      // Sugerencias de WhatsApp con fuente
      await p.evaluate(() => openEditUserModal(8));
      await p.waitForSelector('.wa-sug');
      const sugTxt = await p.locator('#editUserWaSuggest').innerText();
      check(`${tag} modal sin WhatsApp: sugerencias con su FUENTE`, /984 111 222/.test(sugTxt) && /ficha «Veterinaria Capiatá»/.test(sugTxt) && /formulario de reclamo/.test(sugTxt));
      await p.locator('.wa-sug').nth(1).click();
      check(`${tag} "Usar" llena el campo (no guarda solo)`, (await p.inputValue('#editUserPhone')) === '985 333 444' && !(await p.evaluate(() => window.__calls.some(c => c[0] === 'PUT'))));
      await p.click('#editUserBizMain');
      check(`${tag} "Negocio principal" abre el modal de la ficha`, await p.evaluate(() => window.__bizOpened === 88));
      check(`${tag} y tiene aparte el link a la ficha pública`, (await p.getAttribute('#editUserBizPublic', 'href')) === '/negocio/vet');
      await p.waitForSelector('#editUserBizList button');
      await p.locator('#editUserBizList button', { hasText: 'Sucursal 2' }).click();
      check(`${tag} empresas asignadas: cada una abre su ficha`, await p.evaluate(() => window.__bizOpened === 77));
      await p.evaluate(() => closeEditUserModal());

      // Modal
      await p.evaluate(() => openEditUserModal(5));
      check(`${tag} modal: negocio principal arriba`, /Negocio principal/i.test(await p.locator('#editUserModal').innerText()) && (await p.getAttribute('#editUserBizPublic', 'href')) === '/negocio/ferre');
      check(`${tag} modal: WhatsApp con +595 y el número precargado`, /\+595/.test(await p.locator('#editUserModal').innerText()) && (await p.inputValue('#editUserPhone')) === '981 555 005');
      check(`${tag} modal: correo y nombre editables`, (await p.inputValue('#editUserEmail')) === 'u5@x.com' && (await p.inputValue('#editUserName')) === 'Usuario 5');
      check(`${tag} modal: roles correctos (sin "god" roto)`, (await p.$$eval('#editUserRole option', o => o.map(x => x.value))).join() === 'user,client,admin');
      check(`${tag} modal: sin contraseña → "Crear contraseña" + aviso`, /Crear contraseña/.test(await p.locator('#editUserModal').innerText()) && /entra con link de acceso/.test(await p.locator('#editUserModal').innerText()));
      check(`${tag} modal: botón "Mandar link de acceso por WhatsApp"`, await p.isVisible('#editUserAccessBtn'));

      // Validaciones locales
      await p.fill('#editUserPhone', '021 555 555'); await p.click('#editUserSave');
      check(`${tag} WhatsApp inválido → aviso, no guarda`, /WhatsApp inválido/.test(await p.locator('#editUserError').innerText()) && !(await p.evaluate(() => window.__calls.some(c => c[0] === 'PUT'))));
      await p.fill('#editUserPhone', ''); await p.fill('#editUserEmail', ''); await p.click('#editUserSave');
      check(`${tag} sin correo ni WhatsApp → aviso`, /al menos un correo o un WhatsApp/.test(await p.locator('#editUserError').innerText()));
      await p.fill('#editUserPhone', '0982-111-222'); await p.fill('#editUserEmail', 'nuevo@x.com'); await p.fill('#editUserNewPass', 'clave-segura-1');
      await p.selectOption('#editUserRole', 'client');
      await p.click('#editUserSave'); await p.waitForTimeout(150);
      const put = await p.evaluate(() => window.__calls.find(c => c[0] === 'PUT'));
      check(`${tag} guarda TODO en un solo PUT /users/5`, put && put[1] === '/users/5' && put[2].phone === '+595982111222' && put[2].email === 'nuevo@x.com' && put[2].password === 'clave-segura-1' && put[2].role === 'client' && put[2].is_active === true, JSON.stringify(put));
      check(`${tag} cierra el modal y avisa`, !(await p.isVisible('#editUserModal')) && await p.evaluate(() => window.__toasts.some(t => /actualizado/.test(t[1]))));

      // Error del backend con campo
      await p.evaluate(() => { window.__putResp = { success: false, error: 'Ese correo ya lo usa otra cuenta', field: 'email' }; openEditUserModal(6); });
      await p.click('#editUserSave'); await p.waitForTimeout(150);
      check(`${tag} error del backend se muestra en el modal (sigue abierto)`, /ya lo usa otra cuenta/.test(await p.locator('#editUserError').innerText()) && await p.isVisible('#editUserModal'));
      await p.evaluate(() => { window.__putResp = null; closeEditUserModal(); });

      // Yo mismo: rol y "activo" bloqueados
      await p.evaluate(() => loadAdminUsers(2)); await p.waitForTimeout(100);
      await p.evaluate(() => openEditUserModal(900));
      check(`${tag} mi propio usuario: rol y activo bloqueados`, await p.isDisabled('#editUserRole') && await p.isDisabled('#editUserActive'));
      await p.evaluate(() => { window.__calls = []; }); await p.click('#editUserSave'); await p.waitForTimeout(100);
      const mine = await p.evaluate(() => window.__calls.find(c => c[0] === 'PUT'));
      check(`${tag} al guardarme no manda rol ni activo`, mine && !('role' in mine[2]) && !('is_active' in mine[2]), JSON.stringify(mine));
      await p.evaluate(() => closeEditUserModal());
    }

    await p.evaluate(() => loadAdminUsers(1));
    if (width === 1280) await p.screenshot({ path: path.join(__dirname, 'users_list_1280.png') });
    await p.evaluate(() => openEditUserModal(5));
    const box = await p.locator('#editUserModal > div.relative').boundingBox();
    check(`${tag} modal entra en la pantalla`, box && box.x >= 0 && box.x + box.width <= width + 1, JSON.stringify(box));
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${tag} sin scroll horizontal de página con el modal abierto`, overflow <= 0, 'overflow=' + overflow);
    if (width === 390) await p.screenshot({ path: path.join(__dirname, 'users_modal_390.png') });
    check(`${tag} sin errores de script`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
