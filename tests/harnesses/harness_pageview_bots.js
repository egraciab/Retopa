// Pageview tracking — los crawlers NO deben contar como visitas del sitio.
// Extrae la función isCrawler() REAL de server.js y verifica el guard del middleware.
const fs = require('fs');
const SRC = fs.readFileSync('/root/work/opt/retopa/frontend/server.js', 'utf8');
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

// ── Extraer la función isCrawler tal cual está en el fuente y evaluarla ──────
const m = SRC.match(/function isCrawler\(ua\)\s*\{[\s\S]*?\n\}/);
check('isCrawler() existe en server.js', !!m);
// eslint-disable-next-line no-eval
const isCrawler = eval('(' + m[0].replace('function isCrawler', 'function') + ')');

// Bots → true
[
  ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
  ['bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
  ['SemrushBot', 'Mozilla/5.0 (compatible; SemrushBot/7~bl)'],
  ['AhrefsBot', 'Mozilla/5.0 (compatible; AhrefsBot/7.0)'],
  ['WhatsApp preview', 'WhatsApp/2.23'],
  ['facebookexternalhit', 'facebookexternalhit/1.1'],
].forEach(([name, ua]) => check(`bot detectado: ${name}`, isCrawler(ua) === true));

// Humanos → false
[
  ['Chrome desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'],
  ['Safari iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
  ['Android Chrome', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36'],
].forEach(([name, ua]) => check(`humano NO es bot: ${name}`, isCrawler(ua) === false));

check('UA vacío no rompe (no-bot)', isCrawler('') === false && isCrawler(undefined) === false);

// ── Simular el predicado del middleware de tracking ──────────────────────────
// (mismo criterio que server.js: página pública + no crawler)
function shouldTrack(reqPath, method, ua) {
  const p = reqPath || '';
  const isPage = method === 'GET' && (p === '/' || p.startsWith('/negocios')) && !p.includes('.');
  return isPage && !isCrawler(ua);
}
const human = 'Mozilla/5.0 (Windows NT 10.0) Chrome/125.0';
check('humano en / → trackea', shouldTrack('/', 'GET', human) === true);
check('humano en /negocios/cat/ciudad/slug → trackea', shouldTrack('/negocios/tiendas/asuncion/x', 'GET', human) === true);
check('Googlebot en / → NO trackea (antes SÍ contaba)', shouldTrack('/', 'GET', 'Googlebot/2.1') === false);
check('Googlebot en ficha → NO trackea', shouldTrack('/negocios/tiendas/asuncion/x', 'GET', 'Googlebot/2.1') === false);
check('asset .js → NO trackea', shouldTrack('/js/app.js', 'GET', human) === false);
check('POST → NO trackea', shouldTrack('/', 'POST', human) === false);

// ── Contrato: el middleware realmente aplica el guard isCrawler ──────────────
check('src: middleware de pageview gatea con !isCrawler(user-agent)',
  /if\s*\(isPage\s*&&\s*!isCrawler\(req\.headers\['user-agent'\]\)\)\s*trackPageview\(req\)/.test(SRC));
check('src: las vistas de ficha también saltean crawlers (referencia intacta)',
  /if\s*\(!isCrawler\(req\.headers\['user-agent'\]\)\)\s*\{[\s\S]*?businesses\/\$\{biz\.slug\}\/view/.test(SRC));

console.log(`\n== ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
