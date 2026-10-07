# Fix SEO — título de ficha y h1 del navbar

    cd /opt && tar -xzf retopa_fix_seo.tar.gz && cd /opt/retopa
    python3 _deploy/aplicar_fix_title_h1.py
    docker compose up -d --build frontend

Solo frontend.

## Qué arregla

**1. El título de las fichas.** `loadSiteConfig()` en `js/app.js` escribía
`document.title` en toda página. En las fichas el servidor ya había inyectado
un título propio ("Monital SRL — Servicios Profesionales en Asunción | RetoPA")
y el JS lo pisaba con el genérico del sitio. Resultado: 14.469 fichas con el
mismo título en pestaña, marcadores, historial y links compartidos por chat.

Ahora solo se escribe el título del sitio cuando NO hay uno de página
(`window.__RETOPA_PRELOAD__`, que ya inyecta `serveBusinessSpa`).

**2. El `<h1>` del navbar.** El logo estaba marcado como `<h1>`, así que en
cada página el encabezado principal decía "RetoPA". Pasa a `<div>` con las
mismas clases: visualmente idéntico, semánticamente correcto.

## Verificar

Abrí una ficha y mirá el título de la pestaña: debe decir el nombre del
negocio, no "RetoPA — Ecosistema Comercial de Paraguay".

    curl -s https://retopa.com.py/negocios/profesionales/asuncion/monital-srl-8115 \
      | grep -o '<title>[^<]*'

El HTML del servidor ya estaba bien antes del fix; lo que cambia es lo que
queda en el DOM después de que corre el JS.

## Lo que NO cambia

Googlebot recibe la versión SSR (`isCrawler()` por user-agent), que siempre
tuvo el título y el h1 correctos. Este fix es para personas y para robustez,
no una corrección de indexación.
