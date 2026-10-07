/**
 * RetoPA — jobs/founderExpiry.js
 * D6.3 — Vencimiento del "Destacado Fundador".
 * Diario. Ejecutar: docker exec retopa-backend node src/jobs/founderExpiry.js
 * Cron sugerido (host):  0 8 * * *   (8am, todos los días)
 *
 * Por cada grant de fundador vencido (reverted_at IS NULL y expires_at <= NOW()):
 *   1) revierte la ficha al plan previo — SOLO si sigue en 'featured' (no pisa un
 *      upgrade pagado posterior),
 *   2) marca el grant como revertido,
 *   3) dispara el email de conversión (founderExpiring) al dueño (o al email de la
 *      ficha si no tiene dueño) con la prueba social de lo que generó,
 *   4) marca email_sent_at.
 * Idempotente: al setear reverted_at, la próxima corrida no lo vuelve a tomar.
 */

async function run(pool, sendEmail) {
    console.log('[FounderExpiry] Iniciando...');

    const cfgRes = await pool.query(
        "SELECT key, value FROM site_config WHERE key IN ('site_name','site_url')"
    );
    const cfg = {};
    cfgRes.rows.forEach(r => { cfg[r.key] = r.value; });
    const siteName = cfg.site_name || 'RetoPA';
    const siteUrl  = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');

    const grants = await pool.query(`
        SELECT pg.id AS grant_id, pg.business_id, pg.prev_plan_type,
               b.name, b.trade_name, b.slug, b.plan_type, b.email AS biz_email,
               (SELECT u.email FROM user_businesses ub JOIN users u ON u.id = ub.user_id
                  WHERE ub.business_id = b.id AND ub.is_owner = TRUE AND COALESCE(u.email,'') <> '' LIMIT 1) AS owner_email,
               (SELECT u.name FROM user_businesses ub JOIN users u ON u.id = ub.user_id
                  WHERE ub.business_id = b.id AND ub.is_owner = TRUE LIMIT 1) AS owner_name
        FROM plan_grants pg
        JOIN businesses b ON b.id = pg.business_id
        WHERE pg.reason = 'founder' AND pg.reverted_at IS NULL AND pg.expires_at <= NOW()
    `);

    console.log(`[FounderExpiry] ${grants.rows.length} grants vencidos`);
    let reverted = 0, emailed = 0;

    for (const g of grants.rows) {
        try {
            const prev = g.prev_plan_type || 'basic';
            // 1) Revertir SOLO si sigue en featured (no pisar un upgrade pagado posterior).
            await pool.query(
                `UPDATE businesses SET plan_type = $2, updated_at = NOW() WHERE id = $1 AND plan_type = 'featured'`,
                [g.business_id, prev]
            );
            // 2) Marcar el grant como revertido (aunque no estuviera en featured: el grant venció igual).
            await pool.query(`UPDATE plan_grants SET reverted_at = NOW() WHERE id = $1`, [g.grant_id]);
            reverted++;

            // 3) Email de conversión, si hay a quién.
            const to = g.owner_email || g.biz_email;
            if (to) {
                const stats = await pool.query(`
                    SELECT
                      (SELECT COUNT(*) FROM business_views  WHERE business_id = $1 AND viewed_at  >= NOW() - INTERVAL '30 days') AS views,
                      (SELECT COUNT(*) FROM business_clicks WHERE business_id = $1 AND click_type = 'whatsapp' AND clicked_at >= NOW() - INTERVAL '30 days') AS wa
                `, [g.business_id]);
                const views = parseInt(stats.rows[0].views) || 0;
                const wa    = parseInt(stats.rows[0].wa) || 0;

                await sendEmail(to, 'founderExpiring', {
                    name:           g.owner_name || '',
                    businessName:   g.trade_name || g.name,
                    businessUrl:    `${siteUrl}/negocio/${g.slug}`,
                    panelUrl:       `${siteUrl}/cliente`,
                    plansUrl:       `${siteUrl}/#planes`,
                    siteName, siteUrl,
                    views, whatsappClicks: wa,
                });
                await pool.query(`UPDATE plan_grants SET email_sent_at = NOW() WHERE id = $1`, [g.grant_id]);
                emailed++;
                await new Promise(r => setTimeout(r, 150));
            } else {
                console.log(`[FounderExpiry] grant ${g.grant_id} (biz ${g.business_id}): sin email de destino, revertido sin avisar`);
            }
        } catch (e) {
            console.error(`[FounderExpiry] grant ${g.grant_id}:`, e.message);
        }
    }

    console.log(`[FounderExpiry] ${reverted} revertidos, ${emailed} emails enviados`);
    return { processed: grants.rows.length, reverted, emailed };
}

module.exports = { run };

// Ejecución directa (cron): crea el pool y el mailer reales.
if (require.main === module) {
    const { Pool } = require('pg');
    const { sendEmail } = require('../config/mail');
    const pool = new Pool({
        host:     process.env.DB_HOST     || 'postgres',
        port:     process.env.DB_PORT     || 5432,
        database: process.env.DB_NAME     || process.env.POSTGRES_DB,
        user:     process.env.DB_USER     || process.env.POSTGRES_USER,
        password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
    });
    run(pool, sendEmail)
        .then(async () => { await pool.end(); process.exit(0); })
        .catch(async (e) => { console.error(e); try { await pool.end(); } catch (_) {} process.exit(1); });
}
