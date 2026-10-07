// Service Worker (frontend/sw.js) — estrategia de caché.
// Carga el sw.js REAL en un ServiceWorkerGlobalScope simulado y dispara eventos
// install/activate/fetch para verificar: network-first en JS/CSS (freshness tras
// deploy), fallback offline, exclusión de /admin y /api, y que /embajador ya no
// queda pegado. Motivo: el cache-first viejo servía JS viejo hasta borrar caché.
const fs = require('fs');
const vm = require('vm');
const SW = fs.readFileSync('/root/work/opt/retopa/frontend/sw.js', 'utf8');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reqUrl = r => (typeof r === 'string' ? r : r.url);

(async () => {
  // ── Mock del entorno del Service Worker ──────────────────────────────────
  const handlers = {};
  const cacheStore = new Map();        // name -> Map(url -> response)
  const putLog = [];                   // {cache, url}
  let skipWaitingCalled = false, claimed = false;
  let fetchImpl = null;                // configurable por escenario

  const mkCache = name => ({
    put: async (req, res) => { if (!cacheStore.has(name)) cacheStore.set(name, new Map()); cacheStore.get(name).set(reqUrl(req), res); putLog.push({ cache: name, url: reqUrl(req) }); },
    addAll: async (urls) => { if (!cacheStore.has(name)) cacheStore.set(name, new Map()); urls.forEach(u => cacheStore.get(name).set(u, { ok: true, _from: 'precache' })); },
  });
  const caches = {
    open: async name => mkCache(name),
    match: async req => { for (const m of cacheStore.values()) { const r = m.get(reqUrl(req)); if (r) return r; } return undefined; },
    keys: async () => [...cacheStore.keys()],
    delete: async k => cacheStore.delete(k),
  };
  const Response = { error: () => ({ ok: false, _from: 'error' }) };
  const self = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => { skipWaitingCalled = true; },
    clients: { claim: () => { claimed = true; } },
  };
  const sandbox = {
    self, caches, Response, URL, Promise, console,
    location: { origin: 'https://retopa.com.py' },
    fetch: (...a) => fetchImpl(...a),
    setTimeout, clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(SW, sandbox);

  check('sw.js registra handlers install/activate/fetch/message',
    ['install', 'activate', 'fetch', 'message'].every(h => typeof handlers[h] === 'function'));

  // ── install: precache + skipWaiting ──────────────────────────────────────
  await new Promise(res => handlers.install({ waitUntil: p => res(p) }));
  await sleep(10);
  check('install → skipWaiting()', skipWaitingCalled === true);
  const staticCacheName = [...cacheStore.keys()].find(k => k.includes('static'));
  check('install → precachea en cache versionada v2.40', !!staticCacheName && staticCacheName.includes('v2.40'), staticCacheName || '');
  check('install → precache incluye "/" y offline', cacheStore.get(staticCacheName)?.has('/') && cacheStore.get(staticCacheName)?.has('/offline.html'));

  // ── activate: purga caches viejas + claim ────────────────────────────────
  cacheStore.set('retopa-static-v2.39', new Map([['/js/auth.js', { ok: true }]])); // caché vieja cache-first
  cacheStore.set('retopa-v2.39', new Map());
  await new Promise(res => handlers.activate({ waitUntil: p => res(p) }));
  await sleep(10);
  check('activate → purga TODA caché vieja (v2.39)', ![...cacheStore.keys()].some(k => k.includes('v2.39')));
  check('activate → conserva la caché actual (v2.40)', [...cacheStore.keys()].some(k => k.includes('v2.40')));
  check('activate → clients.claim()', claimed === true);

  // helper: dispara un fetch y devuelve {responded, value}
  const fire = async (request) => {
    const ev = { request, _responded: undefined, respondWith(p) { this._responded = p; } };
    handlers.fetch(ev);
    const value = ev._responded !== undefined ? await ev._responded : undefined;
    await sleep(10); // dejar que el put fire-and-forget termine
    return { responded: ev._responded !== undefined, value };
  };
  const GET = (path, mode) => ({ url: 'https://retopa.com.py' + path, method: 'GET', mode: mode || 'no-cors' });

  // ── JS network-first: online sirve la RED (no la caché) ──────────────────
  cacheStore.set(staticCacheName, cacheStore.get(staticCacheName) || new Map());
  cacheStore.get(staticCacheName).set('https://retopa.com.py/js/auth.js', { ok: true, _from: 'cache-vieja' });
  fetchImpl = async () => ({ ok: true, _from: 'network', clone() { return this; } });
  let r = await fire(GET('/js/auth.js'));
  check('JS online → network-first (sirve RED, no caché vieja)', r.responded && r.value && r.value._from === 'network');
  check('JS online → guarda la respuesta fresca en caché', putLog.some(p => p.url === 'https://retopa.com.py/js/auth.js'));

  // ── JS offline: cae a la caché ───────────────────────────────────────────
  cacheStore.get(staticCacheName).set('https://retopa.com.py/js/auth.js', { ok: true, _from: 'cache' });
  fetchImpl = async () => { throw new Error('offline'); };
  r = await fire(GET('/js/auth.js'));
  check('JS offline → fallback a caché', r.responded && r.value && r.value._from === 'cache');

  // ── Embajador JS: YA NO queda pegado (network-first, no cache-first) ──────
  fetchImpl = async () => ({ ok: true, _from: 'network', clone() { return this; } });
  r = await fire(GET('/embajador/js/opportunities.js'));
  check('Embajador JS → network-first (fix del bug "no se actualiza")', r.responded && r.value && r.value._from === 'network');

  // ── CSS: también network-first ───────────────────────────────────────────
  r = await fire(GET('/css/app.css'));
  check('CSS online → network-first', r.responded && r.value && r.value._from === 'network');

  // ── Exclusiones: /admin, /api → NO se interceptan (siempre red directa) ───
  r = await fire(GET('/admin/js/config.js'));
  check('/admin/*.js → NO interceptado (respondWith no llamado)', r.responded === false);
  r = await fire(GET('/api/v2/leads'));
  check('/api/* → NO interceptado', r.responded === false);

  // ── POST y cross-origin → no interceptados ───────────────────────────────
  r = await fire({ url: 'https://retopa.com.py/js/auth.js', method: 'POST', mode: 'no-cors' });
  check('POST → no interceptado (solo GET)', r.responded === false);
  r = await fire({ url: 'https://otro-dominio.com/js/x.js', method: 'GET', mode: 'no-cors' });
  check('cross-origin → no interceptado', r.responded === false);

  // ── Navegación HTML: network-first + fallback offline ────────────────────
  fetchImpl = async () => ({ ok: true, _from: 'network', clone() { return this; } });
  r = await fire(GET('/', 'navigate'));
  check('navegación online → network-first', r.responded && r.value && r.value._from === 'network');
  fetchImpl = async () => { throw new Error('offline'); };
  r = await fire(GET('/pagina-inexistente', 'navigate'));
  check('navegación offline → sirve /offline.html', r.responded && r.value && (r.value._from === 'precache'));

  // ── Imagen: stale-while-revalidate (sirve caché al instante) ─────────────
  cacheStore.get(staticCacheName).set('https://retopa.com.py/img/logo.png', { ok: true, _from: 'cache' });
  let netHit = false;
  fetchImpl = async () => { netHit = true; return { ok: true, _from: 'network', clone() { return this; } }; };
  r = await fire(GET('/img/logo.png'));
  check('Imagen → sirve caché al instante (SWR)', r.responded && r.value && r.value._from === 'cache');
  check('Imagen → revalida en segundo plano (fetch disparado)', netHit === true);

  // ── Chequeos de contrato sobre el fuente ─────────────────────────────────
  check('src: versión bumpeada a v2.40', /VERSION\s*=\s*'v2\.40'/.test(SW));
  check('src: JS/CSS ya NO son cache-first (usa networkFirst)', /\\.\(js\|css\)\$[\s\S]*networkFirst\(request/.test(SW));
  check('src: ya no existe el bloque "Cache-first, fallback red" para estáticos', !/Cache-first, fallback red/.test(SW));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
