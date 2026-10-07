/**
 * RetoPA — jobs/signalDigest.js
 * D9.5 — Notificación diaria AGRUPADA de oportunidades al embajador.
 * UN solo email por embajador por corrida ("Tenés N oportunidades nuevas"),
 * nunca uno por señal. Plantilla editable (signalDigest) en site_config.
 * Marca notified_at para no reenviar. No notifica al negocio final.
 *
 * Se ejecuta después del job de generación (salesSignals). Export run(pool, sendEmail).
 */
async function run(pool, sendEmail) {
  console.log('[SignalDigest] Iniciando...');
  const cfgRes = await pool.query("SELECT key,value FROM site_config WHERE key IN ('site_name','site_url')");
  const cfg = {}; cfgRes.rows.forEach(r => { cfg[r.key] = r.value; });
  const siteName = cfg.site_name || 'RetoPA';
  const siteUrl  = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');

  // Agrupar señales SIN avisar, activas, con embajador y con email
  const groups = await pool.query(`
    SELECT s.assigned_ambassador_id AS amb_id, u.email AS amb_email,
           COALESCE(NULLIF(TRIM(u.name),''), u.email) AS amb_name,
           COUNT(*)::int AS n,
           (array_agg(COALESCE(NULLIF(TRIM(b.trade_name),''), b.name) ORDER BY s.created_at DESC))[1:5] AS sample
    FROM sales_signals s
    JOIN users u ON u.id = s.assigned_ambassador_id
    JOIN businesses b ON b.id = s.business_id
    WHERE s.notified_at IS NULL
      AND s.status IN ('nueva','vista','contactado')
      AND COALESCE(u.email,'') <> ''
    GROUP BY s.assigned_ambassador_id, u.email, u.name`);

  let notifiedAmbs = 0, notifiedSignals = 0;
  for (const g of groups.rows) {
    try {
      await sendEmail(g.amb_email, 'signalDigest', {
        name: g.amb_name, count: g.n, items: g.sample || [],
        siteName, siteUrl, panelUrl: `${siteUrl}/embajador`,
      });
      const upd = await pool.query(
        `UPDATE sales_signals SET notified_at = NOW()
         WHERE assigned_ambassador_id = $1 AND notified_at IS NULL AND status IN ('nueva','vista','contactado')
         RETURNING id`, [g.amb_id]);
      notifiedAmbs++; notifiedSignals += upd.rowCount;
      await new Promise(r => setTimeout(r, 150));
    } catch (e) { console.error(`[SignalDigest] amb ${g.amb_id}:`, e.message); }
  }

  console.log(`[SignalDigest] ${notifiedAmbs} embajadores, ${notifiedSignals} señales`);
  return { ambassadors: notifiedAmbs, signals: notifiedSignals };
}

module.exports = { run };

if (require.main === module) {
  const { Pool } = require('pg');
  const { sendEmail } = require('../config/mail');
  const pool = new Pool({
    host: process.env.DB_HOST || 'postgres', port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.POSTGRES_DB,
    user: process.env.DB_USER || process.env.POSTGRES_USER,
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
  });
  run(pool, sendEmail).then(async () => { await pool.end(); process.exit(0); })
    .catch(async (e) => { console.error(e); try { await pool.end(); } catch (_) {} process.exit(1); });
}
