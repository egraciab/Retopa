-- ============================================
-- RetoPA — Pre-cargar plantilla de notificación
-- Aplicar: docker exec -i retopa-db psql -U retopa -d retopa < sql/032_notify_template_defaults.sql
-- ============================================

INSERT INTO site_config (key, value, updated_at) VALUES
(
  'notify_subject',
  '{{nombre}} ya está en {{sitio}} — reclamá tu perfil',
  NOW()
),
(
  'notify_body',
  'Hola, encontramos a {{nombre}} en nuestras fuentes de datos y ya creamos un perfil en {{sitio}} — el directorio de empresas del Paraguay.

Si sos el responsable de esta empresa, podés reclamar y verificar tu perfil de forma gratuita para aparecer primero en los resultados de búsqueda, agregar descripción, fotos, horarios y gestionar tus datos de contacto.',
  NOW()
),
(
  'notify_cc',
  '',
  NOW()
)
ON CONFLICT (key) DO NOTHING;

SELECT key, LEFT(value, 60) || '...' AS preview FROM site_config
WHERE key IN ('notify_subject','notify_body','notify_cc');
