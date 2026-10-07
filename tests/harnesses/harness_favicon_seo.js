// FAVICON/SEO del home — verifica el <head> servido, el favicon.ico, el manifest
// y que TODOS los íconos queden en rutas PERMITIDAS por el robots.txt real.
// Uso: node harness_favicon_seo.js <frontend_dir>
const fs = require('fs');
const path = require('path');
const FE = process.argv[2] || '.';
let pass = 0, fail = 0;
const check = (n, c, x = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

const html = fs.readFileSync(path.join(FE, 'index.html'), 'utf8');
const head = html.slice(0, html.search(/<\/head>/i));
const server = fs.readFileSync(path.join(FE, 'server.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(FE, 'manifest.json'), 'utf8'));

// --- 1) rel=icon estándar + favicon.ico ---
check('head: <link rel="icon" href="/favicon.ico">', /<link[^>]+rel=["']icon["'][^>]+href=["']\/favicon\.ico["']/i.test(head));
check('head: rel=icon PNG en /img (48 o 192)', /<link[^>]+rel=["']icon["'][^>]+href=["']\/img\/(favicon-48|icon-192)\.png["']/i.test(head));
check('head: apple-touch-icon en /img (no /api)', /apple-touch-icon["'][^>]*href=["']\/img\//i.test(head));

// --- 2) NADA de íconos bajo /api en el head ---
const iconHrefs = [...head.matchAll(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/ig)].map(m => m[1]);
check('head: ningún ícono bajo /api', iconHrefs.length > 0 && !iconHrefs.some(h => h.startsWith('/api')), JSON.stringify(iconHrefs));

// --- 3) Nombre del sitio: og:site_name + WebSite JSON-LD ---
check('head: og:site_name = RetoPA', /property=["']og:site_name["'][^>]+content=["']RetoPA["']/i.test(head));
const ld = [...head.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/ig)].map(m => { try { return JSON.parse(m[1]); } catch (e) { return null; } }).filter(Boolean);
const website = ld.find(o => o['@type'] === 'WebSite');
check('head: JSON-LD WebSite con name "RetoPA"', !!website && website.name === 'RetoPA', JSON.stringify(website || null));
check('head: <title> incluye RetoPA', /<title>[^<]*RetoPA/i.test(html));

// --- 4) favicon.ico válido con tamaño 48 ---
const ico = fs.readFileSync(path.join(FE, 'favicon.ico'));
const icoMagic = ico.length > 6 && ico[0] === 0 && ico[1] === 0 && ico[2] === 1 && ico[3] === 0;
const nImg = ico.length > 6 ? ico.readUInt16LE(4) : 0;
const widths = [];
for (let i = 0; i < nImg; i++) { const w = ico[6 + i * 16]; widths.push(w === 0 ? 256 : w); }
check('favicon.ico: magic ICO válido', icoMagic);
check('favicon.ico: incluye un tamaño 48', widths.includes(48), 'sizes=' + JSON.stringify(widths));

// --- 5) favicon-48.png es PNG 48x48 ---
const png = fs.readFileSync(path.join(FE, 'img', 'favicon-48.png'));
const pngOk = png.length > 24 && png.toString('hex', 0, 8) === '89504e470d0a1a0a';
const pngW = pngOk ? png.readUInt32BE(16) : 0, pngH = pngOk ? png.readUInt32BE(20) : 0;
check('favicon-48.png: PNG 48x48', pngOk && pngW === 48 && pngH === 48, `${pngW}x${pngH}`);

// --- 6) manifest: íconos en /img, ninguno en /api ---
const mIcons = (manifest.icons || []).map(i => i.src);
check('manifest: íconos en /img, ninguno en /api', mIcons.length > 0 && mIcons.every(s => s.startsWith('/img/')) && !mIcons.some(s => s.startsWith('/api')), JSON.stringify(mIcons));

// --- 7) robots real (de server.js): TODOS los íconos del head en ruta permitida ---
const robotsBlock = (server.match(/app\.get\(['"]\/robots\.txt['"][\s\S]*?\}\);/) || [''])[0];
const disallows = [...robotsBlock.matchAll(/Disallow:\s*([^\s\\`]+)/g)].map(m => m[1]);
check('robots: se leyó la lista de Disallow', disallows.length > 0, JSON.stringify(disallows));
const allIconUrls = [...iconHrefs, ...mIcons];
const blocked = allIconUrls.filter(u => disallows.some(d => u.startsWith(d)));
check('robots: NINGÚN ícono cae en una ruta Disallow', blocked.length === 0, 'bloqueados=' + JSON.stringify(blocked));
check('robots: /img NO está en Disallow (ruta de los íconos)', !disallows.some(d => '/img/'.startsWith(d)));

console.log(`\n== ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
