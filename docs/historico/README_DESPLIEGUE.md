# Despliegue — Enriquecimiento de fichas

## Contenido

    backend/src/routes/admin.enrichment.routes.js   nuevo — API de revisión
    frontend/admin/js/enrichment.js                 nuevo — UI de revisión por lotes
    sql/2026-09-02_enrichment_staging.sql           migración (ya aplicada en tu server)
    scripts/normalizar_telefonos.py                 con los 4 parches ya incorporados
    _deploy/aplicar_enriquecimiento.py              patcher idempotente

El patcher edita SOLO las líneas necesarias de `app.js`, `index.html` y
`config.js`. No los sobrescribe, y deja backup `.bak-<fecha>` de cada uno.

## Pasos

    cd /opt
    tar -xzf retopa_enriquecimiento.tar.gz          # respeta /opt/retopa
    cd /opt/retopa
    python3 _deploy/aplicar_enriquecimiento.py      # integra la sección
    docker compose up -d --build backend frontend

Verificar:

    docker compose logs -f backend | head -30
    curl -s localhost/api/v2/admin/enrichment/resumen   # debe dar 401, no 404

Un 404 significa que la ruta no se montó; un 401 significa que está viva y
pidiendo token, que es lo correcto.

## Sobre el build

`--build` alcanza. NO uses `--no-cache`: el Dockerfile del frontend hace
`npm install` antes del `COPY`, así que sin cache reinstalás node_modules al
pedo y el build pasa de ~40 s a varios minutos. Docker invalida la capa del
`COPY . .` solo, que es exactamente lo que cambió.

`--no-cache` solo hace falta si tocás `package.json`.

Tailwind se compila dentro del build del frontend y su `content` ya incluye
`./admin/**/*.js`, así que las clases nuevas de `enrichment.js` entran solas.
Por eso hay que rebuildear el frontend y no alcanza con reiniciarlo.

## Rollback

Del código:

    cd /opt/retopa
    for f in backend/src/app.js frontend/admin/index.html frontend/admin/js/config.js; do
      cp "$f".bak-<fecha> "$f"
    done
    docker compose up -d --build backend frontend

De los datos ya aplicados: botón "Revertir" en la pestaña Corridas del admin,
o `SELECT fn_revertir_corrida(<id>);`. `businesses.phone_raw` conserva el
original en cualquier caso.
