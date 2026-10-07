/**
 * RetoPA — routes/admin.prospects.routes.js
 * Cola de contacto a prospectos (fichas sin reclamar con tráfico real).
 *
 * IMPORTANTE: este módulo NO envía nada. Arma el mensaje y el link wa.me;
 * el envío lo hace Steve desde WhatsApp. Acá solo se registra qué salió.
 */

const express = require('express');
const router  = express.Router();
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  host:     process.env.DB_HOST || 'postgres',
  port:     process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || process.env.POSTGRES_DB,
  user:     process.env.DB_USER || process.env.POSTGRES_USER,
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
});

const adminRouter = require('./admin');
router.use(adminRouter.requireRole('admin'));

const SITE = process.env.SITE_URL || 'https://retopa.com.py';

async function cfg(key, def) {
  const { rows } = await pool.query('SELECT value FROM site_config WHERE key=$1', [key]);
  return rows[0]?.value ?? def;
}

// ── GET /resumen ─────────────────────────────────────────────────────────
router.get('/resumen', async (req, res) => {
  try {
    const [cola, embudo] = await Promise.all([
      pool.query('SELECT COUNT(*) AS n, COALESCE(SUM(visitas_30d),0) AS visitas FROM v_prospectos_claim'),
      pool.query('SELECT * FROM v_prospectos_embudo'),
    ]);
    res.json({ success: true, data: { cola: cola.rows[0], embudo: embudo.rows[0] } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── GET /cola?limit=25 ───────────────────────────────────────────────────
// Devuelve la cola priorizada, con el mensaje YA armado y el link wa.me.
//
// El link de reclamo usa /reclamar/?token=<claim_token>. Si la ficha no tiene
// token o ya venció, se genera uno nuevo (30 días). Si tiene uno vigente se
// reutiliza, para no invalidar un mensaje ya enviado.
router.get('/cola', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 25, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const plantilla = await cfg('prospect_msg_claim', '');

    const { rows: tot } = await pool.query('SELECT COUNT(*)::int AS n FROM v_prospectos_claim');

    const { rows } = await pool.query(
      `SELECT * FROM v_prospectos_claim
        ORDER BY visitas_30d DESC, visitas_total DESC, negocio
        LIMIT $1 OFFSET $2`, [limit, offset]);

    for (const r of rows) {
      const vigente = r.claim_token &&
        (!r.claim_expires_at || new Date(r.claim_expires_at) > new Date());
      if (vigente) continue;
      const tok = crypto.randomBytes(32).toString('hex');
      const exp = new Date(); exp.setDate(exp.getDate() + 30);
      await pool.query(
        `UPDATE businesses
            SET claim_token=$1, claim_token_at=NOW(), claim_expires_at=$2, updated_at=NOW()
          WHERE id=$3`, [tok, exp, r.business_id]);
      r.claim_token = tok;
    }

    const data = rows.map(r => {
      const link = `${SITE}/reclamar/?token=${r.claim_token}&utm_source=wa&utm_campaign=claim`;
      const mensaje = plantilla
        .replace(/{negocio}/g,     r.negocio)
        .replace(/{visitas_30d}/g, r.visitas_30d)
        .replace(/{visitas}/g,     r.visitas_total ?? r.visitas_30d)
        .replace(/{ciudad}/g,   r.ciudad || '')
        .replace(/{rubro}/g,    r.rubro || '')
        .replace(/{link}/g,     link);
      const num = String(r.telefono).replace(/\D/g, '').replace(/^0/, '');
      return { ...r, mensaje, link, wa_url: `https://wa.me/595${num}?text=${encodeURIComponent(mensaje)}` };
    });

    res.json({ success: true, data, total: tot[0].n, offset, limit });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── POST /registrar  { business_id, telefono, visitas_30d, mensaje } ─────
// Se llama DESPUÉS de que Steve mandó el mensaje. Solo registra.
router.post('/registrar', async (req, res) => {
  try {
    const { business_id, telefono, visitas_30d, mensaje } = req.body;
    if (!business_id || !telefono)
      return res.status(400).json({ success: false, error: 'Faltan datos' });

    const { rows } = await pool.query(
      `INSERT INTO prospect_outreach
         (business_id, telefono, visitas_30d, mensaje, enviado_por)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [business_id, telefono, visitas_30d || 0, mensaje || null,
       req.user?.email || 'admin']);

    res.json({ success: true, id: rows[0].id });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── POST /estado  { id, estado, notas } ──────────────────────────────────
router.post('/estado', async (req, res) => {
  try {
    const { id, estado, notas } = req.body;
    const validos = ['enviado','respondio','reclamo','no_interesa','invalido'];
    if (!validos.includes(estado))
      return res.status(400).json({ success: false, error: 'Estado inválido' });

    const { rowCount } = await pool.query(
      `UPDATE prospect_outreach
          SET estado=$2, notas=COALESCE($3,notas),
              cerrado_at = CASE WHEN $2::text IN ('reclamo','no_interesa','invalido')
                                THEN NOW() ELSE cerrado_at END
        WHERE id=$1`, [id, estado, notas || null]);

    res.json({ success: true, actualizados: rowCount });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── GET /historial?estado=enviado ────────────────────────────────────────
router.get('/historial', async (req, res) => {
  try {
    const cond = [], p = [];
    if (req.query.estado) { p.push(req.query.estado); cond.push(`p.estado=$${p.length}`); }
    p.push(Math.min(parseInt(req.query.limit) || 50, 200));

    const { rows } = await pool.query(`
      SELECT p.*, b.name AS negocio, b.slug, b.city AS ciudad,
             b.claim_status
      FROM prospect_outreach p
      JOIN businesses b ON b.id = p.business_id
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
      ORDER BY p.enviado_at DESC LIMIT $${p.length}`, p);

    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── GET /plantilla  +  POST /plantilla ───────────────────────────────────
router.get('/plantilla', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM site_config WHERE key IN
         ('prospect_msg_claim','prospect_min_visitas','prospect_cooldown_dias')`);
    res.json({ success: true, data: Object.fromEntries(rows.map(r => [r.key, r.value])) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/plantilla', async (req, res) => {
  try {
    for (const k of ['prospect_msg_claim','prospect_min_visitas','prospect_cooldown_dias']) {
      if (req.body[k] === undefined) continue;
      await pool.query(
        `INSERT INTO site_config (key,value) VALUES ($1,$2)
         ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [k, String(req.body[k])]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
