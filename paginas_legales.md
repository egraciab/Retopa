## PROMPT

Trabajás sobre el repo de RetoPA en `/opt/retopa` (Node.js/Express, PostgreSQL en el contenedor `retopa-db`, frontend Vanilla JS servido por `frontend/server.js`, Nginx delante, admin en `/admin` con JWT Bearer vía `getAdminToken`, configuración del sitio en la tabla `site_config` como pares key/value). Objetivo: dejar las páginas legales de RetoPA (`terminos.html` y `privacidad.html`) completas, correctas para la legislación paraguaya vigente y **editables desde Admin → Configuración del Sitio**, sin romper nada de lo que ya funciona.

Trabajá en `dev` primero (ver `runbook-entorno-dev-retopa.md` si está en el repo) y entregame el paquete de deploy con la estructura habitual (tar.gz → `/` → `docker compose down && up -d --build`). Antes de tocar código, leé las dos páginas actuales y `frontend/server.js` para entender cómo se sirven las páginas estáticas y cómo se inyecta meta para crawlers.

### 0. Datos del responsable (leer de `site_config`, nunca hardcodear)

Creá estas claves en `site_config` si no existen, con estos valores iniciales, y usalas en las dos páginas y en el pie del sitio:

| key | valor inicial |
|---|---|
| `legal_razon_social` | `HEPTA E.A.S.` |
| `legal_ruc` | `80117760-0` |
| `legal_marca_operada` | `RetoPA (marca en trámite de registro ante DINAPI, solicitud 2649992, clase 35)` |
| `legal_domicilio` | `<<domicilio legal de HEPTA E.A.S., ciudad, Paraguay>>` |
| `legal_email` | `<<correo de contacto legal, p. ej. legal@retopa.com.py>>` |
| `legal_representante_nombre` | `<<nombre completo del representante designado>>` |
| `legal_representante_email` | `<<correo del representante para notificaciones>>` |
| `legal_terminos_version` | `2.0` |
| `legal_terminos_fecha` | fecha del deploy, formato `YYYY-MM-DD` |
| `legal_privacidad_version` | `2.0` |
| `legal_privacidad_fecha` | fecha del deploy |
| `legal_gracia_dias` | `90` (debe ser la misma clave que use la regla de 2.ª ficha de `decision-planes-y-fichas.md`; si esa clave ya existe con otro nombre, reutilizala) |

### 1. Contenido de `terminos.html` (Términos y Condiciones de Uso)

Reescribir completo, en español rioplatense neutro (voseo moderado, sin jerga legal innecesaria), con esta estructura numerada. Cada sección con `id` ancla y un índice al inicio. Nada de "este documento es una base general": tiene que ser la versión definitiva, con una nota final de revisión por asesoría jurídica solo si yo la dejo activa desde el Admin (`legal_mostrar_nota_revision`, default `false`).

1. **Identificación del responsable.** Razón social, RUC, domicilio, correo (desde `site_config`). Aclarar que RetoPA es una marca operada por HEPTA E.A.S. y que, si la operación pasa a otra sociedad, se informará con 30 días de anticipación en esta misma página.
2. **Objeto del servicio.** Directorio y plataforma de presencia digital para negocios, emprendedores y profesionales de Paraguay. Qué es una "ficha", qué es "reclamar", qué es "verificar". RetoPA no es parte de las transacciones entre usuarios y negocios.
3. **Origen de la información de las fichas.** Declarar expresamente que parte de las fichas se crean a partir de **información pública** (registros de la DNCP — contrataciones.gov.py, bajo licencia CC BY 4.0 — y del MIC), con atribución de fuente y fecha conforme al Decreto 4064/2015 (Anexo II), y que esa publicación **no implica aval, vínculo ni patrocinio del Estado ni de ninguna institución**. Explicar que cualquier negocio puede pedir **rectificación, actualización o baja** de su ficha sin necesidad de tener cuenta, por el canal de la sección 12, y el plazo de respuesta (10 días hábiles).
4. **Cuentas y reclamo de fichas.** Requisitos (mayoría de edad, datos veraces, un número de WhatsApp o correo verificable), que el reclamo se otorga a quien demuestre vínculo con el negocio, y que RetoPA puede revertir un reclamo fraudulento. Responsabilidad del titular por lo que publica en su ficha.
5. **Planes, pagos y período de gracia.** Describir con precisión la regla vigente de `decision-planes-y-fichas.md`: creación y reclamo ilimitados y gratuitos; la primera ficha de la cuenta es gratuita para siempre en plan Básico; desde la segunda ficha corre un período de gracia de `{{legal_gracia_dias}}` días, al cabo del cual las fichas adicionales **siguen públicas pero no editables** hasta que una ficha de la cuenta tenga un plan pago; un plan pago en una ficha destraba la edición de todas. Planes pagos (Destacado, Business Pro) y boosts: precio con IVA incluido mostrado en el momento de la compra, duración, renovación **no automática** salvo que se indique lo contrario al contratar, y política de reembolso (sin reembolso por períodos iniciados; reembolso total si RetoPA no activa el servicio en 48 h hábiles). **Destacado Fundador**: beneficio gratuito por 90 días, no se considera pago, al vencer la ficha vuelve a Básico sin cargo y sin pérdida de datos. Facturación electrónica a nombre de HEPTA E.A.S.
6. **Contenido de terceros, reseñas y responsabilidad del intermediario.** Declarar que RetoPA actúa como **prestador de servicios de intermediación (alojamiento de contenidos de terceros)** en los términos de la **Ley 4868/2013 de Comercio Electrónico y su Decreto 1165/2014**, que no tiene obligación general de supervisar contenidos y que retira contenidos ilícitos al tomar conocimiento efectivo. Reglas de reseñas: solo de usuarios registrados, prohibidas las reseñas falsas, pagadas o del propio negocio; el negocio puede responder; RetoPA puede eliminar reseñas que violen estas reglas; las reseñas no son verificadas como hechos por RetoPA.
7. **Representante para notificaciones (Ley 4868/2013, art. 19).** Sección propia, visible, con nombre y correo del representante designado (desde `site_config`) para recibir notificaciones, reclamos y requerimientos de autoridades. Incluir la frase de que la designación se registra ante el MIC (Dirección de Firma Digital y Comercio Electrónico).
8. **Procedimiento de denuncia y retiro de contenidos (Ley 4868/2013, art. 16).** Formulario o correo, qué debe contener la denuncia (identificación del denunciante, contenido exacto, derecho afectado, declaración de buena fe), plazo de evaluación (5 días hábiles), notificación al autor del contenido, posibilidad de contranotificación.
9. **Publicidad y contenidos patrocinados.** Toda ficha destacada, boost, promoción patrocinada o anuncio se identifica visiblemente como tal (Ley 4868 art. 21; Ley 1334/98 art. 35). RetoPA no altera reseñas ni rankings a cambio de pago.
10. **Comunicaciones comerciales.** RetoPA envía avisos de servicio (reclamo, activación, vencimientos) a los titulares de cuenta. Las comunicaciones comerciales (ofertas, novedades) solo con **consentimiento previo** y con **opción de baja en cada mensaje** (Ley 4868 arts. 20–22). Para WhatsApp: RetoPA respeta el **Registro "No Molestar" de SEDECO (Ley 5830/2017)** y lo consulta antes de cada campaña; indicar cómo pedir que no se lo contacte.
11. **Propiedad intelectual.** Marca RetoPA y logo (en trámite DINAPI 2649992); software y base de datos de HEPTA E.A.S.; el contenido que sube cada negocio sigue siendo suyo y otorga a RetoPA licencia no exclusiva para mostrarlo en la plataforma, en buscadores y en materiales de difusión de la propia ficha; prohibición de scraping masivo y reutilización de la base sin autorización.
12. **Contacto, soporte y reclamos.** Correo legal, formulario de soporte, plazo de respuesta. Mención a SEDECO como autoridad de defensa del consumidor para usuarios consumidores finales (Ley 1334/98) sin renunciar a ningún derecho.
13. **Suspensión y cierre de cuentas.** Causales, preaviso cuando corresponda, qué pasa con la ficha (sigue pública como dato del directorio salvo pedido de baja del negocio).
14. **Limitación de responsabilidad.** Redactada de forma compatible con el art. 28 de la Ley 1334/98: **sin** exoneración total, **sin** arbitraje obligatorio para consumidores; responsabilidad limitada a lo pagado en los últimos 12 meses solo para clientes empresariales.
15. **Modificaciones.** Aviso con 15 días de anticipación por correo a titulares de cuenta y banner en el sitio para cambios sustanciales; historial de versiones accesible.
16. **Ley aplicable y jurisdicción.** Leyes de la República del Paraguay; tribunales ordinarios de Asunción, sin perjuicio de los derechos del consumidor a reclamar en su domicilio.

### 2. Contenido de `privacidad.html` (Política de Privacidad)

Misma estructura de ancla e índice. Debe citar por nombre y número las normas y estar lista para la entrada en vigencia de la Ley 7593/2025.

1. **Responsable del tratamiento.** Razón social, RUC, domicilio, correo (desde `site_config`).
2. **Marco legal.** **Ley 7593/2025 de Protección de Datos Personales** (promulgada el 27-11-2025, con plazo de adecuación de 24 meses; RetoPA adopta sus principios desde ahora), **Ley 6534/2020** en lo que sigue vigente, **Ley 4868/2013** y **Ley 5830/2017**. Mencionar a la Agencia Nacional de Protección de Datos Personales (MITIC) como autoridad futura.
3. **Qué datos tratamos y de dónde vienen.** Tabla con cuatro orígenes: (a) datos de negocios provenientes de **fuentes públicas** (DNCP, MIC) — nombre o razón social, RUC, dirección, teléfono, rubro — con atribución; (b) datos que carga el titular al reclamar o crear una ficha; (c) datos de cuenta (nombre, correo, contraseña cifrada, número de WhatsApp verificado); (d) datos de uso (páginas vistas, términos buscados, clics en WhatsApp/llamar/sitio, dispositivo, identificador seudonimizado; **sin IP completa** o con IP truncada, decir cuál es el caso real según el código).
4. **Empresas unipersonales y personas físicas.** Aclarar que cuando una ficha corresponde a una persona física (unipersonal, profesional, oficio), sus datos de contacto comercial son datos personales; base de licitud: **interés legítimo** de dar visibilidad comercial a partir de información pública (Ley 7593 arts. 5 y 8), con derecho de oposición inmediato y gratuito; a partir de que el titular reclama su ficha, base contractual.
5. **Finalidades.** Lista cerrada: mostrar el directorio; gestionar cuentas y fichas; enviar avisos de servicio; medir uso agregado; prevenir fraude; cumplir obligaciones legales; comunicaciones comerciales solo con consentimiento.
6. **Encargados y terceros.** Nombrar: Cloudflare (CDN y seguridad), proveedor de correo transaccional (el que use el sistema — leerlo de la config, no inventar), **Meta Platforms (WhatsApp Business / Cloud API)** para mensajes de servicio, Bancard/Tpago para pagos. Declarar que algunos procesan datos fuera de Paraguay y que RetoPA aplica las garantías contractuales de esos proveedores (Ley 7593 art. 19).
7. **Conservación.** Fichas: mientras el negocio exista en fuentes públicas o el titular no pida baja. Cuentas: mientras estén activas y 12 meses después. Mensajes de WhatsApp (`wa_messages`): 180 días. Datos de tráfico exigidos por la Ley 4868 (art. 10): 6 meses. Datos de uso: agregados a los 12 meses.
8. **Derechos del titular (ARCO + oposición + portabilidad).** Cómo ejercerlos **con y sin cuenta**, por correo o formulario, plazo de respuesta 10 días hábiles, sin costo, y derecho a reclamar ante la autoridad cuando exista.
9. **Baja y rectificación de una ficha sin cuenta.** Procedimiento específico y simple: formulario público `/legal/baja` (o correo) que pida nombre del negocio, URL de la ficha, vínculo con el negocio y qué se solicita; RetoPA puede pedir verificación por WhatsApp al número de la ficha.
10. **Cookies y almacenamiento local.** Qué se usa exactamente (sesión, preferencias, métricas agregadas), si hay o no cookies de terceros, cómo desactivarlas.
11. **Seguridad.** Medidas razonables (cifrado en tránsito, contraseñas con hash, acceso restringido, backups); notificación de incidentes a los afectados y a la autoridad cuando la ley lo exija.
12. **Menores.** El servicio está dirigido a mayores de 18 años.
13. **Comunicaciones y WhatsApp.** Mismo texto que Términos §10, con el enlace al Registro No Molestar de SEDECO.
14. **Cambios y contacto.** Versión, fecha, historial, correo.

### 3. Editor de páginas legales en Admin → Configuración del Sitio

Agregar una pestaña o sección **"Páginas legales"** dentro de Configuración del Sitio con:

- **Datos del responsable**: formulario con todas las claves `legal_*` de la sección 0 (razón social, RUC, domicilio, correo, representante nombre y correo, días de gracia, flag de nota de revisión). Validaciones: RUC con dígito verificador paraguayo, correo válido, días de gracia entero 1–365.
- **Editor de cada página** (Términos / Privacidad): un editor Markdown con vista previa (podés usar una librería liviana ya presente en el proyecto o `marked` + sanitización con DOMPurify o equivalente del lado servidor; **nunca** renderizar HTML sin sanitizar). El contenido se guarda en `site_config` como `legal_terminos_md` y `legal_privacidad_md`; el HTML público se genera desde ese Markdown. Los textos de la sección 1 y 2 son el contenido inicial de esas dos claves (seed en la migración SQL).
- **Variables**: dentro del Markdown se pueden usar `{{legal_razon_social}}`, `{{legal_ruc}}`, `{{legal_domicilio}}`, `{{legal_email}}`, `{{legal_representante_nombre}}`, `{{legal_representante_email}}`, `{{legal_gracia_dias}}`, `{{version}}`, `{{fecha}}`; el render las reemplaza. Documentar la lista en el propio editor.
- **Versionado**: al guardar, se incrementa la versión (minor por defecto; checkbox "cambio sustancial" → major), se guarda la fecha y se archiva la versión anterior en una tabla nueva `legal_versions (id, page, version, content_md, published_at, published_by)`. Botón "Ver historial" con las versiones anteriores y "Restaurar".
- **Aviso de cambio sustancial**: si se marca "cambio sustancial", al publicar se encola un aviso por correo a los titulares de cuenta usando el sistema de notificaciones existente (plantilla nueva `legal_update`) y se activa un banner en el sitio durante 15 días (clave `legal_banner_hasta`).
- Permisos: solo `requireAdmin`. Logs `console.error('[legal]', …)` según la convención del proyecto.

### 4. Backend y rutas

- `GET /terminos.html` y `GET /privacidad.html` siguen respondiendo en las mismas URLs (hay enlaces externos y en el pie): deben renderizar desde `site_config` con caché en memoria de 5 minutos invalidada al guardar desde Admin. Mantener `<title>`, meta description y canonical correctos; `Cache-Control: public, max-age=300` para estas dos páginas (no `no-store`).
- Nuevas rutas: `GET /legal/baja` (formulario público de baja/rectificación sin cuenta) y `POST /legal/baja` que guarde en una tabla `legal_requests (id, tipo, business_id nullable, business_url, nombre, email_o_whatsapp, vinculo, detalle, estado, created_at, resolved_at, notas)` y notifique al admin por correo; `GET /legal/denuncia` y `POST /legal/denuncia` con la misma tabla (`tipo = 'retiro'`). Rate limit con `express-rate-limit` como el resto del proyecto.
- Admin: lista de `legal_requests` con filtro por estado (pendiente / en curso / resuelta / rechazada) y campo de notas, dentro de la misma sección "Páginas legales".
- Migración: `sql/migrate_sNN.sql` con el siguiente número libre (tablas `legal_versions`, `legal_requests`, claves `site_config`, seed del Markdown). Las tablas nuevas deben recibir los GRANTs del rol de la app según la convención del proyecto.

### 5. Pie del sitio y enlaces

- En el pie de todas las páginas públicas (home, fichas, landings, portal): enlaces a Términos, Privacidad, "Pedir baja o corrección de una ficha" (`/legal/baja`) y "Denunciar contenido" (`/legal/denuncia`), más la línea "RetoPA es una marca operada por {{legal_razon_social}} · RUC {{legal_ruc}}".
- En cada ficha que tenga `source` de importación pública (DNCP, MIC o cualquier `source` que empiece con `import_` o `dncp`), mostrar una línea discreta al pie de la ficha: "Datos de contacto iniciales obtenidos de registros públicos ({{fuente}}, {{fecha_importacion}}). ¿Es tu negocio? Reclamalo o pedí corrección." con enlace a reclamo y a `/legal/baja`. Esto cumple la atribución del Decreto 4064/2015 y es un disparador de reclamo. Leer la fuente y la fecha de los campos reales de `businesses` (verificá cómo se llaman: `source`, `created_at` o `imported_at`).
- En el formulario de registro y en el de reclamo: checkbox obligatorio "Leí y acepto los Términos y la Política de Privacidad (versión {{version}})" y guardar en la cuenta `terms_accepted_version` y `terms_accepted_at`. Checkbox **separado y opcional** "Quiero recibir novedades y ofertas de RetoPA por correo y WhatsApp" → `marketing_opt_in`, `marketing_opt_in_at`. Esta segunda marca es la que debe consultar cualquier envío comercial futuro (E2 WhatsApp API).

### 6. SEO y crawlers

- Las dos páginas legales y las de `/legal/*` con `noindex` **no**: Términos y Privacidad deben ser indexables (Google y Meta las piden); `/legal/baja` y `/legal/denuncia` con `noindex, follow`.
- Respetar la lógica de `buildBusinessHTML()` en `frontend/server.js`: la línea de atribución de fuente pública también debe aparecer en la versión que reciben los crawlers.

### 7. Pruebas y entrega

- Harness (automatizado o checklist ejecutada) que verifique: render de ambas páginas con variables reemplazadas; guardado desde Admin y actualización inmediata de la página pública; versionado e historial; restauración; `POST /legal/baja` crea la fila y manda el correo; rate limit activo; checkbox de aceptación obligatorio en registro y reclamo; `marketing_opt_in` se guarda por separado y por defecto en `false`; la línea de atribución aparece en una ficha importada y **no** en una creada por el dueño; `Cache-Control` correcto; sanitización (probá inyectar `<script>` en el Markdown y confirmá que no se ejecuta).
- No tocar: la regla de planes de `decision-planes-y-fichas.md` (solo leer la clave de días de gracia), el flujo de reclamo, el panel de prospectos.
- Entrega: paquete tar.gz con estructura de carpetas correcta para extraer en `/` del servidor (ruta de subida `/home/hepta/claude/`), la migración SQL, y un `CHANGELOG-legal.md` con: archivos tocados, claves nuevas de `site_config`, qué datos de la sección 0 quedaron como marcador y hay que completar desde el Admin, y la lista de verificación ejecutada con resultado.

Al terminar, decime en una lista corta qué quedó pendiente de decisión humana (por ejemplo, el nombre del representante o el domicilio) y qué recomendás revisar con un abogado antes de firmar un convenio con una institución pública.
