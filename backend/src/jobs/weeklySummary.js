/**
 * RetoPA — jobs/weeklySummary.js
 * Resumen semanal para dueños — cron: 0 9 * * 1 (lunes 9am PY)
 * Ejecutar: docker exec retopa-backend node src/jobs/weeklySummary.js
 */

const { Pool } = require('pg');
const { sendEmail } = require('../config/mail');

const pool = new Pool({
    host:     process.env.DB_HOST     || 'postgres',
    port:     process.env.DB_PORT     || 5432,
    database: process.env.DB_NAME     || process.env.POSTGRES_DB,
    user:     process.env.DB_USER     || process.env.POSTGRES_USER,
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
});

async function run() {
    console.log('[WeeklySummary] Iniciando...');

    const cfgRes = await pool.query(
        "SELECT key, value FROM site_config WHERE key IN ('site_name','site_url')"
    );
    const cfg = {};
    cfgRes.rows.forEach(r => { cfg[r.key] = r.value; });
    const siteName = cfg.site_name || 'RetoPA';
    const siteUrl  = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
    const now      = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Asuncion' }));
    const weekLabel = `Semana del ${now.toLocaleDateString('es-PY', { day:'2-digit', month:'long', year:'numeric' })}`;

    const owners = await pool.query(`
        SELECT DISTINCT u.id, u.email, u.name AS owner_name,
            b.id AS biz_id, b.name, b.trade_name, b.slug, b.plan_type,
            (CASE WHEN b.verified THEN 35 ELSE 0 END
            + CASE WHEN NULLIF(TRIM(b.email),'') IS NOT NULL THEN 15 ELSE 0 END
            + CASE WHEN NULLIF(TRIM(b.phone),'') IS NOT NULL THEN 15 ELSE 0 END
            + CASE WHEN NULLIF(TRIM(b.website),'') IS NOT NULL THEN 10 ELSE 0 END
            + CASE WHEN NULLIF(TRIM(b.description),'') IS NOT NULL THEN 10 ELSE 0 END
            + CASE WHEN NULLIF(TRIM(b.image_url),'') IS NOT NULL THEN 5 ELSE 0 END
            + CASE WHEN NULLIF(TRIM(b.address),'') IS NOT NULL THEN 5 ELSE 0 END
            + CASE WHEN b.hours_json IS NOT NULL THEN 5 ELSE 0 END) AS qs
        FROM users u
        JOIN user_businesses ub ON ub.user_id=u.id AND ub.is_owner=TRUE
        JOIN businesses b ON b.id=ub.business_id AND b.is_active=TRUE
        WHERE u.email IS NOT NULL AND u.email != ''
    `);

    console.log(`[WeeklySummary] ${owners.rows.length} empresas`);
    let sent = 0;

    for (const row of owners.rows) {
        try {
            const s = await pool.query(`
                SELECT
                  (SELECT COUNT(*) FROM business_views WHERE business_id=$1 AND viewed_at>=NOW()-INTERVAL '7 days') AS views,
                  (SELECT COUNT(*) FROM business_clicks WHERE business_id=$1 AND click_type='whatsapp' AND clicked_at>=NOW()-INTERVAL '7 days') AS wa,
                  (SELECT COUNT(*) FROM reviews WHERE business_id=$1 AND created_at>=NOW()-INTERVAL '7 days') AS rev,
                  (SELECT COUNT(*) FROM business_likes WHERE business_id=$1 AND created_at>=NOW()-INTERVAL '7 days') AS lk
            `, [row.biz_id]);

            const views = parseInt(s.rows[0].views)||0;
            const wa    = parseInt(s.rows[0].wa)||0;
            const rev   = parseInt(s.rows[0].rev)||0;
            const lk    = parseInt(s.rows[0].lk)||0;

            if (views + wa + rev + lk === 0) continue;

            await sendEmail(row.email, 'weeklySummary', {
                ownerName:      row.owner_name,
                businessName:   row.trade_name || row.name,
                businessUrl:    `${siteUrl}/negocio/${row.slug}`,
                panelUrl:       `${siteUrl}/cliente`,
                siteName, siteUrl, weekLabel,
                views, whatsappClicks: wa, reviews: rev, likes: lk,
                qualityScore:   row.qs,
            });
            sent++;
            await new Promise(r => setTimeout(r, 200));
        } catch (e) {
            console.error(`[WeeklySummary] biz ${row.biz_id}:`, e.message);
        }
    }
    console.log(`[WeeklySummary] ${sent} enviados`);
    await pool.end();
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
