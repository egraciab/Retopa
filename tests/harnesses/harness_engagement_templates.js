// Engagement templates — verifica que las 3 plantillas nuevas (tipsFicha,
// reactivation, firstSteps) RENDERIZAN de verdad vía mail.js, que existen sus
// datos en buildNotifyTestData (send-template real) y su entrada en TEMPLATE_DEFS.
const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = '/root/work/opt/retopa';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

// Mock de ../db para que renderTemplate() no toque Postgres (usa overrides vacíos).
const dbPath = require.resolve(path.join(ROOT, 'backend/src/db'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => ({ rows: [] }) } };

const mail = require(path.join(ROOT, 'backend/src/config/mail'));

const NEW = ['tipsFicha', 'reactivation', 'firstSteps'];

(async () => {
  // ── 1) Renderizan con datos completos (con ficha) ──────────────────────────
  const full = { name: 'Ana', businessName: 'Ferretería Sur', siteName: 'RetoPA', siteUrl: 'https://retopa.com.py', panelUrl: 'https://retopa.com.py/cliente' };
  for (const key of NEW) {
    const r = await mail.renderTemplate(key, full);
    check(`${key}: renderiza {subject, html}`, r && typeof r.subject === 'string' && typeof r.html === 'string' && r.html.length > 200);
    check(`${key}: subject no vacío`, r.subject && r.subject.trim().length > 0, r.subject);
    check(`${key}: usa el nombre del negocio`, r.html.includes('Ferretería Sur') || r.subject.includes('Ferretería Sur'));
    check(`${key}: incluye el enlace al panel (CTA)`, r.html.includes('https://retopa.com.py/cliente'));
    check(`${key}: saluda al usuario por su nombre`, r.html.includes('Ana'));
  }

  // ── 2) Fallback SIN ficha y SIN nombre (usuario sin ficha propia) ──────────
  // Así se manda desde el panel Usuarios cuando el usuario no tiene ficha:
  // bname='Tu empresa', oname='' → no debe romper ni dejar "¡Hola !".
  const bare = { name: '', businessName: 'Tu empresa', siteName: 'RetoPA', siteUrl: 'https://retopa.com.py', panelUrl: 'https://retopa.com.py/cliente' };
  for (const key of NEW) {
    const r = await mail.renderTemplate(key, bare);
    check(`${key}: sin nombre no deja espacio colgado ("¡Hola !")`, !/¡Hola +!|¡Bienvenido,? +!/.test(r.html), 'saludo roto');
    check(`${key}: sin ficha usa "Tu empresa"`, r.html.includes('Tu empresa') || r.subject.includes('Tu empresa'));
  }

  // ── 3) Override editable desde el panel (site_config tpl_*) se aplica ──────
  // Re-mockeamos db para devolver un override del asunto de tipsFicha.
  require.cache[dbPath].exports.query = async (sql) =>
    /tpl_/.test(sql) ? ({ rows: [{ key: 'tpl_tipsFicha_subject', value: 'ASUNTO EDITADO {businessName}' }] }) : ({ rows: [] });
  const ov = await mail.renderTemplate('tipsFicha', full);
  check('override tpl_tipsFicha_subject se aplica y resuelve {businessName}', ov.subject === 'ASUNTO EDITADO Ferretería Sur', ov.subject);

  // ── 4) send-template real: buildNotifyTestData tiene los 3 nuevos ──────────
  const NOTIFY = fs.readFileSync(path.join(ROOT, 'backend/src/routes/admin.notify.routes.js'), 'utf8');
  for (const key of NEW)
    check(`notify: buildNotifyTestData define "${key}" (envío real no falla)`, new RegExp(`\\b${key}:\\s*\\{`).test(NOTIFY));

  // ── 5) TEMPLATE_DEFS (UI + modal de Usuarios) tiene los 3 nuevos ───────────
  const DEFS = fs.readFileSync(path.join(ROOT, 'frontend/admin/js/templates.js'), 'utf8');
  for (const key of NEW)
    check(`templates.js: TEMPLATE_DEFS incluye "${key}"`, new RegExp(`key:\\s*'${key}'`).test(DEFS));

  // ── 6) Coherencia total: toda plantilla del registro mail.js con función ──
  // (que las 3 nuevas estén realmente en el objeto templates y no huérfanas)
  const MAIL = fs.readFileSync(path.join(ROOT, 'backend/src/config/mail.js'), 'utf8');
  for (const key of NEW)
    check(`mail.js: función de plantilla "${key}" presente`, new RegExp(`\\b${key}:\\s*\\(data`).test(MAIL));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
