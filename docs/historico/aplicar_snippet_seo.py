#!/usr/bin/env python3
"""
RetoPA — _deploy/aplicar_snippet_seo.py

Reordena la meta description de las fichas para la intención real de búsqueda.

Los datos de GSC muestran que las consultas son nombres de empresa (a menudo con
razón social) y que 378 consultas con 31.224 impresiones tienen CERO clics:
aparecemos en primera página y no nos eligen.

Antes:  "Servicios Profesionales en Asunción. Tel: 021... Monital SRL en RetoPA."
Ahora:  "Monital SRL — Servicios Profesionales en Asunción. RUC 80012345-6. Tel: 021..."

Cambios:
  1. El nombre va PRIMERO (es lo que el usuario busca confirmar).
  2. Se agrega el RUC, que es el dato de verificación de proveedor.
  3. Se elimina "en RetoPA" del final: el dominio ya se muestra en el resultado.

NO toca URLs, canónicas, robots ni el umbral de indexación. Riesgo sobre lo ya
posicionado: ninguno.

Idempotente, con backup.
Uso:  cd /opt/retopa && python3 _deploy/aplicar_snippet_seo.py
"""
import os, sys, shutil, datetime

RAIZ  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SELLO = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
p = os.path.join(RAIZ, 'frontend/server.js')

if not os.path.exists(p):
    print('⚠ no existe frontend/server.js'); sys.exit(1)

s = open(p, encoding='utf-8').read()
if '_mdRuc' in s:
    print('✔ ya aplicado'); sys.exit(0)

viejo = """  const _mdSeg  = [`${_mdCat} en ${_mdCity}${_mdDept}.`];
  if (biz.phone) _mdSeg.push(`Tel: ${biz.phone}.`);
  if (planShowsFeature(biz.planType)) { const _h = compactHours(biz); if (_h) _mdSeg.push(`Horario: ${_h}.`); }
  _mdSeg.push(`${biz.name} en ${siteName}.`);"""

nuevo = """  const _mdRuc  = (biz.ruc || biz.RUC || '').toString().trim();
  // Orden pensado para búsqueda de entidad: el usuario googlea el nombre de la
  // empresa y quiere confirmar que llegó a la correcta. Nombre primero, después
  // rubro/ciudad, después el dato de verificación (RUC) y el contacto.
  // "en RetoPA" se omite: el dominio ya aparece en el resultado de búsqueda.
  const _mdSeg  = [`${biz.name} — ${_mdCat} en ${_mdCity}${_mdDept}.`];
  if (_mdRuc)    _mdSeg.push(`RUC ${_mdRuc}.`);
  if (biz.phone) _mdSeg.push(`Tel: ${biz.phone}.`);
  if (planShowsFeature(biz.planType)) { const _h = compactHours(biz); if (_h) _mdSeg.push(`Horario: ${_h}.`); }"""

if viejo not in s:
    print('⚠ no encontré el bloque de la meta description (_mdSeg)'); sys.exit(1)

shutil.copy2(p, f'{p}.bak-{SELLO}')
open(p, 'w', encoding='utf-8').write(s.replace(viejo, nuevo, 1))
print(f'✔ frontend/server.js parcheado (backup .bak-{SELLO})')
print('Siguiente:  docker compose up -d --build frontend')
