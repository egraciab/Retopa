#!/usr/bin/env python3
"""
RetoPA — _deploy/aplicar_enriquecimiento.py

Integra la sección "Enriquecimiento" en el panel admin editando SOLO las
líneas necesarias de app.js, index.html y config.js.

- Idempotente: si ya está aplicado, no hace nada.
- Hace backup .bak-<fecha> de cada archivo que toca.
- Si no encuentra un ancla, avisa y no rompe nada.

Uso:   cd /opt/retopa && python3 _deploy/aplicar_enriquecimiento.py
"""

import os, sys, shutil, datetime

RAIZ  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SELLO = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
ok, warn = [], []


def leer(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def escribir(p, s):
    shutil.copy2(p, f'{p}.bak-{SELLO}')
    with open(p, 'w', encoding='utf-8') as f:
        f.write(s)


def parche(path, marca, ancla, insercion, antes=False, etiqueta=''):
    p = os.path.join(RAIZ, path)
    if not os.path.exists(p):
        warn.append(f'{path}: no existe'); return
    s = leer(p)
    if marca in s:
        ok.append(f'{path}: {etiqueta} ya aplicado'); return
    if ancla not in s:
        warn.append(f'{path}: no encontré el ancla para {etiqueta} — hay que hacerlo a mano'); return
    s = s.replace(ancla, (insercion + ancla) if antes else (ancla + insercion), 1)
    escribir(p, s)
    ok.append(f'{path}: {etiqueta} ✔')


# ── 1. backend/src/app.js ────────────────────────────────────────────────
parche('backend/src/app.js',
       marca='admin.enrichment.routes',
       ancla="const adminNotifyRoutes = require('./routes/admin.notify.routes');",
       insercion="\nconst adminEnrichmentRoutes = require('./routes/admin.enrichment.routes');",
       etiqueta='require de la ruta')

parche('backend/src/app.js',
       marca="'/api/v2/admin/enrichment'",
       ancla="app.use('/api/v2/admin/notify', adminNotifyRoutes);",
       insercion="\napp.use('/api/v2/admin/enrichment', adminEnrichmentRoutes);",
       etiqueta='montaje de la ruta')

# ── 2. frontend/admin/js/config.js ───────────────────────────────────────
parche('frontend/admin/js/config.js',
       marca="section === 'enrichment'",
       ancla="    if (section === 'signals') { if (typeof loadSignals === 'function') loadSignals(); }",
       insercion="\n    if (section === 'enrichment') { if (typeof loadEnrichment === 'function') loadEnrichment(); }",
       etiqueta='dispatch en showSection')

parche('frontend/admin/js/config.js',
       marca="enrichment: 'Enriquecimiento de fichas'",
       ancla="signals: 'Disparadores de venta'",
       insercion=", enrichment: 'Enriquecimiento de fichas'",
       etiqueta='título de la sección')

parche('frontend/admin/js/config.js',
       marca="enrichment:'directorio'",
       ancla="cities:'directorio',",
       insercion=" enrichment:'directorio',",
       etiqueta='grupo del menú')

# ── 3. frontend/admin/index.html ─────────────────────────────────────────
NAV = '''
                <a href="#" onclick="showSection('enrichment')" class="sidebar-item flex items-center gap-3 px-6 py-3 text-sm font-medium" id="nav-enrichment">
                    <i class="fas fa-wand-magic-sparkles w-5"></i>
                    <span>Enriquecimiento</span>
                    <span id="enrichmentBadge" class="ml-auto bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full hidden">0</span>
                </a>
'''

SECCION = '''
            <div id="section-enrichment" class="hidden fade-in">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-900">Enriquecimiento de fichas</h2>
                        <p class="text-sm text-gray-500 mt-0.5">Revisión por lotes. Nada se aplica sin tu aprobación y todo se puede revertir.</p>
                    </div>
                    <button onclick="enrVerCorridas()" class="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700">
                        <i class="fas fa-clock-rotate-left mr-1"></i>Corridas
                    </button>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" id="enrichmentKpis"></div>
                <div class="flex gap-2 mb-4">
                    <button data-enr-tab="0.95" onclick="enrSetTab('0.95')" class="px-4 py-2 text-sm font-medium rounded-lg bg-[#0ea5e9] text-white">Reformateo directo</button>
                    <button data-enr-tab="0.70" onclick="enrSetTab('0.70')" class="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">Prefijo por ciudad</button>
                    <button data-enr-tab="0.50" onclick="enrSetTab('0.50')" class="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">Revisión manual</button>
                </div>
                <div id="enrichmentContent"></div>
            </div>
'''

parche('frontend/admin/index.html',
       marca="showSection('enrichment')",
       ancla='''                <a href="#" onclick="showSection('semaforo')"''',
       insercion=NAV,
       antes=True,
       etiqueta='item del menú lateral')

parche('frontend/admin/index.html',
       marca='id="section-enrichment"',
       ancla='''            <div id="section-semaforo" class="hidden fade-in">''',
       insercion=SECCION,
       antes=True,
       etiqueta='sección HTML')

parche('frontend/admin/index.html',
       marca='js/enrichment.js',
       ancla='</body>',
       insercion='    <script src="js/enrichment.js"></script>\n',
       antes=True,
       etiqueta='carga del script')


# ── Reporte ──────────────────────────────────────────────────────────────
print('\n── Integración enriquecimiento ──────────────────')
for x in ok:
    print(f'  ✔ {x}')
for x in warn:
    print(f'  ⚠ {x}')

if warn:
    print('\nQuedaron pasos manuales. Ver INTEGRAR_admin_enriquecimiento.md.')
    sys.exit(1)

print(f'\nBackups: *.bak-{SELLO}')
print('Siguiente:  docker compose up -d --build backend frontend')
