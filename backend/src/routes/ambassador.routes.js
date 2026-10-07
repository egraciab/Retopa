/**
 * RetoPA — ambassador.routes.js v2
 *
 * CORRECCIÓN: rutas separadas en dos routers para evitar prefijo duplicado:
 *   ambRouter  → montado en /api/v2/ambassador   (panel embajador)
 *   adminAmbRouter → montado en /api/v2/admin    (cola admin)
 *
 * Rol: usa is_ambassador flag en users, independiente de role.
 * Estados de ficha: draft → pending_review → (approved=NULL | rejected)
 */

const express = require('express');
const jwt     = require('jsonwebtoken');
const pool    = require('../db');
const { buildKitBatchPdf } = require('../utils/kit-pdf');
const { touchLastSeen } = require('../utils/presence');
const { sendEmail } = require('../config/mail');
const JWT_SECRET = process.env.JWT_SECRET;

// Escapa texto para HTML y convierte saltos de línea en <br> (para el cuerpo del mail).
function _htmlBody(text) {
  const esc = String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return esc.replace(/\r\n|\r|\n/g, '<br>');
}
// Validación simple de email.
function _isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim()); }

// ── Middleware de auth ────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'No autorizado' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    // Marcar actividad: los embajadores también cuentan como "conectados"
    touchLastSeen(pool, req.user);
    next();
  }
  catch { res.status(401).json({ success: false, error: 'Token inválido' }); }
}

function requireAdmin(req, res, next) {
  if (!['admin', 'godmode'].includes(req.user?.role))
    return res.status(403).json({ success: false, error: 'Acceso denegado' });
  next();
}

// Permite: role admin/godmode, o is_ambassador=true en DB
async function requireAmbassador(req, res, next) {
  if (['admin', 'godmode'].includes(req.user?.role)) return next();
  try {
    const r = await pool.query(
      'SELECT is_ambassador FROM users WHERE id = $1 AND is_active = TRUE', [req.user.id]
    );
    if (r.rows[0]?.is_ambassador) return next();
    res.status(403).json({ success: false, error: 'No tenés acceso al Panel Embajador' });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ════════════════════════════════════════════════════════════════════
// ROUTER EMBAJADOR  →  /api/v2/ambassador/...
// ════════════════════════════════════════════════════════════════════
const ambRouter = express.Router();

// ── GET /maps-key — API key de Google Maps para el panel embajador ───────
ambRouter.get('/maps-key', requireAuth, requireAmbassador, async (req, res) => {
  try {
    const r = await pool.query(`SELECT value FROM site_config WHERE key='google_maps_key' LIMIT 1`);
    res.json({ success: true, key: r.rows[0]?.value || null });
  } catch(err) {
    res.json({ success: false, key: null });
  }
});

// ── GET /me — métricas del embajador ────────────────────────────────────
ambRouter.get('/me', requireAuth, requireAmbassador, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id, u.name, u.email, u.phone,
        COUNT(ab.id)                                                           AS total_cargadas,
        COUNT(ab.id) FILTER (WHERE b.data_status IS NULL AND b.is_active)     AS total_publicadas,
        COUNT(ab.id) FILTER (WHERE b.data_status = 'pending_review')          AS total_pendientes,
        COUNT(ab.id) FILTER (WHERE b.data_status = 'rejected')                AS total_rechazadas,
        COUNT(ab.id) FILTER (WHERE b.data_status = 'draft')                   AS total_borradores,
        COUNT(ab.id) FILTER (WHERE b.verified = TRUE)                         AS total_verificadas
      FROM users u
      LEFT JOIN ambassador_businesses ab ON ab.ambassador_id = u.id
      LEFT JOIN businesses b ON b.id = ab.business_id
      WHERE u.id = $1
      GROUP BY u.id
    `, [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    res.json({ success: true, data: result.rows[0] });
  } catch(err) {
    console.error('[Ambassador] GET /me:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /businesses — fichas del embajador ───────────────────────────────
ambRouter.get('/businesses', requireAuth, requireAmbassador, async (req, res) => {
  try {
    const ambassadorId = ['admin','godmode'].includes(req.user.role) && req.query.ambassador_id
      ? parseInt(req.query.ambassador_id)
      : req.user.id;

    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where  = ['ab.ambassador_id = $1'];
    const params = [ambassadorId];
    let idx = 2;

    if (status === 'pending')   { where.push(`b.data_status = $${idx++}`); params.push('pending_review'); }
    else if (status === 'draft')     { where.push(`b.data_status = $${idx++}`); params.push('draft'); }
    else if (status === 'published') { where.push(`b.data_status IS NULL AND b.is_active = TRUE`); }
    else if (status === 'rejected')  { where.push(`b.data_status = $${idx++}`); params.push('rejected'); }

    const total = (await pool.query(
      `SELECT COUNT(*) FROM ambassador_businesses ab
       JOIN businesses b ON b.id = ab.business_id WHERE ${where.join(' AND ')}`, params
    )).rows[0].count;

    const rows = (await pool.query(`
      SELECT b.id, b.name, b.trade_name, b.slug, b.ruc, b.city,
             b.phone, b.whatsapp, b.email, b.website,
             b.description, b.address,
             b.image_url, b.logo_emoji,
             b.lat, b.lng,
             b.verified, b.data_status, b.review_note,
             b.social_instagram, b.social_facebook, b.social_tiktok,
             b.social_linkedin, b.social_twitter, b.social_youtube,
             b.created_at, b.updated_at,
             ab.assignment_type,
             (SELECT COUNT(*) FROM business_views v
                WHERE v.business_id = b.id AND v.viewed_at >= NOW() - INTERVAL '30 days')::int AS views_30d,
             (SELECT COUNT(*) FROM business_clicks cl
                WHERE cl.business_id = b.id AND cl.click_type='whatsapp' AND cl.clicked_at >= NOW() - INTERVAL '30 days')::int AS wa_30d,
             (SELECT name FROM categories c
                JOIN business_categories bc ON bc.category_id = c.id
               WHERE bc.business_id = b.id AND bc.is_primary = TRUE LIMIT 1) AS category_name,
             (SELECT id FROM categories c
                JOIN business_categories bc ON bc.category_id = c.id
               WHERE bc.business_id = b.id AND bc.is_primary = TRUE LIMIT 1) AS category_id
      FROM ambassador_businesses ab
      JOIN businesses b ON b.id = ab.business_id
      WHERE ${where.join(' AND ')}
      ORDER BY b.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit), offset])).rows;

    res.json({
      success: true, data: rows,
      pagination: { total: parseInt(total), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(parseInt(total)/parseInt(limit)) }
    });
  } catch(err) {
    console.error('[Ambassador] GET /businesses:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /businesses — guardar como borrador ─────────────────────────────
ambRouter.post('/businesses', requireAuth, requireAmbassador, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      trade_name, name, ruc, description,
      phone, whatsapp, email, website,
      address, city, category_id, lat, lng,
      social_instagram, social_facebook, social_tiktok,
      social_linkedin, social_twitter, social_youtube,
      submit = false  // si true → pending_review; si false → draft
    } = req.body;

    if (!trade_name?.trim())
      return res.status(400).json({ success: false, error: 'El nombre comercial es requerido' });

    const slugBase = trade_name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const existing = (await client.query(`SELECT COUNT(*) FROM businesses WHERE slug LIKE $1`, [`${slugBase}%`])).rows[0].count;
    const slug = parseInt(existing) > 0 ? `${slugBase}-${Date.now()}` : slugBase;

    const dataStatus = submit ? 'pending_review' : 'draft';

    const bizResult = await client.query(`
      INSERT INTO businesses (
        trade_name, name, ruc, slug, description,
        phone, whatsapp, email, website,
        address, city, lat, lng,
        social_instagram, social_facebook, social_tiktok,
        social_linkedin, social_twitter, social_youtube,
        data_status, verified, is_active, source,
        created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
        $14,$15,$16,$17,$18,$19,
        $20, false, false, 'ambassador', NOW(), NOW()
      ) RETURNING id, slug
    `, [
      trade_name.trim(), (name?.trim()) || trade_name.trim(), ruc?.trim()||null, slug,
      description?.trim()||null, phone?.trim()||null, whatsapp?.trim()||null,
      email?.trim()||null, website?.trim()||null, address?.trim()||null, city||null,
      lat ? parseFloat(lat) : null, lng ? parseFloat(lng) : null,
      social_instagram||null, social_facebook||null, social_tiktok||null,
      social_linkedin||null, social_twitter||null, social_youtube||null,
      dataStatus
    ]);

    const bizId = bizResult.rows[0].id;

    if (category_id) {
      await client.query(
        `INSERT INTO business_categories (business_id, category_id, is_primary, position)
         VALUES ($1,$2,true,0)
         ON CONFLICT (business_id, category_id) DO UPDATE SET is_primary=TRUE, position=0`,
        [bizId, parseInt(category_id)]
      );
      await client.query(`UPDATE businesses SET category_id=$1 WHERE id=$2`, [parseInt(category_id), bizId]);
    }

    if (lat && lng) {
      await client.query(
        `UPDATE businesses SET location=ST_SetSRID(ST_MakePoint($1,$2),4326)::geography WHERE id=$3`,
        [parseFloat(lng), parseFloat(lat), bizId]
      );
    }

    await client.query(
      `INSERT INTO ambassador_businesses (ambassador_id, business_id)
       VALUES ($1,$2) ON CONFLICT (business_id) DO NOTHING`, [req.user.id, bizId]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: { id: bizId, slug: bizResult.rows[0].slug, data_status: dataStatus } });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('[Ambassador] POST /businesses:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});

// ── PUT /businesses/:id — editar ficha propia (draft o rejected) ──────────
ambRouter.put('/businesses/:id', requireAuth, requireAmbassador, async (req, res) => {
  try {
    const bizId = parseInt(req.params.id);
    if (!['admin','godmode'].includes(req.user.role)) {
      const own = await pool.query(
        `SELECT b.data_status FROM ambassador_businesses ab
         JOIN businesses b ON b.id=ab.business_id
         WHERE ab.business_id=$1 AND ab.ambassador_id=$2`, [bizId, req.user.id]
      );
      if (!own.rows.length) return res.status(403).json({ success: false, error: 'No tenés permiso' });
      if (own.rows[0].data_status === null)
        return res.status(403).json({ success: false, error: 'La ficha ya está publicada. Contactá al administrador.' });
    }

    const {
      trade_name, name, ruc, description, phone, whatsapp, email, website,
      address, city, category_id, lat, lng,
      social_instagram, social_facebook, social_tiktok,
      social_linkedin, social_twitter, social_youtube,
      submit = false
    } = req.body;

    const newStatus = submit ? 'pending_review' : undefined; // undefined = no cambia

    await pool.query(`
      UPDATE businesses SET
        trade_name=$1, name=COALESCE($2,name), ruc=$3, description=$4,
        phone=$5, whatsapp=$6, email=$7, website=$8,
        address=$9, city=$10, lat=$11, lng=$12,
        social_instagram=$13, social_facebook=$14, social_tiktok=$15,
        social_linkedin=$16, social_twitter=$17, social_youtube=$18,
        ${newStatus ? `data_status='pending_review', review_note=NULL,` : ''}
        updated_at=NOW()
      WHERE id=$19
    `, [
      trade_name?.trim()||null, name?.trim()||null, ruc?.trim()||null,
      description?.trim()||null, phone?.trim()||null, whatsapp?.trim()||null,
      email?.trim()||null, website?.trim()||null, address?.trim()||null,
      city||null, lat?parseFloat(lat):null, lng?parseFloat(lng):null,
      social_instagram||null, social_facebook||null, social_tiktok||null,
      social_linkedin||null, social_twitter||null, social_youtube||null,
      bizId
    ]);

    if (category_id) {
      // Eliminar la categoría primaria anterior y poner la nueva
      // Evita violar uq_bc_primary (único is_primary por business_id)
      await pool.query(
        `DELETE FROM business_categories WHERE business_id=$1 AND is_primary=TRUE`,
        [bizId]
      );
      await pool.query(
        `INSERT INTO business_categories (business_id, category_id, is_primary, position)
         VALUES ($1,$2,true,0)
         ON CONFLICT (business_id, category_id) DO UPDATE SET is_primary=TRUE, position=0`,
        [bizId, parseInt(category_id)]
      );
      await pool.query(`UPDATE businesses SET category_id=$1 WHERE id=$2`, [parseInt(category_id), bizId]);
    }
    if (lat && lng)
      await pool.query(
        `UPDATE businesses SET location=ST_SetSRID(ST_MakePoint($1,$2),4326)::geography WHERE id=$3`,
        [parseFloat(lng), parseFloat(lat), bizId]
      );

    res.json({ success: true });
  } catch(err) {
    console.error('[Ambassador] PUT /businesses/:id:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /businesses/submit-batch — enviar lote a revisión ───────────────
ambRouter.post('/businesses/submit-batch', requireAuth, requireAmbassador, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ success: false, error: 'Indicá al menos una ficha' });

    const check = await pool.query(
      `SELECT b.id FROM ambassador_businesses ab
       JOIN businesses b ON b.id=ab.business_id
       WHERE ab.ambassador_id=$1 AND b.id=ANY($2::int[])
         AND b.data_status IN ('draft','rejected')`,
      [req.user.id, ids]
    );
    const validIds = check.rows.map(r => r.id);
    if (!validIds.length)
      return res.status(400).json({ success: false, error: 'No hay fichas válidas para enviar' });

    await pool.query(
      `UPDATE businesses SET data_status='pending_review', review_note=NULL, is_active=FALSE, updated_at=NOW()
       WHERE id=ANY($1::int[])`, [validIds]
    );
    res.json({ success: true, sent: validIds.length });
  } catch(err) {
    console.error('[Ambassador] submit-batch:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /businesses/:id/archive — archivar ficha rechazada ──────────────
ambRouter.post('/businesses/:id/archive', requireAuth, requireAmbassador, async (req, res) => {
  try {
    const bizId = parseInt(req.params.id);
    const check = await pool.query(
      `SELECT b.data_status FROM ambassador_businesses ab
       JOIN businesses b ON b.id=ab.business_id
       WHERE ab.business_id=$1 AND ab.ambassador_id=$2`,
      [bizId, req.user.id]
    );
    if (!check.rows.length)
      return res.status(403).json({ success: false, error: 'No tenés permiso' });
    if (check.rows[0].data_status !== 'rejected')
      return res.status(400).json({ success: false, error: 'Solo se pueden archivar fichas rechazadas' });

    await pool.query(
      `UPDATE businesses SET data_status='archived', is_active=FALSE, updated_at=NOW() WHERE id=$1`,
      [bizId]
    );
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// FASE 2A — AUTOASIGNACIÓN DE FICHAS EXISTENTES
// ════════════════════════════════════════════════════════════════════

// ── GET /available — fichas disponibles para autoasignación ──────────────
ambRouter.get('/available', requireAuth, requireAmbassador, async (req, res) => {
  try {
    const { page = 1, limit = 12, city, category, department, order = 'asc' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = ['1=1'];
    const params = [];
    let idx = 1;

    if (city)       { where.push(`unaccent(b.city) ILIKE unaccent($${idx++})`);       params.push(`%${city}%`); }
    if (department) { where.push(`unaccent(b.department) ILIKE unaccent($${idx++})`); params.push(`%${department}%`); }
    if (category) {
      where.push(`EXISTS (
        SELECT 1 FROM business_categories bc2
        JOIN categories cc ON cc.id = bc2.category_id
        WHERE bc2.business_id = b.id
          AND (cc.id = $${idx} OR cc.parent_id = $${idx})
      )`);
      params.push(parseInt(category)); idx++;
    }

    const baseCond = `
      b.is_active = TRUE AND b.verified = FALSE
      AND b.claimed_by IS NULL AND b.data_status IS NULL
      AND fn_quality_score(b.*) < 65
      AND NOT EXISTS (SELECT 1 FROM ambassador_businesses ab WHERE ab.business_id = b.id)
    `;

    // Orden (whitelist): completitud asc/desc o visitas 30d asc/desc
    const ORDER_MAP = {
      asc:        'fn_quality_score(b.*) ASC, b.created_at DESC',
      desc:       'fn_quality_score(b.*) DESC, b.created_at DESC',
      views_desc: 'views_30d DESC NULLS LAST, b.created_at DESC',
      views_asc:  'views_30d ASC NULLS LAST, b.created_at DESC',
    };
    const orderSql = ORDER_MAP[order] || ORDER_MAP.asc;

    const total = (await pool.query(
      `SELECT COUNT(*) FROM businesses b WHERE ${baseCond} AND ${where.join(' AND ')}`, params
    )).rows[0].count;

    const rows = (await pool.query(`
      SELECT
        b.id, b.name, b.trade_name, b.slug,
        b.city, b.department,
        b.phone, b.whatsapp, b.email, b.website,
        b.image_url, b.logo_emoji,
        b.lat, b.lng, b.description, b.address,
        b.source, b.created_at,
        fn_quality_score(b.*) AS quality_score,
        (SELECT COUNT(*) FROM business_views v
           WHERE v.business_id = b.id AND v.viewed_at >= NOW() - INTERVAL '30 days')::int AS views_30d,
        (SELECT COUNT(*) FROM business_clicks cl
           WHERE cl.business_id = b.id AND cl.click_type='whatsapp' AND cl.clicked_at >= NOW() - INTERVAL '30 days')::int AS wa_30d,
        (NULLIF(TRIM(COALESCE(b.whatsapp,'')), '') IS NULL)               AS falta_whatsapp,
        (NULLIF(TRIM(COALESCE(b.phone,'')),    '') IS NULL)               AS falta_phone,
        (NULLIF(TRIM(COALESCE(b.image_url,'')), '') IS NULL)              AS falta_logo,
        (NULLIF(TRIM(COALESCE(b.description,'')), '') IS NULL)            AS falta_descripcion,
        (b.lat IS NULL OR b.lng IS NULL)                                  AS falta_ubicacion,
        (b.hours_json IS NULL OR
         NOT jsonb_path_exists(b.hours_json,'$.* ? (@.closed == false)')) AS falta_horario,
        (SELECT c.name FROM categories c
           JOIN business_categories bc ON bc.category_id = c.id
          WHERE bc.business_id = b.id AND bc.is_primary = TRUE LIMIT 1) AS category_name,
        (SELECT c.id FROM categories c
           JOIN business_categories bc ON bc.category_id = c.id
          WHERE bc.business_id = b.id AND bc.is_primary = TRUE LIMIT 1) AS category_id
      FROM businesses b
      WHERE ${baseCond} AND ${where.join(' AND ')}
      ORDER BY ${orderSql}
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit), offset])).rows;

    res.json({
      success: true, data: rows,
      pagination: { total: parseInt(total), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(parseInt(total)/parseInt(limit)) }
    });
  } catch(err) {
    console.error('[Ambassador] GET /available:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /search — buscador GLOBAL de fichas por nombre ───────────────────
// A diferencia de /available (solo el pool tomable), busca en TODO el
// directorio activo y marca por cada ficha qué acción corresponde:
//   takeable=true  → el embajador puede "Tomar y completar"
//   si no          → solo "Ver ficha" (publicada / reclamada / con embajador)
ambRouter.get('/search', requireAuth, requireAmbassador, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 12, pages: 0 } });

    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
    const offset = (page - 1) * limit;
    const like = '%' + q.replace(/[%_\\]/g, ' ') + '%';   // neutraliza comodines
    const meId = req.user.id;

    const whereSearch = `
      b.is_active = TRUE AND (
        unaccent(COALESCE(NULLIF(TRIM(b.trade_name),''), b.name)) ILIKE unaccent($1)
        OR unaccent(b.name) ILIKE unaccent($1)
        OR b.slug ILIKE $1
      )`;

    const total = (await pool.query(
      `SELECT COUNT(*) FROM businesses b WHERE ${whereSearch}`, [like]
    )).rows[0].count;

    const rows = (await pool.query(`
      SELECT
        b.id, b.name, b.trade_name, b.slug, b.city, b.image_url, b.logo_emoji,
        b.data_status, b.verified,
        (b.claimed_by IS NOT NULL) AS is_claimed,
        fn_quality_score(b.*) AS quality_score,
        (SELECT c.name FROM categories c
           JOIN business_categories bc ON bc.category_id = c.id
          WHERE bc.business_id = b.id AND bc.is_primary = TRUE LIMIT 1) AS category_name,
        ab.ambassador_id AS owner_amb,
        COALESCE(ab.ambassador_id = $2, FALSE) AS mine,
        (SELECT COUNT(*) FROM business_views v
           WHERE v.business_id = b.id AND v.viewed_at >= NOW() - INTERVAL '30 days')::int AS views_30d,
        (SELECT COUNT(*) FROM business_clicks cl
           WHERE cl.business_id = b.id AND cl.click_type='whatsapp' AND cl.clicked_at >= NOW() - INTERVAL '30 days')::int AS wa_30d,
        (b.verified = FALSE AND b.claimed_by IS NULL AND b.data_status IS NULL
         AND fn_quality_score(b.*) < 65 AND ab.ambassador_id IS NULL) AS takeable
      FROM businesses b
      LEFT JOIN ambassador_businesses ab ON ab.business_id = b.id
      WHERE ${whereSearch}
      ORDER BY
        (b.verified = FALSE AND b.claimed_by IS NULL AND b.data_status IS NULL
         AND fn_quality_score(b.*) < 65 AND ab.ambassador_id IS NULL) DESC,
        b.name ASC
      LIMIT $3 OFFSET $4
    `, [like, meId, limit, offset])).rows;

    res.json({
      success: true, data: rows,
      pagination: { total: parseInt(total), page, limit, pages: Math.ceil(parseInt(total) / limit) }
    });
  } catch (err) {
    console.error('[Ambassador] GET /search:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /available/:id/take — tomar UNA ficha ───────────────────────────
ambRouter.post('/available/:id/take', requireAuth, requireAmbassador, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bizId = parseInt(req.params.id);
    const ambId = req.user.id;

    const check = await client.query(`
      SELECT b.id, b.name, b.trade_name FROM businesses b
      WHERE b.id = $1 AND b.is_active = TRUE AND b.verified = FALSE
        AND b.claimed_by IS NULL AND b.data_status IS NULL
        AND fn_quality_score(b.*) < 65
        AND NOT EXISTS (SELECT 1 FROM ambassador_businesses ab WHERE ab.business_id = b.id)
      FOR UPDATE SKIP LOCKED
    `, [bizId]);

    if (!check.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Esta ficha ya fue tomada o no está disponible' });
    }

    await client.query(
      `INSERT INTO ambassador_businesses (ambassador_id, business_id, assignment_type)
       VALUES ($1,$2,'assigned') ON CONFLICT (business_id) DO NOTHING`, [ambId, bizId]
    );
    await client.query(
      `UPDATE businesses SET data_status='draft', is_active=FALSE, updated_at=NOW() WHERE id=$1`, [bizId]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: check.rows[0] });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('[Ambassador] take:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});

// ── POST /available/take-batch — tomar VARIAS fichas (máx 10) ────────────
ambRouter.post('/available/take-batch', requireAuth, requireAmbassador, async (req, res) => {
  const client = await pool.connect();
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ success: false, error: 'Indicá al menos una ficha' });
    if (ids.length > 10)
      return res.status(400).json({ success: false, error: 'Podés tomar hasta 10 fichas a la vez' });

    await client.query('BEGIN');
    const ambId = req.user.id;

    // Bloquear y verificar disponibilidad de todas
    const check = await client.query(`
      SELECT b.id, b.trade_name, b.name FROM businesses b
      WHERE b.id = ANY($1::int[])
        AND b.is_active = TRUE AND b.verified = FALSE
        AND b.claimed_by IS NULL AND b.data_status IS NULL
        AND fn_quality_score(b.*) < 65
        AND NOT EXISTS (SELECT 1 FROM ambassador_businesses ab WHERE ab.business_id = b.id)
      FOR UPDATE SKIP LOCKED
    `, [ids]);

    if (!check.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Ninguna ficha está disponible (ya fueron tomadas)' });
    }

    const validIds = check.rows.map(r => r.id);

    // Insertar asignaciones
    await client.query(`
      INSERT INTO ambassador_businesses (ambassador_id, business_id, assignment_type)
      SELECT $1, unnest($2::int[]), 'assigned'
      ON CONFLICT (business_id) DO NOTHING
    `, [ambId, validIds]);

    await client.query(`
      UPDATE businesses SET data_status='draft', is_active=FALSE, updated_at=NOW()
      WHERE id = ANY($1::int[])
    `, [validIds]);

    await client.query('COMMIT');
    res.json({ success: true, taken: validIds.length, skipped: ids.length - validIds.length, data: check.rows });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('[Ambassador] take-batch:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});

// ── POST /businesses/:id/release — liberar ficha asignada ────────────────
ambRouter.post('/businesses/:id/release', requireAuth, requireAmbassador, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bizId = parseInt(req.params.id);
    const ambId = req.user.id;

    // Verificar que la ficha pertenezca al embajador y sea 'assigned' (no 'created')
    const check = await client.query(`
      SELECT ab.assignment_type, b.data_status FROM ambassador_businesses ab
      JOIN businesses b ON b.id = ab.business_id
      WHERE ab.business_id = $1 AND ab.ambassador_id = $2
    `, [bizId, ambId]);

    if (!check.rows.length)
      return res.status(403).json({ success: false, error: 'No tenés permiso sobre esta ficha' });

    const { assignment_type, data_status } = check.rows[0];

    if (assignment_type !== 'assigned')
      return res.status(400).json({ success: false, error: 'Solo podés liberar fichas que tomaste de "Explorar". Las fichas que creaste vos no se pueden liberar.' });

    if (data_status === 'pending_review')
      return res.status(400).json({ success: false, error: 'Esta ficha ya está en revisión, no se puede liberar' });

    // Restaurar la ficha al estado original (disponible para otros)
    await client.query(`
      UPDATE businesses
      SET data_status = NULL, is_active = TRUE, updated_at = NOW()
      WHERE id = $1
    `, [bizId]);

    // Quitar la asignación
    await client.query(
      `DELETE FROM ambassador_businesses WHERE business_id = $1 AND ambassador_id = $2`,
      [bizId, ambId]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('[Ambassador] release:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});

// ── GET /available/stats — cuántas fichas hay disponibles por ciudad/rubro ─
ambRouter.get('/available/stats', requireAuth, requireAmbassador, async (req, res) => {
  try {
    const byCity = (await pool.query(`
      SELECT b.city, COUNT(*) AS total
      FROM businesses b
      WHERE b.is_active = TRUE AND b.verified = FALSE
        AND b.claimed_by IS NULL AND b.data_status IS NULL
        AND fn_quality_score(b.*) < 65
        AND NOT EXISTS (SELECT 1 FROM ambassador_businesses ab WHERE ab.business_id = b.id)
        AND b.city IS NOT NULL
      GROUP BY b.city
      ORDER BY total DESC
      LIMIT 20
    `)).rows;

    const byCategory = (await pool.query(`
      SELECT c.name AS category, c.id AS category_id, COUNT(DISTINCT b.id) AS total
      FROM businesses b
      JOIN business_categories bc ON bc.business_id = b.id AND bc.is_primary = TRUE
      JOIN categories c ON c.id = bc.category_id
      WHERE b.is_active = TRUE AND b.verified = FALSE
        AND b.claimed_by IS NULL AND b.data_status IS NULL
        AND fn_quality_score(b.*) < 65
        AND NOT EXISTS (SELECT 1 FROM ambassador_businesses ab WHERE ab.business_id = b.id)
      GROUP BY c.id, c.name
      ORDER BY total DESC
      LIMIT 15
    `)).rows;

    const total = (await pool.query(`
      SELECT COUNT(*) FROM businesses b
      WHERE b.is_active = TRUE AND b.verified = FALSE
        AND b.claimed_by IS NULL AND b.data_status IS NULL
        AND fn_quality_score(b.*) < 65
        AND NOT EXISTS (SELECT 1 FROM ambassador_businesses ab WHERE ab.business_id = b.id)
    `)).rows[0].count;

    res.json({ success: true, data: { total: parseInt(total), byCity, byCategory } });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// ROUTER ADMIN  →  /api/v2/admin/ambassador/...
// ════════════════════════════════════════════════════════════════════
const adminAmbRouter = express.Router();

// ── GET /ambassador/pending — cola de revisión ───────────────────────────
adminAmbRouter.get('/ambassador/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { page=1, limit=20, ambassador_id } = req.query;
    const offset = (parseInt(page)-1)*parseInt(limit);
    const where  = [`b.data_status = 'pending_review'`];
    const params = [];
    let idx = 1;

    if (ambassador_id) { where.push(`ab.ambassador_id=$${idx++}`); params.push(parseInt(ambassador_id)); }

    const total = (await pool.query(
      `SELECT COUNT(*) FROM businesses b JOIN ambassador_businesses ab ON ab.business_id=b.id WHERE ${where.join(' AND ')}`, params
    )).rows[0].count;

    const rows = (await pool.query(`
      SELECT b.id, b.name, b.trade_name, b.slug, b.ruc,
             b.city, b.phone, b.whatsapp, b.email, b.website,
             b.description, b.address, b.image_url, b.logo_emoji, b.cover_url,
             b.lat, b.lng, b.data_status, b.review_note, b.created_at,
             u.id AS ambassador_id, u.name AS ambassador_name, u.email AS ambassador_email,
             (SELECT json_agg(json_build_object('id',cx.id,'name',cx.name,'isPrimary',bcx.is_primary))
                FROM business_categories bcx JOIN categories cx ON cx.id=bcx.category_id
               WHERE bcx.business_id=b.id) AS categories
      FROM businesses b
      JOIN ambassador_businesses ab ON ab.business_id=b.id
      JOIN users u ON u.id=ab.ambassador_id
      WHERE ${where.join(' AND ')}
      ORDER BY b.created_at ASC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit), offset])).rows;

    res.json({ success: true, data: rows,
      pagination: { total: parseInt(total), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(parseInt(total)/parseInt(limit)) }
    });
  } catch(err) {
    console.error('[AmbAdmin] GET /pending:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /ambassador/businesses/:id/approve ──────────────────────────────
adminAmbRouter.post('/ambassador/businesses/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `UPDATE businesses SET data_status=NULL, verified=TRUE, is_active=TRUE, review_note=NULL, updated_at=NOW() WHERE id=$1`,
      [parseInt(req.params.id)]
    );
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /ambassador/businesses/:id/reject ───────────────────────────────
adminAmbRouter.post('/ambassador/businesses/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { note } = req.body;
    if (!note?.trim()) return res.status(400).json({ success: false, error: 'Indicá el motivo' });
    await pool.query(
      `UPDATE businesses SET data_status='rejected', is_active=FALSE, review_note=$1, updated_at=NOW() WHERE id=$2`,
      [note.trim(), parseInt(req.params.id)]
    );
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /ambassador/ambassadors — lista de embajadores ───────────────────
adminAmbRouter.get('/ambassador/ambassadors', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = (await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.is_ambassador, u.created_at,
             COUNT(ab.id)                                                        AS total_cargadas,
             COUNT(ab.id) FILTER (WHERE b.data_status IS NULL AND b.is_active)  AS total_publicadas,
             COUNT(ab.id) FILTER (WHERE b.data_status='pending_review')          AS total_pendientes,
             COUNT(ab.id) FILTER (WHERE b.data_status='draft')                   AS total_borradores,
             COUNT(ab.id) FILTER (WHERE b.data_status='rejected')                AS total_rechazadas
      FROM users u
      LEFT JOIN ambassador_businesses ab ON ab.ambassador_id=u.id
      LEFT JOIN businesses b ON b.id=ab.business_id
      WHERE u.is_ambassador=TRUE
      GROUP BY u.id
      ORDER BY total_publicadas DESC, u.name
    `)).rows;
    res.json({ success: true, data: rows });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /ambassador/ambassadors — asignar flag a usuario existente ───────
adminAmbRouter.post('/ambassador/ambassadors', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { user_id, name, email, phone, password } = req.body;
    const bcrypt = require('bcryptjs');

    // Caso A: asignar flag a usuario existente por ID
    if (user_id) {
      const r = await pool.query(
        `UPDATE users SET is_ambassador=TRUE WHERE id=$1 RETURNING id,name,email,role,is_ambassador`,
        [parseInt(user_id)]
      );
      if (!r.rows.length) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
      return res.json({ success: true, data: r.rows[0] });
    }

    // Caso B: crear usuario nuevo con flag
    if (!name?.trim() || !email?.trim() || !password?.trim())
      return res.status(400).json({ success: false, error: 'Nombre, email y contraseña son requeridos' });

    const exists = await pool.query(`SELECT id, is_ambassador FROM users WHERE email=$1`, [email.trim().toLowerCase()]);
    if (exists.rows.length) {
      // Usuario ya existe → solo activar flag
      const r = await pool.query(
        `UPDATE users SET is_ambassador=TRUE WHERE id=$1 RETURNING id,name,email,role,is_ambassador`,
        [exists.rows[0].id]
      );
      return res.json({ success: true, data: r.rows[0], existing: true });
    }

    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      `INSERT INTO users (name,email,phone,password_hash,role,is_ambassador,is_active,email_verified)
       VALUES ($1,$2,$3,$4,'user',TRUE,TRUE,TRUE) RETURNING id,name,email,role,is_ambassador`,
      [name.trim(), email.trim().toLowerCase(), phone?.trim()||null, hash]
    );
    res.json({ success: true, data: r.rows[0] });
  } catch(err) {
    console.error('[AmbAdmin] POST /ambassadors:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /ambassador/users — buscar usuarios existentes para asignar ───────
adminAmbRouter.get('/ambassador/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { q } = req.query;
    const rows = (await pool.query(
      `SELECT id, name, email, role, is_ambassador FROM users
       WHERE is_active=TRUE AND (name ILIKE $1 OR email ILIKE $1)
       ORDER BY name LIMIT 20`,
      [`%${q||''}%`]
    )).rows;
    res.json({ success: true, data: rows });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /ambassador/ambassadors/:id — quitar flag ─────────────────────
adminAmbRouter.delete('/ambassador/ambassadors/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE users SET is_ambassador=FALSE WHERE id=$1`, [parseInt(req.params.id)]);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /ambassador/kits.pdf — Kits QR por lote (SOLO negocios del embajador) ──
ambRouter.get('/kits.pdf', requireAuth, requireAmbassador, async (req, res) => {
  try {
    const params = [req.user.id];
    let where = 'ab.ambassador_id = $1 AND b.is_active = TRUE';
    const idList = req.query.ids ? String(req.query.ids).split(',').map(n => parseInt(n)).filter(Boolean) : null;
    if (idList && idList.length) { params.push(idList); where += ` AND b.id = ANY($${params.length}::int[])`; }
    const q = `SELECT b.id, b.name, b.trade_name AS "tradeName", b.slug, b.city, b.kit_cta,
                      b.image_url AS "imageUrl", c.slug AS "categorySlug", c.name AS "categoryName"
               FROM ambassador_businesses ab
               JOIN businesses b ON b.id = ab.business_id
               LEFT JOIN categories c ON c.id = b.category_id
               WHERE ${where}
               ORDER BY b.trade_name NULLS LAST, b.name
               LIMIT 100`;
    const { rows } = await pool.query(q, params);
    if (!rows.length) return res.status(404).json({ success: false, error: 'No hay negocios para el kit' });
    const cfgRows = await pool.query("SELECT key, value FROM site_config WHERE key IN ('site_url','site_name','qr_kit_cta','logo_url')");
    const cfg = {}; cfgRows.rows.forEach(r => { cfg[r.key] = r.value; });
    const pdf = await buildKitBatchPdf(rows, cfg);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="kits-retopa-${rows.length}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('[ambassador kits.pdf]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// D9.3 — Oportunidades (Disparadores de Venta) del embajador
// ════════════════════════════════════════════════════════════════════
const SIG_PRIO_SQL = `CASE s.trigger_key
  WHEN 't4_fundador_d75' THEN 1 WHEN 't3_boost_vencido' THEN 2 WHEN 't2_destacado_datos' THEN 3
  WHEN 't5_candidato_hc' THEN 4 WHEN 't1_listo_boost' THEN 5 WHEN 't6_ficha_abandonada' THEN 6 ELSE 9 END`;

// GET /opportunities — señales activas del embajador (marca nueva→vista al leer)
ambRouter.get('/opportunities', requireAuth, requireAmbassador, async (req, res) => {
  try {
    const ambassadorId = ['admin','godmode'].includes(req.user.role) && req.query.ambassador_id
      ? parseInt(req.query.ambassador_id) : req.user.id;

    const rows = (await pool.query(`
      SELECT s.id, s.business_id, s.trigger_key, s.product_target, s.status,
             s.evidence, s.suggested_message, s.created_at,
             COALESCE(NULLIF(TRIM(b.trade_name),''), b.name) AS business_name,
             b.slug, b.whatsapp, b.phone, b.email, b.city,
             (SELECT name FROM categories c WHERE c.id = b.category_id) AS category_name
      FROM sales_signals s
      JOIN businesses b ON b.id = s.business_id
      WHERE s.assigned_ambassador_id = $1 AND s.status IN ('nueva','vista','contactado')
      ORDER BY ${SIG_PRIO_SQL}, s.created_at DESC`, [ambassadorId])).rows;

    // "vista" se marca sola al renderizar (solo las nuevas de este embajador)
    await pool.query(
      `UPDATE sales_signals SET status='vista', status_changed_at=NOW()
       WHERE assigned_ambassador_id=$1 AND status='nueva'`, [ambassadorId]).catch(()=>{});

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[Ambassador] GET /opportunities:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper: actualizar estado de una señal propia del embajador
async function updateOwnSignal(req, res, newStatus, note) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'id inválido' });
  const isAdmin = ['admin','godmode'].includes(req.user.role);
  const params = [id, newStatus, req.user.id];
  let ownClause = '';
  if (!isAdmin) { params.push(req.user.id); ownClause = ` AND assigned_ambassador_id = $${params.length}`; }
  let noteClause = '';
  if (note !== undefined) { params.push(note); noteClause = `, note = $${params.length}`; }
  const upd = await pool.query(
    `UPDATE sales_signals SET status=$2, status_changed_at=NOW(), status_changed_by=$3${noteClause}
     WHERE id=$1 AND status IN ('nueva','vista','contactado')${ownClause} RETURNING id`, params);
  if (!upd.rowCount) return res.status(404).json({ success: false, error: 'Señal no encontrada o ya cerrada' });
  res.json({ success: true });
}

// POST /opportunities/:id/contacted
ambRouter.post('/opportunities/:id/contacted', requireAuth, requireAmbassador, async (req, res) => {
  try { await updateOwnSignal(req, res, 'contactado'); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /opportunities/:id/dismiss  (motivo opcional)
ambRouter.post('/opportunities/:id/dismiss', requireAuth, requireAmbassador, async (req, res) => {
  try {
    const note = (req.body && req.body.note) ? String(req.body.note).slice(0, 300) : null;
    await updateOwnSignal(req, res, 'descartada', note);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /opportunities/:id/email — enviar el mensaje sugerido por CORREO a la ficha,
// con el formato lindo de RetoPA (plantilla ambassadorOutreach). Útil cuando la
// ficha no tiene WhatsApp pero sí email. Marca la señal como 'contactado' al enviar.
ambRouter.post('/opportunities/:id/email', requireAuth, requireAmbassador, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, error: 'id inválido' });
    const isAdmin = ['admin', 'godmode'].includes(req.user.role);

    // Traer la señal + datos de la ficha, verificando propiedad (salvo admin)
    const params = [id];
    let ownClause = '';
    if (!isAdmin) { params.push(req.user.id); ownClause = ` AND s.assigned_ambassador_id = $${params.length}`; }
    const sig = (await pool.query(`
      SELECT s.id, s.status, s.suggested_message,
             COALESCE(NULLIF(TRIM(b.trade_name),''), b.name) AS business_name,
             b.slug, b.email
      FROM sales_signals s JOIN businesses b ON b.id = s.business_id
      WHERE s.id = $1 AND s.status IN ('nueva','vista','contactado')${ownClause}
      LIMIT 1`, params)).rows[0];
    if (!sig) return res.status(404).json({ success: false, error: 'Oportunidad no encontrada o ya cerrada' });

    // Destinatario: el email de la ficha (o uno explícito enviado por el front)
    const to = _isEmail(req.body && req.body.to) ? req.body.to.trim() : (sig.email || '').trim();
    if (!_isEmail(to)) return res.status(400).json({ success: false, error: 'La ficha no tiene un email válido' });

    // Config del sitio + datos del embajador (para firma / reply-to)
    const cfgRows = (await pool.query("SELECT key, value FROM site_config WHERE key IN ('site_name','site_url')")).rows;
    const cfg = {}; cfgRows.forEach(r => cfg[r.key] = r.value);
    const siteName = cfg.site_name || 'RetoPA';
    const siteUrl = (cfg.site_url || 'https://retopa.com.py').replace(/\/$/, '');
    const amb = (await pool.query('SELECT name, email FROM users WHERE id = $1', [req.user.id])).rows[0] || {};

    const fichaUrl = sig.slug ? `${siteUrl}/empresa/${encodeURIComponent(sig.slug)}` : null;
    const fichaLabel = fichaUrl ? fichaUrl.replace(/^https?:\/\//, '') : null;

    // Cuerpo: el mensaje editado por el embajador, o el sugerido. El link va en el botón/CTA.
    const rawMsg = (req.body && typeof req.body.message === 'string' && req.body.message.trim())
      ? req.body.message : (sig.suggested_message || '');
    const subject = (req.body && typeof req.body.subject === 'string' && req.body.subject.trim())
      ? req.body.subject.trim().slice(0, 200) : null;

    const result = await sendEmail(to, 'ambassadorOutreach', {
      siteName, siteUrl,
      businessName: sig.business_name,
      bodyHtml: _htmlBody(rawMsg),
      fichaUrl, fichaLabel,
      ambassadorName: amb.name || null,
      ambassadorEmail: amb.email || null,
      replyTo: _isEmail(amb.email) ? amb.email : undefined,
      subject: subject || undefined,
    });
    if (!result || !result.success) {
      return res.status(502).json({ success: false, error: (result && result.error) || 'No se pudo enviar el correo' });
    }

    // Enviado OK → marcar la señal como contactado (outreach concretado)
    await pool.query(
      `UPDATE sales_signals SET status='contactado', status_changed_at=NOW(), status_changed_by=$2
       WHERE id=$1 AND status IN ('nueva','vista','contactado')`, [id, req.user.id]).catch(() => {});

    res.json({ success: true, sentTo: to });
  } catch (err) {
    console.error('[Ambassador] POST /opportunities/:id/email:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = { ambRouter, adminAmbRouter };
