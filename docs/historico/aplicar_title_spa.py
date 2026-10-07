#!/usr/bin/env python3
"""
RetoPA — _deploy/aplicar_title_spa.py

Al abrir una ficha navegando dentro del SPA no se pasa por el servidor, así que
document.title quedaba con el título del sitio. Recargando salía bien porque
ahí sí lo inyecta serveBusinessSpa.

Este parche actualiza el título (y og:title/og:url) al abrir la ficha, con el
MISMO formato que usa server.js:
    `${biz.name} — ${biz.categoryName || 'Empresa'} en ${biz.city || 'Paraguay'} | ${siteName}`
y lo restaura al cerrar el modal.

Idempotente, con backup.
Uso:  cd /opt/retopa && python3 _deploy/aplicar_title_spa.py
"""
import os, sys, shutil, datetime

RAIZ  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SELLO = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
p = os.path.join(RAIZ, 'frontend/js/profile.js')

if not os.path.exists(p):
    print('⚠ no existe frontend/js/profile.js'); sys.exit(1)

s = open(p, encoding='utf-8').read()
if '__retopaSetTitle' in s:
    print('✔ ya aplicado'); sys.exit(0)

# ── 1. helper + set al abrir ─────────────────────────────────────────────
ancla_abrir = """        const canonicalUrl = `/negocios/${biz.categorySlug}/${citySlug}/${biz.slug}`;
        if (window.location.pathname !== canonicalUrl) {
            window.history.replaceState({ empresa: biz.slug }, '', canonicalUrl);
        }
    }"""

nuevo_abrir = """        const canonicalUrl = `/negocios/${biz.categorySlug}/${citySlug}/${biz.slug}`;
        if (window.location.pathname !== canonicalUrl) {
            window.history.replaceState({ empresa: biz.slug }, '', canonicalUrl);
        }
    }

    // Título de pestaña al navegar dentro del SPA (mismo formato que server.js).
    // Sin esto la ficha abierta por click quedaba con el título del sitio, y
    // solo salía bien al recargar.
    __retopaSetTitle(biz);"""

if ancla_abrir not in s:
    print('⚠ no encontré el bloque de URL canónica en openProfile()'); sys.exit(1)
s = s.replace(ancla_abrir, nuevo_abrir, 1)

# ── 2. restaurar al cerrar ───────────────────────────────────────────────
ancla_cerrar = """        if (p.startsWith('/empresa/') || p.startsWith('/negocios/')) {
            window.history.pushState({}, '', '/');
        }
    }"""

nuevo_cerrar = """        if (p.startsWith('/empresa/') || p.startsWith('/negocios/')) {
            window.history.pushState({}, '', '/');
        }
    }
    __retopaSetTitle(null);"""

if ancla_cerrar not in s:
    print('⚠ no encontré el bloque de cierre del modal'); sys.exit(1)
s = s.replace(ancla_cerrar, nuevo_cerrar, 1)

# ── 3. el helper ─────────────────────────────────────────────────────────
helper = """
// ── Título de pestaña y OG al navegar dentro del SPA ───────────────────────
// El servidor ya inyecta estos valores cuando la ficha se carga por URL
// directa. Esto cubre el caso de abrirla por click, que no pasa por el server.
let __retopaTituloSitio = null;

function __retopaSetTitle(biz) {
    const cfg = window.SITE_CONFIG || {};
    if (__retopaTituloSitio === null) {
        __retopaTituloSitio = cfg.site_title
            || (cfg.site_name ? cfg.site_name + ' — Directorio Comercial de Paraguay' : document.title);
    }

    const siteName = cfg.site_name || 'RetoPA';
    const titulo = biz
        ? `${biz.name} — ${biz.categoryName || 'Empresa'} en ${biz.city || 'Paraguay'} | ${siteName}`
        : __retopaTituloSitio;

    document.title = titulo;

    const og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute('content', titulo);
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', location.origin + location.pathname);
}

"""

# insertar el helper antes de la primera función del archivo
marca = '\nfunction '
i = s.index(marca)
s = s[:i] + '\n' + helper + s[i:]

shutil.copy2(p, f'{p}.bak-{SELLO}')
open(p, 'w', encoding='utf-8').write(s)
print(f'✔ frontend/js/profile.js parcheado (backup .bak-{SELLO})')
print('Siguiente:  docker compose up -d --build frontend')
