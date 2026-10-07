/**
 * RetoPA — jobs/salesSignals.js
 * D9.2 — Motor de "Disparadores de Venta" (PQL). Job nocturno.
 * Ejecutar: docker exec retopa-backend node src/jobs/salesSignals.js
 * Cron sugerido (host):  30 6 * * *   (6:30am, todos los días)
 *
 * En cada corrida:
 *   1) EXPIRA señales nueva/vista con más de signals_ttl_days.
 *   2) EVALÚA 6 triggers sobre negocios activos/publicados, cruzando datos que
 *      el sistema YA registra (completitud, visitas, clics WA, boosts, reseñas,
 *      fundador). Cada señal lleva evidencia (números reales) + mensaje sugerido
 *      (plantilla editable de site_config con los números interpolados).
 *   3) INSERTA respetando UNICIDAD (una activa por negocio+producto) y COOLDOWN
 *      (no regenerar un trigger cerrado hace < signals_cooldown_days), eligiendo
 *      la de MAYOR prioridad por producto: T4 > T3 > T2 > T5 > T1 > T6.
 *      La atribución al embajador sale de ambassador_businesses.
 *
 * NO envía emails (eso es D9.5). Todos los umbrales/textos en site_config.
 */

const BASE = "b.is_active = TRUE AND (b.data_status IS NULL OR b.data_status = 'published')";
const V30 = "(SELECT COUNT(*) FROM business_views v WHERE v.business_id=b.id AND v.viewed_at >= NOW() - INTERVAL '30 days')::int";
const WA30 = "(SELECT COUNT(*) FROM business_clicks c WHERE c.business_id=b.id AND c.click_type='whatsapp' AND c.clicked_at >= NOW() - INTERVAL '30 days')::int";
const CLAIM_DATE = "COALESCE(b.claimed_at, b.claim_token_at)";
const BIZNAME = "COALESCE(NULLIF(TRIM(b.trade_name),''), b.name)";

// Prioridad (menor = más prioritaria) + producto por trigger
const PRIO = { t4_fundador_d75:1, t3_boost_vencido:2, t2_destacado_datos:3, t5_candidato_hc:4, t1_listo_boost:5, t6_ficha_abandonada:6 };
const PRODUCT = { t4_fundador_d75:'destacado', t3_boost_vencido:'destacado', t2_destacado_datos:'destacado', t5_candidato_hc:'hepta_cloud', t1_listo_boost:'boost', t6_ficha_abandonada:'retencion' };

const MSG_DEFAULTS = {
  t1_listo_boost:      '¡La ficha de {business} está completa ({completion}%)! Es el momento ideal para su primer Boost y aparecer primero en su rubro.',
  t2_destacado_datos:  'La ficha de {business} tuvo {views} visitas y {clicks} contactos por WhatsApp este mes. Con el plan Destacado aparece primero y aprovecha ese interés.',
  t3_boost_vencido:    'Durante su boost, {business} tuvo {pct} más visitas que antes. Hacelo permanente con Destacado para no perder esa visibilidad.',
  t4_fundador_d75:     'El período Destacado Fundador de {business} vence en {days} días. Renovalo como Destacado para mantener la visibilidad y los contactos.',
  t5_candidato_hc:     '{business} tiene RUC y actividad constante ({rubro}). Es un buen candidato para agendar una demo de Hepta Cloud.',
  t6_ficha_abandonada: 'A la ficha de {business} le faltan {missing_count} datos para posicionar mejor en Google. Completémoslos y gana visibilidad gratis.',
};

function subst(tpl, tokens) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (tokens[k] != null ? String(tokens[k]) : m));
}

async function run(pool) {
  console.log('[SalesSignals] Iniciando...');

  // Config
  const cfgRes = await pool.query("SELECT key, value FROM site_config WHERE key LIKE 'signal%'");
  const cfg = {}; cfgRes.rows.forEach(r => { cfg[r.key] = r.value; });
  const num = (k, d) => { const n = parseInt(cfg[k]); return Number.isFinite(n) ? n : d; };
  const msg = (k) => (cfg['signal_msg_' + k] && cfg['signal_msg_' + k].trim()) ? cfg['signal_msg_' + k] : MSG_DEFAULTS[k];

  const ttl = num('signals_ttl_days', 30);
  const cooldown = num('signals_cooldown_days', 45);
  const t1c = num('signal_t1_completion', 100), t1d = num('signal_t1_days', 7), t1max = num('signal_t1_days_max', 60);
  const t2v = num('signal_t2_views', 30), t2c = num('signal_t2_clicks', 10);
  const t3d = num('signal_t3_days', 7);
  const t4on = (cfg['signal_t4_enabled'] || 'true') === 'true', t4d = num('signal_t4_days_before', 15);
  const t5cats = (cfg['signal_t5_categories'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const t5wa = num('signal_t5_wa', 5), t5act = num('signal_t5_active_days', 60);
  const t6c = num('signal_t6_completion', 80);

  // 1) Expirar señales viejas nueva/vista
  const exp = await pool.query(
    `UPDATE sales_signals SET status='expirada', status_changed_at=NOW()
     WHERE status IN ('nueva','vista') AND created_at < NOW() - ($1||' days')::interval RETURNING id`, [String(ttl)]);
  const expired = exp.rowCount;

  // 1b) C3 — Auto-cerrar señales activas cuya condición de fondo YA NO APLICA.
  //     Solo 'nueva'/'vista' (no tocamos 'contactado': el embajador está en eso).
  //     Reglas conservadoras, cada una = "esto ya no tiene sentido ofrecerlo":
  //       - el negocio se dio de baja
  //       - T4: el Fundador ya venció o fue revertido (ya no está "por vencer")
  //       - T2/T3 (upsell a Destacado): el negocio ya es 'featured'
  //       - T1 (listo para Boost): ya tiene un boost pago vigente
  //       - T6 (ficha por completar): ya alcanzó el umbral de completitud
  const auto = await pool.query(`
    UPDATE sales_signals s SET status='expirada', status_changed_at=NOW()
    FROM businesses b
    WHERE s.business_id = b.id
      AND s.status IN ('nueva','vista')
      AND (
        b.is_active = FALSE
        OR (s.trigger_key='t4_fundador_d75' AND NOT EXISTS (
              SELECT 1 FROM plan_grants pg
              WHERE pg.business_id=b.id AND pg.reason='founder'
                AND pg.reverted_at IS NULL AND pg.expires_at > NOW()))
        OR (s.trigger_key IN ('t2_destacado_datos','t3_boost_vencido') AND b.plan_type='featured')
        OR (s.trigger_key='t1_listo_boost' AND EXISTS (
              SELECT 1 FROM promotion_boosts pb
              WHERE pb.business_id=b.id AND pb.status='paid' AND pb.expires_at > NOW()))
        OR (s.trigger_key='t6_ficha_abandonada'
              AND (fn_profile_completion(b.*)->>'completion')::int >= $1)
      )
    RETURNING s.id`, [t6c]);
  const autoclosed = auto.rowCount;

  // 2) Recolectar candidatos por trigger
  const candidates = []; // {business_id, name, trigger_key, evidence, tokens}
  const push = (rows, key, evf, tokf) => rows.forEach(r => candidates.push({
    business_id: r.business_id, name: r.name, trigger_key: key, evidence: evf(r), tokens: tokf(r),
  }));

  // T1 — Listo para Boost
  push((await pool.query(`
    SELECT b.id AS business_id, ${BIZNAME} AS name, ${CLAIM_DATE} AS claimed_at,
           (fn_profile_completion(b.*)->>'completion')::int AS completion
    FROM businesses b
    WHERE ${BASE} AND b.claim_status='approved'
      AND (b.plan_type='basic' OR b.plan_type IS NULL OR b.plan_type='')
      AND (fn_profile_completion(b.*)->>'completion')::int >= $1
      AND ${CLAIM_DATE} <= NOW() - ($2||' days')::interval
      AND ${CLAIM_DATE} >= NOW() - ($3||' days')::interval
      AND COALESCE(b.boost_until, '-infinity'::timestamp) <= NOW()
      AND NOT EXISTS (SELECT 1 FROM promotion_boosts pb WHERE pb.business_id=b.id AND pb.status='paid' AND pb.expires_at > NOW())
  `, [t1c, t1d, t1max])).rows, 't1_listo_boost',
    r => ({ completion: r.completion, claimed_at: r.claimed_at }),
    r => ({ business: r.name, completion: r.completion }));

  // T2 — Destacado con datos
  push((await pool.query(`
    SELECT * FROM (
      SELECT b.id AS business_id, ${BIZNAME} AS name, ${V30} AS views_30d, ${WA30} AS wa_30d
      FROM businesses b
      WHERE ${BASE} AND (b.plan_type='basic' OR b.plan_type IS NULL OR b.plan_type='')
    ) t WHERE t.views_30d >= $1 OR t.wa_30d >= $2
  `, [t2v, t2c])).rows, 't2_destacado_datos',
    r => ({ views_30d: r.views_30d, wa_30d: r.wa_30d }),
    r => ({ business: r.name, views: r.views_30d, clicks: r.wa_30d }));

  // T3 — Boost vencido, le fue bien
  push((await pool.query(`
    SELECT t.business_id, t.name, t.views_during, t.views_prev
    FROM (
      SELECT b.id AS business_id, ${BIZNAME} AS name,
        (SELECT COUNT(*) FROM business_views v WHERE v.business_id=b.id AND v.viewed_at >= lb.bstart AND v.viewed_at < lb.bend)::int AS views_during,
        (SELECT COUNT(*) FROM business_views v WHERE v.business_id=b.id AND v.viewed_at >= lb.bstart - (lb.bend - lb.bstart) AND v.viewed_at < lb.bstart)::int AS views_prev
      FROM businesses b
      JOIN LATERAL (
        SELECT COALESCE(pb.paid_at, pb.created_at) AS bstart, pb.expires_at AS bend
        FROM promotion_boosts pb
        WHERE pb.business_id=b.id AND pb.status='paid'
          AND pb.expires_at > NOW() - ($1||' days')::interval AND pb.expires_at <= NOW()
        ORDER BY pb.expires_at DESC LIMIT 1
      ) lb ON TRUE
      WHERE ${BASE} AND (b.plan_type='basic' OR b.plan_type IS NULL OR b.plan_type='')
    ) t WHERE t.views_during > t.views_prev
  `, [t3d])).rows, 't3_boost_vencido',
    r => ({ views_during: r.views_during, views_prev: r.views_prev }),
    r => { const pct = r.views_prev > 0 ? Math.round((r.views_during - r.views_prev) / r.views_prev * 100) + '%' : 'muchas'; return { business: r.name, pct }; });

  // T4 — Fundador día 75 (solo si habilitado)
  if (t4on) {
    push((await pool.query(`
      SELECT b.id AS business_id, ${BIZNAME} AS name, pg.expires_at,
             CEIL(EXTRACT(EPOCH FROM (pg.expires_at - NOW()))/86400.0)::int AS days_left,
             ${V30} AS views_30d, ${WA30} AS wa_30d
      FROM businesses b
      JOIN plan_grants pg ON pg.business_id=b.id AND pg.reason='founder' AND pg.reverted_at IS NULL AND pg.expires_at > NOW()
      WHERE ${BASE} AND b.plan_type='featured'
        AND pg.expires_at <= NOW() + ($1||' days')::interval
    `, [t4d])).rows, 't4_fundador_d75',
      r => ({ expires_at: r.expires_at, days_left: r.days_left, views_30d: r.views_30d, wa_30d: r.wa_30d }),
      r => ({ business: r.name, days: r.days_left }));
  }

  // T5 — Candidato Hepta Cloud
  if (t5cats.length) {
    push((await pool.query(`
      SELECT b.id AS business_id, ${BIZNAME} AS name, b.ruc, cat.name AS rubro, ${WA30} AS wa_30d
      FROM businesses b JOIN categories cat ON cat.id=b.category_id
      WHERE ${BASE} AND NULLIF(TRIM(b.ruc),'') IS NOT NULL AND b.claim_status='approved'
        AND cat.slug = ANY($1::text[])
        AND (
          EXISTS (SELECT 1 FROM reviews r WHERE r.business_id=b.id AND r.owner_replied_at IS NOT NULL)
          OR b.updated_at >= NOW() - ($2||' days')::interval
          OR ${WA30} >= $3
        )
    `, [t5cats, t5act, t5wa])).rows, 't5_candidato_hc',
      r => ({ ruc: r.ruc, rubro: r.rubro, wa_30d: r.wa_30d }),
      r => ({ business: r.name, rubro: r.rubro }));
  }

  // T6 — Ficha abandonada
  push((await pool.query(`
    SELECT b.id AS business_id, ${BIZNAME} AS name,
      (fn_profile_completion(b.*)->>'completion')::int AS completion,
      (SELECT COALESCE(jsonb_agg(elem->>'key'),'[]'::jsonb) FROM jsonb_array_elements(fn_profile_completion(b.*)->'items') elem WHERE (elem->>'done')::boolean = false) AS missing
    FROM businesses b
    WHERE ${BASE} AND b.claim_status='approved'
      AND ${CLAIM_DATE} <= NOW() - ($1||' days')::interval
      AND (fn_profile_completion(b.*)->>'completion')::int < $2
  `, [t1d, t6c])).rows, 't6_ficha_abandonada',
    r => ({ completion: r.completion, missing: r.missing, missing_count: (r.missing || []).length }),
    r => ({ business: r.name, missing_count: (r.missing || []).length }));

  // 3) Ordenar por prioridad (la unicidad por producto hace que gane la más prioritaria)
  candidates.sort((a, b) => PRIO[a.trigger_key] - PRIO[b.trigger_key]);

  // 4) Insertar con guardas (unicidad activa + cooldown) — atómico por candidato
  let created = 0; const byTrigger = {};
  for (const c of candidates) {
    try {
      const ins = await pool.query(`
        INSERT INTO sales_signals (business_id, trigger_key, product_target, status, assigned_ambassador_id, evidence, suggested_message, expires_at)
        SELECT $1::int, $2::text, $3::text, 'nueva',
               (SELECT ambassador_id FROM ambassador_businesses ab WHERE ab.business_id=$1::int LIMIT 1),
               $4::jsonb, $5::text, NOW() + ($6::text||' days')::interval
        WHERE NOT EXISTS (SELECT 1 FROM sales_signals s WHERE s.business_id=$1::int AND s.product_target=$3::text AND s.status IN ('nueva','vista','contactado'))
          AND NOT EXISTS (SELECT 1 FROM sales_signals s WHERE s.business_id=$1::int AND s.trigger_key=$2::text AND s.status IN ('descartada','expirada') AND s.status_changed_at > NOW() - ($7::text||' days')::interval)
        RETURNING id`,
        [c.business_id, c.trigger_key, PRODUCT[c.trigger_key], JSON.stringify(c.evidence), subst(msg(c.trigger_key), c.tokens), String(ttl), String(cooldown)]);
      if (ins.rowCount) { created++; byTrigger[c.trigger_key] = (byTrigger[c.trigger_key] || 0) + 1; }
    } catch (e) { console.error(`[SalesSignals] ${c.trigger_key} biz ${c.business_id}:`, e.message); }
  }

  console.log(`[SalesSignals] ${expired} expiradas (TTL), ${autoclosed} auto-cerradas, ${created} nuevas`, byTrigger);
  return { expired, autoclosed, created, byTrigger, evaluated: candidates.length };
}

module.exports = { run };

// Ejecución directa (cron)
if (require.main === module) {
  const { Pool } = require('pg');
  const { sendEmail } = require('../config/mail');
  const digest = require('./signalDigest');
  const pool = new Pool({
    host: process.env.DB_HOST || 'postgres', port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.POSTGRES_DB,
    user: process.env.DB_USER || process.env.POSTGRES_USER,
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
  });
  (async () => {
    try {
      await run(pool);
      await digest.run(pool, sendEmail);   // D9.5 — notificación diaria agrupada
      await pool.end(); process.exit(0);
    } catch (e) { console.error(e); try { await pool.end(); } catch (_) {} process.exit(1); }
  })();
}
