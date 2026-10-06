-- D8.1 — Dashboard de monetización + usuarios conectados.
-- last_seen_at: última actividad del usuario (la toca requireAuth, throttled),
-- para el widget "usuarios conectados" del Dashboard.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamp without time zone;
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users (last_seen_at);

-- Ventana (minutos) para considerar a un usuario "conectado ahora" (default 7).
INSERT INTO site_config (key, value) VALUES
  ('online_window_min', '7')
ON CONFLICT (key) DO NOTHING;
