/**
 * RetoPA — routes/admin.enrichment.routes.js
 * Revisión y aprobación de candidatos de enriquecimiento desde el panel admin.
 * Monta en app.js:  app.use('/api/v2/admin/enrichment', adminEnrichmentRoutes);
 */

const express = require('express');
const router  = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST || 'postgres',
  port:     process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || process.env.POSTGRES_DB,
  user:     process.env.DB_USER || process.env.POSTGRES_USER,
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
});

const adminRouter = require('./admin');
router.use(adminRouter.requireRole('admin'));

// ── GET /resumen ─────────────────────────────────────────────────────────
// Cuántos pendientes hay por tramo de confianza, y el impacto en indexación.
router.get('/resumen', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.confianza,
             COUNT(*)                                   AS pendientes,
             COUNT(*) FILTER (WHERE v.cruza_umbral)     AS cruzan_umbral
      FROM enrichment_candidates e
      LEFT JOIN v_revision_diaria v ON v.id = e.id
      WHERE e.estado = 'pendiente'
      GROUP BY e.confianza ORDER BY e.confianza DESC`);

    const { rows: hoy } = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE estado='aplicado' AND aplicado_at > NOW() - INTERVAL '24 hours') AS aplicados_24h,
             COUNT(*) FILTER (WHERE estado='rechazado' AND revisado_at > NOW() - INTERVAL '24 hours') AS rechazados_24h
      FROM enrichment_candidates`);

    res.json({ success: true, data: { tramos: rows, hoy: hoy[0] } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /grupos?confianza=0.70 ───────────────────────────────────────────
// Agrupa por ciudad. Así aprobás "todo Luque" en vez de 200 fichas sueltas.
router.get('/grupos', async (req, res) => {
  try {
    const conf = parseFloat(req.query.confianza || '0.70');
    const { rows } = await pool.query(`
      SELECT COALESCE(NULLIF(TRIM(b.city),''), '(sin ciudad)') AS ciudad,
             COUNT(*) AS total,
             SUBSTRING(e.valor_normalizado FROM 1 FOR 4)       AS prefijo_ejemplo
      FROM enrichment_candidates e
      JOIN businesses b ON b.id = e.business_id
      WHERE e.estado = 'pendiente' AND e.confianza = $1
      GROUP BY 1, 3 ORDER BY total DESC`, [conf]);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /candidatos ──────────────────────────────────────────────────────
// ?confianza=0.70&ciudad=Luque&limit=20&muestra=1
router.get('/candidatos', async (req, res) => {
  try {
    const { confianza, ciudad, limit = 20, muestra } = req.query;
    const cond = [`e.estado = 'pendiente'`];
    const p = [];
    if (confianza) { p.push(parseFloat(confianza)); cond.push(`e.confianza = $${p.length}`); }
    if (ciudad) {
      if (ciudad === '(sin ciudad)') cond.push(`NULLIF(TRIM(b.city),'') IS NULL`);
      else { p.push(ciudad); cond.push(`b.city = $${p.length}`); }
    }
    p.push(Math.min(parseInt(limit) || 20, 100));

    const { rows } = await pool.query(`
      SELECT e.id, e.business_id, b.name AS negocio, b.city AS ciudad,
             b.slug, e.campo, e.valor_actual, e.valor_normalizado AS propuesto,
             e.confianza, e.motivo_rechazo,
             b.phone_extra,
             fn_quality_score(b.*) AS score_actual,
             (fn_quality_score(b.*) < fn_seo_min_score()
              AND fn_quality_score(b.*) + fn_puntos_campo(e.campo) >= fn_seo_min_score())
               AS cruza_umbral
      FROM enrichment_candidates e
      JOIN businesses b ON b.id = e.business_id
      WHERE ${cond.join(' AND ')}
      ORDER BY ${muestra ? 'RANDOM()' : 'cruza_umbral DESC, e.id'}
      LIMIT $${p.length}`, p);

    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /aprobar  { ids: [...] } ────────────────────────────────────────
router.post('/aprobar', async (req, res) => {
  const client = await pool.connect();
  try {
    const ids = (req.body.ids || []).map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ success: false, error: 'Sin ids' });

    await client.query('BEGIN');
    let ok = 0;
    for (const id of ids) {
      const r = await client.query('SELECT fn_aplicar_candidato($1, $2) AS ok',
                                   [id, req.user?.email || req.user?.username || 'admin']);
      if (r.rows[0].ok) ok++;
    }
    await client.query('COMMIT');
    res.json({ success: true, aplicados: ok, de: ids.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: e.message });
  } finally { client.release(); }
});

// ── POST /aprobar-grupo  { confianza, ciudad } ───────────────────────────
// Aprueba un tramo entero. Es el que convierte 3.000 filas en un click.
router.post('/aprobar-grupo', async (req, res) => {
  const client = await pool.connect();
  try {
    const { confianza, ciudad } = req.body;
    if (confianza === undefined) return res.status(400).json({ success: false, error: 'Falta confianza' });

    const cond = [`e.estado = 'pendiente'`, `e.confianza = $1`];
    const p = [parseFloat(confianza)];
    if (ciudad) {
      if (ciudad === '(sin ciudad)') cond.push(`NULLIF(TRIM(b.city),'') IS NULL`);
      else { p.push(ciudad); cond.push(`b.city = $${p.length}`); }
    }

    const { rows } = await client.query(`
      SELECT e.id FROM enrichment_candidates e
      JOIN businesses b ON b.id = e.business_id
      WHERE ${cond.join(' AND ')}`, p);

    await client.query('BEGIN');
    let ok = 0;
    for (const r of rows) {
      const q = await client.query('SELECT fn_aplicar_candidato($1, $2) AS ok',
                                   [r.id, req.user?.email || 'admin']);
      if (q.rows[0].ok) ok++;
    }
    await client.query('COMMIT');
    res.json({ success: true, aplicados: ok, de: rows.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: e.message });
  } finally { client.release(); }
});

// ── POST /rechazar  { ids: [...], motivo } ───────────────────────────────
router.post('/rechazar', async (req, res) => {
  try {
    const ids = (req.body.ids || []).map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ success: false, error: 'Sin ids' });
    const { rowCount } = await pool.query(`
      UPDATE enrichment_candidates
         SET estado='rechazado', motivo_rechazo=$2, revisado_at=NOW(), revisado_por=$3
       WHERE id = ANY($1::bigint[]) AND estado='pendiente'`,
      [ids, req.body.motivo || 'no_corresponde', req.user?.email || 'admin']);
    res.json({ success: true, rechazados: rowCount });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /auditoria — muestreo de lo auto-aplicado ────────────────────────
router.get('/auditoria', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM v_muestreo_auditoria');
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /corridas + POST /revertir/:id ───────────────────────────────────
router.get('/corridas', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*,
             COUNT(e.id) FILTER (WHERE e.estado='aplicado') AS aplicados
      FROM enrichment_runs r
      LEFT JOIN enrichment_candidates e ON e.run_id = r.id
      GROUP BY r.id ORDER BY r.iniciada_at DESC LIMIT 20`);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/revertir/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT fn_revertir_corrida($1) AS revertidos',
                                      [parseInt(req.params.id)]);
    res.json({ success: true, revertidos: rows[0].revertidos });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
