// SEGURIDAD — mejoras de robustez (defensa en profundidad):
//   (1) JWT_SECRET centralizado sin default adivinable (config/jwt.js)
//   (2) rate-limit en endpoints de credenciales (auth-public)
//   (3) auth explícita en admin/notify (envío masivo + claim tokens)
//   (4) rate-limit en la subida pública de imágenes
const { execSync } = require('child_process');
const fs = require('fs');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const BE = '/root/work/opt/retopa/backend';

// Env necesario para requerir los módulos (config/jwt aborta si falta JWT_SECRET)
process.env.JWT_SECRET = 'test-secret-hardening-0123456789';
process.env.DB_HOST = '/tmp'; process.env.DB_PORT = '5999';
process.env.DB_USER = 'postgres'; process.env.DB_NAME = 'postgres'; process.env.DB_PASSWORD = '';

const jwt = require('jsonwebtoken');
const express = require('express');
// admin.notify requiere nodemailer al cargar (instalado --no-save para el test).
// No se envía nada: requireAdmin corta antes, y el caso admin igual falla por DB
// (lo cual confirma que pasó el guard).

(async () => {
  // ── (1) config/jwt centralizado ──────────────────────────────────────────
  const secret = require(BE + '/src/config/jwt');
  check('(1) config/jwt devuelve el secreto del env', secret === process.env.JWT_SECRET);
  const filesUsingConfig = ['admin', 'upload', 'client', 'promotions.routes', 'auth-public', 'claim.routes', 'admin.notify.routes'];
  const allUseConfig = filesUsingConfig.every(f => /require\('\.\.\/config\/jwt'\)/.test(fs.readFileSync(`${BE}/src/routes/${f}.js`, 'utf8')));
  check('(1) los 7 routers usan el config centralizado', allUseConfig);
  const noGuessable = !filesUsingConfig.some(f => /'retopa-secret-key'|'retopa_secret'/.test(fs.readFileSync(`${BE}/src/routes/${f}.js`, 'utf8')));
  check('(1) ningún router conserva el default adivinable', noGuessable);
  check('(1) config/jwt aborta si falta el secreto', /if \(!JWT_SECRET\)[\s\S]*process\.exit\(1\)/.test(fs.readFileSync(`${BE}/src/config/jwt.js`, 'utf8')));

  // ── (3) admin/notify exige admin (comportamiento real por HTTP) ──────────
  const notify = require(BE + '/src/routes/admin.notify.routes.js');
  const app = express(); app.use(express.json()); app.use('/api/v2/admin/notify', notify);
  const server = app.listen(0); await new Promise(r => server.on('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v2/admin/notify';
  const post = (path, token) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: '{}' }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));

  let r = await post('/send');
  check('(3) notify SIN token → 401', r.status === 401 && r.body.code === 'NO_TOKEN');
  r = await post('/send', jwt.sign({ id: 1, role: 'client' }, process.env.JWT_SECRET));
  check('(3) notify con token NO-admin → 403', r.status === 403 && r.body.code === 'FORBIDDEN');
  r = await post('/send', jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET));
  check('(3) notify con admin → pasa el guard (no 401/403)', r.status !== 401 && r.status !== 403);
  server.close();

  // ── (2) rate-limit en credenciales (contrato de fuente) ──────────────────
  const AP = fs.readFileSync(`${BE}/src/routes/auth-public.js`, 'utf8');
  check('(2) login usa loginLimiter', /router\.post\('\/login', loginLimiter,/.test(AP));
  check('(2) admin-login usa loginLimiter', /router\.post\('\/admin-login', loginLimiter,/.test(AP));
  check('(2) register/forgot/reset/mfa usan sensitiveLimiter',
    /'\/register', sensitiveLimiter/.test(AP) && /'\/forgot-password', sensitiveLimiter/.test(AP) &&
    /'\/reset-password', sensitiveLimiter/.test(AP) && /'\/mfa-verify', sensitiveLimiter/.test(AP));
  check('(2) login cuenta solo fallidos (skipSuccessfulRequests)', /skipSuccessfulRequests: true/.test(AP));

  // ── (4) rate-limit en subida pública ─────────────────────────────────────
  const UP = fs.readFileSync(`${BE}/src/routes/upload.js`, 'utf8');
  check('(4) /upload/public usa publicUploadLimiter', /'\/upload\/public',\s*\n?\s*publicUploadLimiter/.test(UP) || /publicUploadLimiter,/.test(UP));
  check('(4) el limiter público está definido con express-rate-limit', /const publicUploadLimiter = rateLimit\(/.test(UP));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
