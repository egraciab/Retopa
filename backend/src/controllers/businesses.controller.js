const pool = require('../db');
const { success, error } = require('../utils/response');

async function getBusinesses(req, res) {
  try {
    // ===== params =====
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const cityId = req.query.city_id ? parseInt(req.query.city_id) : null;
    const categoryId = req.query.category_id ? parseInt(req.query.category_id) : null;
    const q = req.query.q ? req.query.q.trim() : null;

    // ===== filtros dinámicos =====
    let where = [];
    let values = [];
    let i = 1;

    if (cityId) {
      where.push(`b.city_id = $${i++}`);
      values.push(cityId);
    }

    if (categoryId) {
      where.push(`b.category_id = $${i++}`);
      values.push(categoryId);
    }

    if (q) {
      where.push(`(b.name ILIKE $${i} OR b.address ILIKE $${i})`);
      values.push(`%${q}%`);
      i++;
    }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // ===== data =====
    const dataQuery = `
      SELECT
        b.id,
        b.name,
        b.slug,
        b.address,
        b.phone,
        b.website,
        b.claimed,
        c.id AS city_id,
        c.name AS city,
        cat.id AS category_id,
        cat.name AS category
      FROM businesses b
      JOIN cities c ON c.id = b.city_id
      JOIN categories cat ON cat.id = b.category_id
      ${whereSQL}
      ORDER BY b.name ASC
      LIMIT $${i++}
      OFFSET $${i++}
    `;

    const countQuery = `
      SELECT COUNT(*) FROM businesses b
      ${whereSQL}
    `;

    const dataValues = [...values, limit, offset];
    const countValues = [...values];

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, dataValues),
      pool.query(countQuery, countValues)
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    return success(res, dataResult.rows.map(r => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      address: r.address,
      phone: r.phone,
      website: r.website,
      claimed: r.claimed,
      city: {
        id: r.city_id,
        name: r.city
      },
      category: {
        id: r.category_id,
        name: r.category
      }
    })), {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit)
    });

  } catch (err) {
    console.error(err);
    return error(res, 'Error fetching businesses');
  }
}

async function getBusinessById(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (!id) return error(res, 'Invalid ID', 400);

    const result = await pool.query(`
      SELECT
        b.*,
        c.name AS city,
        cat.name AS category
      FROM businesses b
      JOIN cities c ON c.id = b.city_id
      JOIN categories cat ON cat.id = b.category_id
      WHERE b.id = $1
      LIMIT 1
    `, [id]);

    if (result.rows.length === 0) {
      return error(res, 'Business not found', 404);
    }

    return success(res, result.rows[0]);

  } catch (err) {
    console.error(err);
    return error(res, 'Error fetching business');
  }
}

module.exports = {
  getBusinesses,
  getBusinessById
};
