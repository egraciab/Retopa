# Título de pestaña al navegar dentro del SPA

    cd /opt && tar -xzf retopa_title_spa.tar.gz && cd /opt/retopa
    python3 _deploy/aplicar_title_spa.py
    docker compose up -d --build frontend

Solo frontend.

## El caso que faltaba

El fix anterior evitó que `loadSiteConfig()` pisara el título inyectado por el
servidor. Eso arregló la carga por URL directa (o recarga).

Pero al abrir una ficha **haciendo clic** desde un listado no se pasa por el
servidor: el SPA renderiza el perfil y cambia la URL con `replaceState`, sin
que nadie toque `document.title`. Por eso quedaba el título del sitio hasta
recargar.

Ahora `openProfile()` fija el título con el mismo formato que `server.js`:

    ${biz.name} — ${biz.categoryName || 'Empresa'} en ${biz.city || 'Paraguay'} | ${siteName}

y también actualiza `og:title` y `og:url`. Al cerrar el modal se restaura el
título del sitio.

## Verificar

Sin recargar: entrá al home, hacé clic en una ficha → el título de la pestaña
debe cambiar al nombre del negocio. Cerrá el modal → vuelve al del sitio.

## Nota sobre OG

Actualizar `og:title` por JS sirve poco para Facebook o WhatsApp, que leen el
HTML crudo sin ejecutar JS. Para links compartidos lo que vale es el SSR, que
ya estaba bien. Se actualiza igual por consistencia y por si algún cliente
lee el DOM.
