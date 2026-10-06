-- RetoPA S4.9 — Plantillas de email editables desde Panel Admin
-- Pre-cargadas con los textos hardcodeados actuales del mail.js
BEGIN;

INSERT INTO site_config (key, value) VALUES
-- Bienvenida (usuario nuevo)
('tpl_welcome_subject', 'Bienvenido a {{sitio}}'),
('tpl_welcome_body',    'Hola {{nombre}},

¡Bienvenido/a a {{sitio}}! Tu cuenta fue creada exitosamente.

Ya podés registrar tu empresa y empezar a aparecer en el directorio comercial de Paraguay.'),

-- Bienvenida empresa/negocio (registro sin claim)
('tpl_verified_subject', '✅ Tu empresa ha sido verificada en {{sitio}}'),
('tpl_verified_body',    'Hola {{nombre}},

¡Felicitaciones! Tu empresa {{empresa}} ha sido VERIFICADA exitosamente en {{sitio}}.

Ahora aparecés con el badge de verificación en el directorio y tenés mayor visibilidad en las búsquedas.

Podés ver tu perfil público en: {{url_empresa}}'),

-- Nueva reseña
('tpl_newReview_subject', '⭐ Nueva reseña en {{empresa}} — {{rating}}/5'),
('tpl_newReview_body',    'Hola {{duenio}},

{{autor}} dejó una reseña de {{rating}} estrellas en {{empresa}}.

"{{comentario}}"

Entrá a tu panel para verla y responderla.'),

-- Milestone de likes
('tpl_likeMilestone_subject', '🎉 ¡{{empresa}} alcanzó {{likes}} likes en RetoPA!'),
('tpl_likeMilestone_body',    'Hola {{duenio}},

{{empresa}} acaba de alcanzar {{likes}} likes en {{sitio}}. ¡Tu negocio está gustando!

Seguí completando tu perfil para aparecer más arriba en los resultados.'),

-- Contacto WhatsApp
('tpl_whatsappContact_subject', '📱 Alguien quiso contactar a {{empresa}} por WhatsApp'),
('tpl_whatsappContact_body',    'Hola {{duenio}},

Alguien encontró {{empresa}} en {{sitio}} y hizo clic en WhatsApp para contactarte.

Si no recibiste el mensaje, revisá que tu número de WhatsApp esté actualizado en tu perfil.'),

-- Resumen semanal
('tpl_weeklySummary_subject', '📊 Tu semana en RetoPA — {{empresa}}'),
('tpl_weeklySummary_body',    'Hola {{duenio}},

Este es el resumen de actividad de {{empresa}} esta semana:

👁  Visitas: {{visitas}}
📱 Contactos WhatsApp: {{whatsapp}}
❤️  Likes: {{likes}}
⭐ Reseñas nuevas: {{resenias}}

Entrá al panel para ver más detalles.'),

-- Claim recibido
('tpl_claimReceived_subject', '⏳ Recibimos tu solicitud — {{empresa}} en {{sitio}}'),
('tpl_claimReceived_body',    'Hola {{nombre}},

Recibimos tu solicitud para reclamar el perfil de {{empresa}} en {{sitio}}.

Nuestro equipo verificará tu identidad en 24-48 horas hábiles. Recibirás otro email de confirmación cuando sea aprobado.'),

-- Claim aprobado
('tpl_claimApproved_subject', '🎉 ¡Tu perfil fue verificado! — {{empresa}} en {{sitio}}'),
('tpl_claimApproved_body',    'Hola {{nombre}},

¡Felicitaciones! El perfil de {{empresa}} fue verificado exitosamente en {{sitio}}.

Ya podés ingresar al panel y empezar a gestionar tu empresa:
- Completar descripción, fotos y horarios
- Ver estadísticas de visitas y contactos
- Responder reseñas de clientes
- Gestionar tus categorías y servicios'),

-- Resetear contraseña
('tpl_passwordReset_subject', '🔐 Restablecer contraseña — {{sitio}}'),
('tpl_passwordReset_body',    'Hola {{nombre}},

Recibimos una solicitud para restablecer tu contraseña en {{sitio}}.

Hacé clic en el link para continuar. El link expira en 1 hora.

Si no solicitaste esto, ignorá este email.'),

-- Notificación masiva a empresas (ya existe como notify_subject/notify_body)
-- No sobreescribir si ya tiene valor
('tpl_notifyBiz_subject', '{{nombre}} ya está en {{sitio}} — reclamá tu perfil'),
('tpl_notifyBiz_body',    'Hola,

Encontramos a {{nombre}} en nuestras fuentes de datos y ya creamos un perfil en {{sitio}}.

¿Es tu empresa? Reclamá y verificá tu perfil gratis para aparecer primero en los resultados de búsqueda, completar descripción, fotos, horarios y más.')

ON CONFLICT (key) DO NOTHING;

COMMIT;
