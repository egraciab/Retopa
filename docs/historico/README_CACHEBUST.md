# Cache-busting automático de JS y CSS

    cd /opt && tar -xzf retopa_cachebust.tar.gz && cd /opt/retopa
    python3 _deploy/aplicar_cachebust.py
    docker compose up -d --build frontend

Solo frontend.

## El problema

`index.html` versionaba a mano solo 3 de 12 scripts, con un token fijo
(`?v27s65e`) que había que subir en cada deploy. Los otros 9 y todo el admin
no se versionaban nunca. Resultado: después de cada deploy los visitantes
recurrentes siguen con el JS viejo hasta que el navegador decide soltarlo, y
solo se arregla con Ctrl+Shift+R.

## La solución

`frontend/scripts/cachebust.js` reescribe cada referencia local a `.js`/`.css`
en `index.html` y `admin/index.html` agregando `?v=<sha1 del contenido>`.

Hash **por archivo**: solo cambia la URL de lo que realmente cambió, así el
resto sigue cacheado y no tirás el caché entero en cada deploy.

Corre dentro del build (después de Tailwind, para que el CSS compilado también
quede versionado), así que no hay que acordarse de nada.

Idempotente: correrlo dos veces da el mismo resultado, no acumula `?v=`.
Los CDN externos (Font Awesome, etc.) quedan intactos.

## Verificar después del deploy

    curl -s https://retopa.com.py/ | grep -o '/js/app.js?v=[a-f0-9]*'

Debe mostrar un hash. Y al desplegar un cambio en `app.js`, ese hash cambia
solo — sin Ctrl+Shift+R.

## Nota

Aplicá esto DESPUÉS del fix de título (retopa_fix_seo.tar.gz), así el nuevo
`app.js` sale con hash nuevo y les llega a todos de una.
