// ============================================================
//  RETOPA — Internal API for Hepta Cloud Integration
//  Agregar a /opt/retopa/backend/src/routes/
//  Registrar en app.js: app.use('/api/v2/internal', internalRoutes);
//
//  Auth: Header X-Internal-Key (compartido entre HC y RetoPA)
// ============================================================
const router  = require('express').Router();
const pool    = require('../db');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const INTERNAL_KEY = process.env.INTERNAL_API_KEY || '';
const JWT_SECRET   = process.env.JWT_SECRET;

function requireInternalKey(req, res, next) {
  const key = req.headers['x-internal-key'] || '';
  if (!INTERNAL_KEY || key !== INTERNAL_KEY)
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
}

// ── POST /internal/sync-user ──────────────────────────────────
// Crea o devuelve un usuario en RetoPA a partir de datos de HC
router.post('/sync-user', requireInternalKey, async (req, res) => {
  const { email, name, phone, password_hash } = req.body;
  if (!email || !name)
    return res.status(400).json({ success: false, error: 'email y name requeridos' });

  try {
    // Buscar si ya existe
    const existing = await pool.query(
      'SELECT id, email, name, role FROM users WHERE email=$1', [email.toLowerCase()]
    );

    if (existing.rows.length) {
      return res.json({ success: true, data: existing.rows[0], created: false });
    }

    // Crear usuario nuevo — usar hash de HC o generar uno temporal
    const hash = password_hash || await bcrypt.hash(
      Math.random().toString(36).slice(-12), 10
    );

    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, phone, role, is_active, email_verified)
       VALUES ($1,$2,$3,$4,'user',TRUE,TRUE) RETURNING id, email, name, role`,
      [email.toLowerCase(), hash, name.trim(), phone || null]
    );

    res.json({ success: true, data: rows[0], created: true });
  } catch(err) {
    console.error('[internal/sync-user]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /internal/create-listing ────────────────────────────
// Crea una ficha de negocio en RetoPA para un cliente de HC
router.post('/create-listing', requireInternalKey, async (req, res) => {
  const {
    user_id,           // ID del user en RetoPA (de sync-user)
    name,              // Razón social
    trade_name,        // Nombre comercial
    email,
    phone,
    whatsapp,
    city,
    description,
    category_id,
    ruc,
    image_url,         // logo
    source,
  } = req.body;

  if (!name || !user_id)
    return res.status(400).json({ success: false, error: 'name y user_id requeridos' });

  try {
    // Generar slug único
    const base = (trade_name || name)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g,'');

    let slug = base;
    let attempt = 0;
    while (true) {
      const ex = await pool.query('SELECT id FROM businesses WHERE slug=$1', [slug]);
      if (!ex.rows.length) break;
      slug = `${base}-${++attempt}`;
    }

    const { rows } = await pool.query(
      `INSERT INTO businesses
         (name, trade_name, slug, email, phone, whatsapp, city,
          description, category_id, ruc, image_url,
          plan_type, is_active, verified, source, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'basic',TRUE,FALSE,$12,NOW())
       RETURNING id, slug`,
      [
        name.trim(),
        trade_name?.trim() || null,
        slug,
        email || null,
        phone || null,
        whatsapp || phone || null,
        city || null,
        description || null,
        category_id || null,
        ruc || null,
        image_url || null,
        source || 'hepta_cloud',
      ]
    );

    const biz = rows[0];

    // Vincular al usuario como propietario
    await pool.query(
      `INSERT INTO user_businesses (user_id, business_id, is_owner, can_edit)
       VALUES ($1,$2,TRUE,TRUE) ON CONFLICT DO NOTHING`,
      [user_id, biz.id]
    );

    res.json({
      success: true,
      data: {
        id:   biz.id,
        slug: biz.slug,
        url:  `https://retopa.com.py/negocios/${biz.slug}`,
      },
      created: true,
    });
  } catch(err) {
    console.error('[internal/create-listing]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /internal/user-by-email/:email ───────────────────────
router.get('/user-by-email/:email', requireInternalKey, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.name, u.role,
              json_agg(json_build_object(
                'id', b.id, 'slug', b.slug, 'name', b.name,
                'plan_type', b.plan_type, 'is_active', b.is_active
              )) FILTER (WHERE b.id IS NOT NULL) AS businesses
       FROM users u
       LEFT JOIN user_businesses ub ON ub.user_id = u.id
       LEFT JOIN businesses b ON b.id = ub.business_id
       WHERE u.email = $1
       GROUP BY u.id`,
      [req.params.email.toLowerCase()]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
