// SEGURIDAD — el static del frontend NO debe servir código fuente/config.
// Antes express.static(__dirname) exponía /server.js, /package.json, /Dockerfile,
// /node_modules, dotfiles… ("descargar la estructura de cómo está hecha la web").
// Se replica el guard REAL sobre un dir de prueba y se verifica el comportamiento,
// más un chequeo de contrato sobre frontend/server.js.
const express = require('express');
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

// Guard IDÉNTICO al de frontend/server.js
const BLOCKED_FILES = new Set(['/server.js', '/package.json', '/package-lock.json', '/dockerfile', '/tailwind.config.js', '/.env', '/.env.example']);
const BLOCKED_PREFIXES = ['/node_modules/', '/.git/'];
function guard(req, res, next) {
  const p = (req.path || '').toLowerCase();
  if (BLOCKED_FILES.has(p) || p.endsWith('.map') || BLOCKED_PREFIXES.some(pre => p.startsWith(pre))) {
    return res.status(404).type('text/plain').send('Not found');
  }
  next();
}

(async () => {
  // Dir de prueba con archivos sensibles + legítimos
  const root = '/tmp/fe_static_test';
  fs.rmSync(root, { recursive: true, force: true });
  const mk = (rel, content) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
  mk('server.js', 'SECRET SOURCE');
  mk('package.json', '{"deps":"x"}');
  mk('Dockerfile', 'FROM node');
  mk('tailwind.config.js', 'module.exports={}');
  mk('.env', 'POSTGRES_PASSWORD=x');
  mk('app.js.map', '{"map":1}');
  mk('node_modules/foo/index.js', 'lib');
  mk('.git/config', '[core]');
  mk('js/app.js', 'CLIENT OK');
  mk('admin/js/config.js', 'ADMIN CLIENT OK');
  mk('.well-known/acme-challenge/token123', 'ACME');
  mk('index.html', '<html>');

  const app = express();
  app.use(guard);
  app.use(express.static(root, { index: false, dotfiles: 'ignore' }));
  app.use((req, res) => res.status(200).type('text/plain').send('FALLBACK')); // simula el fallback SPA/SSR
  const server = app.listen(0); await new Promise(r => server.on('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = p => fetch(base + p).then(async r => ({ status: r.status, body: await r.text() }));

  // ── Sensibles → 404, sin filtrar contenido ──────────────────────────────
  for (const [p, label] of [['/server.js', 'código fuente'], ['/package.json', 'dependencias'], ['/Dockerfile', 'Dockerfile'], ['/tailwind.config.js', 'config build'], ['/node_modules/foo/index.js', 'node_modules'], ['/app.js.map', 'source map'], ['/.git/config', '.git']]) {
    const r = await get(p);
    check(`bloquea ${label} (${p}) → 404`, r.status === 404 && !r.body.includes('SECRET') && !r.body.includes('deps') && !r.body.includes('FROM node') && !r.body.includes('lib') && !r.body.includes('core'));
  }
  let r = await get('/.env');
  check('bloquea /.env → no 200 (no filtra el password)', r.status !== 200 && !r.body.includes('POSTGRES_PASSWORD'));

  // ── Legítimos → 200 (el fix NO rompe el sitio) ──────────────────────────
  r = await get('/js/app.js');       check('sirve /js/app.js (cliente) → 200', r.status === 200 && r.body === 'CLIENT OK');
  r = await get('/admin/js/config.js'); check('sirve /admin/js/config.js → 200', r.status === 200 && r.body.includes('ADMIN CLIENT OK'));
  r = await get('/.well-known/acme-challenge/token123'); check('NO rompe /.well-known (el guard no lo bloquea) → 200', r.status === 200);

  server.close();

  // ── Contrato sobre el server real ───────────────────────────────────────
  const S = fs.readFileSync('/root/work/opt/retopa/frontend/server.js', 'utf8');
  const idxGuard = S.indexOf('BLOCKED_FILES');
  const idxStatic = S.indexOf('app.use(express.static(__dirname');
  check('src: el guard existe y va ANTES de express.static', idxGuard > 0 && idxStatic > 0 && idxGuard < idxStatic);
  check('src: express.static con dotfiles:ignore', /dotfiles:\s*'ignore'/.test(S));
  check('src: bloquea /server.js y /node_modules', /'\/server\.js'/.test(S) && /'\/node_modules\/'/.test(S));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
