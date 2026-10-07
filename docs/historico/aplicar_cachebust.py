#!/usr/bin/env python3
"""
RetoPA — _deploy/aplicar_cachebust.py
Engancha scripts/cachebust.js al build del frontend. Idempotente, con backup.
Uso:  cd /opt/retopa && python3 _deploy/aplicar_cachebust.py
"""
import os, sys, shutil, datetime

RAIZ  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SELLO = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
p = os.path.join(RAIZ, 'frontend/Dockerfile')

if not os.path.exists(p):
    print('⚠ no existe frontend/Dockerfile'); sys.exit(1)

s = open(p, encoding='utf-8').read()
if 'cachebust.js' in s:
    print('✔ ya aplicado'); sys.exit(0)

ancla = 'EXPOSE 3001'
if ancla not in s:
    print('⚠ no encontré el ancla EXPOSE en el Dockerfile'); sys.exit(1)

# Después de Tailwind: así el CSS compilado también queda versionado.
nuevo = """# Versionar JS/CSS por hash de contenido (evita caché viejo en el navegador)
RUN node scripts/cachebust.js

EXPOSE 3001"""

shutil.copy2(p, f'{p}.bak-{SELLO}')
open(p, 'w', encoding='utf-8').write(s.replace(ancla, nuevo, 1))
print(f'✔ Dockerfile enganchado (backup .bak-{SELLO})')
print('Siguiente:  docker compose up -d --build frontend')
