/**
 * RetoPA — jobs/prospectDigest.js
 * Resumen diario de prospectos a contactar (fichas sin dueño con tráfico).
 *
 * NO envía nada a los prospectos. Solo te avisa a vos que la cola tiene
 * material, con los mejores de hoy. El contacto lo seguís haciendo a mano
 * desde el panel.
 *
 * Ejecutar:  docker exec retopa-backend node src/jobs/prospectDigest.js
 */

async function run(pool, sendEmail) {
  console.log('[ProspectDigest] Iniciando...');

  const cfgRes = await pool.query(
    `SELECT key, value FROM site_config
      WHERE key IN ('site_name','site_url','prospect_digest_to','prospect_digest_min')`);
  const cfg = {};
  cfgRes.rows.forEach(r => { cfg[r.key] = r.value; });

  const siteName = cfg.site_name || 'RetoPA';
  const siteUrl  = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
  const minimo   = parseInt(cfg.prospect_digest_min || '1', 10);

  const destinos = String(cfg.prospect_digest_to || '')
    .split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);

  if (!destinos.length) {
    console.log('[ProspectDigest] Sin destinatarios (site_config.prospect_digest_to). Nada que hacer.');
    return { enviados: 0, motivo: 'sin_destinatarios' };
  }

  // Cola actual + los mejores de hoy
  const { rows: tot } = await pool.query(
    `SELECT COUNT(*)::int AS n,
            COALESCE(SUM(visitas_30d),0)::int AS visitas_mes
       FROM v_prospectos_claim`);
  const total = tot[0].n;

  if (total < minimo) {
    console.log(`[ProspectDigest] Solo ${total} en cola (mínimo ${minimo}). No se envía.`);
    return { enviados: 0, motivo: 'bajo_minimo', total };
  }

  const { rows: top } = await pool.query(
    `SELECT negocio, ciudad, visitas_total, visitas_30d
       FROM v_prospectos_claim
      ORDER BY visitas_30d DESC, visitas_total DESC
      LIMIT 5`);

  // Cómo viene el embudo
  const { rows: emb } = await pool.query('SELECT * FROM v_prospectos_embudo');
  const e = emb[0] || {};

  const items = top.map(t =>
    `${t.negocio}${t.ciudad ? ` (${t.ciudad})` : ''} — ${t.visitas_30d} visitas este mes, ${t.visitas_total} en total`);

  let enviados = 0;
  for (const to of destinos) {
    try {
      await sendEmail(to, 'prospectDigest', {
        count: total,
        visitasMes: tot[0].visitas_mes,
        items,
        enviados7d:  e.enviados_7d  || 0,
        reclamaron:  e.reclamaron   || 0,
        tasaClaim:   e.tasa_claim_pct ?? 0,
        siteName, siteUrl,
        panelUrl: `${siteUrl}/admin/index.html#prospects`,
      });
      enviados++;
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      console.error(`[ProspectDigest] ${to}:`, err.message);
    }
  }

  console.log(`[ProspectDigest] ${total} en cola, avisado a ${enviados} destinatario(s).`);
  return { enviados, total };
}

module.exports = { run };

// Ejecución directa (cron)
if (require.main === module) {
  const { Pool } = require('pg');
  const { sendEmail } = require('../config/mail');
  const pool = new Pool({
    host: process.env.DB_HOST || 'postgres', port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.POSTGRES_DB,
    user: process.env.DB_USER || process.env.POSTGRES_USER,
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
  });
  (async () => {
    try {
      await run(pool, sendEmail);
      await pool.end(); process.exit(0);
    } catch (e) {
      console.error(e); try { await pool.end(); } catch (_) {} process.exit(1);
    }
  })();
}
