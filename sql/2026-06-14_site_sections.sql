-- RetoPA — Secciones activables del sitio público
-- 2026-06-14_site_sections.sql

BEGIN;

INSERT INTO site_config (key, value, updated_at)
VALUES
  ('section_planes_enabled',    '1', NOW()),
  ('section_servicios_enabled', '1', NOW()),
  ('section_promos_enabled',    '1', NOW())
ON CONFLICT (key) DO NOTHING;

COMMIT;

SELECT key, value FROM site_config
WHERE key IN ('section_planes_enabled','section_servicios_enabled','section_promos_enabled');
