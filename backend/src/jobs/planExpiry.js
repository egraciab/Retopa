/**
 * RetoPA — jobs/planExpiry.js
 * D7.4 — Ciclo de vida de los planes PAGOS (plan_grants reason='paid').
 * Diario. Ejecutar: docker exec retopa-backend node src/jobs/planExpiry.js
 * Cron sugerido (host):  0 8 * * *   (8am, todos los días)
 *
 * En cada corrida:
 *   1) REVERSIÓN: por cada grant pago vencido + pasada la gracia
 *      (expires_at + plan_grace_days < NOW()), baja la ficha a su plan previo
 *      SIN borrar nada (solo cambia plan_type; categorías/galería/datos quedan
 *      intactos y vuelven al reactivar), marca el grant revertido y manda el
 *      email 'planExpired' (reactivación) con la prueba social.
 *   2) RECORDATORIOS: por cada grant pago activo, manda 'planRenewalReminder'
 *      en los umbrales de plan_renewal_days (por defecto 7/3/0 días), una sola
 *      vez por umbral (rastreado en plan_grants.reminders_sent).
 *
 * Idempotente: reverted_at (reversión) y reminders_sent (recordatorios) evitan
 * repetir. Al renovar, el confirm resetea email_sent_at y reminders_sent.
 *
 * NOTA: los precios salen de la tabla plans; los textos de los emails son
 * editables desde Admin → Plantillas (planRenewalReminder / planExpired).
 */

function whenTextFor(daysLeft) {
    if (daysLeft >= 2)  return `vence en ${daysLeft} días`;
    if (daysLeft === 1) return 'vence mañana';
    if (daysLeft === 0) return 'vence hoy';
    return `venció hace ${Math.abs(daysLeft)} día${Math.abs(daysLeft) === 1 ? '' : 's'}`;
}

async function run(pool, sendEmail) {
    console.log('[PlanExpiry] Iniciando...');

    const cfgRes = await pool.query(
        "SELECT key, value FROM site_config WHERE key IN ('site_name','site_url','plan_grace_days','plan_renewal_days','tpago_link_featured','tpago_link_premium')"
    );
    const cfg = {};
    cfgRes.rows.forEach(r => { cfg[r.key] = r.value; });
    const siteName  = cfg.site_name || 'RetoPA';
    const siteUrl   = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
    const graceDays = Math.max(0, parseInt(cfg.plan_grace_days) || 7);
    const reminderDays = String(cfg.plan_renewal_days || '7,3,0')
        .split(',').map(s => parseInt(s.trim()))
        .filter(n => Number.isFinite(n)).sort((a, b) => b - a);

    let reverted = 0, reminded = 0;

    // ── 1) REVERSIÓN de grants pagos vencidos + pasada la gracia ──────────────
    const expired = await pool.query(`
        SELECT pg.id AS grant_id, pg.business_id, pg.plan_type, pg.prev_plan_type,
               b.name, b.trade_name, b.slug, b.plan_type AS cur_plan, b.email AS biz_email,
               (SELECT u.email FROM user_businesses ub JOIN users u ON u.id=ub.user_id
                  WHERE ub.business_id=b.id AND ub.is_owner=TRUE AND COALESCE(u.email,'')<>'' LIMIT 1) AS owner_email,
               (SELECT u.name  FROM user_businesses ub JOIN users u ON u.id=ub.user_id
                  WHERE ub.business_id=b.id AND ub.is_owner=TRUE LIMIT 1) AS owner_name,
               p.name AS plan_name
        FROM plan_grants pg
        JOIN businesses b ON b.id=pg.business_id
        LEFT JOIN plans p ON p.id = pg.plan_type
        WHERE pg.reason='paid' AND pg.reverted_at IS NULL
          AND pg.expires_at + make_interval(days => $1) < NOW()
    `, [graceDays]);

    console.log(`[PlanExpiry] ${expired.rows.length} grants pagos a revertir (gracia ${graceDays}d)`);
    for (const g of expired.rows) {
        try {
            const prev = g.prev_plan_type || 'basic';
            // Reversión NO destructiva: solo baja el plan_type, y solo si la ficha
            // sigue en el plan otorgado (no pisa un upgrade pago posterior).
            await pool.query(
                `UPDATE businesses SET plan_type=$2, updated_at=NOW() WHERE id=$1 AND plan_type=$3`,
                [g.business_id, prev, g.plan_type]);
            await pool.query(`UPDATE plan_grants SET reverted_at=NOW() WHERE id=$1`, [g.grant_id]);
            reverted++;

            const to = g.owner_email || g.biz_email;
            if (to) {
                const stats = await pool.query(`
                    SELECT
                      (SELECT COUNT(*) FROM business_views  WHERE business_id=$1 AND viewed_at  >= NOW() - INTERVAL '30 days') AS views,
                      (SELECT COUNT(*) FROM business_clicks WHERE business_id=$1 AND click_type='whatsapp' AND clicked_at >= NOW() - INTERVAL '30 days') AS wa
                `, [g.business_id]);
                await sendEmail(to, 'planExpired', {
                    name: g.owner_name || '', businessName: g.trade_name || g.name,
                    planLabel: g.plan_name || g.plan_type,
                    views: parseInt(stats.rows[0].views) || 0,
                    whatsappClicks: parseInt(stats.rows[0].wa) || 0,
                    panelUrl: `${siteUrl}/cliente`, plansUrl: `${siteUrl}/#planes`,
                    siteName, siteUrl,
                });
                await pool.query(`UPDATE plan_grants SET email_sent_at=NOW() WHERE id=$1`, [g.grant_id]);
                await new Promise(r => setTimeout(r, 150));
            }
        } catch (e) { console.error(`[PlanExpiry] revert grant ${g.grant_id}:`, e.message); }
    }

    // ── 2) RECORDATORIOS de renovación (grants pagos activos) ─────────────────
    const active = await pool.query(`
        SELECT pg.id AS grant_id, pg.business_id, pg.plan_type, pg.expires_at, pg.reminders_sent,
               FLOOR(EXTRACT(EPOCH FROM (pg.expires_at - NOW()))/86400.0)::int AS days_left,
               b.name, b.trade_name, b.slug, b.email AS biz_email,
               (SELECT u.email FROM user_businesses ub JOIN users u ON u.id=ub.user_id
                  WHERE ub.business_id=b.id AND ub.is_owner=TRUE AND COALESCE(u.email,'')<>'' LIMIT 1) AS owner_email,
               (SELECT u.name  FROM user_businesses ub JOIN users u ON u.id=ub.user_id
                  WHERE ub.business_id=b.id AND ub.is_owner=TRUE LIMIT 1) AS owner_name,
               p.name AS plan_name, p.price AS plan_price
        FROM plan_grants pg
        JOIN businesses b ON b.id=pg.business_id
        LEFT JOIN plans p ON p.id = pg.plan_type
        WHERE pg.reason='paid' AND pg.reverted_at IS NULL
    `);

    for (const g of active.rows) {
        try {
            const sent = String(g.reminders_sent || '').split(',').map(s => s.trim()).filter(Boolean);
            // Umbrales alcanzados (days_left <= umbral) que aún no se enviaron.
            const due = reminderDays.filter(t => g.days_left <= t && !sent.includes(String(t)));
            if (!due.length) continue;

            const to = g.owner_email || g.biz_email;
            if (to) {
                const link = (cfg[`tpago_link_${g.plan_type}`] || '').trim();
                const venc = new Date(g.expires_at).toLocaleDateString('es-PY', { day:'2-digit', month:'long', year:'numeric' });
                await sendEmail(to, 'planRenewalReminder', {
                    name: g.owner_name || '', businessName: g.trade_name || g.name,
                    planLabel: g.plan_name || g.plan_type,
                    daysLeft: g.days_left, whenText: whenTextFor(g.days_left),
                    amount: (parseInt(g.plan_price) || 0).toLocaleString('es-PY'),
                    expires: venc, tpagoLink: link,
                    panelUrl: `${siteUrl}/cliente`, plansUrl: `${siteUrl}/#planes`,
                    siteName, siteUrl,
                });
                reminded++;
                await new Promise(r => setTimeout(r, 150));
            }
            // Marca TODOS los umbrales alcanzados como enviados (aunque no haya email).
            const merged = Array.from(new Set(sent.concat(due.map(String))));
            await pool.query(`UPDATE plan_grants SET reminders_sent=$2 WHERE id=$1`, [g.grant_id, merged.join(',')]);
        } catch (e) { console.error(`[PlanExpiry] reminder grant ${g.grant_id}:`, e.message); }
    }

    console.log(`[PlanExpiry] ${reverted} revertidos, ${reminded} recordatorios`);
    return { revertedPaid: reverted, reminded, processedActive: active.rows.length };
}

module.exports = { run };

// Ejecución directa (cron): corre vencimiento de pagos Y de fundador.
if (require.main === module) {
    const { Pool } = require('pg');
    const { sendEmail } = require('../config/mail');
    const founder = require('./founderExpiry');
    const pool = new Pool({
        host:     process.env.DB_HOST     || 'postgres',
        port:     process.env.DB_PORT     || 5432,
        database: process.env.DB_NAME     || process.env.POSTGRES_DB,
        user:     process.env.DB_USER     || process.env.POSTGRES_USER,
        password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
    });
    (async () => {
        try {
            await run(pool, sendEmail);
            await founder.run(pool, sendEmail);   // reversión del Destacado Fundador
            await pool.end(); process.exit(0);
        } catch (e) { console.error(e); try { await pool.end(); } catch (_) {} process.exit(1); }
    })();
}
