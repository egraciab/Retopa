-- D9.2 — Plantillas de mensaje sugerido por trigger (editables desde site_config).
-- El job usa estas si existen; si no, cae a los defaults del código. {tokens} se
-- interpolan con los números reales de la evidencia.
INSERT INTO site_config (key, value) VALUES
  ('signal_msg_t1_listo_boost',      '¡La ficha de {business} está completa ({completion}%)! Es el momento ideal para su primer Boost y aparecer primero en su rubro.'),
  ('signal_msg_t2_destacado_datos',  'La ficha de {business} tuvo {views} visitas y {clicks} contactos por WhatsApp este mes. Con el plan Destacado aparece primero y aprovecha ese interés.'),
  ('signal_msg_t3_boost_vencido',    'Durante su boost, {business} tuvo {pct} más visitas que antes. Hacelo permanente con Destacado para no perder esa visibilidad.'),
  ('signal_msg_t4_fundador_d75',     'El período Destacado Fundador de {business} vence en {days} días. Renovalo como Destacado para mantener la visibilidad y los contactos.'),
  ('signal_msg_t5_candidato_hc',     '{business} tiene RUC y actividad constante ({rubro}). Es un buen candidato para agendar una demo de Hepta Cloud.'),
  ('signal_msg_t6_ficha_abandonada', 'A la ficha de {business} le faltan {missing_count} datos para posicionar mejor en Google. Completémoslos y gana visibilidad gratis.')
ON CONFLICT (key) DO NOTHING;
