-- D7.6 — Cierre de sesión por inactividad configurable desde Admin.
-- admin_idle_timeout_min: minutos de inactividad hasta cerrar sesión (default 30).
-- admin_idle_warning_min: minutos antes del cierre para mostrar el aviso (default 5; 0 = sin aviso).
INSERT INTO site_config (key, value) VALUES
  ('admin_idle_timeout_min', '30'),
  ('admin_idle_warning_min', '5')
ON CONFLICT (key) DO NOTHING;
