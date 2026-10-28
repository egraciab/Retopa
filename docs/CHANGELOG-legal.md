# Páginas legales editables — 2026-10-28

Paquete `retopa_paginas_legales.tar.gz`. Términos y Privacidad pasan a vivir en `site_config` (Markdown), se editan y versionan desde **Admin → Páginas legales**, y se suman los formularios públicos de baja y denuncia, la atribución de fuente pública en las fichas y la aceptación registrada de términos.

## Archivos

| Archivo | Qué cambia |
|---|---|
| `sql/2026-10-28_paginas_legales.sql` | **Nuevo.** Claves `legal_*`, tablas `legal_versions` y `legal_requests`, columnas de aceptación y opt-in en `users`. Idempotente. |
| `backend/src/routes/legal.routes.js` | **Nuevo.** API pública (`/api/v2/legal`) y del Admin (`/api/v2/admin/legal`). |
| `backend/src/helpers/legalMarkdown.js` | **Nuevo.** Markdown → HTML que escapa todo antes de dar formato. |
| `backend/src/assets/legal/{terminos,privacidad}.md` | **Nuevo.** Textos 2.0 (los mismos que siembra la migración; respaldo si la clave está vacía). |
| `backend/src/app.js` | Monta las rutas legales. |
| `backend/src/config/mail.js` | Plantillas `legal_update` (aviso de cambio sustancial) y `legalRequestAlert` (pedido nuevo → buzones de leads). |
| `backend/src/routes/directory.js` | `publicSource` en la ficha; claves legales en `/site-config` público; **el correo de quien deja una reseña ya no se publica** en la API. |
| `backend/src/routes/auth-public.js` | `/register` exige `acepta_terminos` y guarda versión, fecha y opt-in. |
| `backend/src/routes/claim.routes.js` | `/confirm` y `/alta` exigen `acepta_terminos` y lo guardan. |
| `frontend/legal-pages.js` | **Nuevo.** `/terminos.html`, `/privacidad.html` (con `?v=` para versiones viejas), `/legal/baja`, `/legal/denuncia` y el pie legal de las páginas generadas en el servidor. |
| `frontend/server.js` | Registra lo anterior antes del static, bloquea `/legal-pages.js`, pie legal y línea de fuente pública en la ficha para crawlers. |
| `frontend/index.html`, `js/app.js` | Pie: baja, denuncia y «marca operada por…»; banner de cambio sustancial; casillas en Crear cuenta. |
| `frontend/js/auth.js` | Manda `acepta_terminos` y `marketing_opt_in`. |
| `frontend/js/profile.js` | Línea de fuente pública al pie de la ficha. |
| `frontend/reclamar/index.html` | Casillas obligatoria y opcional en reclamo y alta (no en «pedir revisión», que no crea cuenta). |
| `frontend/admin/index.html`, `admin/js/config.js`, `admin/js/legal.js` | Sección **Páginas legales**: datos, editor con vista previa, historial y restaurar, pedidos, aviso por correo. |
| `tests/harnesses/harness_paginas_legales.js` | **Nuevo.** 97 chequeos. |
| `tests/harnesses/harness_{login_wa,reclamo_e1,reclamo_ficha}.js` | Mandan `acepta_terminos: true` (el contrato de la API cambió). |

`terminos.html` y `privacidad.html` estáticos **no se tocan**: quedan como respaldo si el backend no responde.

## Claves nuevas de `site_config`

`legal_razon_social`, `legal_ruc`, `legal_marca_operada`, `legal_domicilio`, `legal_email`, `legal_representante_nombre`, `legal_representante_email`, `legal_terminos_version`, `legal_terminos_fecha`, `legal_privacidad_version`, `legal_privacidad_fecha`, `legal_gracia_dias`, `legal_mostrar_nota_revision` (false), `legal_banner_hasta`, `legal_aviso_id`, `legal_fuentes_publicas`, `legal_terminos_md`, `legal_privacidad_md`.

- `legal_gracia_dias` **no** reutiliza `plan_grace_days`: esa clave (7) es la gracia después de que **vence un plan pago** (`jobs/planExpiry.js`). Hoy no hay ninguna regla de 2.ª ficha con 90 días, así que `legal_gracia_dias` queda guardada sin uso.
- `legal_fuentes_publicas` empieza con `DNCP` y `DNCP-SIPE`. Los demás orígenes (`import_contactos`, `import_hilagro`, `import_nil`, `import_infocenter`, `manual`, `prospeccion_*`) **no** llevan la línea de «registros públicos» hasta que se confirme de dónde vienen.

## Datos que quedaron como marcador (completar en Admin → Páginas legales → Datos)

Mientras no se completen, la página pública muestra «[pendiente de completar]»:

- `legal_domicilio`
- `legal_email`
- `legal_representante_nombre`
- `legal_representante_email`

## Diferencias con el pedido original

- **Planes (§5):** describe las reglas de hoy (decisión del 28/10). Reclamar es gratis; con plan Básico cada cuenta crea **una** ficha nueva y para más necesita un plan pago en alguna; el pago es por link de Tpago confirmado a mano; no hay renovación automática; gracia de `plan_grace_days` días al vencer.
- **Reseñas (§6):** se dejan con nombre y correo, sin cuenta, y se publican al instante; RetoPA modera después (decisión del 28/10).
- **Aviso de cambio sustancial:** banner de 15 días y envío del correo **por tandas** desde el Admin, en vez de una cola automática (decisión del 28/10). Destinatarios: usuarios activos `user`/`client` con correo; a quien ya le llegó no se le repite.
- **Registro No Molestar:** queda el compromiso de consultarlo antes de cada campaña. **El sistema no lo hace solo**: hay que consultar nomolestar.gov.py a mano antes de cada tanda de WhatsApp (decisión del 28/10).
- **Proveedores (Privacidad §6):** solo los reales. No hay Cloudflare delante del sitio (solo cdnjs para íconos), no hay Bancard ni WhatsApp Cloud API, y no existe `wa_messages` (se quitó su plazo de conservación). Se agregaron Google Maps/Fonts, que el sitio sí carga.
- **IP (Privacidad §3):** las métricas guardan un hash de la IP con clave secreta; la excepción declarada son los pedidos de reclamo (`claim_requests.ip`), que guardan la IP completa.
- **Citas legales corregidas** contra el texto oficial:
  - Ley 4868, art. 16: es el retiro por **propiedad intelectual**. El procedimiento general de denuncia es propio de RetoPA, y el puerto seguro del alojamiento es el **art. 12**.
  - Ley 4868, art. 19: el representante se **comunica** al MIC como autoridad de aplicación; la ley no habla de un «registro».
  - Ley 1334, art. 35: prohíbe la **publicidad engañosa**. La identificación de la publicidad está en la Ley 4868, art. 21.
  - Comunicaciones comerciales: Ley 4868, arts. 21 a 23.
  - Ley 7593: vigencia a los 24 meses (art. 57), incidentes de seguridad (art. 17), derechos (arts. 26 a 32), interés legítimo (art. 8), transferencias (art. 19).
- **Rutas:** los formularios envían a `POST /api/v2/legal/baja` y `/api/v2/legal/denuncia`, para que el límite por IP vea la IP real. `GET /legal/baja` y `/legal/denuncia` los sirve el frontend. Límite: 8 envíos por hora por IP y por formulario.
- **Migración:** `sql/2026-10-28_paginas_legales.sql` sigue la convención de nombres con fecha (no existe `migrate_sNN`). Sin GRANTs: la app usa el mismo rol dueño de las tablas.
- **Admin:** «Páginas legales» es una entrada propia del menú, junto a «Sitio Web», no una pestaña adentro.
- **Versión aceptada:** se guarda como `T<términos>/P<privacidad>`, p. ej. `T2.0/P2.0`.
- Los documentos `decision-planes-y-fichas.md` y `runbook-entorno-dev-retopa.md` no están en el servidor.

## Verificación ejecutada (2026-10-28)

En Postgres efímero con el esquema de prod (`pg_dump -s`) + la migración, y con el código del paquete sobre una copia de prod:

- **Migración:** dry-run con `ROLLBACK` sin rastro; aplicada dos veces seguidas sin duplicar nada (2 versiones, 18 claves).
- **`harness_paginas_legales.js`: 97/97**, dos corridas seguidas. Cubre:
  - render de las dos páginas con variables;
  - guardado en el Admin y actualización inmediata;
  - validaciones (RUC con dígito verificador, correos, días 1–365, JSON);
  - sanitización (`<script>`, `onerror`, `javascript:`);
  - versionado minor y major, historial, restaurar y `?v=` público;
  - `POST /legal/baja` crea la fila y avisa a los buzones; denuncia; honeypot; límite por IP;
  - registro, reclamo y alta exigen la casilla; `marketing_opt_in` separado y FALSE por defecto;
  - aviso por tandas sin repetir destinatarios;
  - plantillas reales escapando lo que manda el público;
  - atribución en ficha DNCP y no en ficha del dueño ni en `import_hilagro`;
  - correo de reseñas fuera de la API;
  - `Cache-Control: public, max-age=300`, `index, follow` en Términos y Privacidad, `noindex, follow` en `/legal/*`;
  - línea de fuente en la versión para crawlers;
  - respaldo estático con el backend caído;
  - `/legal-pages.js` bloqueado.
- **Regresión, prod vs paquete:**
  - iguales: `login_wa` 39/39, `reclamo_ficha` 38/38, `alta_dueno` 19/19, `claim_events` 44/44, `claim_email` 9/9, `fusion` 59/59, `pageview_bots` 19/19, `static_exposure` 14/14;
  - `reclamo_e1` 87/89 en los dos casos: las 2 fallas ya estaban en prod;
  - `favicon_seo` 7/14 en los dos casos: ya fallaba en prod.
- **Docker:** las imágenes de backend y frontend construyen (Tailwind y cachebust ok).
- **No ejecutado acá:** las pruebas de interfaz con navegador (Playwright no está en prod) y `harness_email_verification` / `harness_engancha_email` (necesitan `initdb` local). Correrlos en dev.
