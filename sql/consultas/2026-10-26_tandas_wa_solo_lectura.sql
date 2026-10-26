-- ════════════════════════════════════════════════════════════════════════════
-- RetoPA — 2026-10-26 — Resultado de las tandas de prospección por WhatsApp
-- SOLO LECTURA. Correr con:  PGOPTIONS='-c default_transaction_read_only=on' psql ...
-- Informe: docs/informe_tandas_wa_2026-10-26.md
--
-- Tandas: T1 = businesses.source 'prospeccion_agente'; T2 = 'prospeccion_agente_t2';
-- T0 = tabla vieja prospect_outreach. El contacto WA se cruza por los últimos
-- 9 dígitos (whatsapp o phone), porque el panel usa igualdad exacta y algunas
-- fichas cambiaron a formato '+595…'.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Embudo por tanda
WITH wa AS (
 SELECT right(regexp_replace(whatsapp,'\D','','g'),9) w9, estado, fecha_contacto FROM prospect_wa_outreach
), u AS (
SELECT b.id, b.name, b.city, c.name rubro, b.source,
  CASE b.source WHEN 'prospeccion_agente' THEN 'T1' WHEN 'prospeccion_agente_t2' THEN 'T2' ELSE 'otro' END tanda,
  (SELECT min(w.fecha_contacto) FROM wa w WHERE w.w9<>'' AND w.w9 IN (right(regexp_replace(coalesce(b.whatsapp,''),'\D','','g'),9), right(regexp_replace(coalesce(b.phone,''),'\D','','g'),9))) contacto_wa,
  (SELECT min(p.enviado_at) FROM prospect_outreach p WHERE p.business_id=b.id) contacto_viejo,
  b.claim_status, b.claim_method, b.claimed_at, b.claimed_by, b.claim_reviewed_at,
  ub.user_id owner_id, ub.created_at ub_at, ub.delegated_by,
  us.created_at user_created, us.last_seen_at, us.first_seen_at, us.role, us.email_verified, us.password_hash='!pending-no-password!' sin_activar, us.password_set_at,
  b.plan_type, b.boost_until, b.is_active, b.merged_into, b.created_at biz_created, b.updated_at
FROM businesses b
LEFT JOIN categories c ON c.id=b.category_id
LEFT JOIN LATERAL (SELECT * FROM user_businesses x WHERE x.business_id=b.id ORDER BY x.is_owner DESC, x.created_at LIMIT 1) ub ON true
LEFT JOIN users us ON us.id=coalesce(ub.user_id,b.claimed_by)
WHERE b.source IN ('prospeccion_agente','prospeccion_agente_t2')
   OR b.claimed_at >= '2026-09-01' OR ub.created_at >= '2026-09-01'
   OR EXISTS (SELECT 1 FROM prospect_outreach p WHERE p.business_id=b.id)
)
SELECT tanda,
       count(*)                                                        AS fichas,
       count(*) FILTER (WHERE contacto_wa IS NOT NULL OR contacto_viejo IS NOT NULL) AS contactadas,
       count(*) FILTER (WHERE claim_status IS NOT NULL OR owner_id IS NOT NULL)      AS reclamaron,
       count(*) FILTER (WHERE claim_status = 'approved' OR owner_id IS NOT NULL)     AS aprobados,
       count(*) FILTER (WHERE owner_id IS NOT NULL AND last_seen_at IS NOT NULL)     AS entraron_portal
  FROM u GROUP BY tanda ORDER BY tanda;

-- 2) Lista nominal de reclamadas / con dueño
WITH wa AS (
 SELECT right(regexp_replace(whatsapp,'\D','','g'),9) w9, estado, fecha_contacto FROM prospect_wa_outreach
), u AS (
SELECT b.id, b.name, b.city, c.name rubro, b.source,
  CASE b.source WHEN 'prospeccion_agente' THEN 'T1' WHEN 'prospeccion_agente_t2' THEN 'T2' ELSE 'otro' END tanda,
  (SELECT min(w.fecha_contacto) FROM wa w WHERE w.w9<>'' AND w.w9 IN (right(regexp_replace(coalesce(b.whatsapp,''),'\D','','g'),9), right(regexp_replace(coalesce(b.phone,''),'\D','','g'),9))) contacto_wa,
  (SELECT min(p.enviado_at) FROM prospect_outreach p WHERE p.business_id=b.id) contacto_viejo,
  b.claim_status, b.claim_method, b.claimed_at, b.claimed_by, b.claim_reviewed_at,
  ub.user_id owner_id, ub.created_at ub_at, ub.delegated_by,
  us.created_at user_created, us.last_seen_at, us.first_seen_at, us.role, us.email_verified, us.password_hash='!pending-no-password!' sin_activar, us.password_set_at,
  b.plan_type, b.boost_until, b.is_active, b.merged_into, b.created_at biz_created, b.updated_at
FROM businesses b
LEFT JOIN categories c ON c.id=b.category_id
LEFT JOIN LATERAL (SELECT * FROM user_businesses x WHERE x.business_id=b.id ORDER BY x.is_owner DESC, x.created_at LIMIT 1) ub ON true
LEFT JOIN users us ON us.id=coalesce(ub.user_id,b.claimed_by)
WHERE b.source IN ('prospeccion_agente','prospeccion_agente_t2')
   OR b.claimed_at >= '2026-09-01' OR ub.created_at >= '2026-09-01'
   OR EXISTS (SELECT 1 FROM prospect_outreach p WHERE p.business_id=b.id)
)
SELECT u.id, coalesce(nullif(b.trade_name,''), u.name) AS ficha, u.city, u.rubro, u.tanda,
       (u.contacto_wa AT TIME ZONE 'America/Asuncion')::date      AS contacto_wa,
       (u.contacto_viejo AT TIME ZONE 'America/Asuncion')::date   AS contacto_t0,
       coalesce(u.claimed_at, u.ub_at)::date                      AS reclamo,
       u.claim_status, u.delegated_by, u.last_seen_at::date AS ultimo_ingreso, u.sin_activar,
       (fn_profile_completion(b.*)->>'completion')::int           AS completitud,
       b.plan_type, b.boost_until::date
  FROM u JOIN businesses b ON b.id = u.id
 WHERE u.claim_status IS NOT NULL OR u.owner_id IS NOT NULL
 ORDER BY u.tanda, reclamo;

-- 3) Compras de esas fichas (plan / boost / regalos)
SELECT 'grant' t, business_id, plan_type, reason, granted_at FROM plan_grants
UNION ALL SELECT 'request', business_id, plan, status, created_at FROM plan_requests
UNION ALL SELECT 'boost', business_id, boost_type, status, created_at FROM promotion_boosts
 ORDER BY 5 DESC;

-- 4) Pedidos de reclamo desde el botón de la ficha
SELECT r.business_id, b.name, b.source, r.kind, r.status, r.created_at, r.handled_at,
       EXISTS (SELECT 1 FROM user_businesses ub WHERE ub.business_id = b.id) AS tiene_dueno
  FROM claim_requests r JOIN businesses b ON b.id = r.business_id ORDER BY r.created_at;
