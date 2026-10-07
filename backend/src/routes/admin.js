// ============================================
// RETOPA Admin API - SPRINT #1 FINAL
// Fix Auth + Leads + FULL Frontend Compatible
// Columnas reales del schema de la DB
// ============================================

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const redisClient = require('../config/redis');
const { buildKitBatchPdf } = require('../utils/kit-pdf');
const { touchLastSeen } = require('../utils/presence');
const { getNetworkStats } = require('../utils/sysnet');
const { notifyOwner } = require('../helpers/notifyOwner');

async function invalidateBusinessCache(slug) {
    try {
        if (slug) await redisClient.del(`dir:biz:${slug}`);
        const keys = await redisClient.keys('dir:businesses:*');
        if (keys.length) await redisClient.del(keys);
    } catch (e) {}
}

const { getPlanLimits } = require('../utils/plan-limits');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || process.env.POSTGRES_DB,
  user: process.env.DB_USER || process.env.POSTGRES_USER,
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
});

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const JWT_SECRET = require('../config/jwt');

// ── Middleware JWT con roles ───────────────────────────────────────────────
// Jerarquía: godmode > admin > client > user
const ROLE_LEVEL = { godmode: 4, admin: 3, client: 2, user: 1 };

function requireRole(minRole) {
    return function(req, res, next) {
        const token = (req.headers.authorization || '').replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Token requerido', code: 'NO_TOKEN' });
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const level = ROLE_LEVEL[decoded.role] || 0;
            const required = ROLE_LEVEL[minRole] || 3;
            if (level < required) return res.status(403).json({ success: false, error: 'Sin permisos', code: 'FORBIDDEN' });
            req.user = decoded;
            // Marcar actividad: los admins también cuentan como "conectados"
            touchLastSeen(pool, decoded);
            next();
        } catch(e) {
            return res.status(401).json({ success: false, error: 'Token inválido o expirado', code: 'INVALID_TOKEN' });
        }
    };
}

// Todos los endpoints admin requieren rol admin o superior
router.use(requireRole('admin'));

// ── POST /admin/login — login para el panel admin ────────────────────────
// Esta ruta está ANTES del middleware, la registramos en app.js directamente
// Aquí definimos la función que app.js puede importar
router.requireRole = requireRole;

// ── GET /admin/kits.pdf — Kits QR por lote (por ids= o por category=/city=) ──
router.get('/kits.pdf', async (req, res) => {
  try {
    const { ids, category, city } = req.query;
    const conds = ['b.is_active = TRUE']; const params = [];
    if (ids) {
      const idList = String(ids).split(',').map(n => parseInt(n)).filter(Boolean);
      if (!idList.length) return res.status(400).json({ success: false, error: 'ids inválidos' });
      params.push(idList); conds.push(`b.id = ANY($${params.length}::int[])`);
    } else if (category || city) {
      if (category) { params.push(category); conds.push(`(c.slug = $${params.length} OR c.parent_id = (SELECT id FROM categories WHERE slug = $${params.length}))`); }
      if (city)     { params.push(city);     conds.push(`unaccent(b.city) ILIKE unaccent($${params.length})`); }
    } else {
      return res.status(400).json({ success: false, error: 'Indicá ids= o category=/city=' });
    }
    const q = `SELECT b.id, b.name, b.trade_name AS "tradeName", b.slug, b.city, b.kit_cta,
                      b.image_url AS "imageUrl", c.slug AS "categorySlug", c.name AS "categoryName"
               FROM businesses b LEFT JOIN categories c ON c.id = b.category_id
               WHERE ${conds.join(' AND ')}
               ORDER BY b.trade_name NULLS LAST, b.name
               LIMIT 100`;
    const { rows } = await pool.query(q, params);
    if (!rows.length) return res.status(404).json({ success: false, error: 'No se encontraron negocios para el kit' });
    const cfg = await getSiteConfigAll();
    const pdf = await buildKitBatchPdf(rows, cfg);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="kits-retopa-${rows.length}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('[admin kits.pdf]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// DASHBOARD
// ============================================
router.get('/dashboard', async (req, res) => {
  try {
    const [bizCount, revCount, leadsPending, usersCount, verifiedCount, pendingVerifCount] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM businesses WHERE is_active = true'),
      pool.query('SELECT COUNT(*) FROM reviews WHERE is_approved = true'),
      pool.query("SELECT COUNT(*) FROM service_leads WHERE status = 'pending'"),
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM businesses WHERE verified = true AND is_active = true'),
      pool.query('SELECT COUNT(*) FROM businesses WHERE (verified = false OR verified IS NULL) AND is_active = true'),
    ]);

    const [basicCount, featuredCount, premiumCount] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM businesses WHERE (plan_type = 'basic' OR plan_type IS NULL OR plan_type = '') AND is_active = true"),
      pool.query("SELECT COUNT(*) FROM businesses WHERE plan_type = 'featured' AND is_active = true"),
      pool.query("SELECT COUNT(*) FROM businesses WHERE plan_type = 'premium' AND is_active = true"),
    ]);

    // Ingresos estimados — precios de la tabla plans con fallback
    let featuredPrice = 299000, premiumPrice = 599000;
    try {
      const prices = await pool.query("SELECT id, price FROM plans WHERE is_active = TRUE AND id IN ('featured','premium')");
      prices.rows.forEach(p => {
        if (p.id === 'featured') featuredPrice = parseInt(p.price) || 299000;
        if (p.id === 'premium')  premiumPrice  = parseInt(p.price) || 599000;
      });
    } catch(e) {}
    const fCount = parseInt(featuredCount.rows[0].count);
    const pCount = parseInt(premiumCount.rows[0].count);
    const estimatedMonthly = (fCount * featuredPrice) + (pCount * premiumPrice);

    // Ingresos por mes (últimos 6 meses) — basado en won leads
    const revenueByMonth = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', updated_at), 'YYYY-MM') AS month,
        SUM(CASE WHEN service_type = 'premium' THEN ${premiumPrice}
                 WHEN service_type = 'featured' THEN ${featuredPrice}
                 ELSE 0 END)::bigint AS revenue
      FROM service_leads
      WHERE status IN ('won','closed')
        AND updated_at >= NOW() - INTERVAL '6 months'
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    // Server stats — proceso Node y sistema
    const os = require('os');
    const serverStats = {
      uptime_s:    Math.floor(process.uptime()),
      mem_used_mb: Math.round((process.memoryUsage().rss) / 1024 / 1024),
      mem_total_mb:Math.round(os.totalmem() / 1024 / 1024),
      mem_free_mb: Math.round(os.freemem()  / 1024 / 1024),
      load_avg:    os.loadavg()[0].toFixed(2),
      cpus:        os.cpus().length,
      node_version:process.version,
      network:     getNetworkStats(),
    };

    const leadsStats = await pool.query('SELECT status, COUNT(*) as count FROM service_leads GROUP BY status');
    const leadsByStatus = {};
    leadsStats.rows.forEach(r => { leadsByStatus[r.status] = parseInt(r.count); });

    const [newUsersWeek, newBizWeek] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days'"),
      pool.query("SELECT COUNT(*) FROM businesses WHERE created_at >= NOW() - INTERVAL '7 days' AND is_active = true"),
    ]);

    const topCategories = await pool.query(`
      SELECT c.name, c.slug, c.icon, c.color,
             COUNT(b.id) as business_count,
             COALESCE(c.search_count, 0) as search_count
      FROM categories c
      LEFT JOIN businesses b ON b.category_id = c.id AND b.is_active = true
      GROUP BY c.id, c.name, c.slug, c.icon, c.color, c.search_count
      ORDER BY COUNT(b.id) DESC, c.search_count DESC LIMIT 8
    `);

    const recentBusinesses = await pool.query(`
      SELECT b.id, b.name, b.verified, b.plan_type, b.city, b.created_at, c.name as category,
             COALESCE(b.like_count, 0) as like_count
      FROM businesses b LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.is_active = true ORDER BY b.created_at DESC LIMIT 10
    `);

    const recentLeads = await pool.query(`
      SELECT sl.id, sl.contact_name, sl.business_name, sl.service_type, sl.status, sl.created_at,
             b.name as business_real_name, b.city
      FROM service_leads sl LEFT JOIN businesses b ON sl.business_id = b.id
      ORDER BY sl.created_at DESC LIMIT 10
    `);

    // Altas de empresas por mes (últimos 12 meses) — para el line chart de crecimiento
    const bizGrowth = await pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
             COUNT(*)::int AS count
      FROM businesses
      WHERE created_at >= NOW() - INTERVAL '12 months' AND is_active = true
      GROUP BY 1 ORDER BY 1 ASC
    `);

    // Altas recientes (para los contadores 7d / 30d)
    const bizRecent = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS d7,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS d30
      FROM businesses WHERE is_active = true
    `);

    // Embudo de leads (pipeline comercial) — orden lógico del embudo
    // Nota: 'new' y 'completed' son estados legacy (claims viejos). Se cuentan
    // como pending/won respectivamente para que el embudo no deje huérfanos.
    const funnel = [
      { key: 'pending',     label: 'Pendientes',  count: (leadsByStatus['pending']||0) + (leadsByStatus['new']||0) },
      { key: 'contacted',   label: 'Contactados', count: leadsByStatus['contacted']   || 0 },
      { key: 'negotiating', label: 'Negociando',  count: leadsByStatus['negotiating'] || 0 },
      { key: 'follow_up',   label: 'Seguimiento', count: leadsByStatus['follow_up']   || 0 },
      { key: 'won',         label: 'Ganados',     count: (leadsByStatus['won']||0) + (leadsByStatus['closed']||0) + (leadsByStatus['completed']||0) },
      { key: 'lost',        label: 'Perdidos',    count: leadsByStatus['lost']        || 0 },
    ];

    res.json({
      success: true,
      stats: {
        total_businesses: parseInt(bizCount.rows[0].count),
        total_users: parseInt(usersCount.rows[0].count),
        total_reviews: parseInt(revCount.rows[0].count),
        pending_leads: parseInt(leadsPending.rows[0].count),
        total_leads: Object.values(leadsByStatus).reduce((a, b) => a + b, 0),
        leads_contacted: leadsByStatus['contacted'] || 0,
        leads_won: (leadsByStatus['won'] || 0) + (leadsByStatus['closed'] || 0) + (leadsByStatus['completed'] || 0),
        leads_negotiating: leadsByStatus['negotiating'] || 0,
        leads_lost: leadsByStatus['lost'] || 0,
        verified: parseInt(verifiedCount.rows[0].count),
        pending_verification: parseInt(pendingVerifCount.rows[0].count),
        basic_plan: parseInt(basicCount.rows[0].count),
        featured_plan: parseInt(featuredCount.rows[0].count),
        premium_plan: parseInt(premiumCount.rows[0].count),
        new_users_week: parseInt(newUsersWeek.rows[0].count),
        new_biz_week: parseInt(newBizWeek.rows[0].count),
        estimated_monthly_revenue: estimatedMonthly,
        featured_price: featuredPrice,
        premium_price: premiumPrice,
      },
      revenueByMonth: revenueByMonth.rows,
      serverStats,
      topCategories: topCategories.rows.map(c => ({
        name: c.name, slug: c.slug, icon: c.icon, color: c.color,
        business_count: parseInt(c.business_count),
        search_count: parseInt(c.search_count)
      })),
      recentBusinesses: recentBusinesses.rows.map(b => ({
        id: b.id, name: b.name, verified: b.verified,
        plan_type: b.plan_type || 'basic', category: b.category || '-',
        city: b.city || '', created_at: b.created_at
      })),
      recentLeads: recentLeads.rows.map(l => ({
        id: l.id, contact_name: l.contact_name || '',
        business_name: l.business_name || l.business_real_name || '',
        service_type: l.service_type || 'basic',
        status: l.status || 'pending', city: l.city || '', created_at: l.created_at
      })),
      bizGrowth: bizGrowth.rows,
      bizRecent: { d7: parseInt(bizRecent.rows[0].d7), d30: parseInt(bizRecent.rows[0].d30) },
      leadsFunnel: funnel,
    });
  } catch (err) {
    console.error('[Admin] Dashboard error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /dashboard/growth ── Pulso del directorio con rango + granularidad ────
// Rangos: 1w (por día), 1m (por día), 3m (por semana), 6m (por mes).
// Rellena los períodos sin altas con 0 → la línea es continua y honesta.
const GROWTH_RANGES = {
  '1w': { bucket: 'day',   interval: '7 days',   label: 'día' },
  '1m': { bucket: 'day',   interval: '30 days',  label: 'día' },
  '3m': { bucket: 'week',  interval: '90 days',  label: 'semana' },
  '6m': { bucket: 'month', interval: '6 months', label: 'mes' },
};
router.get('/dashboard/growth', async (req, res) => {
  try {
    const r = GROWTH_RANGES[req.query.range] || GROWTH_RANGES['1m'];
    const q = await pool.query(`
      WITH series AS (
        SELECT generate_series(
          date_trunc($1, NOW() - $2::interval),
          date_trunc($1, NOW()),
          ('1 ' || $1)::interval
        ) AS period
      ),
      counts AS (
        SELECT date_trunc($1, created_at) AS period, COUNT(*)::int AS count
        FROM businesses
        WHERE is_active = true AND created_at >= date_trunc($1, NOW() - $2::interval)
        GROUP BY 1
      )
      SELECT to_char(s.period, 'YYYY-MM-DD') AS period, COALESCE(c.count, 0)::int AS count
      FROM series s LEFT JOIN counts c ON c.period = s.period
      ORDER BY s.period
    `, [r.bucket, r.interval]);
    res.json({ success: true, range: req.query.range || '1m', bucket: r.bucket, label: r.label, rows: q.rows });
  } catch (err) {
    console.error('[Admin] Dashboard growth error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /dashboard/live ── Datos en tiempo real (server + conexiones) ─────────
// Endpoint liviano para polling frecuente sin recargar todo el dashboard
router.get('/dashboard/live', async (req, res) => {
  try {
    const os = require('os');
    const server = {
      uptime_s:     Math.floor(process.uptime()),
      mem_used_mb:  Math.round(process.memoryUsage().rss / 1024 / 1024),
      mem_total_mb: Math.round(os.totalmem() / 1024 / 1024),
      load_avg:     parseFloat(os.loadavg()[0].toFixed(2)),
      cpus:         os.cpus().length,
      network:      getNetworkStats(),
    };

    // Conexiones reales desde site_visits (cualquier página: home, directorio, fichas)
    // D8.4 — cortes de día/mes anclados a hora de Paraguay (America/Asuncion);
    // "Mes" = mes calendario en curso. visited_at se guarda como UTC naive.
    const conn = await pool.query(`
      SELECT
        COUNT(DISTINCT ip_hash) FILTER (WHERE visited_at >= NOW() - INTERVAL '5 minutes') AS now,
        COUNT(DISTINCT ip_hash) FILTER (WHERE (visited_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion')::date = (NOW() AT TIME ZONE 'America/Asuncion')::date) AS today,
        COUNT(DISTINCT ip_hash) FILTER (WHERE (visited_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion') >= (NOW() AT TIME ZONE 'America/Asuncion') - INTERVAL '7 days') AS week,
        COUNT(DISTINCT ip_hash) FILTER (WHERE (visited_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion') >= date_trunc('month', (NOW() AT TIME ZONE 'America/Asuncion'))) AS month,
        COUNT(*) FILTER (WHERE (visited_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion')::date = (NOW() AT TIME ZONE 'America/Asuncion')::date) AS views_today
      FROM site_visits
    `);
    const c = conn.rows[0];

    res.json({
      success: true,
      server,
      connections: {
        now:   parseInt(c.now)   || 0,
        today: parseInt(c.today) || 0,
        week:  parseInt(c.week)  || 0,
        month: parseInt(c.month) || 0,
        views_today: parseInt(c.views_today) || 0,
      },
      ts: Date.now()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// ── GET /admin/monetization ── D8.1 — KPIs de monetización + usuarios conectados
router.get('/monetization', async (req, res) => {
  try {
    // Ventana de "conectado ahora" (config, default 7 min)
    let onlineWin = 7;
    try {
      const w = await pool.query("SELECT value FROM site_config WHERE key='online_window_min'");
      const n = parseInt(w.rows[0]?.value); if (Number.isFinite(n) && n > 0) onlineWin = n;
    } catch (e) {}

    const [pending, planCash, boostCash, mrr, expiring, online, onlineList, todayCount, todayList] = await Promise.all([
      // Solicitudes de plan pendientes
      pool.query("SELECT COUNT(*)::int AS n FROM plan_requests WHERE status='pending'"),
      // Caja del mes — planes confirmados (mes calendario, hora Paraguay)
      pool.query("SELECT COALESCE(SUM(amount_gs),0)::bigint AS gs, COUNT(*)::int AS n FROM plan_requests WHERE status='confirmed' AND (confirmed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion') >= date_trunc('month', (NOW() AT TIME ZONE 'America/Asuncion'))"),
      // Caja del mes — boosts pagados (mes calendario, hora Paraguay)
      pool.query("SELECT COALESCE(SUM(price_gs),0)::bigint AS gs, COUNT(*)::int AS n FROM promotion_boosts WHERE status='paid' AND (paid_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion') >= date_trunc('month', (NOW() AT TIME ZONE 'America/Asuncion'))"),
      // MRR activo — suma de plans.price de los grants pagos vigentes hoy
      pool.query(`SELECT COALESCE(SUM(p.price),0)::bigint AS gs, COUNT(*)::int AS n
                  FROM plan_grants pg JOIN plans p ON p.id = pg.plan_type
                  WHERE pg.reason='paid' AND pg.reverted_at IS NULL AND pg.expires_at > NOW()`),
      // Por vencer — grants pagos vigentes que vencen en 7 / 30 días
      pool.query(`SELECT
                    COUNT(*) FILTER (WHERE expires_at <= NOW() + INTERVAL '7 days')::int  AS d7,
                    COUNT(*) FILTER (WHERE expires_at <= NOW() + INTERVAL '30 days')::int AS d30
                  FROM plan_grants WHERE reason='paid' AND reverted_at IS NULL AND expires_at > NOW()`),
      // Usuarios conectados ahora (conteo)
      pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE last_seen_at >= NOW() - ($1 || ' minutes')::interval`, [String(onlineWin)]),
      // Lista compacta (los más recientes, acotada)
      pool.query(`SELECT id, name, email, role, is_ambassador, last_seen_at
                  FROM users WHERE last_seen_at >= NOW() - ($1 || ' minutes')::interval
                  ORDER BY last_seen_at DESC LIMIT 8`, [String(onlineWin)]),
      // Conectados HOY (día calendario, hora Paraguay) — conteo
      pool.query(`SELECT COUNT(*)::int AS n FROM users
                  WHERE (last_seen_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion')
                        >= date_trunc('day', (NOW() AT TIME ZONE 'America/Asuncion'))`),
      // Conectados HOY — lista (los más recientes)
      pool.query(`SELECT id, name, email, role, is_ambassador, last_seen_at FROM users
                  WHERE (last_seen_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion')
                        >= date_trunc('day', (NOW() AT TIME ZONE 'America/Asuncion'))
                  ORDER BY last_seen_at DESC LIMIT 20`),
    ]);

    const planGs  = parseInt(planCash.rows[0].gs)  || 0;
    const boostGs = parseInt(boostCash.rows[0].gs) || 0;

    res.json({
      success: true,
      data: {
        pending_requests: pending.rows[0].n,
        month_revenue: {
          total_gs: planGs + boostGs,
          plans_gs: planGs, plans_count: planCash.rows[0].n,
          boosts_gs: boostGs, boosts_count: boostCash.rows[0].n,
        },
        mrr: { gs: parseInt(mrr.rows[0].gs) || 0, active_paid: mrr.rows[0].n },
        expiring: { d7: expiring.rows[0].d7, d30: expiring.rows[0].d30 },
        online: {
          window_min: onlineWin,
          count: online.rows[0].n,
          users: onlineList.rows.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, is_ambassador: u.is_ambassador, last_seen_at: u.last_seen_at })),
          today_count: todayCount.rows[0].n,
          today_users: todayList.rows.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, is_ambassador: u.is_ambassador, last_seen_at: u.last_seen_at })),
        },
      },
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /admin/reg-banner-stats?days=30 ── Embudo del banner de captación ─────
router.get('/reg-banner-stats', async (req, res) => {
  try {
    let days = parseInt(req.query.days);
    if (!Number.isFinite(days) || days < 1 || days > 365) days = 30;

    // Totales por evento (con sesiones únicas) en la ventana
    const totals = (await pool.query(`
      SELECT event, COUNT(*)::int AS events, COUNT(DISTINCT session_id)::int AS sessions
      FROM reg_banner_events
      WHERE created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY event`, [String(days)])).rows;

    const byEvent = {};
    totals.forEach(r => { byEvent[r.event] = { events: r.events, sessions: r.sessions }; });
    const g = k => byEvent[k] || { events: 0, sessions: 0 };

    const imp = g('impression'), cta = g('cta');
    const ctrSessions = imp.sessions > 0 ? +(cta.sessions / imp.sessions * 100).toFixed(1) : 0;

    // Serie diaria (hora Paraguay) para un mini-gráfico
    const series = (await pool.query(`
      SELECT (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion')::date AS d,
             COUNT(*) FILTER (WHERE event='impression')::int AS impressions,
             COUNT(*) FILTER (WHERE event='cta')::int        AS cta
      FROM reg_banner_events
      WHERE created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY 1 ORDER BY 1`, [String(days)])).rows;

    res.json({
      success: true,
      data: {
        days,
        impressions: imp,
        cta,
        dismiss: g('dismiss'),
        never: g('never'),
        login: g('login'),
        ctr_sessions: ctrSessions,   // % de sesiones que vieron el banner y tocaron el CTA
        by_day: series.map(r => ({ date: r.d, impressions: r.impressions, cta: r.cta })),
      },
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /admin/monetization/report ── D8.2 — Informe (mes/producto/embudo/por vencer)
const BOOST_LABELS = { boost_7d: 'Boost 7 días', boost_15d: 'Boost 15 días', boost_home_30d: 'Boost Home 30 días' };
router.get('/monetization/report', async (req, res) => {
  try {
    const [byMonth, plansProd, boostsProd, funnel, expiring] = await Promise.all([
      // Ingresos por mes (últimos 6 meses) — planes + boosts. Meses y cortes en hora Paraguay.
      pool.query(`
        SELECT to_char(m, 'YYYY-MM') AS ym,
          COALESCE((SELECT SUM(amount_gs) FROM plan_requests pr WHERE pr.status='confirmed' AND date_trunc('month',(pr.confirmed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion'))=m),0)::bigint AS plans_gs,
          COALESCE((SELECT SUM(price_gs)  FROM promotion_boosts b WHERE b.status='paid'      AND date_trunc('month',(b.paid_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion'))=m),0)::bigint AS boosts_gs
        FROM generate_series(date_trunc('month',(NOW() AT TIME ZONE 'America/Asuncion')) - INTERVAL '5 months', date_trunc('month',(NOW() AT TIME ZONE 'America/Asuncion')), INTERVAL '1 month') m
        ORDER BY m`),
      // Por producto (planes) — últimos 6 meses (hora Paraguay), nombre desde plans
      pool.query(`SELECT p.name AS product, COALESCE(SUM(pr.amount_gs),0)::bigint AS gs, COUNT(*)::int AS n
                  FROM plan_requests pr JOIN plans p ON p.id=pr.plan
                  WHERE pr.status='confirmed' AND (pr.confirmed_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion') >= date_trunc('month',(NOW() AT TIME ZONE 'America/Asuncion')) - INTERVAL '5 months'
                  GROUP BY p.name ORDER BY gs DESC`),
      // Por producto (boosts) — últimos 6 meses (hora Paraguay)
      pool.query(`SELECT boost_type AS product, COALESCE(SUM(price_gs),0)::bigint AS gs, COUNT(*)::int AS n
                  FROM promotion_boosts WHERE status='paid' AND (paid_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion') >= date_trunc('month',(NOW() AT TIME ZONE 'America/Asuncion')) - INTERVAL '5 months'
                  GROUP BY boost_type ORDER BY gs DESC`),
      // Embudo Leads → Solicitudes → Confirmadas (histórico)
      pool.query(`SELECT
                    (SELECT COUNT(*) FROM service_leads WHERE service_type IN ('featured','premium'))::int AS leads,
                    (SELECT COUNT(*) FROM plan_requests)::int AS solicitudes,
                    (SELECT COUNT(*) FROM plan_requests WHERE status='confirmed')::int AS confirmadas`),
      // Planes por vencer (próximos 30 días) — detalle para accionar renovación
      pool.query(`SELECT b.name, b.trade_name, b.slug, pg.plan_type, p.name AS plan_name, pg.expires_at,
                    CEIL(EXTRACT(EPOCH FROM (pg.expires_at - NOW()))/86400.0)::int AS days_left,
                    (SELECT u.email FROM user_businesses ub JOIN users u ON u.id=ub.user_id
                       WHERE ub.business_id=b.id AND ub.is_owner=TRUE AND COALESCE(u.email,'')<>'' LIMIT 1) AS owner_email
                  FROM plan_grants pg JOIN businesses b ON b.id=pg.business_id
                  LEFT JOIN plans p ON p.id=pg.plan_type
                  WHERE pg.reason='paid' AND pg.reverted_at IS NULL AND pg.expires_at > NOW()
                    AND pg.expires_at <= NOW() + INTERVAL '30 days'
                  ORDER BY pg.expires_at ASC LIMIT 50`),
    ]);

    const byProduct = [
      ...plansProd.rows.map(r => ({ product: r.product, kind: 'plan',  gs: parseInt(r.gs) || 0, count: r.n })),
      ...boostsProd.rows.map(r => ({ product: BOOST_LABELS[r.product] || r.product, kind: 'boost', gs: parseInt(r.gs) || 0, count: r.n })),
    ].sort((a, b) => b.gs - a.gs);

    const f = funnel.rows[0];
    const leads = f.leads || 0, sol = f.solicitudes || 0, conf = f.confirmadas || 0;

    res.json({
      success: true,
      data: {
        by_month: byMonth.rows.map(r => ({
          ym: r.ym, plans_gs: parseInt(r.plans_gs) || 0, boosts_gs: parseInt(r.boosts_gs) || 0,
          total_gs: (parseInt(r.plans_gs) || 0) + (parseInt(r.boosts_gs) || 0),
        })),
        by_product: byProduct,
        funnel: {
          leads, solicitudes: sol, confirmadas: conf,
          rate_sol:  leads ? Math.round((sol / leads) * 100)  : null,
          rate_conf: sol   ? Math.round((conf / sol) * 100)   : null,
        },
        expiring: expiring.rows.map(r => ({
          name: r.trade_name || r.name, slug: r.slug,
          plan_name: r.plan_name || r.plan_type,
          expires_at: r.expires_at, days_left: r.days_left, owner_email: r.owner_email,
        })),
      },
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ══════════════════════ D9.4 — Disparadores de Venta (admin) ═══════════════
const SIG_ACTIVE = ['nueva','vista','contactado'];
const SIG_PRIO = `CASE s.trigger_key
  WHEN 'onb_bienvenida' THEN 0
  WHEN 't4_fundador_d75' THEN 1 WHEN 't3_boost_vencido' THEN 2 WHEN 't2_destacado_datos' THEN 3
  WHEN 't5_candidato_hc' THEN 4 WHEN 't1_listo_boost' THEN 5 WHEN 't6_ficha_abandonada' THEN 6 ELSE 9 END`;

// GET /admin/signals — tabla global con filtros
router.get('/signals', async (req, res) => {
  try {
    const { trigger, product, city, ambassador_id, age_days } = req.query;
    const status = req.query.status || 'active';
    const where = []; const params = [];
    const P = v => { params.push(v); return '$' + params.length; };

    if (status === 'active') where.push(`s.status = ANY(${P(SIG_ACTIVE)})`);
    else if (status !== 'all') where.push(`s.status = ${P(status)}`);
    if (trigger)  where.push(`s.trigger_key = ${P(trigger)}`);
    if (product)  where.push(`s.product_target = ${P(product)}`);
    if (city)     where.push(`unaccent(b.city) ILIKE unaccent('%'||${P(city)}||'%')`);
    if (ambassador_id === 'none') where.push(`s.assigned_ambassador_id IS NULL`);
    else if (ambassador_id)       where.push(`s.assigned_ambassador_id = ${P(parseInt(ambassador_id))}`);
    if (age_days) where.push(`s.created_at >= NOW() - (${P(String(parseInt(age_days)))}||' days')::interval`);

    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    const total = (await pool.query(
      `SELECT COUNT(*)::int n FROM sales_signals s JOIN businesses b ON b.id=s.business_id ${whereSql}`, params)).rows[0].n;

    const rows = (await pool.query(`
      SELECT s.id, s.business_id, s.trigger_key, s.product_target, s.status, s.evidence,
             s.suggested_message, s.note, s.created_at, s.status_changed_at, s.assigned_ambassador_id,
             COALESCE(NULLIF(TRIM(b.trade_name),''), b.name) AS business_name, b.slug, b.city,
             (SELECT name FROM categories c WHERE c.id=b.category_id) AS category_name,
             u.name AS ambassador_name, u.email AS ambassador_email
      FROM sales_signals s
      JOIN businesses b ON b.id=s.business_id
      LEFT JOIN users u ON u.id=s.assigned_ambassador_id
      ${whereSql}
      ORDER BY (s.assigned_ambassador_id IS NULL AND s.status = ANY($${params.length+1})) DESC, ${SIG_PRIO}, s.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`, [...params, SIG_ACTIVE])).rows;

    res.json({ success: true, data: rows, total, page, limit });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /admin/signals/summary — tarjetas + conversión por trigger + embajadores
router.get('/signals/summary', async (req, res) => {
  try {
    const [act, mes, conv, ambs] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int n FROM sales_signals WHERE status = ANY($1)`, [SIG_ACTIVE]),
      pool.query(`SELECT COUNT(*)::int n FROM sales_signals WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Asuncion') >= date_trunc('month',(NOW() AT TIME ZONE 'America/Asuncion'))`),
      pool.query(`SELECT trigger_key,
                    COUNT(*) FILTER (WHERE status='convertida')::int AS convertidas,
                    COUNT(*) FILTER (WHERE status IN ('convertida','descartada','expirada'))::int AS cerradas,
                    COUNT(*) FILTER (WHERE status = ANY($1))::int AS activas
                  FROM sales_signals GROUP BY trigger_key`, [SIG_ACTIVE]),
      pool.query(`SELECT id, name, email FROM users WHERE is_ambassador = TRUE AND is_active = TRUE ORDER BY name NULLS LAST`),
    ]);
    res.json({ success: true, data: {
      active: act.rows[0].n,
      created_month: mes.rows[0].n,
      by_trigger: conv.rows.map(r => ({
        trigger_key: r.trigger_key, convertidas: r.convertidas, cerradas: r.cerradas, activas: r.activas,
        rate: r.cerradas ? Math.round((r.convertidas / r.cerradas) * 100) : null,
      })),
      ambassadors: ambs.rows,
    }});
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /admin/signals/:id/assign — reasignar (o desasignar con ambassador_id null)
router.post('/signals/:id/assign', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    let ambId = req.body.ambassador_id;
    ambId = (ambId === null || ambId === '' || ambId === undefined) ? null : parseInt(ambId);
    if (ambId !== null) {
      const ok = await pool.query(`SELECT 1 FROM users WHERE id=$1 AND is_ambassador=TRUE`, [ambId]);
      if (!ok.rowCount) return res.status(400).json({ success: false, error: 'No es un embajador válido' });
    }
    const upd = await pool.query(`UPDATE sales_signals SET assigned_ambassador_id=$2 WHERE id=$1 RETURNING id`, [id, ambId]);
    if (!upd.rowCount) return res.status(404).json({ success: false, error: 'Señal no encontrada' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /admin/signals/:id/close — cerrar como convertida | descartada
router.post('/signals/:id/close', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const status = req.body.status;
    if (!['convertida','descartada'].includes(status)) return res.status(400).json({ success: false, error: 'estado inválido' });
    const note = (req.body.note) ? String(req.body.note).slice(0, 300) : null;
    const adminId = (req.user && (req.user.id || req.user.userId)) || null;
    const upd = await pool.query(
      `UPDATE sales_signals SET status=$2, note=COALESCE($3,note), status_changed_at=NOW(), status_changed_by=$4
       WHERE id=$1 AND status = ANY($5) RETURNING id`, [id, status, note, adminId, SIG_ACTIVE]);
    if (!upd.rowCount) return res.status(404).json({ success: false, error: 'Señal no encontrada o ya cerrada' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /admin/signals/regenerate — corre el job de generación on-demand.
// Expira las vencidas y genera nuevas señales según los umbrales actuales.
// NO envía el digest por email (eso queda para la corrida por cron), para no
// notificar a los embajadores cada vez que un admin regenera a mano.
router.post('/signals/regenerate', async (req, res) => {
  try {
    const salesSignals = require('../jobs/salesSignals');
    const result = await salesSignals.run(pool);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[admin] POST /signals/regenerate:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/leads', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0, q, service_type, view, origin } = req.query;

    // Base: JOIN con businesses. Excluir promo_boost y claim — tienen su propio
    // menú (Promociones y Claims respectivamente); no son captación ni venta.
    let whereClause = `WHERE sl.service_type NOT IN ('promo_boost', 'claim')`;
    const params = [];
    let paramIdx = 1;

    // Vista: active (default) = no archivados y no tratados; archived = archivados o tratados; all = todos
    // "Tratado" = won/lost/closed (venta) + verificado/descartado (captación).
    // "Archivado manual" = archived=true.
    if (view === 'archived') {
      whereClause += ` AND (sl.archived = TRUE OR sl.status IN ('won','lost','closed','verificado','descartado'))`;
    } else if (view === 'all') {
      // sin filtro de archivado
    } else {
      // active (default): ni archivado manual ni tratado → el "backlog accionable"
      whereClause += ` AND sl.archived = FALSE AND sl.status NOT IN ('won','lost','closed','verificado','descartado')`;
    }

    if (status) {
      whereClause += ` AND sl.status = $${paramIdx++}`;
      params.push(status);
    }
    // Origen: 'captacion' = alta de ficha gratis (plan 'basic' o sin plan), o marcada
    //         explícitamente por el formulario (notes.source='web_register').
    //         'venta' = pedidos de plan pago (featured/premium), reclamos, etc.
    // El predicado debe coincidir con isCaptacionLead() del front. notes puede no ser
    // JSON válido → PG16 IS JSON OBJECT lo evalúa de forma segura.
    const CAPTACION_PRED = `(
      COALESCE(sl.service_type,'') NOT IN ('featured','premium','claim')
      AND (
        COALESCE(sl.service_type,'') IN ('basic','')
        OR COALESCE(sl.notes IS JSON OBJECT AND (sl.notes::jsonb->>'source') = 'web_register', FALSE)
      )
    )`;
    if (origin === 'captacion') {
      whereClause += ` AND ${CAPTACION_PRED}`;
    } else if (origin === 'venta') {
      whereClause += ` AND NOT ${CAPTACION_PRED}`;
    }
    if (service_type) {
      whereClause += ` AND sl.service_type = $${paramIdx++}`;
      params.push(service_type);
    }
    if (q) {
      whereClause += ` AND (
        COALESCE(sl.business_name, b.name, '') ILIKE $${paramIdx}
        OR sl.contact_name ILIKE $${paramIdx}
        OR sl.contact_email ILIKE $${paramIdx}
      )`;
      params.push(`%${q}%`); paramIdx++;
    }

    const countSql = `
      SELECT COUNT(*) FROM service_leads sl
      LEFT JOIN businesses b ON sl.business_id = b.id
      ${whereClause}
    `;
    const countResult = await pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].count);

    const dataSql = `
      SELECT
        sl.id,
        sl.status,
        sl.service_type,
        sl.contact_name,
        sl.contact_email,
        sl.contact_phone,
        sl.notes,
        sl.created_at,
        sl.updated_at,
        -- Nombre de empresa: prioridad a columna business_name, luego businesses.name, luego notes
        COALESCE(sl.business_name, b.name, '') AS business_name,
        -- Datos completos de la empresa vinculada
        b.id        AS business_id,
        b.city      AS business_city,
        b.phone     AS business_phone,
        b.description AS business_description,
        b.address   AS business_address,
        b.website   AS business_website,
        b.ruc       AS business_ruc,
        b.email     AS business_email,
        b.verified  AS business_verified,
        b.plan_type AS business_plan_type,
        -- Categoría de la empresa
        c.id        AS category_id,
        c.name      AS category_name,
        c.slug      AS category_slug
      FROM service_leads sl
      LEFT JOIN businesses b ON sl.business_id = b.id
      LEFT JOIN categories c ON b.category_id = c.id
      ${whereClause}
      ORDER BY sl.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(dataSql, params);

    // Enriquecer: si falta business_name pero está en notes JSON, extraerlo
    const rows = result.rows.map(row => {
      if (!row.business_name && row.notes) {
        try {
          const parsed = JSON.parse(row.notes);
          row.business_name = parsed.business_name || parsed.name || parsed.company_name || parsed.empresa || '';
        } catch(e) {}
      }
      // Si city no viene de businesses, intentar desde notes
      if (!row.business_city && row.notes) {
        try {
          const parsed = JSON.parse(row.notes);
          row.business_city = parsed.city || parsed.ciudad || '';
        } catch(e) {}
      }
      // Si phone no viene de businesses, intentar desde notes
      if (!row.business_phone && row.notes) {
        try {
          const parsed = JSON.parse(row.notes);
          row.business_phone = parsed.phone || parsed.business_phone || parsed.telefono || '';
        } catch(e) {}
      }
      return row;
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (err) {
    console.error('[Admin] Leads error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/leads/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'contacted', 'closed', 'verificado', 'descartado'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, error: `Status inválido` });
    const result = await pool.query(
      `UPDATE service_leads SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, business_name, contact_name, status, updated_at`,
      [status, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Lead no encontrado' });
    res.json({ success: true, data: result.rows[0], message: `Lead marcado como "${status}"` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ================================================================
// POST /api/v2/admin/leads/:id/verify-ficha
// CAPTACIÓN → CONVERSIÓN: verifica la ficha registrada desde el propio Lead
// (sin ir a "Empresas"), pasa el lead a estado 'verificado', y CREA una
// Oportunidad de onboarding/bienvenida SIN asignar para que el admin la derive
// luego a un embajador. Todo en una sola transacción. El correo de verificación
// se dispara (fire & forget) sólo si hubo transición no-verificada → verificada.
// ================================================================
const { runVerifyFicha } = require('../helpers/verifyFicha');
router.post('/leads/:id/verify-ficha', async (req, res) => {
  const client = await pool.connect();
  try {
    const leadId = parseInt(req.params.id);
    if (!leadId || isNaN(leadId)) return res.status(400).json({ success: false, error: 'ID inválido' });

    const cfg = await getSiteConfigAll();

    await client.query('BEGIN');
    const out = await runVerifyFicha(client, leadId, cfg);
    if (out.error === 'NOT_FOUND') { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Lead no encontrado' }); }
    if (out.error === 'NO_BUSINESS') { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: 'Este registro no tiene una ficha de empresa vinculada' }); }
    await client.query('COMMIT');

    // Post-commit: invalidar cachés del directorio y disparar correo de verificación
    try { const keys = await redisClient.keys('dir:*'); if (keys.length) await redisClient.del(keys); } catch (e) {}
    if (out.didVerify) notifyBusinessVerified(out.bizId); // fire & forget: sólo en la transición

    res.json({
      success: true,
      verified: true,
      did_verify: out.didVerify,
      opportunity_created: out.opportunityCreated,
      message: out.opportunityCreated
        ? 'Ficha verificada. Se creó una oportunidad de onboarding sin asignar.'
        : 'Ficha verificada. Ya existía una oportunidad de onboarding activa para esta empresa.'
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[verify-ficha]', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ================================================================
// PUT /api/v2/admin/leads/:id - Actualizar lead completo
// ================================================================
router.put('/leads/:id', async (req, res) => {
    try {
        const leadId = parseInt(req.params.id);
        if (!leadId || isNaN(leadId)) {
            return res.status(400).json({ success: false, error: 'ID invalido' });
        }

        const {
            contact_name,
            contact_email,
            contact_phone,
            business_name,
            service_type,
            status,
            notes
        } = req.body;

        // Validar status si se envia
        // Venta: pending/contacted/negotiating/won/lost/follow_up · Captación: verificado/descartado
        const validStatuses = ['pending', 'contacted', 'negotiating', 'won', 'lost', 'follow_up', 'verificado', 'descartado'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Status invalido. Permitidos: pending, contacted, negotiating, won, lost, follow_up, verificado, descartado'
            });
        }

        // Validar service_type si se envia
        const validServices = ['basic', 'featured', 'premium', 'promo_boost', 'claim', 'general'];
        if (service_type && !validServices.includes(service_type)) {
            return res.status(400).json({ 
                success: false, 
                error: `Servicio inválido: ${service_type}`
            });
        }

        // Verificar que el lead existe y no está bloqueado
        const checkResult = await pool.query(
            'SELECT id, status, business_id FROM service_leads WHERE id = $1',
            [leadId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Lead no encontrado' });
        }

        const currentLead = checkResult.rows[0];

        // Lock: won y lost no se pueden editar a menos que se re-abra explícitamente
        const isLocked = ['won', 'lost'].includes(currentLead.status);
        const isReopening = status && ['pending', 'contacted', 'negotiating'].includes(status);
        if (isLocked && !isReopening) {
            return res.status(409).json({
                success: false,
                error: `Este lead está cerrado (${currentLead.status}). Re-abrilo cambiando el estado para editarlo.`,
                locked: true,
                current_status: currentLead.status
            });
        }

        // Construir query dinamica - solo actualizar campos enviados
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (contact_name !== undefined) {
            updates.push(`contact_name = $${paramIndex++}`);
            values.push(contact_name);
        }
        if (contact_email !== undefined) {
            updates.push(`contact_email = $${paramIndex++}`);
            values.push(contact_email);
        }
        if (contact_phone !== undefined) {
            updates.push(`contact_phone = $${paramIndex++}`);
            values.push(contact_phone);
        }
        if (business_name !== undefined) {
            updates.push(`business_name = $${paramIndex++}`);
            values.push(business_name);
        }
        if (service_type !== undefined) {
            updates.push(`service_type = $${paramIndex++}`);
            values.push(service_type);
        }
        if (status !== undefined) {
            updates.push(`status = $${paramIndex++}`);
            values.push(status);
        }
        if (notes !== undefined) {
            updates.push(`notes = $${paramIndex++}`);
            values.push(notes);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No hay campos para actualizar' });
        }

        // Siempre actualizar updated_at
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(leadId);

        const query = `
            UPDATE service_leads 
            SET ${updates.join(', ')} 
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        const result = await pool.query(query, values);

        // Sincronizar plan SOLO cuando el lead es de tipo plan (featured/premium)
        // NUNCA tocar plan_type para promo_boost, claim u otros service_type
        const planUpgradeTypes = ['featured', 'premium'];
        if (status === 'won' && currentLead.business_id && service_type && planUpgradeTypes.includes(service_type)) {
            await pool.query(
                `UPDATE businesses SET plan_type=$1, updated_at=NOW() WHERE id=$2`,
                [service_type, currentLead.business_id]
            );
            try {
                const bizRow = await pool.query('SELECT slug FROM businesses WHERE id=$1', [currentLead.business_id]);
                if (bizRow.rows[0]?.slug) await invalidateBusinessCache(bizRow.rows[0].slug);
            } catch(e) {}
        }

        // Para promo_boost won → activar el boost específico referenciado en notes
        if (status === 'won' && service_type === 'promo_boost') {
            const leadFull = await pool.query('SELECT notes FROM service_leads WHERE id=$1', [leadId]);
            const notes    = leadFull.rows[0]?.notes || '';

            // Intentar leer boost_id explícito (nuevo formato)
            const boostIdMatch   = notes.match(/boost_id:(\d+)/);
            const specificBoostId = boostIdMatch ? parseInt(boostIdMatch[1]) : null;

            // Intentar leer boost_type del notes (ambos formatos)
            const boostTypeMatch = notes.match(/tipo:(boost_\w+)/) || notes.match(/(boost_\w+)/);
            const notesBoostType = boostTypeMatch ? boostTypeMatch[1] : null;

            let boostQuery, boostParam;
            if (specificBoostId) {
                boostQuery = `SELECT * FROM promotion_boosts WHERE id=$1 AND status='pending'`;
                boostParam = [specificBoostId];
            } else if (notesBoostType && currentLead.business_id) {
                boostQuery = `SELECT * FROM promotion_boosts WHERE business_id=$1 AND boost_type=$2 AND status='pending' ORDER BY created_at DESC LIMIT 1`;
                boostParam = [currentLead.business_id, notesBoostType];
            } else {
                boostQuery = `SELECT * FROM promotion_boosts WHERE business_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1`;
                boostParam = [currentLead.business_id];
            }

            const boost = await pool.query(boostQuery, boostParam).catch(()=>({rows:[]}));

            if (boost.rows.length) {
                const b = boost.rows[0];
                const daysMap = { boost_7d:7, boost_15d:15, boost_home_30d:30 };
                const daysCfg = await pool.query(
                    `SELECT key, value FROM site_config WHERE key IN ('promo_boost_7d_days','promo_boost_15d_days','promo_boost_home_days')`
                ).catch(()=>({rows:[]}));
                const daysOverride = {};
                daysCfg.rows.forEach(r => {
                    if (r.key === 'promo_boost_7d_days')    daysOverride.boost_7d = parseInt(r.value);
                    if (r.key === 'promo_boost_15d_days')   daysOverride.boost_15d = parseInt(r.value);
                    if (r.key === 'promo_boost_home_days')  daysOverride.boost_home_30d = parseInt(r.value);
                });
                const days      = daysOverride[b.boost_type] || daysMap[b.boost_type] || 7;
                const expiresAt = new Date(Date.now() + days * 86400000);

                await pool.query(
                    `UPDATE promotion_boosts SET status='paid', paid_at=NOW(), expires_at=$1 WHERE id=$2`,
                    [expiresAt, b.id]
                ).catch(()=>{});

                if (b.promotion_id) {
                    const inHome = b.boost_type === 'boost_home_30d';
                    await pool.query(
                        `UPDATE promotions SET boost_type=$1, show_in_home=$2, expires_at=$3, is_active=TRUE, updated_at=NOW() WHERE id=$4`,
                        [b.boost_type, inHome, expiresAt, b.promotion_id]
                    ).catch(()=>{});
                }
            }
        }

        res.json({ 
            success: true, 
            data: result.rows[0],
            message: 'Lead actualizado correctamente',
            plan_synced: (status === 'won' && currentLead.business_id && service_type) ? service_type : null
        });

    } catch (err) {
        console.error('Error PUT /admin/leads/:id:', err);
        res.status(500).json({ success: false, error: err.message || 'Error interno del servidor' });
    }
});

// PUT /api/v2/admin/leads/:id/archive — archivar o desarchivar un lead
router.put('/leads/:id/archive', async (req, res) => {
    try {
        const archived = req.body.archived !== false; // default true
        await pool.query(
            'UPDATE service_leads SET archived = $1, archived_at = $2, updated_at = NOW() WHERE id = $3',
            [archived, archived ? new Date() : null, req.params.id]
        );
        res.json({ success: true, archived });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// ================================================================
// POST /api/v2/admin/leads - Crear lead completo desde registro
// ================================================================
router.post('/leads', async (req, res) => {
    try {
        const {
            name,                    // "HEPTA E.A.S." — nombre de la empresa (del form)
            business_name,           // alias opcional
            ruc,
            category_id,             // ahora es INTEGER (ID numérico)
            description,
            phone,                   // teléfono de la empresa
            email,                   // email de la empresa
            address,
            city,
            website,
            image_url,
            service_type,            // "basic", "featured", "premium"
            plan_type,               // alias usado por el frontend
            contact_name,            // "Admin" — nombre del contacto
            contact_email,           // "admin@hepta.com.py" — email del contacto
            contact_phone,           // "+595 985 605737" — teléfono del contacto
            user_id
        } = req.body;

        // ── VALIDACIÓN ──
        if (!contact_name || !contact_email) {
            return res.status(400).json({
                success: false,
                error: 'contact_name y contact_email son obligatorios'
            });
        }

        // ── SERVICE TYPE ──
        const validServices = ['basic', 'featured', 'premium'];
        const srvType = validServices.includes(service_type) ? service_type
            : validServices.includes(plan_type) ? plan_type
            : 'basic';

        // ── CATEGORY ID → INTEGER ──
        let catId = null;
        let catSlug = null;
        const rawCat = category_id || '';
        if (rawCat) {
            const parsed = parseInt(rawCat);
            if (!isNaN(parsed)) {
                catId = parsed;
                // Opcional: buscar slug para referencia
                try {
                    const c = await pool.query('SELECT slug FROM categories WHERE id = $1', [catId]);
                    if (c.rows[0]) catSlug = c.rows[0].slug;
                } catch(e) {}
            } else {
                // Es un slug, buscar el ID
                catSlug = rawCat;
                try {
                    const c = await pool.query('SELECT id FROM categories WHERE slug = $1 LIMIT 1', [rawCat]);
                    if (c.rows[0]) catId = c.rows[0].id;
                } catch(e) {}
            }
        }

        // ── CONSTRUIR JSON DE NOTES (TODOS los campos de empresa) ──
        const empresa = name || business_name || '';
        const notesData = {
            // Identificación
            name: empresa,
            business_name: empresa,
            company_name: empresa,

            // Fiscal
            ruc: ruc || '',

            // Categoría
            category_id: catId,
            category: catId,
            category_slug: catSlug,

            // Descripción
            description: description || '',
            descripcion: description || '',

            // Contacto de empresa (NO el contacto que registró)
            phone: phone || '',
            business_phone: phone || '',
            company_phone: phone || '',
            telefono: phone || '',
            email: email || '',
            business_email: email || '',
            company_email: email || '',
            email_empresa: email || '',

            // Ubicación
            address: address || '',
            direccion: address || '',
            dirección: address || '',
            street: address || '',
            city: city || '',
            ciudad: city || '',

            // Web
            website: website || '',
            web: website || '',
            site: website || '',

            // Imagen
            image_url: image_url || '',
            imageUrl: image_url || '',
            image: image_url || '',

            // Metadata
            user_id: user_id || null,
            source: 'web_registration',
            registered_at: new Date().toISOString()
        };

        // ── INSERT ──
        const result = await pool.query(`
            INSERT INTO service_leads (
                business_name,
                contact_name,
                contact_email,
                contact_phone,
                service_type,
                status,
                notes,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *
        `, [
            empresa,                    // business_name (columna)
            contact_name,               // contact_name (columna)
            contact_email,              // contact_email (columna)
            contact_phone || '',        // contact_phone (columna)
            srvType,                    // service_type (columna)
            JSON.stringify(notesData)   // notes (JSON completo)
        ]);

        res.json({
            success: true,
            data: result.rows[0],
            message: 'Empresa registrada correctamente'
        });

    } catch (err) {
        console.error('Error POST /admin/leads:', err);
        res.status(500).json({ success: false, error: err.message || 'Error interno' });
    }
});
// ============================================
// NEGOCIOS - Frontend compatible
// ============================================
router.get('/businesses', async (req, res) => {
  try {
    const { page = 1, limit = 20, plan, verified, q, category, city } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Ordenamiento (whitelist → evita inyección). Default: más nuevas primero.
    const SORTS = {
      name: 'b.name', city: 'b.city', plan: 'b.plan_type', verified: 'b.verified',
      rating: 'b.rating', reviews: 'b.review_count', likes: 'like_count',
      views_30d: 'views_30d', wa_30d: 'wa_30d', created: 'b.created_at',
    };
    const sortKey = SORTS[String(req.query.sort)] ? String(req.query.sort) : 'created';
    const sortDir = String(req.query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const orderExpr = `${SORTS[sortKey]} ${sortDir} NULLS LAST, b.id DESC`;

    const where = ['1=1'];
    const params = [];
    let paramIdx = 1;

    if (q) {
      where.push(`(b.name ILIKE $${paramIdx} OR b.email ILIKE $${paramIdx} OR b.phone ILIKE $${paramIdx} OR b.ruc ILIKE $${paramIdx})`);
      params.push(`%${q}%`); paramIdx++;
    }
    if (city) { where.push(`unaccent(b.city) ILIKE unaccent($${paramIdx})`); params.push(`%${city}%`); paramIdx++; }
    if (category) {
      // Si la categoría tiene hijos (es padre), incluir empresas en cualquiera de los hijos
      where.push(`EXISTS (
        SELECT 1 FROM business_categories bc2
        JOIN categories cc ON cc.id = bc2.category_id
        WHERE bc2.business_id = b.id
          AND (cc.id = $${paramIdx} OR cc.parent_id = $${paramIdx})
      )`);
      params.push(parseInt(category)); paramIdx++;
    }
    if (plan) { where.push(`b.plan_type = $${paramIdx++}`); params.push(plan); }
    if (verified !== undefined && verified !== '') { where.push(`b.verified = $${paramIdx++}`); params.push(verified === 'true'); }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM businesses b LEFT JOIN categories c ON b.category_id = c.id ${whereSql}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const dataSql = `
      SELECT b.id, b.name, b.slug, b.ruc, b.email, b.phone, b.address, b.city, b.website,
             b.description, b.verified, b.plan_type, b.rating, b.review_count,
             COALESCE(b.like_count, 0) as like_count,
             b.hours, b.tags, b.lat, b.lng, b.logo_emoji, b.image_url, b.cover_url, b.created_at,
             (SELECT pg.expires_at FROM plan_grants pg
                WHERE pg.business_id = b.id AND pg.reason = 'founder'
                  AND pg.reverted_at IS NULL AND pg.expires_at > NOW()
                ORDER BY pg.expires_at DESC LIMIT 1) AS founder_expires_at,
             c.id as category_id, c.name as category_name, c.color as category_color, c.bg_color as category_bg,
             (SELECT COUNT(*) FROM business_views v
                WHERE v.business_id = b.id AND v.viewed_at >= NOW() - INTERVAL '30 days')::int AS views_30d,
             (SELECT COUNT(*) FROM business_clicks cl
                WHERE cl.business_id = b.id AND cl.click_type='whatsapp' AND cl.clicked_at >= NOW() - INTERVAL '30 days')::int AS wa_30d,
             (
               SELECT COALESCE(json_agg(json_build_object(
                   'id', cx.id, 'slug', cx.slug, 'name', cx.name,
                   'isPrimary', bcx.is_primary, 'position', bcx.position
               ) ORDER BY bcx.is_primary DESC, bcx.position), '[]'::json)
               FROM business_categories bcx
               JOIN categories cx ON cx.id = bcx.category_id
               WHERE bcx.business_id = b.id
             ) AS categories
      FROM businesses b
      LEFT JOIN categories c ON b.category_id = c.id
      ${whereSql}
      ORDER BY ${orderExpr}
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(parseInt(limit), offset);

    const result = await pool.query(dataSql, params);
    res.json({ success: true, data: result.rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    console.error('[Admin] Businesses error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /admin/businesses/uncategorized ── Empresas sin categoría ────────────
router.get('/businesses/uncategorized', async (req, res) => {
  try {
    const { q, city, limit = 50, offset = 0 } = req.query;
    let where = `b.is_active = TRUE AND (b.category_id IS NULL
        OR b.category_id NOT IN (SELECT id FROM categories WHERE parent_id IS NOT NULL))`;
    const params = [];
    let idx = 1;
    if (q) { where += ` AND (b.name ILIKE $${idx} OR b.trade_name ILIKE $${idx} OR COALESCE(b.tags::text,'') ILIKE $${idx})`; params.push(`%${q}%`); idx++; }
    if (city) { where += ` AND b.city ILIKE $${idx}`; params.push(`%${city}%`); idx++; }

    const result = await pool.query(`
      SELECT b.id, b.name, b.trade_name, b.slug, b.city, b.department,
             b.phone, b.email, b.tags, b.description, b.plan_type,
             b.category_id, c.name AS current_category
      FROM businesses b
      LEFT JOIN categories c ON c.id = b.category_id
      WHERE ${where}
      ORDER BY b.name ASC
      LIMIT $${idx} OFFSET $${idx+1}
    `, [...params, parseInt(limit), parseInt(offset)]);

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM businesses b WHERE ${where}`, params
    );

    res.json({ success: true, data: result.rows, total: parseInt(countRes.rows[0].count) });
  } catch(err) { console.error('[uncategorized]', err.message, err.stack); res.status(500).json({ success: false, error: err.message }); }
});


// ── POST /admin/businesses/bulk-category ── Asignar categoría en bulk ────────
router.post('/businesses/bulk-category', async (req, res) => {
  try {
    const { business_ids, category_id } = req.body;
    if (!Array.isArray(business_ids) || !business_ids.length)
      return res.status(400).json({ success: false, error: 'business_ids requerido' });
    if (!category_id)
      return res.status(400).json({ success: false, error: 'category_id requerido' });

    // Verificar que la categoría existe (padre o hijo)
    const catCheck = await pool.query(
      'SELECT id, name, parent_id FROM categories WHERE id=$1', [category_id]
    );
    if (!catCheck.rows.length)
      return res.status(404).json({ success: false, error: 'Categoría no encontrada' });

    const ids = business_ids.map(n => parseInt(n)).filter(Number.isFinite);
    await pool.query(
      `UPDATE businesses SET category_id=$1, updated_at=NOW() WHERE id = ANY($2::int[])`,
      [category_id, ids]
    );

    // Sincronizar en business_categories también
    for (const bizId of ids) {
      await pool.query(`
        INSERT INTO business_categories (business_id, category_id, is_primary, position)
        VALUES ($1, $2, TRUE, 0)
        ON CONFLICT (business_id, category_id) DO UPDATE SET is_primary=TRUE
      `, [bizId, category_id]).catch(()=>{});
    }

    // Invalidar cache
    try { await redisClient.del('dir:categories:all'); } catch(e) {}

    res.json({ success: true, updated: ids.length, category: catCheck.rows[0].name });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});


router.get('/businesses/:id', async (req, res) => {
  try {
    const bizResult = await pool.query(
      `SELECT b.*, c.name as category_name,
              (SELECT COUNT(*) FROM business_views v
                 WHERE v.business_id = b.id AND v.viewed_at >= NOW() - INTERVAL '30 days')::int AS views_30d,
              (SELECT COUNT(*) FROM business_clicks cl
                 WHERE cl.business_id = b.id AND cl.click_type='whatsapp' AND cl.clicked_at >= NOW() - INTERVAL '30 days')::int AS wa_30d,
              (SELECT pg.expires_at FROM plan_grants pg
                 WHERE pg.business_id = b.id AND pg.reason = 'founder'
                   AND pg.reverted_at IS NULL AND pg.expires_at > NOW()
                 ORDER BY pg.expires_at DESC LIMIT 1) AS founder_expires_at,
              (
                SELECT COALESCE(json_agg(json_build_object(
                    'id', cx.id, 'slug', cx.slug, 'name', cx.name,
                    'isPrimary', bcx.is_primary, 'position', bcx.position
                ) ORDER BY bcx.is_primary DESC, bcx.position), '[]'::json)
                FROM business_categories bcx
                JOIN categories cx ON cx.id = bcx.category_id
                WHERE bcx.business_id = b.id
              ) AS categories
       FROM businesses b LEFT JOIN categories c ON b.category_id = c.id
       WHERE b.id = $1`,
      [req.params.id]
    );
    if (bizResult.rowCount === 0) return res.status(404).json({ success: false, error: 'Business not found' });
    const business = bizResult.rows[0];
    const reviewsResult = await pool.query(
      `SELECT id, rating, comment, author_name as "authorName", created_at as "createdAt" FROM reviews WHERE business_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    const ownersResult = await pool.query(
      `SELECT ub.user_id, ub.is_owner, ub.can_edit, ub.notes, ub.delegated_at,
              u.id, u.name, u.email, u.role
       FROM user_businesses ub
       JOIN users u ON ub.user_id = u.id
       WHERE ub.business_id = $1
       ORDER BY ub.is_owner DESC, ub.delegated_at`,
      [req.params.id]
    );
    business.reviews = reviewsResult.rows;
    business.owners = ownersResult.rows;
    res.json({ success: true, data: business });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /businesses/bulk-import ─────────────────────────────────────────────
// Helper: formatear RUC paraguayo (801522943 → 80152294-3)
function formatRUC(ruc) {
  if (!ruc) return ruc;
  const clean = String(ruc).trim().replace(/[^0-9]/g, '');
  if (clean.length < 2) return ruc;
  return clean.slice(0, -1) + '-' + clean.slice(-1);
}
router.post('/businesses/bulk-import', async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0)
      return res.status(400).json({ success: false, error: 'records[] es requerido' });
    if (records.length > 200)
      return res.status(400).json({ success: false, error: 'Máximo 200 registros por lote' });

    let inserted = 0, updated = 0, deduped = 0, review = 0, skipped = 0, errors = 0;

    // UPDATE común (COALESCE: no borra con vacíos). NUNCA cambia el slug → preserva la URL.
    const UPD = `UPDATE businesses SET
                 name=$1, trade_name=COALESCE($2, trade_name), phone=COALESCE($3, phone),
                 email=COALESCE($4, email), website=COALESCE($5, website), address=COALESCE($6, address),
                 city=COALESCE($7, city), department=COALESCE($8, department),
                 category_id=COALESCE($9, category_id), plan_type=$10, verified=$11, updated_at=NOW()
               WHERE id=$12`;

    for (const r of records) {
      try {
        const { ruc: rawRuc, name, slug, trade_name, phone, email, website, address,
                category_id, city, department, plan_type, verified, is_active, source, duplicate_mode } = r;
        if (!name || !slug) { errors++; continue; }
        const ruc = rawRuc ? formatRUC(rawRuc) : null;

        // Normalizar vacíos a null
        const v = x => (x === undefined || x === null || String(x).trim() === '') ? null : String(x).trim();
        const tradeName = v(trade_name), ph = v(phone), em = v(email), web = v(website), addr = v(address), src = v(source);

        const finalSlug = slug;
        const cityN = v(city);
        const isUpdate = duplicate_mode === 'update';
        const updParams = (id) => [name, tradeName, ph, em, web, addr, cityN, v(department),
                                   category_id || null, plan_type || 'basic', verified || false, id];

        // 1) Match por SLUG exacto (comportamiento previo).
        const bySlug = await pool.query('SELECT id FROM businesses WHERE slug=$1', [slug]);
        if (bySlug.rows.length > 0) {
          if (isUpdate) { await pool.query(UPD, updParams(bySlug.rows[0].id)); updated++; }
          else skipped++;
          continue;
        }

        // 2) Dedupe "mismo negocio": RUC + ciudad (o nombre + ciudad si no hay RUC).
        //    Evita crear un DUPLICADO cuando el nombre/slug cambió pero es la misma empresa
        //    (ej. "S.R.L." → "Sociedad de Responsabilidad Limitada"). Actualiza el existente
        //    conservando su slug/URL. Si hay 2+ coincidencias → no toca (queda para revisión).
        let dup = { rows: [] };
        if (ruc && cityN)  dup = await pool.query('SELECT id FROM businesses WHERE ruc=$1 AND unaccent(lower(city))=unaccent(lower($2))', [ruc, cityN]);
        else if (ruc)      dup = await pool.query('SELECT id FROM businesses WHERE ruc=$1', [ruc]);
        else if (cityN)    dup = await pool.query('SELECT id FROM businesses WHERE unaccent(lower(name))=unaccent(lower($1)) AND unaccent(lower(city))=unaccent(lower($2))', [name, cityN]);

        if (dup.rows.length === 1) {
          if (isUpdate) { await pool.query(UPD, updParams(dup.rows[0].id)); updated++; }
          else skipped++;
          deduped++;
          continue;
        }
        if (dup.rows.length > 1) { review++; continue; }  // ambiguo → no crear duplicado

        // 3) Sin match → negocio realmente nuevo.
        await pool.query(
          `INSERT INTO businesses
             (ruc, ruc_parent, name, trade_name, slug, phone, email, website, address,
              category_id, city, department, plan_type, verified, is_active, source, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())`,
          [ruc, ruc, name, tradeName, finalSlug, ph, em, web, addr,
           category_id||null, cityN, v(department), plan_type||'basic',
           verified||false, is_active!==false, src]
        );
        inserted++;
      } catch(e) {
        errors++;
      }
    }

    // Invalidar caches relevantes
    try {
      const keys = await redisClient.keys('dir:*');
      if (keys.length) await redisClient.del(keys);
    } catch(e) {}

    res.json({ success: true, inserted, updated, deduped, review, skipped, errors });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /businesses/:id/owners ── Ver propietarios ───────────────────────
router.get('/businesses/:id/owners', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT ub.id, ub.user_id, ub.is_owner, ub.can_edit, ub.delegated_at, ub.notes,
                   u.name, u.email, u.role
            FROM user_businesses ub
            JOIN users u ON u.id = ub.user_id
            WHERE ub.business_id = $1
            ORDER BY ub.is_owner DESC, ub.delegated_at
        `, [req.params.id]);
        res.json({ success: true, data: result.rows });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /businesses/:id/delegate ── Delegar empresa a usuario ────────────
router.post('/businesses/:id/delegate', async (req, res) => {
    try {
        const { user_id, is_owner = false, can_edit = true, notes } = req.body;
        if (!user_id) return res.status(400).json({ success: false, error: 'user_id requerido' });

        const bizId = parseInt(req.params.id);

        // Verificar que el usuario existe
        const user = await pool.query('SELECT id, name, email, role FROM users WHERE id=$1', [user_id]);
        if (!user.rows.length) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

        // Insertar o actualizar relación
        await pool.query(`
            INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit, delegated_at, delegated_by, notes)
            VALUES ($1, $2, $3, $4, NOW(), $5, $6)
            ON CONFLICT (user_id, business_id) DO UPDATE SET
                is_owner = EXCLUDED.is_owner,
                can_edit = EXCLUDED.can_edit,
                delegated_at = NOW(),
                delegated_by = EXCLUDED.delegated_by,
                notes = EXCLUDED.notes
        `, [user_id, bizId, is_owner, can_edit, req.user?.id || null, notes || null]);

        // Si es dueño, actualizar role a 'client' si era 'user'
        if (is_owner) {
            await pool.query(
                "UPDATE users SET role='client' WHERE id=$1 AND role='user'",
                [user_id]
            );
        }

        res.json({ success: true, user: user.rows[0] });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE /businesses/:id/delegate/:userId ── Revocar acceso ─────────────
router.delete('/businesses/:id/delegate/:userId', async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM user_businesses WHERE business_id=$1 AND user_id=$2',
            [parseInt(req.params.id), parseInt(req.params.userId)]
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// D7.5 — Al verificar una empresa (transición NO-verificada → verificada) se
// manda la plantilla 'verified' al dueño y se registra en Logs de correos.
// Fire & forget; idempotente (solo en la transición, no re-envía si ya estaba).
async function notifyBusinessVerified(businessId) {
  try {
    const q = await pool.query(`
      SELECT b.id, b.name, b.trade_name, b.slug, b.email AS biz_email,
             (SELECT u.email FROM user_businesses ub JOIN users u ON u.id=ub.user_id WHERE ub.business_id=b.id AND ub.is_owner=TRUE AND COALESCE(u.email,'')<>'' LIMIT 1) AS owner_email,
             (SELECT u.name  FROM user_businesses ub JOIN users u ON u.id=ub.user_id WHERE ub.business_id=b.id AND ub.is_owner=TRUE LIMIT 1) AS owner_name
      FROM businesses b WHERE b.id=$1`, [businessId]);
    const b = q.rows[0]; if (!b) return;
    const to = b.owner_email || b.biz_email;
    if (!to) { console.log(`[verified email] biz ${businessId} sin email de destino`); return; }
    const cfg = await getSiteConfigAll();
    const siteName = cfg.site_name || 'RetoPA';
    const siteUrl  = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
    const { sendEmail } = require('../config/mail');
    const r = await sendEmail(to, 'verified', {
      name: b.owner_name || '', businessName: b.trade_name || b.name,
      businessUrl: `${siteUrl}/negocio/${b.slug}`, panelUrl: `${siteUrl}/cliente`,
      siteName, siteUrl,
    });
    // El log de email_log ya lo hace sendEmail() de forma centralizada (type='verified').
  } catch (e) { console.error('[notifyBusinessVerified]', e.message); }
}

// ── PATCH /businesses/:id/verify ── Solo cambia verified ─────────────────
router.patch('/businesses/:id/verify', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const v = req.body.verified === true || req.body.verified === 'true';
    // Solo actualiza si cambia el estado (RETURNING para saber si hubo transición).
    const upd = await pool.query(
      'UPDATE businesses SET verified=$1, updated_at=NOW() WHERE id=$2 AND verified IS DISTINCT FROM $1 RETURNING id',
      [v, id]
    );
    try { await redisClient.del(`dir:biz:*`); const keys = await redisClient.keys('dir:*'); if (keys.length) await redisClient.del(keys); } catch(e) {}
    if (upd.rowCount && v) notifyBusinessVerified(id); // fire & forget: solo en la transición a verificada
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/businesses/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, trade_name, description, email, phone, whatsapp, address, city, category_id, category_ids, plan_type, website, ruc, hours, hours_json, tags, lat, lng, verified, image_url, cover_url,
            social_instagram, social_facebook, social_tiktok, social_linkedin, social_twitter, social_youtube } = req.body;

    // Determinar set de categorías solicitado (si se pasó algo)
    let catIds = null; // null = no tocar
    if (Array.isArray(category_ids)) {
      catIds = category_ids.map(n => parseInt(n)).filter(Number.isFinite);
      catIds = Array.from(new Set(catIds));
    } else if (category_id !== undefined) {
      catIds = category_id ? [parseInt(category_id)] : [];
    }

    // Si se redefine, validar tope contra el plan efectivo (el que viene en body, o el actual)
    if (catIds !== null) {
      const planRow = plan_type
        ? { plan_type }
        : (await client.query('SELECT plan_type FROM businesses WHERE id=$1', [req.params.id])).rows[0] || { plan_type: 'basic' };
      const limits = await getPlanLimits(planRow.plan_type);
      if (catIds.length > limits.max_categories) {
        return res.status(400).json({
          success: false,
          error: `El plan ${planRow.plan_type} permite hasta ${limits.max_categories} categoría(s); enviaste ${catIds.length}`,
          code: 'CATEGORY_LIMIT_EXCEEDED'
        });
      }
    }

    // ¿Venía sin verificar? (para disparar el email solo en la transición)
    const prevVerified = (await client.query('SELECT verified FROM businesses WHERE id=$1', [req.params.id])).rows[0]?.verified === true;

    await client.query('BEGIN');

    // Primaria visible (sincroniza businesses.category_id)
    const primaryCatId = catIds !== null
      ? (catIds.length ? catIds[0] : null)
      : (category_id !== undefined ? (category_id || null) : undefined);

    const result = await client.query(
      `UPDATE businesses
       SET name=$1, description=$2, email=$3, phone=$4, address=$5, city=$6,
           category_id = CASE WHEN $7::boolean THEN $8::int ELSE category_id END,
           plan_type=$9, website=$10, ruc=$11, hours=$12, tags=$13,
           hours_json = CASE WHEN $28::text IS NOT NULL THEN $28::jsonb ELSE hours_json END,
           lat=$14, lng=$15, verified=$16,
           trade_name = COALESCE($20::text, trade_name),
           whatsapp = COALESCE($21::text, whatsapp),
           image_url = CASE WHEN $18::text IS NOT NULL THEN $18::text ELSE image_url END,
           cover_url = CASE WHEN $19::text IS NOT NULL THEN $19::text ELSE cover_url END,
           social_instagram = $22, social_facebook = $23, social_tiktok = $24,
           social_linkedin  = $25, social_twitter  = $26, social_youtube = $27,
           updated_at = NOW()
       WHERE id=$17 RETURNING *`,
      [
        name, description, email, phone, address, city,
        primaryCatId !== undefined,
        primaryCatId === undefined ? null : primaryCatId,
        plan_type, website, ruc, hours, tags, lat, lng, verified,
        req.params.id,
        image_url || null, cover_url || null,
        trade_name || null, whatsapp || null,
        social_instagram || null, social_facebook || null, social_tiktok || null,
        social_linkedin  || null, social_twitter  || null, social_youtube || null,
        hours_json ? JSON.stringify(hours_json) : null
      ]
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    // Re-poblar pivot si vino set de categorías
    if (catIds !== null) {
      await client.query('DELETE FROM business_categories WHERE business_id = $1', [req.params.id]);
      for (let i = 0; i < catIds.length; i++) {
        await client.query(
          `INSERT INTO business_categories (business_id, category_id, is_primary, position)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (business_id, category_id) DO NOTHING`,
          [req.params.id, catIds[i], i === 0, i]
        );
      }
    }

    await client.query('COMMIT');

    // Invalidar cache Redis para que el frontend público vea los cambios
    await invalidateBusinessCache(result.rows[0].slug);
    try { await redisClient.del('dir:categories:all'); } catch(e) {}

    // D7.5 — si esta edición verificó la empresa (false → true), avisar+loguear.
    if (result.rows[0].verified === true && !prevVerified) notifyBusinessVerified(parseInt(req.params.id));

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch(_) {}
    console.error('[Admin] PUT /businesses error:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

router.post('/businesses/:id/verify', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const prev = await pool.query('SELECT verified FROM businesses WHERE id=$1', [id]);
    if (!prev.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    const wasVerified = prev.rows[0].verified === true;
    const result = await pool.query('UPDATE businesses SET verified=true, updated_at=NOW() WHERE id=$1 RETURNING *', [id]);
    if (!wasVerified) notifyBusinessVerified(id); // solo si venía sin verificar
    res.json({ success: true, data: result.rows[0], message: 'Negocio verificado' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/businesses/:id/unverify', async (req, res) => {
  try {
    const result = await pool.query('UPDATE businesses SET verified=false, updated_at=NOW() WHERE id=$1 RETURNING *', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result.rows[0], message: 'Verificación removida' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/businesses/:id/plan', async (req, res) => {
  try {
    const { plan } = req.body;
    const result = await pool.query('UPDATE businesses SET plan_type=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [plan, req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result.rows[0], message: `Plan actualizado a "${plan}"` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /businesses ── Crear empresa desde el admin ─────────────────────────
router.post('/businesses', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      name, trade_name, description, email, phone, whatsapp, address, city, department,
      category_id, category_ids, plan_type = 'basic', website, ruc, hours, tags,
      lat, lng, verified = false, image_url, cover_url,
      social_instagram, social_facebook, social_tiktok, social_linkedin, social_twitter, social_youtube
    } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'El nombre es requerido' });

    // Slug único
    const baseSlug = name.trim().toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
    let slug = baseSlug;
    let suffix = 0;
    while (true) {
      const check = await client.query('SELECT id FROM businesses WHERE slug=$1', [slug]);
      if (check.rows.length === 0) break;
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO businesses
         (name, trade_name, slug, description, email, phone, whatsapp, address, city, department,
          category_id, plan_type, website, ruc, hours, tags, lat, lng, verified,
          image_url, cover_url, is_active,
          social_instagram, social_facebook, social_tiktok, social_linkedin, social_twitter, social_youtube)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,TRUE,$22,$23,$24,$25,$26,$27)
       RETURNING *`,
      [
        name.trim(), trade_name || null, slug, description || null,
        email || null, phone || null, whatsapp || null,
        address || null, city || null, department || null,
        category_id ? parseInt(category_id) : null,
        plan_type, website || null, ruc || null, hours || null,
        tags && tags.length ? tags : null,
        lat ? parseFloat(lat) : null, lng ? parseFloat(lng) : null,
        verified === true || verified === 'true',
        image_url || null, cover_url || null,
        social_instagram || null, social_facebook || null, social_tiktok || null,
        social_linkedin || null, social_twitter || null, social_youtube || null
      ]
    );

    const biz = result.rows[0];

    // Pivot de categorías
    const catIds = Array.isArray(category_ids) && category_ids.length
      ? category_ids.map(n => parseInt(n)).filter(Number.isFinite)
      : category_id ? [parseInt(category_id)] : [];

    for (let i = 0; i < catIds.length; i++) {
      await client.query(
        `INSERT INTO business_categories (business_id, category_id, is_primary, position)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [biz.id, catIds[i], i === 0, i]
      );
    }

    // Si tiene lat/lng, actualizar geometry
    if (biz.lat && biz.lng) {
      await client.query(
        `UPDATE businesses SET location = ST_MakePoint($1,$2)::geography WHERE id=$3`,
        [biz.lng, biz.lat, biz.id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: biz, message: 'Empresa creada correctamente' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});

router.delete('/businesses/:id', async (req, res) => {
  try {
    // Eliminar dependencias antes de borrar la empresa
    await pool.query('DELETE FROM reviews WHERE business_id=$1', [req.params.id]);
    await pool.query('DELETE FROM service_leads WHERE business_id=$1', [req.params.id]);
    await pool.query('DELETE FROM user_businesses WHERE business_id=$1', [req.params.id]);
    const result = await pool.query('DELETE FROM businesses WHERE id=$1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, message: 'Empresa eliminada correctamente' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// USUARIOS
// ============================================
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 25, q, role, is_active, inactive_days } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    // Filtros (sobre columnas de u) → sirven para el count y para la data.
    const conds = ['1=1']; const params = []; let idx = 1;
    if (q)    { conds.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx})`); params.push(`%${q}%`); idx++; }
    if (role) { conds.push(`u.role = $${idx++}`); params.push(role); }
    if (is_active !== undefined && is_active !== '') { conds.push(`u.is_active = $${idx++}`); params.push(is_active === 'true'); }
    // "Sin acceso": inactivos hace +N días (incluye a los que NUNCA entraron → last_seen NULL).
    const invDays = parseInt(inactive_days, 10);
    if (Number.isFinite(invDays) && invDays > 0) {
      conds.push(`(u.last_seen_at IS NULL OR u.last_seen_at < NOW() - ($${idx} || ' days')::interval)`);
      params.push(String(invDays)); idx++;
    }
    const whereSql = 'WHERE ' + conds.join(' AND ');

    // Count LIMPIO (sin GROUP BY ni subconsultas) → total del listado (con filtros).
    const countRes = await pool.query(`SELECT COUNT(DISTINCT u.id)::int AS n FROM users u ${whereSql}`, params);
    const total = countRes.rows[0].n;

    // KPIs GLOBALES (todos los usuarios, sin importar filtro/página) para las tarjetas.
    const statsRes = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE is_active)::int  AS active,
             COUNT(*) FILTER (WHERE role='client')::int  AS clients,
             COUNT(*) FILTER (WHERE role='admin')::int   AS admins,
             COUNT(*) FILTER (WHERE role='godmode')::int AS godmode
      FROM users`);

    const dataParams = [...params, parseInt(limit), offset];
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.city, u.role, u.is_active, u.created_at, u.last_seen_at,
             COUNT(ub.business_id) as business_count,
             (SELECT b.slug FROM user_businesses ub2 JOIN businesses b ON b.id = ub2.business_id
               WHERE ub2.user_id = u.id AND ub2.is_owner = TRUE ORDER BY ub2.business_id LIMIT 1) AS owned_slug
      FROM users u LEFT JOIN user_businesses ub ON ub.user_id = u.id
      ${whereSql}
      GROUP BY u.id, u.name, u.email, u.phone, u.city, u.role, u.is_active, u.created_at, u.last_seen_at
      ORDER BY u.created_at DESC LIMIT $${idx++} OFFSET $${idx++}
    `, dataParams);
    res.json({ success: true, data: result.rows, stats: statsRes.rows[0], pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total/parseInt(limit)) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /admin/users/bulk-email — Enviar una plantilla a un SEGMENTO ─────────
// Reusa los MISMOS filtros del listado (q, role, is_active, inactive_days) para
// mandar una plantilla (p.ej. 'reactivation') a un lote de usuarios. Respeta un
// COOLDOWN por destinatario+plantilla (no re-manda la misma plantilla al mismo
// email dentro de N días, mirando email_log). Con preview:true solo cuenta.
// Si el usuario tiene ficha propia, la usa para los placeholders ({businessName}).
router.post('/users/bulk-email', async (req, res) => {
  try {
    const { template, q, role, is_active, inactive_days,
            cooldown_days = 7, limit = 500, preview = false } = req.body || {};
    if (!template) return res.status(400).json({ success: false, error: 'template requerido' });

    // Validar que la plantilla exista (evita mandar un lote a la nada).
    const mail = require('../config/mail');
    try { await mail.renderTemplate(template, {}); }
    catch (e) { return res.status(400).json({ success: false, error: `Plantilla "${template}" no reconocida` }); }

    // Filtros IDÉNTICOS a GET /admin/users (mismo segmento que ves en pantalla).
    const base = ['1=1']; const bp = []; let bi = 1;
    if (q)    { base.push(`(u.name ILIKE $${bi} OR u.email ILIKE $${bi})`); bp.push(`%${q}%`); bi++; }
    if (role) { base.push(`u.role = $${bi++}`); bp.push(role); }
    if (is_active !== undefined && is_active !== '') { base.push(`u.is_active = $${bi++}`); bp.push(is_active === true || is_active === 'true'); }
    const invDays = parseInt(inactive_days, 10);
    if (Number.isFinite(invDays) && invDays > 0) {
      base.push(`(u.last_seen_at IS NULL OR u.last_seen_at < NOW() - ($${bi} || ' days')::interval)`);
      bp.push(String(invDays)); bi++;
    }
    base.push('u.email IS NOT NULL');
    const baseWhere = 'WHERE ' + base.join(' AND ');

    // Coincidencias del segmento (sin cooldown).
    const matched = (await pool.query(`SELECT COUNT(*)::int AS n FROM users u ${baseWhere}`, bp)).rows[0].n;

    // Cooldown por destinatario+plantilla (email_log.type = nombre de plantilla).
    const cd = Math.max(parseInt(cooldown_days, 10) || 0, 0);
    let eligWhere = baseWhere; const eligParams = [...bp]; let ci = bi;
    if (cd > 0) {
      eligWhere += ` AND NOT EXISTS (SELECT 1 FROM email_log el WHERE el.to_email = u.email
                       AND el.type = $${ci} AND el.status='sent'
                       AND el.created_at > NOW() - ($${ci + 1} || ' days')::interval)`;
      eligParams.push(template, String(cd)); ci += 2;
    }
    const eligible = (await pool.query(`SELECT COUNT(*)::int AS n FROM users u ${eligWhere}`, eligParams)).rows[0].n;
    const skipped_cooldown = Math.max(matched - eligible, 0);

    const cap = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 2000);
    const would_send = Math.min(eligible, cap);

    // Filas del lote (owned_slug/name para los placeholders). Nunca-vistos primero.
    const dataSql = `
      SELECT u.id, u.name, u.email,
             (SELECT b.slug FROM user_businesses ub JOIN businesses b ON b.id = ub.business_id
               WHERE ub.user_id = u.id AND ub.is_owner = TRUE ORDER BY ub.business_id LIMIT 1) AS owned_slug,
             (SELECT COALESCE(b.trade_name, b.name) FROM user_businesses ub JOIN businesses b ON b.id = ub.business_id
               WHERE ub.user_id = u.id AND ub.is_owner = TRUE ORDER BY ub.business_id LIMIT 1) AS owned_name
      FROM users u ${eligWhere}
      ORDER BY u.last_seen_at ASC NULLS FIRST, u.created_at ASC
      LIMIT $${ci}`;

    if (preview) {
      const sample = (await pool.query(dataSql, [...eligParams, 5])).rows;
      return res.json({ success: true, preview: true, matched, eligible, skipped_cooldown, would_send, cooldown_days: cd, sample });
    }

    // Envío real (rate-limit ~3/s). sendEmail loguea cada uno en email_log.
    const rows = (await pool.query(dataSql, [...eligParams, cap])).rows;
    const cfg = await getSiteConfigAll();
    const siteName = cfg.site_name || 'RetoPA';
    const siteUrl  = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
    let sent = 0, failed = 0; const errors = [];
    for (const u of rows) {
      const data = {
        name: u.name || '', businessName: u.owned_name || 'Tu empresa',
        siteName, siteUrl, panelUrl: `${siteUrl}/cliente`,
        businessUrl: u.owned_slug ? `${siteUrl}/negocio/${u.owned_slug}` : siteUrl,
      };
      try { const r = await mail.sendEmail(u.email, template, data); if (r && r.success) sent++; else { failed++; errors.push({ email: u.email, error: (r && r.error) || 'fallo' }); } }
      catch (e) { failed++; errors.push({ email: u.email, error: e.message }); }
      await new Promise(r => setTimeout(r, 333));
    }
    res.json({ success: true, sent, failed, skipped_cooldown, remaining: Math.max(eligible - sent, 0), cooldown_days: cd, errors: errors.slice(0, 10) });
  } catch (err) {
    console.error('[users/bulk-email]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { name, email, password, phone, role = 'user' } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, error: 'name, email y password son requeridos' });
    if (password.length < 8) return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 8 caracteres' });
    const validRoles = ['user','client','admin','godmode'];
    if (!validRoles.includes(role)) return res.status(400).json({ success: false, error: 'Rol inválido' });
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows.length > 0) return res.status(409).json({ success: false, error: 'El email ya está registrado' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, phone, role, is_active) VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id, email, name, role, created_at',
      [email.toLowerCase(), hash, name, phone||null, role]
    );
    res.json({ success: true, data: result.rows[0], message: 'Usuario creado correctamente' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    const result = await pool.query('UPDATE users SET role=$1, updated_at=NOW() WHERE id=$2 RETURNING id, name, email, role', [role, req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result.rows[0], message: `Rol actualizado` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Empresas asignadas a un usuario
router.get('/users/:id/businesses', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.id, b.name, b.trade_name, b.slug, b.plan_type, b.verified, b.city,
             ub.is_owner, ub.can_edit, ub.delegated_at
      FROM user_businesses ub
      JOIN businesses b ON b.id = ub.business_id
      WHERE ub.user_id = $1
      ORDER BY ub.is_owner DESC, b.name ASC
    `, [req.params.id]);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Desafectar una empresa de un usuario
router.delete('/users/:id/businesses/:bizId', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM user_businesses WHERE user_id=$1 AND business_id=$2 RETURNING business_id',
      [req.params.id, req.params.bizId]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Relación no encontrada' });
    res.json({ success: true, message: 'Empresa desafectada del usuario' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/users/:id/status', async (req, res) => {
  try {
    const isActive = req.body.is_active !== undefined ? req.body.is_active : req.body.active;
    const result = await pool.query('UPDATE users SET is_active=$1, updated_at=NOW() WHERE id=$2 RETURNING id, name, email, is_active', [isActive, req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result.rows[0], message: `Usuario ${isActive ? 'activado' : 'desactivado'}` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    // Desvincular empresas del usuario antes de eliminar
    await pool.query('DELETE FROM user_businesses WHERE user_id=$1', [req.params.id]);
    const result = await pool.query('DELETE FROM users WHERE id=$1 RETURNING id, name, email', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, message: `Usuario "${result.rows[0].name || result.rows[0].email}" eliminado correctamente` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// CATEGORIAS
// ============================================
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, p.name AS parent_name, p.slug AS parent_slug,
             (SELECT COUNT(*) FROM business_categories bc WHERE bc.category_id = c.id) AS real_count
      FROM categories c
      LEFT JOIN categories p ON p.id = c.parent_id
      ORDER BY
        COALESCE(p.display_order, c.display_order) ASC NULLS LAST,
        (c.parent_id IS NOT NULL) ASC,
        c.display_order ASC NULLS LAST,
        c.name ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/categories', async (req, res) => {
  try {
    const { name, slug, icon, color, bg_color, display_order, parent_id } = req.body;
    if (!name || !slug) return res.status(400).json({ success: false, error: 'name y slug son requeridos' });
    // Validar que el padre, si se pasa, no sea a su vez un hijo (solo 2 niveles)
    if (parent_id) {
      const p = await pool.query('SELECT id, parent_id FROM categories WHERE id = $1', [parent_id]);
      if (!p.rows.length) return res.status(400).json({ success: false, error: 'Categoría padre no encontrada' });
      if (p.rows[0].parent_id) return res.status(400).json({ success: false, error: 'La categoría padre no puede ser a su vez una subcategoría (solo 2 niveles)' });
    }
    const result = await pool.query(
      'INSERT INTO categories (name, slug, icon, color, bg_color, display_order, parent_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, slug, icon||null, color||null, bg_color||null, display_order||0, parent_id||null]
    );
    try { await redisClient.del('dir:categories:all'); } catch(e) {}
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, error: 'Ya existe una categoría con ese slug' });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const { name, slug, icon, color, bg_color, display_order, parent_id } = req.body;
    const catId = parseInt(req.params.id);
    // No puede ser padre de sí mismo
    if (parent_id && parseInt(parent_id) === catId) {
      return res.status(400).json({ success: false, error: 'Una categoría no puede ser su propio padre' });
    }
    if (parent_id) {
      const p = await pool.query('SELECT id, parent_id FROM categories WHERE id = $1', [parent_id]);
      if (!p.rows.length) return res.status(400).json({ success: false, error: 'Categoría padre no encontrada' });
      if (p.rows[0].parent_id) return res.status(400).json({ success: false, error: 'La categoría padre no puede ser a su vez una subcategoría (solo 2 niveles)' });
      // Si esta categoría tiene hijos, no puede pasar a ser hija (rompería los 2 niveles)
      const k = await pool.query('SELECT COUNT(*)::int AS n FROM categories WHERE parent_id = $1', [catId]);
      if (k.rows[0].n > 0) return res.status(400).json({ success: false, error: 'Esta categoría tiene subcategorías; quitalas antes de moverla' });
    }
    const result = await pool.query(
      'UPDATE categories SET name=$1, slug=$2, icon=$3, color=$4, bg_color=$5, display_order=$6, parent_id=$7 WHERE id=$8 RETURNING *',
      [name, slug, icon||null, color||null, bg_color||null, display_order||0, parent_id||null, catId]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Not found' });
    try { await redisClient.del('dir:categories:all'); } catch(e) {}
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const catId = parseInt(req.params.id);
    const bizCheck = await pool.query('SELECT COUNT(*) FROM business_categories WHERE category_id=$1', [catId]);
    if (parseInt(bizCheck.rows[0].count) > 0) return res.status(400).json({ success: false, error: `No se puede eliminar: ${bizCheck.rows[0].count} negocios usan esta categoría` });
    const result = await pool.query('DELETE FROM categories WHERE id=$1', [catId]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Not found' });
    try { await redisClient.del('dir:categories:all'); } catch(e) {}
    res.json({ success: true, message: 'Categoría eliminada' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// PLANES — DB-backed, editable desde admin
// ============================================
router.get('/plans', async (req, res) => {
  try {
    const bizCounts = await pool.query(`SELECT plan_type, COUNT(*) as count FROM businesses WHERE is_active = true GROUP BY plan_type`);
    const countMap = {};
    bizCounts.rows.forEach(r => { countMap[r.plan_type || 'basic'] = parseInt(r.count); });

    // Intentar leer de la tabla plans; si no existe aún, devolver hardcoded
    let plans;
    try {
      const result = await pool.query('SELECT * FROM plans WHERE is_active = TRUE ORDER BY display_order ASC');
      plans = result.rows.map(p => ({
        ...p,
        features: Array.isArray(p.features) ? p.features : JSON.parse(p.features || '[]'),
        businesses: countMap[p.id] || 0,
      }));
    } catch(e) {
      // Tabla no existe aún — fallback hardcoded
      plans = [
        { id: 'basic',    name: 'Básico',    subtitle: '', price: 0,      is_featured: false, button_label: 'Registrar gratis', features: ['Perfil básico','1 categoría'], businesses: countMap['basic']    || 0 },
        { id: 'featured', name: 'Destacado', subtitle: '', price: 50000,  is_featured: true,  button_label: 'Empezar ahora',    features: ['Perfil completo','Destacado'],   businesses: countMap['featured'] || 0 },
        { id: 'premium',  name: 'Pro',       subtitle: '', price: 100000, is_featured: false, button_label: 'Contactar ventas', features: ['Todo incluido'],                businesses: countMap['premium']  || 0 },
      ];
    }

    res.json({ success: true, data: plans });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/plans/:id', async (req, res) => {
  try {
    const {
        name, subtitle, price, features, is_featured, button_label, display_order,
        ribbon,
        // Límites operativos
        max_categories, max_gallery, max_social, max_tags,
        has_whatsapp, has_hours, has_gallery, has_map, has_social, has_reviews_reply,
        priority_boost,
    } = req.body;
    const featuresJson = JSON.stringify(Array.isArray(features) ? features : (features||[]).split('\n').map(s=>s.trim()).filter(Boolean));
    const result = await pool.query(
      `UPDATE plans SET
          name=$1, subtitle=$2, price=$3, features=$4, is_featured=$5,
          button_label=$6, display_order=$7,
          max_categories=$8, max_gallery=$9, max_social=$10, max_tags=$11,
          has_whatsapp=$12, has_hours=$13, has_gallery=$14, has_map=$15,
          has_social=$16, has_reviews_reply=$17, priority_boost=$18,
          ribbon=$19,
          updated_at=NOW()
       WHERE id=$20 RETURNING *`,
      [
          name, subtitle||'', parseInt(price)||0, featuresJson,
          is_featured||false, button_label||'', parseInt(display_order)||0,
          parseInt(max_categories)||1, parseInt(max_gallery)||0,
          parseInt(max_social)||0, parseInt(max_tags)||5,
          has_whatsapp !== false, has_hours||false, has_gallery||false,
          has_map||false, has_social||false, has_reviews_reply||false,
          parseInt(priority_boost)||0,
          (ribbon && String(ribbon).trim()) ? String(ribbon).trim().slice(0,30) : null,
          req.params.id,
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Plan no encontrado' });
    // Invalidar ambos caches
    try { await redisClient.del('dir:plans'); } catch(e) {}
    const { invalidate } = require('../utils/plan-limits');
    invalidate();
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /plans/:id/move — mover un plan a izquierda/derecha (swap display_order con el vecino)
router.put('/plans/:id/move', async (req, res) => {
  const client = await pool.connect();
  try {
    const { direction } = req.body; // 'left' | 'right'
    if (!['left','right'].includes(direction))
      return res.status(400).json({ success: false, error: 'Dirección inválida' });

    await client.query('BEGIN');
    // Traer todos los planes activos ordenados, con display_order normalizado
    const all = (await client.query(
      'SELECT id, display_order FROM plans WHERE is_active = TRUE ORDER BY display_order ASC, id ASC'
    )).rows;
    const idx = all.findIndex(p => p.id === req.params.id);
    if (idx === -1) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Plan no encontrado' }); }

    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= all.length) {
      // Ya está en el extremo, no hay nada que hacer
      await client.query('ROLLBACK');
      return res.json({ success: true, data: all, noop: true });
    }

    // Normalizar órdenes a 1..N por si venían repetidos/nulos, y luego hacer el swap
    const a = all[idx], b = all[swapIdx];
    // Asignar órdenes secuenciales a todos para garantizar consistencia
    for (let i = 0; i < all.length; i++) {
      let order = i + 1;
      if (all[i].id === a.id) order = swapIdx + 1;
      else if (all[i].id === b.id) order = idx + 1;
      await client.query('UPDATE plans SET display_order=$1, updated_at=NOW() WHERE id=$2', [order, all[i].id]);
    }
    await client.query('COMMIT');

    try { await redisClient.del('dir:plans'); } catch(e) {}
    const { invalidate } = require('../utils/plan-limits');
    invalidate();

    const updated = (await pool.query('SELECT * FROM plans WHERE is_active = TRUE ORDER BY display_order ASC')).rows;
    res.json({ success: true, data: updated });
  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ============================================
// CIUDADES - Frontend compatible (department directo, no department_id)
// ============================================
router.get('/cities', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.name, c.slug, c.department, c.lat, c.lng, c.is_active, c.created_at,
             COUNT(b.id) as business_count
      FROM cities c
      LEFT JOIN businesses b ON b.city = c.name
      GROUP BY c.id, c.name, c.slug, c.department, c.lat, c.lng, c.is_active, c.created_at
      ORDER BY c.name
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    try {
      const result = await pool.query('SELECT *, 0 as business_count FROM cities ORDER BY name');
      res.json({ success: true, data: result.rows });
    } catch (err2) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

router.post('/cities', async (req, res) => {
  try {
    const { name, slug, department, lat, lng } = req.body;
    const result = await pool.query(
      'INSERT INTO cities (name, slug, department, lat, lng) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, slug, department, lat, lng]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/cities/:id', async (req, res) => {
  try {
    const { name, slug, department, lat, lng } = req.body;
    const result = await pool.query(
      'UPDATE cities SET name=$1, slug=$2, department=$3, lat=$4, lng=$5, updated_at=NOW() WHERE id=$6 RETURNING *',
      [name, slug, department, lat, lng, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/cities/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM cities WHERE id=$1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, message: 'Ciudad eliminada' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// SITE CONFIG
// ============================================
// ============================================
// SITE CONFIG — tabla key-value en DB
// ============================================
async function getSiteConfigAll() {
  try {
    const result = await pool.query('SELECT key, value FROM site_config');
    const config = {};
    result.rows.forEach(r => { config[r.key] = r.value || ''; });
    // smtp_pass: si está vacío en DB, usar variable de entorno
    if (!config.smtp_pass) config.smtp_pass = process.env.SMTP_PASS || '';
    if (!config.smtp_host) config.smtp_host = process.env.SMTP_HOST || '';
    if (!config.smtp_user) config.smtp_user = process.env.SMTP_USER || '';
    if (!config.smtp_from) config.smtp_from = process.env.SMTP_FROM || config.smtp_user;
    return config;
  } catch (e) {
    return {
      site_name: process.env.SITE_NAME || 'RetoPA',
      site_url: process.env.SITE_URL || '',
      contact_phone: process.env.CONTACT_PHONE || '',
      contact_email: process.env.CONTACT_EMAIL || '',
      smtp_host: process.env.SMTP_HOST || '',
      smtp_port: process.env.SMTP_PORT || '587',
      smtp_secure: process.env.SMTP_SECURE || 'false',
      smtp_user: process.env.SMTP_USER || '',
      smtp_pass: process.env.SMTP_PASS || '',
      smtp_from: process.env.SMTP_FROM || '',
      smtp_from_name: process.env.SMTP_FROM_NAME || 'RetoPA',
      social_facebook: '', social_instagram: '', social_linkedin: '', social_whatsapp: '',
    };
  }
}

router.get('/site-config', async (req, res) => {
  try {
    const config = await getSiteConfigAll();
    // Nunca enviar smtp_pass al frontend
    const safe = { ...config };
    if (safe.smtp_pass) safe.smtp_pass = safe.smtp_pass ? '••••••••' : '';
    res.json({ success: true, data: safe });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/site-config', async (req, res) => {
  try {
    const allowed = [
      'site_name','site_url','contact_phone','contact_email',
      'site_title','site_tagline',
      'social_facebook','social_instagram','social_linkedin','social_whatsapp',
      'whatsapp_url','whatsapp_message','google_maps_key',
      'smtp_host','smtp_port','smtp_secure','smtp_user','smtp_from','smtp_from_name',
      'services_label','services_title','services_desc',
      'logo_url',
      'leads_emails',
      'hero_title','hero_subtitle','hero_description','hero_cta_text','hero_cta_link',
      'hero_bg_from','hero_bg_to',
      'plans_label','plans_title','plans_desc',
      'footer_tagline','footer_copyright',
      'footer_col2_title','footer_col2_links',
      'footer_col3_title','footer_col3_links',
      'footer_col4_title','footer_col4_links',
      'notify_subject','notify_cc','notify_body',
      'section_planes_enabled','section_servicios_enabled','section_promos_enabled',
      'semaforo_verde_visitas','semaforo_verde_busquedas','semaforo_rojo_visitas','semaforo_rojo_busquedas',
      'tpago_link_featured','tpago_link_premium','plan_grace_days','plan_renewal_days',
      'admin_idle_timeout_min','admin_idle_warning_min',
      'achievements_config',
    ];
    const body = req.body;
    // Si smtp_pass no viene vacío ni masked, actualizarlo también
    if (body.smtp_pass && body.smtp_pass !== '••••••••') {
      allowed.push('smtp_pass');
    }
    // D9.4 — permitir todos los umbrales/textos de señales (signal_* / signals_*)
    const isAllowed = (k) => allowed.includes(k) || /^signals?_/.test(k);

    const upserts = Object.entries(body)
      .filter(([k, v]) => isAllowed(k))
      .map(([k, v]) => pool.query(
        `INSERT INTO site_config (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
        [k, v || '']
      ));
    await Promise.all(upserts);

    // Invalidar cache del sitio público
    try { await redisClient.del('dir:site-config'); } catch(e) {}
    res.json({ success: true, message: 'Configuración guardada' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Endpoint público para que el frontend lea nombre, teléfono, redes sociales
// (sin datos SMTP ni contraseñas)
// Montado también en directory.js vía app.js

// ============================================
// EMAIL — test SMTP y envío desde admin
// ============================================
function buildTransport(config) {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: config.smtp_host || process.env.SMTP_HOST,
    port: parseInt(config.smtp_port || process.env.SMTP_PORT || 587),
    secure: (config.smtp_secure || process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: config.smtp_user || process.env.SMTP_USER,
      pass: (config.smtp_pass && config.smtp_pass !== '••••••••')
        ? config.smtp_pass
        : process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
  });
}

router.post('/email/test', async (req, res) => {
  try {
    const config = await getSiteConfigAll();
    const to = req.body.to || config.contact_email || config.smtp_user;
    if (!to) return res.status(400).json({ success: false, error: 'Ingresá un email de destino' });

    const transport = buildTransport(config);
    await transport.verify();

    const fromName = config.smtp_from_name || 'RetoPA';
    const fromAddr = config.smtp_from || config.smtp_user;
    await transport.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to,
      subject: `✅ Test de email — ${fromName}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
          <h2 style="color:#0ea5e9">¡Configuración de email funcionando!</h2>
          <p>Este es un email de prueba enviado desde el panel admin de <strong>${config.site_name || 'RetoPA'}</strong>.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
          <p style="color:#6b7280;font-size:12px">
            Servidor: ${config.smtp_host} : ${config.smtp_port}<br>
            Seguridad: ${config.smtp_secure === 'true' ? 'SSL/TLS' : 'STARTTLS'}<br>
            Usuario: ${config.smtp_user}
          </p>
        </div>
      `,
    });

    // Loguear
    pool.query(
      "INSERT INTO email_log (to_email, subject, type, status) VALUES ($1, $2, 'test', 'sent')",
      [to, `Test de email — ${fromName}`]
    ).catch(() => {});

    res.json({ success: true, message: `Email de prueba enviado a ${to}` });
  } catch (err) {
    console.error('[Email test]', err);
    pool.query(
      "INSERT INTO email_log (to_email, subject, type, status, error) VALUES ($1, 'Test de email', 'test', 'failed', $2)",
      [req.body.to || '', err.message]
    ).catch(() => {});
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /email-log ────────────────────────────────────────────────────────────
router.get('/email-log', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await pool.query(
      'SELECT id, to_email, subject, type, status, error, created_at FROM email_log ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    const counts = await pool.query(
      "SELECT status, COUNT(*) FROM email_log GROUP BY status"
    );
    const stats = {};
    counts.rows.forEach(r => { stats[r.status] = parseInt(r.count); });
    res.json({ success: true, data: result.rows, stats });
  } catch (err) {
    // Si la tabla no existe aún
    res.json({ success: true, data: [], stats: {}, message: 'Ejecutá la migración 007_email_log.sql para activar el log' });
  }
});

router.post('/email/verify', async (req, res) => {
  try {
    const config = await getSiteConfigAll();
    const transport = buildTransport(config);
    await transport.verify();
    res.json({ success: true, message: 'Conexión SMTP verificada correctamente' });
  } catch (err) {
    res.status(500).json({ success: false, error: `Error SMTP: ${err.message}` });
  }
});

// ============================================
// MFA — 2FA por email para admins
// ============================================
router.post('/mfa/send', async (req, res) => {
  try {
    const { user_id, email } = req.body;
    let userResult;
    if (user_id) {
      userResult = await pool.query('SELECT id, name, email FROM users WHERE id=$1 AND is_active=TRUE', [user_id]);
    } else if (email) {
      userResult = await pool.query('SELECT id, name, email FROM users WHERE email=$1 AND is_active=TRUE', [email.toLowerCase()]);
    } else {
      return res.status(400).json({ success: false, error: 'user_id o email requerido' });
    }
    if (!userResult.rows.length) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    const user = userResult.rows[0];

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'UPDATE users SET mfa_otp=$1, mfa_otp_expires=$2 WHERE id=$3',
      [otp, expires, user.id]
    );

    const config = await getSiteConfigAll();
    const transport = buildTransport(config);
    const fromName = config.smtp_from_name || 'RetoPA';
    const fromAddr = config.smtp_from || config.smtp_user;

    await transport.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to: user.email,
      subject: `${otp} — Código de acceso ${fromName}`,
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:16px">
          <div style="text-align:center;margin-bottom:24px">
            <div style="width:56px;height:56px;background:#0ea5e9;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px">
              <span style="font-size:24px">🔐</span>
            </div>
            <h2 style="color:#0f172a;margin:0">Código de verificación</h2>
          </div>
          <p style="color:#64748b;text-align:center">Hola <strong>${user.name}</strong>, tu código de acceso al panel admin es:</p>
          <div style="background:white;border:2px solid #0ea5e9;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
            <span style="font-size:40px;font-weight:900;color:#0f172a;letter-spacing:8px">${otp}</span>
          </div>
          <p style="color:#94a3b8;font-size:12px;text-align:center">
            Válido por 10 minutos. Si no solicitaste este código, ignorá este email.
          </p>
        </div>
      `,
    });

    res.json({ success: true, message: `Código enviado a ${user.email}` });
  } catch (err) {
    console.error('[MFA send]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/mfa/verify', async (req, res) => {
  try {
    const { user_id, otp } = req.body;
    if (!user_id || !otp) return res.status(400).json({ success: false, error: 'user_id y otp requeridos' });

    const result = await pool.query(
      'SELECT mfa_otp, mfa_otp_expires FROM users WHERE id=$1',
      [user_id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    const { mfa_otp, mfa_otp_expires } = result.rows[0];

    if (!mfa_otp || mfa_otp !== otp.trim()) {
      return res.status(401).json({ success: false, error: 'Código incorrecto' });
    }
    if (new Date() > new Date(mfa_otp_expires)) {
      return res.status(401).json({ success: false, error: 'Código expirado. Solicitá uno nuevo.' });
    }

    // Limpiar OTP después de uso exitoso
    await pool.query('UPDATE users SET mfa_otp=NULL, mfa_otp_expires=NULL WHERE id=$1', [user_id]);
    res.json({ success: true, message: 'Código verificado correctamente' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/mfa/toggle', async (req, res) => {
  try {
    const { user_id, email, enabled } = req.body;
    let result;
    if (user_id) {
      result = await pool.query('UPDATE users SET mfa_enabled=$1 WHERE id=$2 RETURNING id, email, mfa_enabled', [enabled, user_id]);
    } else if (email) {
      result = await pool.query('UPDATE users SET mfa_enabled=$1 WHERE email=$2 RETURNING id, email, mfa_enabled', [enabled, email.toLowerCase()]);
    } else {
      return res.status(400).json({ success: false, error: 'Se requiere user_id o email' });
    }
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    res.json({ success: true, message: `2FA ${enabled ? 'activado' : 'desactivado'}`, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ============================================
// SERVICIOS — CRUD (Sprint 6)
// ============================================
router.get('/services', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY display_order ASC, id ASC');
    res.json({ success: true, data: result.rows.map(s => ({ ...s, features: Array.isArray(s.features) ? s.features : JSON.parse(s.features || '[]') })) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/services', async (req, res) => {
  try {
    const { title, description, icon, icon_color, icon_bg, features, display_order, cta_text, cta_url } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, error: 'El título es requerido' });
    const featuresJson = JSON.stringify(Array.isArray(features) ? features : (typeof features === 'string' ? features.split('\n').map(s => s.trim()).filter(Boolean) : []));
    const result = await pool.query(
      `INSERT INTO services (title, description, icon, icon_color, icon_bg, features, display_order, cta_text, cta_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title.trim(), description||null, icon||'fa-star', icon_color||'text-brand-600', icon_bg||'bg-brand-100', featuresJson, parseInt(display_order)||0, cta_text||null, cta_url||null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/services/:id', async (req, res) => {
  try {
    const { title, description, icon, icon_color, icon_bg, features, display_order, is_active, cta_text, cta_url } = req.body;
    const featuresJson = JSON.stringify(Array.isArray(features) ? features : (typeof features === 'string' ? features.split('\n').map(s => s.trim()).filter(Boolean) : []));
    const result = await pool.query(
      `UPDATE services SET title=$1, description=$2, icon=$3, icon_color=$4, icon_bg=$5,
       features=$6, display_order=$7, is_active=$8, cta_text=$9, cta_url=$10, updated_at=NOW() WHERE id=$11 RETURNING *`,
      [title, description||null, icon||'fa-star', icon_color||'text-brand-600', icon_bg||'bg-brand-100',
       featuresJson, parseInt(display_order)||0, is_active !== false, cta_text||null, cta_url||null, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/services/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM services WHERE id=$1 RETURNING title', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, message: `Servicio "${result.rows[0].title}" eliminado` });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /admin/claims — Lista de claims (paginada + filtro + búsqueda) ────────
// Query: ?status=pending|approved|rejected  ?q=texto  ?page=1  ?limit=25
// Devuelve stats GLOBALES (para las tarjetas) independientes del filtro/página.
router.get('/claims', async (req, res) => {
  try {
    const { status, q, page = 1, limit = 25 } = req.query;
    const lim = Math.min(parseInt(limit) || 25, 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * lim;

    const conds = ['b.claim_status IS NOT NULL']; const params = []; let idx = 1;
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      conds.push(`b.claim_status = $${idx++}`); params.push(status);
    }
    if (q && String(q).trim()) {
      conds.push(`(b.name ILIKE $${idx} OR b.trade_name ILIKE $${idx} OR b.email ILIKE $${idx} OR u.name ILIKE $${idx} OR u.email ILIKE $${idx})`);
      params.push(`%${String(q).trim()}%`); idx++;
    }
    const whereSql = 'WHERE ' + conds.join(' AND ');

    // Total del listado (con filtros) + stats GLOBALES (para las tarjetas).
    const [countRes, statsRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM businesses b LEFT JOIN users u ON u.id = b.claimed_by ${whereSql}`, params),
      pool.query(`SELECT COUNT(*)::int AS total,
                         COUNT(*) FILTER (WHERE claim_status='pending')::int  AS pending,
                         COUNT(*) FILTER (WHERE claim_status='approved')::int AS approved,
                         COUNT(*) FILTER (WHERE claim_status='rejected')::int AS rejected
                  FROM businesses WHERE claim_status IS NOT NULL`),
    ]);
    const total = countRes.rows[0].n;

    const result = await pool.query(`
      SELECT b.id, b.name, b.trade_name, b.slug, b.email, b.phone,
             b.city, b.department, b.claim_status, b.claimed_at,
             b.claim_token_at, b.notify_count, b.notified_at,
             u.id AS user_id, u.name AS user_name, u.email AS user_email,
             sl.contact_name  AS lead_contact_name,
             sl.contact_email AS lead_contact_email,
             sl.contact_phone AS lead_contact_phone,
             sl.notes         AS lead_notes
      FROM businesses b
      LEFT JOIN users u ON u.id = b.claimed_by
      LEFT JOIN LATERAL (
        SELECT contact_name, contact_email, contact_phone, notes
        FROM service_leads
        WHERE business_id = b.id AND service_type = 'claim'
        ORDER BY created_at DESC LIMIT 1
      ) sl ON TRUE
      ${whereSql}
      ORDER BY
        CASE b.claim_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        b.claimed_at DESC NULLS LAST
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, lim, offset]);
    // Exponer contacto + mensaje/evidencia del formulario público y el ORIGEN del
    // reclamo: 'cuenta' (flujo por token, hay usuario vinculado) o 'formulario'.
    const data = result.rows.map(r => {
      let message = '', evidence_url = '';
      if (r.lead_notes) { try { const p = JSON.parse(r.lead_notes); message = p.message || ''; evidence_url = p.evidence_url || ''; } catch (e) {} }
      const { lead_notes, ...rest } = r;
      return {
        ...rest,
        origin: r.user_id ? 'cuenta' : 'formulario',
        message, evidence_url,
        contact_name:  r.user_name  || r.lead_contact_name  || null,
        contact_email: r.user_email || r.lead_contact_email || r.email || null,
        contact_phone: r.lead_contact_phone || r.phone || null,
      };
    });
    res.json({
      success: true,
      data,
      stats: statsRes.rows[0],
      pagination: { total, page: parseInt(page) || 1, limit: lim, pages: Math.max(Math.ceil(total / lim), 1) },
    });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /admin/claims/approve ────────────────────────────────────────────────
const { resolveClaimContact, ensureClaimOwner, issueActivationToken } = require('../helpers/claimAccess');

// Envía el email correcto tras provisionar acceso: si la cuenta se creó ahora →
// 'claimActivate' (link para crear contraseña); si ya existía → 'claimApproved'.
async function emailClaimAccess(biz, info, contactName, activationToken) {
  if (!info || !info.email) return;
  const cfg = await getSiteConfigAll();
  const siteName = cfg.site_name || 'RetoPA';
  const siteUrl  = (cfg.site_url  || 'https://retopa.com.py').replace(/\/$/, '');
  const { sendEmail } = require('../config/mail');
  if (info.created && activationToken) {
    await sendEmail(info.email, 'claimActivate', {
      name: contactName || info.name || '', businessName: biz.trade_name || biz.name,
      activateUrl: `${siteUrl}/?reset=${activationToken}`,
      businessUrl: `${siteUrl}/negocio/${biz.slug}`, siteName, siteUrl,
    });
  } else {
    await sendEmail(info.email, 'claimApproved', {
      name: contactName || info.name || '', businessName: biz.trade_name || biz.name,
      businessUrl: `${siteUrl}/negocio/${biz.slug}`, panelUrl: `${siteUrl}/cliente`, siteName, siteUrl,
    });
  }
}

// APROBAR un claim: verifica la ficha Y provisiona el acceso del dueño
// (crea/vincula cuenta + envía activación si es nueva). Todo transaccional.
router.post('/claims/approve', async (req, res) => {
  const { business_id } = req.body;
  if (!business_id) return res.status(400).json({ success: false, error: 'business_id requerido' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(`
      UPDATE businesses SET claim_status='approved', verified=TRUE, updated_at=NOW()
      WHERE id=$1 AND claim_status='pending'
      RETURNING id, name, trade_name, email, slug, city, department
    `, [business_id]);
    if (!upd.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Claim no encontrado o ya procesado' });
    }
    const biz = upd.rows[0];

    // Provisionar dueño: usuario dueño ya vinculado (token) o contacto del lead (formulario)
    const contact = await resolveClaimContact(client, business_id);
    const info = await ensureClaimOwner(client, biz, contact);
    let token = null;
    if (info.created) token = await issueActivationToken(client, info.userId);

    await client.query(
      `UPDATE service_leads SET status='won', updated_at=NOW()
       WHERE business_id=$1 AND service_type='claim' AND status IN ('new','pending')`, [business_id]
    );
    await client.query('COMMIT');

    emailClaimAccess(biz, info, contact.name, token).catch(e => console.warn('[Claim] email acceso:', e.message));
    res.json({ success: true, data: biz, access: { user_id: info.userId, created: info.created, email: info.email } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[claims/approve]', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// DAR / REENVIAR ACCESO a un claim YA APROBADO cuyo dueño no quedó con cuenta
// (p.ej. reclamos por formulario aprobados antes de este flujo). Crea/vincula la
// cuenta y reenvía la activación.
router.post('/claims/grant-access', async (req, res) => {
  const { business_id } = req.body;
  if (!business_id) return res.status(400).json({ success: false, error: 'business_id requerido' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const b = await client.query('SELECT id, name, trade_name, email, slug FROM businesses WHERE id=$1', [business_id]);
    if (!b.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Empresa no encontrada' }); }
    const biz = b.rows[0];
    const contact = await resolveClaimContact(client, business_id);
    if (!contact.email) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, error: 'No hay email de contacto en el reclamo para otorgar acceso' }); }
    const info = await ensureClaimOwner(client, biz, contact);
    let token = null;
    if (info.created) token = await issueActivationToken(client, info.userId);
    await client.query("UPDATE businesses SET claim_status=COALESCE(claim_status,'approved'), verified=TRUE, updated_at=NOW() WHERE id=$1", [business_id]);
    await client.query('COMMIT');

    emailClaimAccess(biz, info, contact.name, token).catch(e => console.warn('[Claim] email acceso (grant):', e.message));
    res.json({ success: true, access: { user_id: info.userId, created: info.created, email: info.email } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[claims/grant-access]', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ── POST /admin/claims/reject ─────────────────────────────────────────────────
router.post('/claims/reject', async (req, res) => {
  const { business_id, reason } = req.body;
  if (!business_id) return res.status(400).json({ success: false, error: 'business_id requerido' });
  try {
    await pool.query(
      `UPDATE businesses SET claim_status='rejected', updated_at=NOW() WHERE id=$1`, [business_id]
    );
    if (reason) {
      await pool.query(
        `UPDATE service_leads SET status='rejected',
         notes=COALESCE(notes,'')||$2, updated_at=NOW()
         WHERE business_id=$1 AND service_type='claim'`,
        [business_id, ` | Rechazo: ${reason}`]
      ).catch(()=>{});
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});


// ── D5.2 — Semáforo de ventas: grilla categoría×ciudad con métricas del mes ──
// Visitas (business_views) + clics WhatsApp (business_clicks) + búsquedas (search_events)
// + fichas totales/reclamadas (claim_status='approved'), y estado 🔴/🟡/🟢 con umbrales
// configurables desde site_config (semaforo_*). Incluye Top de términos del mes.
router.get('/semaforo', async (req, res) => {
  try {
    // Mes objetivo (YYYY-MM). Default: mes actual del servidor.
    const monthParam = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : null;
    const now = new Date();
    const y = monthParam ? +monthParam.slice(0, 4) : now.getFullYear();
    const m = monthParam ? +monthParam.slice(5, 7) : (now.getMonth() + 1);
    const pad = n => String(n).padStart(2, '0');
    const monthStart = `${y}-${pad(m)}-01`;
    const nY = m === 12 ? y + 1 : y, nM = m === 12 ? 1 : m + 1;
    const monthEnd  = `${nY}-${pad(nM)}-01`;
    const pY = m === 1 ? y - 1 : y, pM = m === 1 ? 12 : m - 1;
    const prevStart = `${pY}-${pad(pM)}-01`;
    const prevEnd   = monthStart;

    // Umbrales configurables (site_config.semaforo_*), con defaults.
    const cfg = await getSiteConfigAll();
    const num = (k, d) => { const v = parseInt(cfg[k]); return Number.isFinite(v) ? v : d; };
    const TH = {
      verdeVisitas:   num('semaforo_verde_visitas', 1000),
      verdeBusquedas: num('semaforo_verde_busquedas', 300),
      rojoVisitas:    num('semaforo_rojo_visitas', 300),
      rojoBusquedas:  num('semaforo_rojo_busquedas', 100),
    };

    // Normalizador de ciudad para alinear fuentes (fichas usan b.city; búsquedas, el filtro).
    const norm = s => (s == null ? '' : String(s)).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

    const [fichas, views, clicks, searches, searchesPrev, cats, top] = await Promise.all([
      pool.query(`SELECT b.category_id, b.city,
                         COUNT(*)::int AS fichas,
                         COUNT(*) FILTER (WHERE b.claim_status='approved')::int AS reclamadas
                  FROM businesses b WHERE b.is_active = TRUE
                  GROUP BY b.category_id, b.city`),
      pool.query(`SELECT b.category_id, b.city, COUNT(*)::int AS n
                  FROM business_views v JOIN businesses b ON b.id=v.business_id
                  WHERE v.viewed_at >= $1 AND v.viewed_at < $2
                  GROUP BY b.category_id, b.city`, [monthStart, monthEnd]),
      pool.query(`SELECT b.category_id, b.city, COUNT(*)::int AS n
                  FROM business_clicks c JOIN businesses b ON b.id=c.business_id
                  WHERE c.click_type='whatsapp' AND c.clicked_at >= $1 AND c.clicked_at < $2
                  GROUP BY b.category_id, b.city`, [monthStart, monthEnd]),
      pool.query(`SELECT category_id, city, COUNT(*)::int AS n
                  FROM search_events WHERE created_at >= $1 AND created_at < $2
                  GROUP BY category_id, city`, [monthStart, monthEnd]),
      pool.query(`SELECT category_id, city, COUNT(*)::int AS n
                  FROM search_events WHERE created_at >= $1 AND created_at < $2
                  GROUP BY category_id, city`, [prevStart, prevEnd]),
      pool.query(`SELECT id, name, slug FROM categories`),
      pool.query(`SELECT term, COUNT(*)::int AS n FROM search_events
                  WHERE created_at >= $1 AND created_at < $2 AND term IS NOT NULL AND term <> ''
                  GROUP BY term ORDER BY n DESC, term ASC LIMIT 50`, [monthStart, monthEnd]),
    ]);

    const catMap = new Map();
    cats.rows.forEach(c => catMap.set(c.id, { name: c.name, slug: c.slug }));

    // Merge por clave (category_id | ciudad-normalizada)
    const cells = new Map();
    const keyOf = (catId, city) => (catId == null ? '0' : String(catId)) + '|' + norm(city);
    function cell(catId, cityRaw) {
      const k = keyOf(catId, cityRaw);
      let e = cells.get(k);
      if (!e) {
        const c = catId != null ? catMap.get(catId) : null;
        e = {
          category_id: catId != null ? catId : null,
          category: c ? c.name : 'Sin categoría',
          category_slug: c ? c.slug : null,
          city: (cityRaw && String(cityRaw).trim()) ? String(cityRaw).trim() : 'Sin ciudad',
          fichas: 0, reclamadas: 0, views: 0, whatsapp: 0, searches: 0, searches_prev: 0,
        };
        cells.set(k, e);
      }
      return e;
    }
    // fichas primero → fija la grafía de la ciudad desde businesses
    fichas.rows.forEach(r => { const e = cell(r.category_id, r.city); e.fichas = r.fichas; e.reclamadas = r.reclamadas; });
    views.rows.forEach(r => { cell(r.category_id, r.city).views += r.n; });
    clicks.rows.forEach(r => { cell(r.category_id, r.city).whatsapp += r.n; });
    searches.rows.forEach(r => { cell(r.category_id, r.city).searches += r.n; });
    searchesPrev.rows.forEach(r => { cell(r.category_id, r.city).searches_prev += r.n; });

    // Estado (mixto/literal): 🟢 si visitas>verde (mes actual) O búsquedas>verde 2 meses seguidos;
    // 🔴 si visitas<rojo Y búsquedas<rojo; 🟡 el resto.
    function estado(e) {
      const verde = e.views > TH.verdeVisitas || (e.searches > TH.verdeBusquedas && e.searches_prev > TH.verdeBusquedas);
      if (verde) return 'verde';
      if (e.views < TH.rojoVisitas && e.searches < TH.rojoBusquedas) return 'rojo';
      return 'amarillo';
    }
    let rows = [...cells.values()].map(e => ({ ...e, estado: estado(e) }));
    rows.sort((a, b) => (b.views + b.searches) - (a.views + a.searches) || a.category.localeCompare(b.category));

    const CAP = 2000;
    const truncated = rows.length > CAP;
    if (truncated) rows = rows.slice(0, CAP);

    res.json({
      success: true,
      data: {
        month: `${y}-${pad(m)}`,
        thresholds: TH,
        totals: {
          celdas:   rows.length,
          views:    rows.reduce((s, r) => s + r.views, 0),
          whatsapp: rows.reduce((s, r) => s + r.whatsapp, 0),
          searches: rows.reduce((s, r) => s + r.searches, 0),
          verde:    rows.filter(r => r.estado === 'verde').length,
          amarillo: rows.filter(r => r.estado === 'amarillo').length,
          rojo:     rows.filter(r => r.estado === 'rojo').length,
        },
        rows,
        top_terminos: top.rows.map(t => ({ term: t.term, n: t.n })),
        truncated,
      },
    });
  } catch (e) {
    console.error('[admin/semaforo]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});


// ── D6 — "Destacado Fundador" (grant de plan con vencimiento) ────────────────
// Otorga featured temporal a una ficha básica. Guarda el plan previo para revertir.
// El público ve "Destacado" (plan_type='featured'); el badge "Fundador" es solo admin.
router.post('/businesses/:id/founder', async (req, res) => {
  const client = await pool.connect();
  try {
    const bizId = parseInt(req.params.id);
    if (!Number.isInteger(bizId)) return res.status(400).json({ success: false, error: 'id inválido' });
    let days = parseInt(req.body && req.body.days);
    if (!Number.isFinite(days) || days < 1) days = 90;      // default 90 días
    if (days > 730) days = 730;                              // tope de seguridad (2 años)
    const adminId = (req.user && (req.user.id || req.user.userId)) || null;

    await client.query('BEGIN');
    const bizRes = await client.query('SELECT id, plan_type FROM businesses WHERE id=$1 FOR UPDATE', [bizId]);
    if (!bizRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Empresa no encontrada' }); }
    const prevPlan = bizRes.rows[0].plan_type || 'basic';

    // No pisar un plan pago (featured/premium): el fundador es para fichas básicas.
    if (prevPlan === 'premium' || prevPlan === 'featured') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: `La ficha ya es ${prevPlan}. El Destacado Fundador es para fichas básicas.` });
    }
    // ¿Ya tiene un grant activo? (índice único parcial lo garantiza, pero avisamos lindo)
    const active = await client.query(
      `SELECT id FROM plan_grants WHERE business_id=$1 AND reverted_at IS NULL AND expires_at > NOW()`, [bizId]);
    if (active.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ success: false, error: 'La ficha ya tiene un Destacado Fundador activo.' }); }

    const grant = await client.query(
      `INSERT INTO plan_grants (business_id, plan_type, prev_plan_type, reason, granted_by, expires_at)
       VALUES ($1, 'featured', $2, 'founder', $3, NOW() + ($4 || ' days')::interval)
       RETURNING id, expires_at`,
      [bizId, prevPlan, adminId, String(days)]
    );
    await client.query(`UPDATE businesses SET plan_type='featured', updated_at=NOW() WHERE id=$1`, [bizId]);
    await client.query('COMMIT');
    res.json({ success: true, data: { business_id: bizId, plan_type: 'featured', prev_plan_type: prevPlan, expires_at: grant.rows[0].expires_at, grant_id: grant.rows[0].id } });

    // Avisar al dueño que recibió el Destacado de regalo (fire & forget, no bloquea la respuesta)
    try {
      const expiresLabel = new Date(grant.rows[0].expires_at).toLocaleDateString('es-PY',
        { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Asuncion' });
      notifyOwner(bizId, 'founderGranted', { days, expiresLabel }).catch(() => {});
    } catch (e) { /* nunca romper por el email */ }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    console.error('[admin/founder grant]', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});

// Quitar el Destacado Fundador a mano (revierte al plan previo antes de tiempo).
router.post('/businesses/:id/founder/revoke', async (req, res) => {
  const client = await pool.connect();
  try {
    const bizId = parseInt(req.params.id);
    if (!Number.isInteger(bizId)) return res.status(400).json({ success: false, error: 'id inválido' });
    const adminId = (req.user && (req.user.id || req.user.userId)) || null;

    await client.query('BEGIN');
    const g = await client.query(
      `SELECT id, prev_plan_type FROM plan_grants
       WHERE business_id=$1 AND reason='founder' AND reverted_at IS NULL AND expires_at > NOW()
       ORDER BY expires_at DESC LIMIT 1 FOR UPDATE`, [bizId]);
    if (!g.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'No hay Destacado Fundador activo en esta ficha.' }); }
    const prev = g.rows[0].prev_plan_type || 'basic';

    await client.query(`UPDATE plan_grants SET reverted_at=NOW(), reverted_by=$2 WHERE id=$1`, [g.rows[0].id, adminId]);
    // Solo revertir si sigue en 'featured' (no pisar un upgrade pagado posterior).
    await client.query(`UPDATE businesses SET plan_type=$2, updated_at=NOW() WHERE id=$1 AND plan_type='featured'`, [bizId, prev]);
    await client.query('COMMIT');
    res.json({ success: true, data: { business_id: bizId, reverted_to: prev } });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    console.error('[admin/founder revoke]', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});


// ── D7.3 — Solicitudes de plan (Tpago): listar + confirmar + cancelar ────────
router.get('/plan-requests', async (req, res) => {
  try {
    const status = ['pending','confirmed','cancelled'].includes(req.query.status) ? req.query.status : 'pending';
    const rows = await pool.query(`
      SELECT pr.id, pr.business_id, pr.plan, pr.amount_gs, pr.status, pr.tpago_link, pr.reference_id,
             pr.notes, pr.created_at, pr.confirmed_at,
             b.name, b.trade_name, b.slug, b.plan_type AS current_plan, b.city,
             p.name AS plan_name,
             COALESCE((SELECT email FROM users WHERE id=pr.user_id),
                      (SELECT u.email FROM user_businesses ub JOIN users u ON u.id=ub.user_id
                         WHERE ub.business_id=b.id AND ub.is_owner=TRUE LIMIT 1)) AS owner_email
      FROM plan_requests pr
      JOIN businesses b ON b.id=pr.business_id
      LEFT JOIN plans p ON p.id = pr.plan
      WHERE pr.status=$1 ORDER BY pr.created_at DESC LIMIT 200`, [status]);
    res.json({ success: true, data: rows.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/plan-requests/:id/confirm', async (req, res) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'id inválido' });
    const adminId = (req.user && (req.user.id || req.user.userId)) || null;

    await client.query('BEGIN');
    const prRes = await client.query(`
      SELECT pr.*, b.plan_type AS current_plan, b.name, b.trade_name, b.slug,
             (SELECT email FROM users WHERE id=pr.user_id) AS requester_email,
             (SELECT name  FROM users WHERE id=pr.user_id) AS requester_name,
             (SELECT u.email FROM user_businesses ub JOIN users u ON u.id=ub.user_id WHERE ub.business_id=b.id AND ub.is_owner=TRUE AND COALESCE(u.email,'')<>'' LIMIT 1) AS owner_email,
             (SELECT u.name  FROM user_businesses ub JOIN users u ON u.id=ub.user_id WHERE ub.business_id=b.id AND ub.is_owner=TRUE LIMIT 1) AS owner_name
      FROM plan_requests pr JOIN businesses b ON b.id=pr.business_id
      WHERE pr.id=$1 AND pr.status='pending' FOR UPDATE OF pr`, [id]);
    if (!prRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Solicitud pendiente no encontrada' }); }
    const pr = prRes.rows[0];
    const plan = pr.plan;

    // Grant activo actual (si hay)
    const active = await client.query(
      `SELECT id, reason, plan_type FROM plan_grants WHERE business_id=$1 AND reverted_at IS NULL AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1 FOR UPDATE`,
      [pr.business_id]);
    let newExpiry;
    if (active.rows.length && active.rows[0].reason === 'paid' && active.rows[0].plan_type === plan) {
      // Renovación: extender el mismo grant pago +1 mes (desde el vencimiento vigente o ahora)
      const upd = await client.query(
        `UPDATE plan_grants SET expires_at = GREATEST(expires_at, NOW()) + INTERVAL '1 month', email_sent_at=NULL, reminders_sent='' WHERE id=$1 RETURNING expires_at`,
        [active.rows[0].id]);
      newExpiry = upd.rows[0].expires_at;
    } else {
      // Reemplazar cualquier grant activo (fundador u otro) y crear uno pago nuevo (+1 mes)
      if (active.rows.length) {
        await client.query(`UPDATE plan_grants SET reverted_at=NOW(), reverted_by=$2 WHERE id=$1`, [active.rows[0].id, adminId]);
      }
      const ins = await client.query(
        `INSERT INTO plan_grants (business_id, plan_type, prev_plan_type, reason, granted_by, expires_at)
         VALUES ($1, $2, 'basic', 'paid', $3, NOW() + INTERVAL '1 month') RETURNING expires_at`,
        [pr.business_id, plan, adminId]);
      newExpiry = ins.rows[0].expires_at;
    }

    await client.query(`UPDATE businesses SET plan_type=$2, updated_at=NOW() WHERE id=$1`, [pr.business_id, plan]);
    await client.query(`UPDATE plan_requests SET status='confirmed', confirmed_by=$2, confirmed_at=NOW() WHERE id=$1`, [id, adminId]);
    await client.query('COMMIT');

    // Email de activación (fire & forget)
    (async () => {
      try {
        const cfg = await getSiteConfigAll();
        const siteName = cfg.site_name || 'RetoPA';
        const siteUrl  = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
        const planRow  = await pool.query(`SELECT name FROM plans WHERE id=$1`, [plan]);
        const planLabel = planRow.rows[0]?.name || (plan === 'premium' ? 'Empresa Pro' : 'Negocio Digital');
        const to = pr.requester_email || pr.owner_email;
        if (to) {
          const { sendEmail } = require('../config/mail');
          const venc = new Date(newExpiry).toLocaleDateString('es-PY', { day:'2-digit', month:'long', year:'numeric' });
          await sendEmail(to, 'planActivated', {
            name: pr.requester_name || pr.owner_name || '', businessName: pr.trade_name || pr.name,
            planLabel, expires: venc, siteName, siteUrl, panelUrl: `${siteUrl}/cliente`,
          });
        }
      } catch (e) { console.error('[planActivated email]', e.message); }
    })();

    res.json({ success: true, data: { business_id: pr.business_id, plan, expires_at: newExpiry } });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    console.error('[plan-request confirm]', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});

router.post('/plan-requests/:id/cancel', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'id inválido' });
    const adminId = (req.user && (req.user.id || req.user.userId)) || null;
    const note = (req.body && req.body.notes) ? String(req.body.notes).slice(0, 300) : null;
    const upd = await pool.query(
      `UPDATE plan_requests SET status='cancelled', confirmed_by=$2, confirmed_at=NOW(),
         notes = COALESCE(notes,'') || $3
       WHERE id=$1 AND status='pending' RETURNING id, business_id, plan, user_id`,
      [id, adminId, note ? ` | Cancelada: ${note}` : ' | Cancelada']);
    if (!upd.rows.length) return res.status(404).json({ success: false, error: 'Solicitud pendiente no encontrada' });

    // Email de rechazo al solicitante (fire & forget) — con el motivo cargado
    (async () => {
      try {
        const cfg = await getSiteConfigAll();
        const siteName = cfg.site_name || 'RetoPA';
        const siteUrl  = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
        const info = await pool.query(`
          SELECT b.name, b.trade_name,
                 (SELECT email FROM users WHERE id=$2) AS requester_email,
                 (SELECT name  FROM users WHERE id=$2) AS requester_name,
                 (SELECT u.email FROM user_businesses ub JOIN users u ON u.id=ub.user_id WHERE ub.business_id=b.id AND ub.is_owner=TRUE AND COALESCE(u.email,'')<>'' LIMIT 1) AS owner_email,
                 (SELECT u.name  FROM user_businesses ub JOIN users u ON u.id=ub.user_id WHERE ub.business_id=b.id AND ub.is_owner=TRUE LIMIT 1) AS owner_name
          FROM businesses b WHERE b.id=$1`, [upd.rows[0].business_id, upd.rows[0].user_id]);
        const b = info.rows[0];
        const to = b && (b.requester_email || b.owner_email);
        if (b && to) {
          const planRow = await pool.query(`SELECT name FROM plans WHERE id=$1`, [upd.rows[0].plan]);
          const planLabel = planRow.rows[0]?.name || upd.rows[0].plan;
          const { sendEmail } = require('../config/mail');
          await sendEmail(to, 'planRejected', {
            name: b.requester_name || b.owner_name || '', businessName: b.trade_name || b.name,
            planLabel, reason: note || '', siteName, siteUrl, panelUrl: `${siteUrl}/cliente`,
          });
        }
      } catch (e) { console.error('[planRejected email]', e.message); }
    })();

    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});


module.exports = router;
