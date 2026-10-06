-- Sprint v2: title de página y tagline editables
INSERT INTO site_config (key, value) VALUES
  ('site_title',   'RetoPA — Directorio Empresarial de Paraguay'),
  ('site_tagline', 'Encontrá lo que necesitás')
ON CONFLICT (key) DO NOTHING;
