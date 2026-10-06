-- ═══════════════════════════════════════════════════════════════════════════
-- D9.1 — Motor de "Disparadores de Venta" (PQL): señales por negocio.
-- Un job nocturno (D9.2) cruza datos que el sistema YA registra y genera
-- oportunidades accionables. Esta migración crea el esquema + la config.
-- Todos los umbrales y textos viven en site_config (prefijo signal_ / signals_).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sales_signals (
  id                     BIGSERIAL PRIMARY KEY,
  business_id            INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- t1_listo_boost | t2_destacado_datos | t3_boost_vencido | t4_fundador_d75 | t5_candidato_hc | t6_ficha_abandonada
  trigger_key            VARCHAR(40) NOT NULL,
  -- boost | destacado | pro | hepta_cloud | retencion
  product_target         VARCHAR(20) NOT NULL,
  -- nueva → vista → contactado → convertida | descartada | expirada
  status                 VARCHAR(20) NOT NULL DEFAULT 'nueva',
  assigned_ambassador_id INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- NULL = solo admin
  evidence               JSONB NOT NULL DEFAULT '{}'::jsonb,               -- números que la justifican
  suggested_message      TEXT,                                             -- texto para la conversación
  note                   TEXT,                                             -- motivo al descartar (opcional)
  created_at             TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status_changed_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status_changed_by      INTEGER,
  expires_at             TIMESTAMP WITHOUT TIME ZONE
);

-- UNICIDAD: un negocio nunca tiene dos señales ACTIVAS para el mismo producto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_signals_active
  ON sales_signals (business_id, product_target)
  WHERE status IN ('nueva','vista','contactado');

-- Índices de trabajo
CREATE INDEX IF NOT EXISTS idx_sales_signals_status     ON sales_signals (status);
CREATE INDEX IF NOT EXISTS idx_sales_signals_business   ON sales_signals (business_id);
CREATE INDEX IF NOT EXISTS idx_sales_signals_ambassador ON sales_signals (assigned_ambassador_id)
  WHERE status IN ('nueva','vista','contactado');
-- Para el cooldown: última señal cerrada por (negocio, trigger)
CREATE INDEX IF NOT EXISTS idx_sales_signals_cooldown   ON sales_signals (business_id, trigger_key, status_changed_at);

-- ── Config (site_config) — umbrales editables, nada hardcodeado ──────────────
INSERT INTO site_config (key, value) VALUES
  -- Ciclo de vida
  ('signals_cooldown_days', '45'),   -- no regenerar un trigger descartado/expirado antes de N días
  ('signals_ttl_days',      '30'),   -- señal nueva/vista sin acción → expira a los N días
  -- T1 — Listo para Boost
  ('signal_t1_completion',  '100'),  -- completitud mínima (%)
  ('signal_t1_days',        '7'),    -- reclamada hace ≥ N días
  ('signal_t1_days_max',    '60'),   -- y ≤ N días
  -- T2 — Destacado con datos
  ('signal_t2_views',       '30'),   -- visitas 30d ≥ N  (o)
  ('signal_t2_clicks',      '10'),   -- clics WhatsApp 30d ≥ N
  -- T3 — Boost vencido, le fue bien
  ('signal_t3_days',        '7'),    -- boost finalizado hace ≤ N días
  -- T4 — Fundador día 75 (D6 está desplegado → habilitado)
  ('signal_t4_enabled',     'true'),
  ('signal_t4_days_before', '15'),   -- vence en ≤ N días
  -- T5 — Candidato Hepta Cloud
  ('signal_t5_categories',  'comercio,salud,servicios-profesionales,construccion,seguridad'), -- slugs (AJUSTAR a los reales)
  ('signal_t5_wa',          '5'),    -- clics WhatsApp 30d ≥ N (señal de dueño activo)
  ('signal_t5_active_days', '60'),   -- o actualizó la ficha en los últimos N días
  -- T6 — Ficha abandonada
  ('signal_t6_completion',  '80')    -- completitud < N %
ON CONFLICT (key) DO NOTHING;
