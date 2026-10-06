-- D9.5 — Notificación diaria agrupada al embajador.
-- notified_at: cuándo se incluyó la señal en un digest enviado (evita reenvíos).
-- NULL = todavía no avisada. Un solo email por embajador por corrida.
ALTER TABLE sales_signals ADD COLUMN IF NOT EXISTS notified_at timestamp without time zone;
CREATE INDEX IF NOT EXISTS idx_sales_signals_notify
  ON sales_signals (assigned_ambassador_id) WHERE notified_at IS NULL;
