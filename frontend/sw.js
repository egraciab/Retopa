/**
 * RetoPA — Service Worker v2.55
 *
 * v2.54 → v2.55: SEO — favicon estándar en el home (rel=icon a /favicon.ico y /img, fuera de /api que robots bloquea) + JSON-LD WebSite y og:site_name (nombre "RetoPA" en Google).
 * v2.53 → v2.54: mini-fichas — likes del negocio (❤️ N) y aro de completitud del perfil sobre la miniatura.
 * v2.52 → v2.53: fix — el modal de "Reclamar empresa" quedaba DETRÁS de la ficha; ahora va por encima (z-index) y el panel scrollea en mobile.
 * v2.51 → v2.52: fix — al conceder/actualizar la ubicación se recarga también "Abiertos ahora" (antes solo se veía la distancia al refrescar).
 * v2.50 → v2.51: etapa 4 (ficha mobile) — barra de acciones fija (Llamar/WhatsApp/Llegar), rating "Sin reseñas aún", redes sociales.
 * v2.49 → v2.50: etapa 3 — filtros chip sticky (mobile) + "Ver más resultados" + bloque "¿No encontrás?".
 * v2.48 → v2.49: etapa 3 — selector de TODAS las categorías (modal buscable desde "Ver todas las categorías").
 * v2.47 → v2.48: etapa 3 home — "Abiertos ahora" con tarjeta compacta + orden (Abiertos → Promos → Negocio) y promos alineadas a mobile.
 * v2.46 → v2.47: etapa 3 (resultados mobile) — tarjeta compacta con acciones Llamar/WhatsApp/Llegar y rating "Sin reseñas aún".
 * v2.45 → v2.46: alta de ficha sin cuenta manda correo de activación (?activar=TOKEN); crear contraseña confirma el correo y engancha.
 * v2.44 → v2.45: verificación de correo por link mágico (?verify=TOKEN); el enganche de fichas exige correo confirmado.
 * v2.43 → v2.44: registro sin login forzado (pide correo de gestión) y sin selector de plan (abre directo al form).
 * v2.42 → v2.43: H1 del hero bi-color desde site_config + registro corto (nombre, categoría, ciudad, WhatsApp).
 * v2.41 → v2.42: etapa 2 del rediseño (home hero mobile-first: buscador arriba del pliegue, chips, bloque dorado).
 *   Se sube la versión para invalidar la caché estática y que el header/hero/nav
 *   nuevos se vean en la siguiente carga sin borrar caché a mano.
 *
 * Estrategia:
 *   - Navegaciones HTML  → NETWORK-FIRST (fallback a caché offline).
 *   - JS / CSS           → NETWORK-FIRST (online SIEMPRE la última versión tras
 *                          un deploy; la caché solo se usa si el usuario está
 *                          offline). El servidor ya manda Cache-Control:no-cache
 *                          + ETag, así que online la revalidación es un 304 barato.
 *   - Imágenes / fuentes → stale-while-revalidate (rápidas y se refrescan solas).
 *   - /api /admin /cliente /empresa → nunca se interceptan (siempre red).
 *
 * Motivo del cambio v2.39 → v2.40:
 *   El cache-first de estáticos dejaba el SITIO PÚBLICO y el PANEL DEL EMBAJADOR
 *   corriendo JS viejo hasta borrar la caché del navegador a mano (ni el hard
 *   refresh lo evitaba, porque el SW cortaba antes de llegar a la red). Con
 *   network-first, cada deploy se ve en la siguiente carga, sin borrar nada.
 */

const VERSION      = 'v2.55';
const CACHE_STATIC = 'retopa-static-' + VERSION;

const PRECACHE = ['/', '/index.html', '/offline.html', '/manifest.json'];
const OFFLINE_URL = '/offline.html';

// Rutas que NUNCA se interceptan (siempre van a la red directo)
const NO_CACHE = ['/api/', '/admin', '/cliente', '/empresa/'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_STATIC)
            .then(cache => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    // Purga TODA caché de versiones anteriores (incluye las cache-first viejas).
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_STATIC).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Network-first: intenta la red; si falla (offline), cae a la caché.
function networkFirst(request, offlineFallback) {
    return fetch(request)
        .then(res => {
            if (res && res.ok) {
                const clone = res.clone();
                caches.open(CACHE_STATIC).then(c => c.put(request, clone));
            }
            return res;
        })
        .catch(() => caches.match(request).then(cached =>
            cached || (offlineFallback ? caches.match(OFFLINE_URL) : Response.error())
        ));
}

// Stale-while-revalidate: sirve la caché al instante y actualiza en segundo plano.
function staleWhileRevalidate(request) {
    return caches.match(request).then(cached => {
        const network = fetch(request).then(res => {
            if (res && res.ok) {
                const clone = res.clone();
                caches.open(CACHE_STATIC).then(c => c.put(request, clone));
            }
            return res;
        }).catch(() => cached);
        return cached || network;
    });
}

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Solo mismo origen y solo GET.
    if (url.origin !== location.origin) return;
    if (request.method !== 'GET') return;

    // Rutas excluidas → siempre red, sin interceptar.
    if (NO_CACHE.some(p => url.pathname.startsWith(p))) return;

    // Navegaciones HTML → network-first con fallback a la página offline.
    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request, true));
        return;
    }

    // JS / CSS → network-first (freshness tras cada deploy; caché solo offline).
    if (/\.(js|css)$/i.test(url.pathname)) {
        event.respondWith(networkFirst(request, false));
        return;
    }

    // Resto de estáticos (imágenes, fuentes…) → stale-while-revalidate.
    event.respondWith(staleWhileRevalidate(request));
});

// Permitir que la página fuerce la activación del SW nuevo ("Actualizar").
self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
        self.skipWaiting();
    }
});
