#!/usr/bin/env python3
"""
RetoPA — _deploy/aplicar_prospectos.py
Integra la sección "Prospectos" al panel admin. Idempotente, con backups.
Uso:  cd /opt/retopa && python3 _deploy/aplicar_prospectos.py
"""
import os, sys, shutil, datetime

RAIZ  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SELLO = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
ok, warn = [], []

def parche(path, marca, ancla, insercion, antes=False, etiqueta=''):
    p = os.path.join(RAIZ, path)
    if not os.path.exists(p):
        warn.append(f'{path}: no existe'); return
    s = open(p, encoding='utf-8').read()
    if marca in s:
        ok.append(f'{path}: {etiqueta} ya aplicado'); return
    if ancla not in s:
        warn.append(f'{path}: no encontré el ancla para {etiqueta}'); return
    s = s.replace(ancla, (insercion + ancla) if antes else (ancla + insercion), 1)
    shutil.copy2(p, f'{p}.bak-{SELLO}')
    open(p, 'w', encoding='utf-8').write(s)
    ok.append(f'{path}: {etiqueta} ✔')

# backend
parche('backend/src/app.js', 'admin.prospects.routes',
       "const adminEnrichmentRoutes = require('./routes/admin.enrichment.routes');",
       "\nconst adminProspectsRoutes = require('./routes/admin.prospects.routes');",
       etiqueta='require de la ruta')
parche('backend/src/app.js', "'/api/v2/admin/prospects'",
       "app.use('/api/v2/admin/enrichment', adminEnrichmentRoutes);",
       "\napp.use('/api/v2/admin/prospects', adminProspectsRoutes);",
       etiqueta='montaje de la ruta')

# config.js
parche('frontend/admin/js/config.js', "section === 'prospects'",
       "    if (section === 'enrichment') { if (typeof loadEnrichment === 'function') loadEnrichment(); }",
       "\n    if (section === 'prospects') { if (typeof loadProspects === 'function') loadProspects(); }",
       etiqueta='dispatch en showSection')
parche('frontend/admin/js/config.js', "prospects: 'Prospectos'",
       "enrichment: 'Enriquecimiento de fichas'",
       ", prospects: 'Prospectos a contactar'",
       etiqueta='título de la sección')
parche('frontend/admin/js/config.js', "prospects:'comercial'",
       "leads:'comercial',", " prospects:'comercial',",
       etiqueta='grupo del menú')

NAV = '''
                <a href="#" onclick="showSection('prospects')" class="sidebar-item flex items-center gap-3 px-6 py-3 text-sm font-medium" id="nav-prospects">
                    <i class="fab fa-whatsapp w-5"></i>
                    <span>Prospectos</span>
                </a>
'''

SECCION = '''
            <div id="section-prospects" class="hidden fade-in">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-900">Prospectos a contactar</h2>
                        <p class="text-sm text-gray-500 mt-0.5">Fichas sin reclamar que ya reciben visitas. El mensaje se abre en WhatsApp; el envío lo hacés vos.</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="loadProspects()" class="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"><i class="fas fa-list mr-1"></i>Cola</button>
                        <button onclick="proVerHistorial()" class="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"><i class="fas fa-clock-rotate-left mr-1"></i>Historial</button>
                        <button onclick="proVerAjustes()" class="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"><i class="fas fa-sliders mr-1"></i>Ajustes</button>
                    </div>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" id="prospectsKpis"></div>
                <div id="prospectsContent"></div>
            </div>
'''

parche('frontend/admin/index.html', "showSection('prospects')",
       '''                <a href="#" onclick="showSection('semaforo')"''',
       NAV, antes=True, etiqueta='item del menú lateral')
parche('frontend/admin/index.html', 'id="section-prospects"',
       '''            <div id="section-semaforo" class="hidden fade-in">''',
       SECCION, antes=True, etiqueta='sección HTML')
parche('frontend/admin/index.html', 'js/prospects.js',
       '</body>', '    <script src="js/prospects.js"></script>\n',
       antes=True, etiqueta='carga del script')

print('\n── Integración prospectos ───────────────────────')
for x in ok:   print(f'  ✔ {x}')
for x in warn: print(f'  ⚠ {x}')
if warn:
    print('\nQuedaron pasos manuales.'); sys.exit(1)
print(f'\nBackups: *.bak-{SELLO}')
print('Siguiente:  docker compose up -d --build backend frontend')
