// Claim por FORMULARIO público → dispara los mismos emails que los leads:
// claimReceived (al que reclama) + claimAdminAlert (a leads_emails).
// Monta el router real de directory.js con db/redis/mail mockeados.
const path = require('path');
const http = require('http');
const express = require('express');
const ROOT = '/root/work/opt/retopa';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const mock = (rel, exports) => {
  const p = require.resolve(path.join(ROOT, rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};

// ── Mock DB ──────────────────────────────────────────────────────────────────
const BIZ = { id: 42, name: 'Ferretería Sur', verified: false, claim_status: null };
async function dbQuery(sql, params) {
  if (/FROM businesses WHERE slug/i.test(sql)) return { rows: [BIZ] };
  if (/site_config WHERE key IN/i.test(sql))
    return { rows: [
      { key: 'site_name', value: 'RetoPA' },
      { key: 'site_url', value: 'https://retopa.com.py' },
      { key: 'leads_emails', value: 'ventas@retopa.com.py, admin@retopa.com.py' },
    ] };
  return { rows: [] };
}
const fakeClient = { query: async () => ({ rows: [] }), release: () => {} };
const pool = { query: dbQuery, connect: async () => fakeClient };
mock('backend/src/db', pool);
mock('backend/src/config/redis', { get: async () => null, setEx: async () => {}, keys: async () => [], del: async () => {} });

// ── Mock mail: captura los envíos ────────────────────────────────────────────
const sent = [];
mock('backend/src/config/mail', { sendEmail: async (to, template, data) => { sent.push({ to, template, data }); return { success: true }; } });

(async () => {
  const router = require(path.join(ROOT, 'backend/src/routes/directory'));
  const app = express();
  app.use(express.json());
  app.use('/', router);
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;

  const body = JSON.stringify({ contact_name: 'Juan Pérez', contact_email: 'juan@x.com', contact_phone: '0981000000', message: 'Soy el dueño', evidence_url: '' });
  const resp = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/businesses/ferreteria-sur/claim', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d || '{}') })); });
    req.on('error', reject); req.write(body); req.end();
  });

  check('POST /claim responde success', resp.status === 200 && resp.body.success === true, JSON.stringify(resp.body));
  // Los emails son fire & forget → esperar un toque
  await new Promise(r => setTimeout(r, 200));

  check('se enviaron 3 emails (1 al dueño + 2 admin)', sent.length === 3, 'n=' + sent.length + ' → ' + sent.map(s => s.template + '→' + s.to).join(', '));
  const received = sent.find(s => s.template === 'claimReceived');
  check('claimReceived al que reclama (juan@x.com)', received && received.to === 'juan@x.com');
  check('claimReceived lleva businessName correcto', received && received.data.businessName === 'Ferretería Sur');
  const alerts = sent.filter(s => s.template === 'claimAdminAlert');
  check('claimAdminAlert a los 2 buzones de leads_emails', alerts.length === 2);
  check('claimAdminAlert → ventas@ y admin@', alerts.map(a => a.to).sort().join() === 'admin@retopa.com.py,ventas@retopa.com.py', alerts.map(a=>a.to).join());
  check('claimAdminAlert lleva datos del que reclama', alerts[0] && alerts[0].data.userName === 'Juan Pérez' && alerts[0].data.userEmail === 'juan@x.com');

  server.close();

  // Contrato sobre el fuente
  const fs = require('fs');
  const D = fs.readFileSync(path.join(ROOT, 'backend/src/routes/directory.js'), 'utf8');
  check('src: el form de claim envía claimAdminAlert', /sendEmail\(recipient, 'claimAdminAlert'/.test(D));
  check('src: el form de claim envía claimReceived', /sendEmail\(contact_email, 'claimReceived'/.test(D));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
