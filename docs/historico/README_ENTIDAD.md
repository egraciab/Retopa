# Señales de entidad — RUC y sameAs

    cd /opt && tar -xzf retopa_entidad_seo.tar.gz && cd /opt/retopa
    python3 _deploy/aplicar_entidad_seo.py
    docker compose up -d --build frontend

Solo frontend. Aplicar DESPUÉS de retopa_snippet_seo.tar.gz.

## Por qué

El tráfico real son búsquedas del nombre de la empresa. En esas consultas
competimos contra el sitio propio de esa empresa, su Facebook y su ficha de
Google. Lo que le falta a Google es una razón para entender que la ficha de
RetoPA habla de ESA misma entidad y no de otra cosa.

## Los tres cambios

**1. RUC visible en el SSR.** La ficha ya lo mostraba a las personas (SPA)
pero el HTML que recibe Googlebot no lo incluía. Se agrega al `<dl>` de datos.
De paso queda consistente con la meta description, que ya lo menciona.

**2. `taxID` en el JSON-LD.** Para una empresa paraguaya el RUC es EL
identificador. Se declara solo porque ahora está visible en la página.

**3. `sameAs` con el sitio propio, en todos los planes.** Este era el hueco
grande. Hoy:

    const max = planType === 'premium' ? 6 : planType === 'featured' ? 2 : 0;
    if (!max) return [];

Con 14.456 fichas en básico de 14.469, el 99,9% emitía JSON-LD **sin ningún
sameAs**. El sitio web sí se muestra en la ficha en todos los planes, así que
declararlo cumple la regla de Google de marcar solo contenido visible.

Las redes sociales siguen gateadas por plan: esto no regala una función paga.

## Riesgo sobre lo posicionado

Ninguno. No toca URLs, canónicas, `robots`, sitemaps ni el umbral.

## Expectativa realista

`sameAs` y `taxID` ayudan a la resolución de entidad, pero Google no publica
cómo los pondera y el efecto no es inmediato ni medible de forma aislada. Es
higiene de datos estructurados bien hecha, no una palanca con resultado
garantizado.

## Verificar

    curl -s https://retopa.com.py/negocios/profesionales/asuncion/monital-srl-8115 \
      | grep -o '"taxID":"[^"]*"\|"sameAs":\[[^]]*\]'

Y pasá una ficha por el Rich Results Test de Google para confirmar que el
schema sigue validando.
