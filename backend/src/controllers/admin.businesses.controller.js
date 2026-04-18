const pool = require('../db');

// =====================
// GET LIST
// =====================
async function getAdminBusinesses(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const q = req.query.q?.trim();
    const claimed = req.query.claimed;
    const isActive = req.query.is_active;
    const ruc = req.query.ruc?.trim();
    const categoryId = req.query.category_id;
    const cityId = req.query.city_id;

    let where = [];
    let values = [];
    let i = 1;

    where.push(`b.is_active = true`);

    if (ruc) {
      where.push(`TRIM(b.ruc_clean) = $${i++}`);
      values.push(ruc);
    }

    if (q) {
      where.push(`(b.name ILIKE $${i} OR b.address ILIKE $${i} OR b.ruc ILIKE $${i})`);
      values.push(`%${q}%`);
      i++;
    }

    if (claimed === 'true' || claimed === 'false') {
      where.push(`b.claimed = $${i++}`);
      values.push(claimed === 'true');
    }

    if (isActive === 'true' || isActive === 'false') {
      where.push(`b.is_active = $${i++}`);
      values.push(isActive === 'true');
    }

    if (categoryId) {
      where.push(`b.category_id = $${i++}`);
      values.push(parseInt(categoryId));
    }

    if (cityId) {
      where.push(`b.city_id = $${i++}`);
      values.push(parseInt(cityId));
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const offset = (page - 1) * limit;

    const dataQuery = `
      SELECT
        b.id,
        b.name,
        b.ruc,
        b.phone,
        b.email,
        b.source,
        b.claimed,
        b.is_active,
        c.name AS city,
        cat.name AS category
      FROM businesses b
      LEFT JOIN cities c ON c.id = b.city_id
      LEFT JOIN categories cat ON cat.id = b.category_id
      ${whereSql}
      ORDER BY b.id DESC
      LIMIT $${i++} OFFSET $${i++}
    `;

    const countQuery = `
      SELECT COUNT(*) FROM businesses b ${whereSql}
    `;

    const [data, count] = await Promise.all([
      pool.query(dataQuery, [...values, limit, offset]),
      pool.query(countQuery, values)
    ]);

    const total = parseInt(count.rows[0].count);

    res.json({
      success: true,
      data: data.rows,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
}
// =====================
// GET BY ID
// =====================
async function getAdminBusinessById(req, res) {
  try {
    const id = parseInt(req.params.id);

    const result = await pool.query(
      `
      SELECT
        b.*,
        c.name AS city,
        cat.name AS category
      FROM businesses b
      LEFT JOIN cities c ON c.id = b.city_id
      LEFT JOIN categories cat ON cat.id = b.category_id
      WHERE b.id = $1
      `,
      [id]
    );

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('GET /api/admin/businesses/:id error:', err);
    return res.status(500).json({ success: false });
  }
}

// =====================
// UPDATE
// =====================
async function updateBusiness(req, res) {
  try {
    const id = parseInt(req.params.id);

    const {
      name,
      address,
      phone,
      email,
      website,
      city_id,
      category_id,
      claimed,
      is_active,
      source,
      ruc
    } = req.body;

    const result = await pool.query(
      `
      UPDATE businesses
      SET
        name = COALESCE($2, name),
        address = COALESCE($3, address),
        phone = COALESCE($4, phone),
        email = COALESCE($5, email),
        website = COALESCE($6, website),
        city_id = COALESCE($7, city_id),
        category_id = COALESCE($8, category_id),
        claimed = COALESCE($9, claimed),
        is_active = COALESCE($10, is_active),
        source = COALESCE($11, source),
        ruc = COALESCE($12, ruc),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        name ?? null,
        address ?? null,
        phone ?? null,
        email ?? null,
        website ?? null,
        city_id ?? null,
        category_id ?? null,
        claimed ?? null,
        is_active ?? null,
        source ?? null,
        ruc ?? null
      ]
    );

    return res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (err) {
    console.error('PUT error:', err);
    return res.status(500).json({ success: false });
  }
}

// =====================
// CREATE
// =====================
async function createAdminBusiness(req, res) {
  try {
    const {
      name,
      address,
      phone,
      email,
      website,
      city_id,
      category_id,
      source,
      claimed,
      is_active,
      ruc
    } = req.body;

    const result = await pool.query(
      `
      INSERT INTO businesses
      (
        name, address, phone, email, website,
        city_id, category_id, source, claimed, is_active, ruc
      )
      VALUES
      (
        $1,$2,$3,$4,$5,
        $6,$7,COALESCE($8,'manual'),COALESCE($9,false),COALESCE($10,true),$11
      )
      RETURNING *
      `,
      [
        name,
        address || null,
        phone || null,
        email || null,
        website || null,
        city_id || null,
        category_id || null,
        source || 'manual',
        claimed ?? false,
        is_active ?? true,
        ruc || null
      ]
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0]
    });

  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'RUC ya existe'
      });
    }

    return res.status(500).json({ success: false });
  }
}

module.exports = {
  getAdminBusinesses,
  getAdminBusinessById,
  updateBusiness,
  createAdminBusiness
};
