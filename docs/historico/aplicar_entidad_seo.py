#!/usr/bin/env python3
"""
RetoPA — _deploy/aplicar_entidad_seo.py

Refuerza las señales de ENTIDAD, que es lo que pide el tráfico real: la gente
googlea el nombre de la empresa (a menudo con razón social) para verificarla.

Tres cambios, todos de riesgo cero sobre lo ya posicionado (no tocan URLs,
canónicas, robots ni sitemaps):

1. RUC visible en el SSR.
   La ficha muestra el RUC a las personas (js/profile.js) pero el HTML que
   recibe Googlebot no lo incluía. Se agrega al <dl> de datos, junto al
   teléfono. Además deja el marcado consistente con la meta description, que
   ya lo menciona.

2. taxID en el JSON-LD.
   schema.org/Organization define taxID. Para una empresa paraguaya el RUC es
   EL identificador. Le da a Google una forma inequívoca de vincular la ficha
   con la entidad real.

3. sameAs con el sitio web propio, en TODOS los planes.
   Hoy sameAs solo se llena con redes sociales y solo para featured/premium:
   `const max = planType === 'premium' ? 6 : planType === 'featured' ? 2 : 0`
   Con 14.456 fichas en básico, el 99,9% emitía JSON-LD sin ningún sameAs.
   El sitio web SÍ se muestra en la ficha en todos los planes, así que
   declararlo respeta la regla de Google de marcar solo contenido visible.
   Esto NO regala una función paga: las redes siguen gateadas por plan.

Idempotente, con backup.
Uso:  cd /opt/retopa && python3 _deploy/aplicar_entidad_seo.py
"""
import os, sys, shutil, datetime

RAIZ  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SELLO = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
p = os.path.join(RAIZ, 'frontend/server.js')

if not os.path.exists(p):
    print('⚠ no existe frontend/server.js'); sys.exit(1)

s = open(p, encoding='utf-8').read()
if 'taxID' in s:
    print('✔ ya aplicado'); sys.exit(0)

cambios = []

# ── 1. RUC en el <dl> del SSR ────────────────────────────────────────────
v1 = """          ${biz.phone   ? `<div><dt>Teléfono</dt><dd>${esc(biz.phone)}</dd></div>` : ''}"""
n1 = """          ${biz.ruc     ? `<div><dt>RUC</dt><dd>${esc(biz.ruc)}</dd></div>` : ''}
          ${biz.phone   ? `<div><dt>Teléfono</dt><dd>${esc(biz.phone)}</dd></div>` : ''}"""
if v1 not in s:
    print('⚠ no encontré el <dl> de datos del SSR'); sys.exit(1)
s = s.replace(v1, n1, 1); cambios.append('RUC visible en el SSR')

# ── 2 y 3. taxID + sameAs con el sitio propio ────────────────────────────
v2 = """  const _sameAs = socialLinksFor(biz).map(s => s.url);
  if (_sameAs.length) schema.sameAs = _sameAs;"""
n2 = """  // RUC: identificador inequívoco de la empresa en Paraguay. Se declara solo
  // porque la ficha lo muestra (SSR y SPA).
  if (biz.ruc) schema.taxID = String(biz.ruc).trim();
  // Razón social vs nombre de fantasía: ambos se buscan.
  const _trade = biz.tradeName || biz.trade_name;
  if (_trade && _trade !== biz.name) schema.alternateName = _trade;
  // sameAs: el sitio propio es la señal de entidad más fuerte y la ficha lo
  // muestra en todos los planes. Las redes siguen gateadas por plan.
  const _sameAs = socialLinksFor(biz).map(s => s.url);
  if (biz.website) {
    const _w = String(biz.website).trim();
    const _wAbs = /^https?:\\/\\//i.test(_w) ? _w : `https://${_w}`;
    if (!_sameAs.includes(_wAbs)) _sameAs.unshift(_wAbs);
  }
  if (_sameAs.length) schema.sameAs = _sameAs;"""
if v2 not in s:
    print('⚠ no encontré el bloque sameAs del JSON-LD'); sys.exit(1)
s = s.replace(v2, n2, 1); cambios.append('taxID + alternateName + sameAs con sitio propio')

shutil.copy2(p, f'{p}.bak-{SELLO}')
open(p, 'w', encoding='utf-8').write(s)
for c in cambios: print(f'  ✔ {c}')
print(f'\nbackup: frontend/server.js.bak-{SELLO}')
print('Siguiente:  docker compose up -d --build frontend')
