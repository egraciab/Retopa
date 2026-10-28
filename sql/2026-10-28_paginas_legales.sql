-- ════════════════════════════════════════════════════════════════════════════
-- RetoPA — 2026-10-28 — Páginas legales editables (Términos y Privacidad)
--
--   1) site_config: datos del responsable (legal_*), Markdown de las dos páginas
--      (legal_terminos_md / legal_privacidad_md), versión, fecha, banner de
--      cambio sustancial y la tabla origen → fuente pública de las fichas.
--      ON CONFLICT DO NOTHING: si ya existen, NO se pisan (re-correr es seguro).
--   2) legal_versions: TODAS las versiones publicadas (la vigente es la última).
--   3) legal_requests: pedidos de baja / rectificación / retiro sin cuenta.
--   4) users: aceptación de términos (versión + fecha) y opt-in comercial
--      SEPARADO (default FALSE), + marca de a quién ya le llegó el aviso legal.
--
-- legal_gracia_dias NO reutiliza plan_grace_days: esa clave es la gracia tras
-- VENCER un plan pago (jobs/planExpiry.js), no la regla de 2.ª ficha.
-- Sin GRANTs: la app usa el mismo rol dueño de las tablas (convención actual).
-- Dry-run: sed 's/^COMMIT;/ROLLBACK;/' este_archivo.sql | psql …
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 1) site_config ──────────────────────────────────────────────────────────
INSERT INTO site_config (key, value, updated_at) VALUES
  ('legal_razon_social',          'HEPTA E.A.S.', NOW()),
  ('legal_ruc',                   '80117760-0', NOW()),
  ('legal_marca_operada',         'RetoPA (marca en trámite de registro ante DINAPI, solicitud 2649992, clase 35)', NOW()),
  ('legal_domicilio',             '<<domicilio legal de HEPTA E.A.S., ciudad, Paraguay>>', NOW()),
  ('legal_email',                 '<<correo de contacto legal, p. ej. legal@retopa.com.py>>', NOW()),
  ('legal_representante_nombre',  '<<nombre completo del representante designado>>', NOW()),
  ('legal_representante_email',   '<<correo del representante para notificaciones>>', NOW()),
  ('legal_terminos_version',      '2.0', NOW()),
  ('legal_terminos_fecha',        to_char(CURRENT_DATE, 'YYYY-MM-DD'), NOW()),
  ('legal_privacidad_version',    '2.0', NOW()),
  ('legal_privacidad_fecha',      to_char(CURRENT_DATE, 'YYYY-MM-DD'), NOW()),
  ('legal_gracia_dias',           '90', NOW()),
  ('legal_mostrar_nota_revision', 'false', NOW()),
  ('legal_banner_hasta',          '', NOW()),
  ('legal_aviso_id',              '', NOW()),
  ('legal_fuentes_publicas',      '{"DNCP":"DNCP — contrataciones.gov.py","DNCP-SIPE":"DNCP — contrataciones.gov.py"}', NOW())
ON CONFLICT (key) DO NOTHING;

INSERT INTO site_config (key, value, updated_at) VALUES ('legal_terminos_md', $md$# Términos y Condiciones de Uso

Estos términos regulan el uso de RetoPA ({{site_url}}). Al usar el sitio, crear una cuenta o reclamar una ficha, aceptás estas condiciones. Si no estás de acuerdo, no uses el servicio.

## 1. Identificación del responsable {#responsable}

RetoPA es una marca operada por **{{legal_razon_social}}**, RUC **{{legal_ruc}}**, con domicilio en {{legal_domicilio}}. Correo de contacto: [{{legal_email}}](mailto:{{legal_email}}).

Marca: {{legal_marca_operada}}.

Si la operación de RetoPA pasa a otra sociedad, lo vamos a informar en esta misma página con al menos 30 días de anticipación.

## 2. Objeto del servicio {#objeto}

RetoPA es un directorio y una plataforma de presencia digital para negocios, emprendedores y profesionales de Paraguay. Algunos términos que usamos:

- **Ficha:** la página pública de un negocio en RetoPA, con sus datos de contacto, ubicación, horarios, rubro y fotos.
- **Reclamar una ficha:** que la persona responsable del negocio tome el control de la ficha desde su cuenta, después de demostrar su vínculo con el negocio.
- **Verificar:** la marca que RetoPA agrega a una ficha cuando confirmó, por los medios que considere adecuados, que los datos principales corresponden al negocio.

RetoPA no vende productos ni presta los servicios de los negocios que aparecen en el directorio, y **no es parte** de las operaciones que hagas con ellos. Cada negocio es responsable de lo que ofrece, cobra y entrega.

## 3. Origen de la información de las fichas {#origen}

Una parte de las fichas se crea a partir de **información pública**, en particular de los registros de la Dirección Nacional de Contrataciones Públicas (DNCP — [contrataciones.gov.py](https://www.contrataciones.gov.py)), que se publican como datos abiertos bajo licencia Creative Commons Atribución 4.0 (CC BY 4.0). En esas fichas indicamos la fuente y la fecha en que se incorporó el dato. Otras fichas provienen de directorios y listados comerciales, de lo que cargan los propios negocios o del trabajo de nuestro equipo.

Que un negocio figure en RetoPA a partir de información pública **no implica aval, vínculo ni patrocinio** del Estado paraguayo ni de ninguna institución.

Cualquier negocio puede pedir la **rectificación, actualización o baja** de su ficha **sin necesidad de tener cuenta**, desde [{{site_url}}/legal/baja]({{site_url}}/legal/baja) o escribiendo a [{{legal_email}}](mailto:{{legal_email}}). Respondemos dentro de los **10 días hábiles**.

## 4. Cuentas y reclamo de fichas {#cuentas}

Para crear una cuenta o reclamar una ficha tenés que:

- ser mayor de 18 años;
- dar datos veraces y mantenerlos actualizados;
- tener un número de WhatsApp o un correo que podamos verificar.

El reclamo de una ficha se otorga a quien demuestre su vínculo con el negocio, por ejemplo escribiéndonos desde el WhatsApp que figura en la ficha. Si detectamos que un reclamo fue fraudulento o que quien reclamó no tiene relación con el negocio, podemos **revertirlo** y devolver la ficha a su estado anterior.

Sos responsable de lo que publicás en tu ficha y de mantener seguro el acceso a tu cuenta. Avisanos enseguida si sospechás que alguien entró sin tu permiso.

## 5. Planes, pagos y vencimientos {#planes}

- **Plan Básico:** es **gratis** y no vence. Reclamar una ficha que ya existe es gratis. Con el plan Básico, cada cuenta puede **crear una ficha nueva**; para crear más fichas desde la misma cuenta, al menos una de sus fichas tiene que tener un plan pago.
- **Planes pagos (Destacado, Business Pro) y destaques temporales (boost):** el precio, con IVA incluido, y la duración se muestran antes de contratar. Hoy el pago se hace por **link de pago (Tpago)** y activamos el plan cuando confirmamos el pago. Los planes se contratan por mes.
- **Renovación:** la renovación **no es automática**. Te avisamos antes del vencimiento. Si no renovás, al terminar el período y un plazo de gracia de {{plan_grace_days}} días, la ficha vuelve al plan Básico **sin perder sus datos**.
- **Reembolsos:** no reembolsamos períodos ya iniciados. Si pagaste y no activamos el servicio dentro de las **48 horas hábiles**, te devolvemos el total.
- **Destacado Fundador:** es un beneficio **gratuito** que RetoPA puede otorgar por el plazo que se indica al otorgarlo. No se considera un pago. Al vencer, la ficha vuelve al plan Básico sin cargo y sin pérdida de datos.
- **Facturación:** los pagos se facturan a nombre de **{{legal_razon_social}}**.

## 6. Contenido de terceros y reseñas {#contenido}

RetoPA aloja contenidos que cargan los negocios y los usuarios (datos de las fichas, fotos, reseñas y respuestas). Respecto de esos contenidos, actuamos como **prestador de servicios de alojamiento de datos** en los términos de la **Ley N.º 4868/2013 de Comercio Electrónico** (art. 12) y su reglamento, el **Decreto N.º 1165/2014**. No tenemos una obligación general de supervisar lo que publican otros, pero **retiramos o bloqueamos** el contenido ilícito apenas tomamos conocimiento efectivo de él.

**Reseñas:**

- Cualquier persona puede dejar una reseña indicando su nombre y su correo. El correo no se publica. Las reseñas se publican al instante y RetoPA las modera después.
- Están **prohibidas** las reseñas falsas, las pagadas o incentivadas, y las que escribe el propio negocio o alguien en su nombre.
- El negocio puede responder las reseñas, según lo que incluya su plan.
- Podemos eliminar las reseñas que violen estas reglas o la ley.
- Las reseñas son opiniones de quienes las escriben: RetoPA **no verifica** los hechos que cuentan.

## 7. Representante para notificaciones {#representante}

Conforme al **art. 19 de la Ley N.º 4868/2013**, designamos como representante para recibir notificaciones, reclamos por infracciones o lesiones a derechos de terceros y requerimientos de autoridades a:

- **{{legal_representante_nombre}}**
- Correo: [{{legal_representante_email}}](mailto:{{legal_representante_email}})
- Domicilio: {{legal_domicilio}}

Los datos del representante se comunican al Ministerio de Industria y Comercio (MIC), autoridad de aplicación de la ley.

## 8. Denuncia y retiro de contenidos {#denuncia}

Si un contenido publicado en RetoPA es ilícito o lesiona tus derechos (por ejemplo, tu propiedad intelectual, tu honor o tus datos personales), podés denunciarlo desde [{{site_url}}/legal/denuncia]({{site_url}}/legal/denuncia) o al correo del representante. La denuncia debe incluir:

1. tu identificación (nombre y un correo o WhatsApp de contacto);
2. el contenido exacto que denunciás (el enlace de la ficha y qué parte);
3. el derecho afectado y por qué;
4. una declaración de que la información que das es correcta y que actuás de buena fe.

Evaluamos la denuncia dentro de los **5 días hábiles**. Si corresponde, retiramos o bloqueamos el contenido y avisamos a quien lo publicó, que puede presentar una **contranotificación** con sus razones. Para infracciones a la propiedad intelectual, este es el mecanismo de retiro previsto en el art. 16 de la Ley N.º 4868/2013.

## 9. Publicidad y contenidos patrocinados {#publicidad}

Las fichas destacadas, los destaques temporales (boost), las promociones patrocinadas y cualquier anuncio se identifican **visiblemente** como tales, como exige el art. 21 de la Ley N.º 4868/2013 para las comunicaciones comerciales. No hacemos publicidad engañosa (Ley N.º 1334/1998 de Defensa del Consumidor y del Usuario, art. 35).

RetoPA **no altera reseñas** ni el orden de las opiniones a cambio de un pago. Los planes pagos pueden mejorar la posición de una ficha en los listados, y eso se indica como contenido destacado.

## 10. Comunicaciones comerciales {#comunicaciones}

A los titulares de cuenta les mandamos **avisos de servicio** (reclamo, activación, vencimientos, cambios en estos términos), por correo o WhatsApp.

Las **comunicaciones comerciales** (ofertas y novedades) las mandamos solo a quien dio su **consentimiento previo**, y cada mensaje incluye una forma simple y gratuita de **darse de baja** (Ley N.º 4868/2013, arts. 21 a 23).

Para WhatsApp y llamadas respetamos el **Registro Nacional "No Molestar"** que administra la SEDECO (Ley N.º 5830/2017) y lo consultamos antes de cada campaña. Si no querés que te contactemos, escribinos a [{{legal_email}}](mailto:{{legal_email}}) o respondé "BAJA" al mensaje. También podés inscribir tu número en el registro en [nomolestar.gov.py](https://nomolestar.gov.py).

## 11. Propiedad intelectual {#propiedad}

La marca y el logo de RetoPA ({{legal_marca_operada}}), el software y la base de datos del directorio pertenecen a **{{legal_razon_social}}**.

Lo que sube cada negocio (textos, fotos, logos) **sigue siendo suyo**. Al publicarlo, nos das una licencia no exclusiva y gratuita para mostrarlo en RetoPA, en buscadores y en materiales de difusión de la propia ficha, mientras la ficha esté publicada.

Está prohibido copiar de forma masiva el contenido del directorio (scraping) o reutilizar la base de datos sin autorización escrita.

## 12. Contacto, soporte y reclamos {#contacto}

Podés escribirnos a [{{legal_email}}](mailto:{{legal_email}}) o usar la opción **Soporte** del sitio. Respondemos dentro de los 10 días hábiles.

Si sos consumidor final, también podés recurrir a la **Secretaría de Defensa del Consumidor y el Usuario (SEDECO)**, conforme a la Ley N.º 1334/1998. Nada de lo que dicen estos términos limita los derechos que te da esa ley.

## 13. Suspensión y cierre de cuentas {#suspension}

Podemos suspender o cerrar una cuenta si se usa para fraude, suplantación, contenido ilícito, reseñas falsas o una violación grave de estos términos. Cuando no haya urgencia, te avisamos antes y te damos la oportunidad de corregir.

Podés cerrar tu cuenta cuando quieras. Cerrar la cuenta no borra la ficha del negocio: la ficha sigue publicada como dato del directorio, salvo que el negocio pida su baja (sección 3).

## 14. Limitación de responsabilidad {#responsabilidad}

Trabajamos para que la información del directorio sea correcta y para que el servicio esté disponible, pero no podemos garantizar que funcione siempre sin interrupciones ni que todos los datos que cargan terceros sean exactos.

Nada de lo que dicen estos términos excluye ni limita la responsabilidad que la ley no permite excluir, en particular la que establece la Ley N.º 1334/1998 frente a consumidores. No imponemos arbitraje obligatorio a los consumidores.

Para **clientes empresariales** (negocios que contratan un plan en el marco de su actividad), nuestra responsabilidad total por el servicio se limita al monto que hayan pagado a RetoPA en los últimos 12 meses.

## 15. Modificaciones {#modificaciones}

Podemos actualizar estos términos. Si el cambio es **sustancial**, lo avisamos con al menos **15 días de anticipación**, por correo a los titulares de cuenta y con un aviso visible en el sitio. Los cambios no afectan los planes pagos ya contratados durante el período en curso. Si no estás de acuerdo con la nueva versión, podés dejar de usar el servicio y cerrar tu cuenta.

Versión vigente: **{{version}}**, del **{{fecha}}**. Las versiones anteriores se pueden consultar al pie de esta página.

## 16. Ley aplicable y jurisdicción {#ley}

Estos términos se rigen por las leyes de la República del Paraguay. Cualquier conflicto se somete a los tribunales ordinarios de la ciudad de Asunción, **sin perjuicio** del derecho de los consumidores a reclamar ante los tribunales de su domicilio y ante la SEDECO.
$md$, NOW())
ON CONFLICT (key) DO NOTHING;

INSERT INTO site_config (key, value, updated_at) VALUES ('legal_privacidad_md', $md$# Política de Privacidad

Esta política explica qué datos personales trata RetoPA ({{site_url}}), para qué, con quién los comparte y cómo podés ejercer tus derechos.

## 1. Responsable del tratamiento {#responsable}

**{{legal_razon_social}}**, RUC **{{legal_ruc}}**, con domicilio en {{legal_domicilio}}, operadora de la marca RetoPA. Correo para temas de datos personales: [{{legal_email}}](mailto:{{legal_email}}).

## 2. Marco legal {#marco}

Tratamos los datos conforme a las leyes de la República del Paraguay:

- **Ley N.º 7593/2025 de Protección de Datos Personales en la República del Paraguay**, promulgada el 27 de noviembre de 2025. Entra en vigencia a los 24 meses de su publicación (art. 57). RetoPA aplica sus principios desde ahora.
- **Ley N.º 6534/2020** de protección de datos personales crediticios, en lo que resulte aplicable.
- **Ley N.º 4868/2013 de Comercio Electrónico** y su reglamento, el Decreto N.º 1165/2014.
- **Ley N.º 5830/2017**, que prohíbe la publicidad no autorizada a usuarios de telefonía móvil y crea el Registro Nacional "No Molestar".

La autoridad de control prevista por la Ley N.º 7593/2025 es la **Agencia Nacional de Protección de Datos Personales**, en el ámbito del MITIC.

## 3. Qué datos tratamos y de dónde vienen {#datos}

| Origen | Qué datos | Cómo los obtenemos |
|---|---|---|
| Fuentes públicas y directorios | Nombre o razón social, RUC, dirección, teléfono, rubro del negocio | Registros públicos, en particular datos abiertos de la DNCP ([contrataciones.gov.py](https://www.contrataciones.gov.py), licencia CC BY 4.0), y directorios y listados comerciales. En las fichas de fuente pública indicamos la fuente y la fecha. |
| Lo que carga el titular | Datos y fotos del negocio, horarios, redes, descripción | Al reclamar o crear una ficha, o al editarla desde el panel |
| Cuenta | Nombre, correo, contraseña (guardada solo como hash), número de WhatsApp y si lo verificamos, versión de los términos aceptados, si aceptás novedades | Al registrarte o reclamar una ficha |
| Uso del sitio | Fichas vistas, términos buscados, clics en WhatsApp, Llamar o sitio web, origen de la visita | Automáticamente, al navegar |

**Sobre la dirección IP:** en las métricas de uso **no guardamos tu IP**. Guardamos un identificador **seudonimizado**: un resumen criptográfico (hash) de la IP calculado con una clave secreta, que no permite recuperar la IP. La única excepción son los **pedidos de reclamo de una ficha**, donde guardamos la IP completa para prevenir fraudes. No guardamos el tipo de navegador ni de dispositivo.

**Reseñas:** si dejás una reseña, guardamos el nombre y el correo que indiques. Se publica el nombre; el correo no se publica.

## 4. Empresas unipersonales y personas físicas {#personas-fisicas}

Cuando una ficha corresponde a una persona física (una empresa unipersonal, un profesional o un oficio), sus datos de contacto comercial son **datos personales**.

- **Antes de que reclame la ficha**, la base legal es nuestro **interés legítimo** en dar visibilidad comercial a partir de información pública (Ley N.º 7593/2025, arts. 5 y 8). Esa persona puede **oponerse** en cualquier momento, gratis y sin dar explicaciones, y damos de baja o corregimos la ficha (sección 9).
- **Desde que reclama la ficha**, la base legal es la **relación contractual** con RetoPA.

## 5. Finalidades {#finalidades}

Usamos los datos solo para:

1. mostrar el directorio de negocios;
2. gestionar cuentas y fichas;
3. enviar avisos de servicio (reclamo, activación, vencimientos, cambios de estas políticas);
4. medir el uso del sitio de forma agregada;
5. prevenir fraudes y abusos;
6. cumplir obligaciones legales;
7. enviar comunicaciones comerciales, **solo si diste tu consentimiento**.

## 6. Encargados y terceros {#terceros}

Para prestar el servicio trabajamos con estos proveedores:

- **Proveedor de correo saliente (SMTP)**, para los correos de servicio.
- **Meta Platforms (WhatsApp)**: cuando te escribimos o nos escribís por WhatsApp, el mensaje pasa por los servidores de WhatsApp, según sus propias condiciones.
- **Tpago**, para los links de pago de los planes. No recibimos ni guardamos los datos de tu tarjeta.
- **Google (Maps y Fonts)** y **cdnjs (Cloudflare)**: al abrir el sitio, tu navegador descarga de ellos los mapas, las tipografías y los íconos, y por eso reciben tu IP.
- **El proveedor de servidores** donde corre RetoPA.

Algunos de estos proveedores tratan datos fuera de Paraguay. En esos casos aplicamos las garantías contractuales que ofrecen, conforme al art. 19 de la Ley N.º 7593/2025. **No vendemos datos personales.**

## 7. Conservación {#conservacion}

- **Fichas:** mientras el negocio siga existiendo en las fuentes públicas, o hasta que pida la baja.
- **Cuentas:** mientras estén activas y 12 meses después de cerradas.
- **Datos de tráfico** que exige el art. 10 de la Ley N.º 4868/2013: 6 meses.
- **Datos de uso:** a los 12 meses los conservamos solo de forma agregada.
- **Pedidos de reclamo, baja o denuncia:** el tiempo necesario para resolverlos y defender nuestros derechos.

## 8. Tus derechos {#derechos}

Podés pedir **acceso** a tus datos, su **rectificación**, su **supresión**, oponerte al tratamiento (**oposición**) y pedir su **portabilidad** (Ley N.º 7593/2025, arts. 26 a 32).

- **Con cuenta:** desde tu panel podés corregir tus datos y los de tu ficha. Para lo demás, escribinos desde el correo de la cuenta.
- **Sin cuenta:** escribinos a [{{legal_email}}](mailto:{{legal_email}}) o usá el formulario de [{{site_url}}/legal/baja]({{site_url}}/legal/baja).

Respondemos dentro de los **10 días hábiles**, sin costo. Si no quedás conforme, vas a poder reclamar ante la Agencia Nacional de Protección de Datos Personales cuando esté en funciones.

## 9. Baja o corrección de una ficha sin cuenta {#baja}

Si tu negocio aparece en RetoPA y querés corregir un dato o que lo demos de baja, no necesitás crear una cuenta:

1. entrá a [{{site_url}}/legal/baja]({{site_url}}/legal/baja);
2. indicá el nombre del negocio, el enlace de la ficha, tu vínculo con el negocio y qué querés que hagamos;
3. dejá un correo o WhatsApp de contacto.

Para confirmar que el pedido viene del negocio, podemos escribirte por WhatsApp al número que figura en la ficha.

## 10. Cookies y almacenamiento local {#cookies}

RetoPA **no usa cookies**, ni propias ni de terceros, y no usa herramientas de publicidad ni de seguimiento (como Google Analytics o el píxel de Meta).

Sí guardamos algunos datos en el **almacenamiento local de tu navegador** (localStorage y sessionStorage):

- tu sesión iniciada;
- tus preferencias (modo oscuro, tipo de vista, avisos que ya cerraste);
- un identificador aleatorio de visita, para contar visitas sin identificarte;
- tu ubicación aproximada, solo si das permiso, para mostrarte negocios cercanos. Se guarda solo en tu navegador durante la sesión.

Podés borrar todo esto desde la configuración de tu navegador. Si lo borrás, se cierra tu sesión.

## 11. Seguridad {#seguridad}

Aplicamos medidas razonables para proteger los datos: conexión cifrada (HTTPS), contraseñas guardadas solo como hash, acceso restringido al equipo que lo necesita y copias de seguridad.

Si ocurre un incidente de seguridad que afecte tus datos, te lo vamos a avisar a vos y a la autoridad de control cuando la ley lo exija (Ley N.º 7593/2025, art. 17).

## 12. Menores {#menores}

RetoPA está dirigido a **mayores de 18 años**. No creamos cuentas a menores de edad a sabiendas.

## 13. Comunicaciones y WhatsApp {#whatsapp}

A los titulares de cuenta les mandamos **avisos de servicio** por correo o WhatsApp. Las **comunicaciones comerciales** (ofertas y novedades) las mandamos solo con tu **consentimiento previo**, y cada mensaje incluye una forma simple y gratuita de darte de baja (Ley N.º 4868/2013, arts. 21 a 23).

Respetamos el **Registro Nacional "No Molestar"** de la SEDECO (Ley N.º 5830/2017) y lo consultamos antes de cada campaña. Podés inscribir tu número en [nomolestar.gov.py](https://nomolestar.gov.py), o pedirnos directamente que no te contactemos escribiendo a [{{legal_email}}](mailto:{{legal_email}}) o respondiendo "BAJA".

## 14. Cambios y contacto {#cambios}

Si hacemos un cambio sustancial en esta política, lo avisamos con al menos 15 días de anticipación, por correo a los titulares de cuenta y con un aviso en el sitio.

Versión vigente: **{{version}}**, del **{{fecha}}**. Las versiones anteriores se pueden consultar al pie de esta página.

Consultas: [{{legal_email}}](mailto:{{legal_email}}).
$md$, NOW())
ON CONFLICT (key) DO NOTHING;

-- ── 2) legal_versions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_versions (
    id            bigserial PRIMARY KEY,
    page          varchar(12) NOT NULL CHECK (page IN ('terminos','privacidad')),
    version       varchar(10) NOT NULL,
    content_md    text NOT NULL,
    sustancial    boolean NOT NULL DEFAULT FALSE,
    published_at  timestamp without time zone NOT NULL DEFAULT NOW(),
    published_by  integer REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_legal_versions_page ON legal_versions (page, published_at DESC);

-- La 2.0 queda como primera versión publicada (solo si la tabla está vacía).
INSERT INTO legal_versions (page, version, content_md, sustancial)
SELECT p, (SELECT value FROM site_config WHERE key = 'legal_' || p || '_version'),
          (SELECT value FROM site_config WHERE key = 'legal_' || p || '_md'), TRUE
  FROM unnest(ARRAY['terminos','privacidad']) AS p
 WHERE NOT EXISTS (SELECT 1 FROM legal_versions lv WHERE lv.page = p);

-- ── 3) legal_requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_requests (
    id                bigserial PRIMARY KEY,
    tipo              varchar(14) NOT NULL CHECK (tipo IN ('baja','rectificacion','actualizacion','retiro')),
    business_id       integer REFERENCES businesses(id) ON DELETE SET NULL,
    business_url      varchar(300),
    nombre            varchar(120) NOT NULL,
    email_o_whatsapp  varchar(160) NOT NULL,
    vinculo           varchar(200),
    detalle           text NOT NULL,
    buena_fe          boolean NOT NULL DEFAULT FALSE,   -- denuncia: declaración de buena fe
    estado            varchar(10) NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente','en_curso','resuelta','rechazada')),
    created_at        timestamp without time zone NOT NULL DEFAULT NOW(),
    resolved_at       timestamp without time zone,
    notas             text
);
CREATE INDEX IF NOT EXISTS idx_legal_requests_estado ON legal_requests (estado, created_at DESC);

-- ── 4) users: aceptación y opt-in comercial ─────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_version varchar(20);   -- 'T2.0/P2.0'
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at      timestamp without time zone;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in       boolean NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in_at    timestamp without time zone;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_aviso_enviado    varchar(40);   -- = site_config.legal_aviso_id ya enviado
COMMENT ON COLUMN users.marketing_opt_in IS
  'Consentimiento SEPARADO para novedades/ofertas por correo y WhatsApp. Todo envío comercial (E2 WhatsApp API incluida) debe filtrar por esto.';

COMMIT;
