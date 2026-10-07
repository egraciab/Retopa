# Snippet de búsqueda — reordenar la meta description

    cd /opt && tar -xzf retopa_snippet_seo.tar.gz && cd /opt/retopa
    python3 _deploy/aplicar_snippet_seo.py
    docker compose up -d --build frontend

Solo frontend.

## Por qué

GSC muestra 378 consultas con 31.224 impresiones y CERO clics. Aparecemos en
primera página (posición media ~8) para el nombre de la empresa y no nos
eligen, porque arriba están el sitio propio, el Facebook y la ficha de Google
de esa misma empresa.

La descripción actual no le da al usuario ninguna razón para elegirnos:

    Servicios Profesionales en Asunción. Tel: 021907449. Monital SRL en RetoPA.

El nombre —lo único que quiere confirmar— va al final, y falta el RUC, que es
el dato que busca quien está verificando un proveedor.

## Después

    Monital SRL — Servicios Profesionales en Asunción. RUC 80048115-3. Tel: 021907449.

Tres cambios: nombre primero, RUC agregado, y se quita "en RetoPA" (el dominio
ya se muestra en el resultado, son caracteres desperdiciados).

## Riesgo sobre lo ya posicionado

Ninguno. No toca URLs, canónicas, `robots`, sitemaps ni el umbral de
indexación. Las 4.450 páginas indexadas siguen igual; cambia solo el texto que
se lee en el resultado.

## Expectativa realista

Google reescribe la meta description cuando le parece que otra cosa responde
mejor a la consulta, así que esto no garantiza nada. Para consultas de nombre
propio suele respetarla más, porque el nombre coincide con la búsqueda.

## Medir

Línea base al día de hoy (3 meses): 4.241 clics, 214 mil impresiones,
CTR 2 %, posición media 7,1.

Volver a mirar en 4–6 semanas. Lo que tiene que moverse es el **CTR**, no la
posición. Si el CTR sube y la posición se mantiene, funcionó.

Para verificar el cambio en producción:

    curl -s https://retopa.com.py/negocios/profesionales/asuncion/monital-srl-8115 \
      | grep -o '<meta name="description"[^>]*'
