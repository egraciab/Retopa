#!/usr/bin/env python3
"""
RetoPA — _deploy/aplicar_fix_title_h1.py

Dos arreglos de SEO/UX en el frontend. Idempotente, con backups.

1. js/app.js — loadSiteConfig() pisaba document.title en TODA página, incluidas
   las fichas, donde el servidor ya inyectó un título propio. Ahora solo lo pisa
   cuando NO hay un título de página inyectado (window.__RETOPA_PRELOAD__).

2. index.html — el <h1> del navbar es el logo del sitio. Un h1 de marca en cada
   página compite con el encabezado real. Pasa a <div> conservando las clases.

Uso:  cd /opt/retopa && python3 _deploy/aplicar_fix_title_h1.py
"""
import os, sys, shutil, datetime, re

RAIZ  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SELLO = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
ok, warn = [], []

def backup(p):
    shutil.copy2(p, f'{p}.bak-{SELLO}')

# ── 1. app.js: no pisar el título de página ──────────────────────────────
p = os.path.join(RAIZ, 'frontend/js/app.js')
if not os.path.exists(p):
    warn.append('frontend/js/app.js: no existe')
else:
    s = open(p, encoding='utf-8').read()
    if '__RETOPA_PRELOAD__' in s and 'Título de pestaña' not in s.split('__RETOPA_PRELOAD__')[0][-400:]:
        pass
    viejo = """        // Nombre del sitio
        if (s.site_name) {
            // Título de pestaña: preferir site_title explícito, luego construir desde site_name
            const pageTitle = s.site_title || (s.site_name + ' — Directorio Comercial de Paraguay');
            document.title = pageTitle;
            const el = document.getElementById('footerSiteName');
            if (el) el.textContent = s.site_name;
        } else if (s.site_title) {
            document.title = s.site_title;
        }"""
    nuevo = """        // Nombre del sitio
        // OJO: en las fichas el servidor ya inyectó un <title> propio del negocio
        // (serveBusinessSpa) y marcó window.__RETOPA_PRELOAD__. Pisarlo dejaba a
        // las 14k fichas con el mismo título genérico en pestaña, marcadores y
        // links compartidos. Solo escribimos el título del sitio si NO hay uno
        // de página.
        const tienePaginaPropia = !!window.__RETOPA_PRELOAD__;
        if (s.site_name) {
            const pageTitle = s.site_title || (s.site_name + ' — Directorio Comercial de Paraguay');
            if (!tienePaginaPropia) document.title = pageTitle;
            const el = document.getElementById('footerSiteName');
            if (el) el.textContent = s.site_name;
        } else if (s.site_title) {
            if (!tienePaginaPropia) document.title = s.site_title;
        }"""
    if 'tienePaginaPropia' in s:
        ok.append('frontend/js/app.js: ya aplicado')
    elif viejo not in s:
        warn.append('frontend/js/app.js: no encontré el bloque de document.title')
    else:
        backup(p)
        open(p, 'w', encoding='utf-8').write(s.replace(viejo, nuevo, 1))
        ok.append('frontend/js/app.js: título de página respetado ✔')

# ── 2. index.html: el h1 del navbar pasa a div ───────────────────────────
q = os.path.join(RAIZ, 'frontend/index.html')
if not os.path.exists(q):
    warn.append('frontend/index.html: no existe')
else:
    h = open(q, encoding='utf-8').read()
    if 'data-brand-heading' in h:
        ok.append('frontend/index.html: ya aplicado')
    else:
        m = re.search(r'<h1(\s+class="text-xl font-black[^"]*"[^>]*)>(\s*Reto<span[^>]*>PA</span>\s*)</h1>', h)
        if not m:
            warn.append('frontend/index.html: no encontré el <h1> del navbar')
        else:
            nuevo_el = f'<div data-brand-heading{m.group(1)}>{m.group(2)}</div>'
            backup(q)
            open(q, 'w', encoding='utf-8').write(h.replace(m.group(0), nuevo_el, 1))
            ok.append('frontend/index.html: h1 del navbar → div ✔')

print('\n── Fix title / h1 ───────────────────────────────')
for x in ok:   print(f'  ✔ {x}')
for x in warn: print(f'  ⚠ {x}')
if warn:
    print('\nQuedaron pasos manuales.'); sys.exit(1)
print(f'\nBackups: *.bak-{SELLO}')
print('Siguiente:  docker compose up -d --build frontend')
