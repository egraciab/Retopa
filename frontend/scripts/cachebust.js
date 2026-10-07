#!/usr/bin/env node
/**
 * RetoPA — frontend/scripts/cachebust.js
 *
 * Reescribe las referencias a JS y CSS locales en los HTML agregando
 * ?v=<hash del contenido>. Hash POR ARCHIVO: solo cambia la URL de lo que
 * realmente cambió, así el resto sigue cacheado.
 *
 * Corre en el build (Dockerfile), así que nunca hay que acordarse de subir
 * un número a mano.
 *
 * Uso:  node scripts/cachebust.js [archivo.html ...]
 *       (por defecto: index.html y admin/index.html)
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.resolve(__dirname, '..');
const objetivos = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['index.html', 'admin/index.html'];

const cache = new Map();

function hashDe(rutaWeb, baseHtml) {
  // /js/app.js  → <raiz>/js/app.js ;  js/x.js (relativo) → junto al html
  const rel = rutaWeb.startsWith('/') ? rutaWeb.slice(1) : path.join(path.dirname(baseHtml), rutaWeb);
  const abs = path.join(RAIZ, rel);
  if (cache.has(abs)) return cache.get(abs);
  let h = null;
  // el CSS compilado por Tailwind vive en public/, no en la raíz
  for (const cand of [abs, path.join(RAIZ, 'public', rel)]) {
    try {
      h = crypto.createHash('sha1').update(fs.readFileSync(cand)).digest('hex').slice(0, 8);
      break;
    } catch (_) { /* sigue */ }
  }
  cache.set(abs, h);
  return h;   // null → archivo no encontrado, se deja intacto
}

let totalArchivos = 0, totalRefs = 0;

for (const rel of objetivos) {
  const p = path.join(RAIZ, rel);
  if (!fs.existsSync(p)) { console.log(`  · ${rel}: no existe, salteado`); continue; }

  let html = fs.readFileSync(p, 'utf8');
  let n = 0;

  // src="/js/x.js"  |  href="/css/x.css"  — con o sin ?v= previo
  html = html.replace(
    /\b(src|href)="((?!https?:|\/\/|data:)[^"?]+\.(?:js|css))(\?[^"]*)?"/g,
    (todo, attr, ruta) => {
      const h = hashDe(ruta, rel);
      if (!h) return todo;
      n++;
      return `${attr}="${ruta}?v=${h}"`;
    }
  );

  if (n) {
    fs.writeFileSync(p, html);
    totalArchivos++; totalRefs += n;
    console.log(`  ✔ ${rel}: ${n} referencias versionadas`);
  } else {
    console.log(`  · ${rel}: sin referencias locales a versionar`);
  }
}

console.log(`[cachebust] ${totalRefs} referencias en ${totalArchivos} archivo(s).`);
