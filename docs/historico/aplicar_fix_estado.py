#!/usr/bin/env python3
"""
RetoPA — _deploy/aplicar_fix_estado.py

Arregla POST /api/v2/admin/prospects/estado, que fallaba con
    "inconsistent types deduced for parameter $2"

Causa: $2 se usaba como valor de la columna `estado` (varchar) y a la vez
dentro de `$2 IN ('reclamo',...)`, comparado con literales de texto. Postgres
no puede deducir un tipo único para el mismo parámetro. Se agrega ::text.

Esto también arregla el botón "Número inválido" de la cola: el front registra
el envío y después llama a /estado para corregirlo; como esa llamada fallaba,
el registro quedaba en 'enviado'.

Idempotente, con backup.
Uso:  cd /opt/retopa && python3 _deploy/aplicar_fix_estado.py
"""
import os, sys, shutil, datetime

RAIZ  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SELLO = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
p = os.path.join(RAIZ, 'backend/src/routes/admin.prospects.routes.js')

if not os.path.exists(p):
    print('⚠ no existe admin.prospects.routes.js'); sys.exit(1)

s = open(p, encoding='utf-8').read()
if "$2::text IN" in s:
    print('✔ ya aplicado'); sys.exit(0)

viejo = """          SET estado=$2, notas=COALESCE($3,notas),
              cerrado_at = CASE WHEN $2 IN ('reclamo','no_interesa','invalido')
                                THEN NOW() ELSE cerrado_at END"""
nuevo = """          SET estado=$2, notas=COALESCE($3,notas),
              cerrado_at = CASE WHEN $2::text IN ('reclamo','no_interesa','invalido')
                                THEN NOW() ELSE cerrado_at END"""

if viejo not in s:
    print('⚠ no encontré el UPDATE de /estado'); sys.exit(1)

shutil.copy2(p, f'{p}.bak-{SELLO}')
open(p, 'w', encoding='utf-8').write(s.replace(viejo, nuevo, 1))
print(f'✔ parcheado (backup .bak-{SELLO})')
print('Siguiente:  docker compose up -d --build backend')
