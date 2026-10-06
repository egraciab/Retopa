-- D5.2 — Umbrales del semáforo de ventas (editables desde el admin). Idempotente.
-- El endpoint /admin/semaforo funciona igual sin estas filas (usa los mismos defaults),
-- pero sembrarlas las hace visibles/editables desde el panel. NO son públicas
-- (no van al whitelist de /site-config): son de uso interno/ventas.
INSERT INTO site_config (key, value) VALUES
  ('semaforo_verde_visitas',   '1000'),
  ('semaforo_verde_busquedas', '300'),
  ('semaforo_rojo_visitas',    '300'),
  ('semaforo_rojo_busquedas',  '100')
ON CONFLICT (key) DO NOTHING;
