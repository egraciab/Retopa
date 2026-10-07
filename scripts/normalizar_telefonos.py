#!/usr/bin/env python3
"""
RetoPA — normalizar_telefonos.py

Normaliza el campo `phone` SIN PERDER NADA:
  1. Guarda el texto original en businesses.phone_raw (una sola vez)
  2. Propone el número principal en enrichment_candidates (revisable + rollback)
  3. Los números secundarios y el interno NO se descartan

Uso:
    python3 normalizar_telefonos.py --dry-run              # reporte, no escribe
    python3 normalizar_telefonos.py --dry-run --source manual
    python3 normalizar_telefonos.py --apply --limit 200    # escribe candidatos

Requiere: pip install psycopg2-binary
"""

import re, os, sys, argparse, unicodedata, json

# ─────────────────────────────────────────────────────────────────────────────
# PREFIJOS DE ÁREA
# Derivados de los datos reales de RetoPA. REVISAR antes de producción:
# los marcados (?) no aparecieron en la muestra y son de referencia general.
# ─────────────────────────────────────────────────────────────────────────────
AREAS = {
    '21',   # Gran Asunción
    '228',  # Capiatá / Ypacaraí
    '294',  # Itauguá
    '61',   # Ciudad del Este / Pdte. Franco
    '631',  # Hernandarias
    '644',  # Minga Guazú
    '673',  # Santa Rita
    '71',   # Encarnación
    '331',  # Concepción
    '336',  # Pedro Juan Caballero
    '521',  # Coronel Oviedo
    '541',  # Villarrica
    '511',  # Caacupé
    '462',  # Salto del Guairá
    '491',  # Filadelfia
    '492',  # Loma Plata
    '75',   # (?) Ayolas / Misiones
    '83',   # (?) Chaco
    '86',   # (?) Alto Paraguay
}

# Ciudad → prefijo, para reconstruir números de 6 dígitos huérfanos.
CIUDAD_AREA = {
    'asuncion': '21', 'lambare': '21', 'luque': '21', 'fernando de la mora': '21',
    'san lorenzo': '21', 'villa elisa': '21', 'mariano roque alonso': '21',
    'limpio': '21', 'san antonio': '21', 'nemby': '21', 'villa hayes': '21',
    'capiata': '21',        # Gran Asunción → 021 (confirmado)
    'itaugua': '294',
    'ciudad del este': '61', 'presidente franco': '61',
    'hernandarias': '631', 'minga guazu': '644', 'santa rita': '673',
    'encarnacion': '71', 'concepcion': '331', 'coronel oviedo': '521',
    'villarrica': '541', 'pedro juan caballero': '336', 'caacupe': '511',
    'salto del guaira': '462', 'filadelfia': '491', 'loma plata': '492',
}

# Códigos de país extranjeros que aparecen en los datos (no tocar esas fichas)
PAIS_EXTRANJERO = {'591': 'BO', '598': 'UY', '54': 'AR', '55': 'BR', '56': 'CL'}


def clave_ciudad(c):
    if not c:
        return None
    c = unicodedata.normalize('NFKD', c).encode('ascii', 'ignore').decode()
    return c.lower().strip()


def es_movil(d):
    return len(d) == 9 and d[0] == '9'


def es_fijo(d):
    # Paraguay: los moviles empiezan con 9. Un nacional de 8-9 digitos que
    # empieza con 2-8 es fijo, sin importar si conocemos su prefijo de zona.
    # (AREAS ya solo se usa para reconstruir huerfanos de 6-7 digitos.)
    return len(d) in (8, 9) and d[:1] in '2345678'


def consumir(d, area):
    """Consume un blob de dígitos en números válidos. Devuelve (numeros, resto)."""
    out = []
    while d:
        while d.startswith('0'):
            d = d[1:]
        if d.startswith('595'):
            d = d[3:]
            continue
        if len(d) == 12 and area and not d[:1] == '9':
            out.append(area + d[:6]); out.append(area + d[6:]); d = ''; continue
        if len(d) >= 9 and es_movil(d[:9]):
            out.append(d[:9]); d = d[9:]; continue
        if len(d) >= 8 and es_fijo(d[:8]):
            out.append(d[:8]); d = d[8:]; continue
        if len(d) in (6, 7) and area:
            out.append(area + d); d = ''; continue
        # dos fijos de 6 dígitos pegados, sin prefijo
        if len(d) == 12 and area and not es_fijo(d[:8]):
            out.append(area + d[:6]); out.append(area + d[6:]); d = ''; continue
        break
    return out, d


def normalizar(texto, ciudad):
    """
    Devuelve dict:
      principal, secundarios[], interno, confianza (0-1), motivo[]
    principal = None significa: no se pudo, NO TOCAR la ficha.
    """
    if not texto or not texto.strip():
        return {'principal': None, 'motivo': ['vacio']}

    # sacar caracteres de control invisibles (hay LTR marks en los datos)
    t = ''.join(ch for ch in texto if unicodedata.category(ch)[0] != 'C')

    # extraer interno sin perder lo que viene después
    interno = None
    m = re.search(r'\b(?:int\.?|interno)\s*:?\s*(\d+)', t, re.I)
    if m:
        interno = m.group(1)
        t = t[:m.start()] + ' ' + t[m.end():]

    crudo = re.sub(r'\D', '', t)
    for cc, pais in sorted(PAIS_EXTRANJERO.items(), key=lambda x: -len(x[0])):
        if crudo.startswith(cc) and not crudo.startswith('595') and len(crudo) >= 11:
            return {'principal': None, 'motivo': [f'extranjero_{pais}']}

    area = CIUDAD_AREA.get(clave_ciudad(ciudad))
    numeros, motivo, inferido = [], [], False

    partes = [p for p in re.split(r'[/;,]', t) if re.search(r'\d', p)]
    for parte in partes:
        d = re.sub(r'\D', '', parte)
        got, resto = consumir(d, area)
        numeros += got
        if len(d) == 6 and got:
            inferido = True
        if resto:
            motivo.append(f'resto:{resto}')

    vistos = []
    for n in numeros:
        if n not in vistos:
            vistos.append(n)

    if not vistos:
        return {'principal': None, 'motivo': motivo or ['sin_numero']}

    conf = 0.95
    if inferido:
        conf = 0.70          # prefijo de área inferido de la ciudad
    if any(x.startswith('resto') for x in motivo):
        conf = min(conf, 0.50)   # quedaron dígitos sueltos → revisar sí o sí
    if not area and inferido:
        conf = 0.0

    return {
        'principal':   '0' + vistos[0],
        'secundarios': ['0' + v for v in vistos[1:]],
        'interno':     interno,
        'confianza':   conf,
        'motivo':      motivo,
    }


# ─────────────────────────────────────────────────────────────────────────────
# BASE DE DATOS
# ─────────────────────────────────────────────────────────────────────────────

SQL_PRELUDIO = """
-- Copia de seguridad del texto original. Se llena UNA vez y no se toca nunca más.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS phone_raw TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS phone_extra JSONB;
UPDATE businesses SET phone_raw = phone
 WHERE phone_raw IS NULL AND NULLIF(TRIM(phone),'') IS NOT NULL;
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--source', default=None)
    ap.add_argument('--limit', type=int, default=None)
    args = ap.parse_args()

    if not (args.dry_run or args.apply):
        ap.error('Elegí --dry-run o --apply')

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=os.getenv('DB_PORT', 5432),
        dbname=os.getenv('DB_NAME', 'retopa'),
        user=os.getenv('DB_USER', 'retopa'),
        password=os.getenv('DB_PASSWORD', ''),
    )
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    if args.apply:
        cur.execute(SQL_PRELUDIO)
        conn.commit()
        print('✔ phone_raw / phone_extra listos, originales respaldados')

    cur.execute("""SELECT 1 FROM information_schema.columns
                    WHERE table_name='businesses' AND column_name='phone_raw'""")
    col = 'COALESCE(phone_raw, phone)' if cur.fetchone() else 'phone'

    q = f"""SELECT id, name, city, {col} AS phone
             FROM businesses
            WHERE NULLIF(TRIM({col}),'') IS NOT NULL"""
    params = []
    if args.source:
        q += ' AND source = %s'; params.append(args.source)
    q += ' ORDER BY id'
    if args.limit:
        q += ' LIMIT %s'; params.append(args.limit)

    cur.execute(q, params)
    filas = cur.fetchall()
    print(f'📞 {len(filas)} fichas con teléfono a evaluar\n')

    stats = {'ok': 0, 'revisar': 0, 'rechazado': 0, 'sin_cambio': 0}
    propuestas = []

    for f in filas:
        r = normalizar(f['phone'], f['city'])
        if not r['principal']:
            stats['rechazado'] += 1
            if args.dry_run and stats['rechazado'] <= 15:
                print(f"  ✗ {f['id']:5} {str(f['phone'])[:28]:30} [{','.join(r['motivo'])}]")
            continue
        if r['principal'] == (f['phone'] or '').strip() and not r['secundarios']:
            stats['sin_cambio'] += 1
            continue
        if r['confianza'] >= 0.70:
            stats['ok'] += 1
        else:
            stats['revisar'] += 1
        propuestas.append((f, r))
        if args.dry_run and len(propuestas) <= 20:
            extra = f" +{len(r['secundarios'])} sec" if r['secundarios'] else ''
            print(f"  ✔ {f['id']:5} {str(f['phone'])[:28]:30} → {r['principal']}{extra} (c={r['confianza']})")

    print(f"\n── Resumen ───────────────────────────")
    print(f"  recuperables (conf ≥ 0.70) : {stats['ok']}")
    print(f"  a revisar    (conf < 0.70) : {stats['revisar']}")
    print(f"  sin cambio                 : {stats['sin_cambio']}")
    print(f"  no parseables              : {stats['rechazado']}")

    if args.dry_run:
        print('\n(dry-run: no se escribió nada)')
        return

    # ── Escribir a staging ──────────────────────────────────────────────────
    cur.execute("""INSERT INTO enrichment_runs
                     (filtro_categoria, cuota_maxima, scraper_version, motivo_fin)
                   VALUES ('normalizacion_telefono', %s, 'norm-1.0', 'completo')
                   RETURNING id""", (len(propuestas),))
    run_id = cur.fetchone()[0]

    n = 0
    for f, r in propuestas:
        cur.execute("""
            INSERT INTO enrichment_candidates
              (run_id, business_id, campo, valor_actual, valor_propuesto,
               valor_normalizado, fuente, fuente_url, confianza, corroboraciones)
            VALUES (%s,%s,'phone',%s,%s,%s,'manual',NULL,%s,1)
            ON CONFLICT (business_id, campo, valor_normalizado) DO NOTHING
        """, (run_id, f['id'], f['phone'], f['phone'], r['principal'], r['confianza']))
        n += cur.rowcount
        if r['secundarios'] or r['interno']:
            cur.execute("""UPDATE businesses SET phone_extra = %s WHERE id = %s""",
                        (json.dumps({'secundarios': r['secundarios'],
                                     'interno': r['interno']}), f['id']))

    cur.execute("""UPDATE enrichment_runs
                      SET finalizada_at = NOW(), fichas_evaluadas = %s, candidatos_creados = %s
                    WHERE id = %s""", (len(filas), n, run_id))
    conn.commit()
    print(f'\n✔ corrida #{run_id}: {n} candidatos en staging.')
    print('  Revisá con:  SELECT * FROM v_revision_diaria;')
    print(f'  Revertir:    SELECT fn_revertir_corrida({run_id});')


if __name__ == '__main__':
    main()
