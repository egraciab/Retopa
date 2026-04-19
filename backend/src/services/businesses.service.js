const pool = require('../db');

async function getBusinesses({ page, limit, cityId, categoryId, q }) {
  const offset = (page - 1) * limit;

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

  return {
    rows: dataResult.rows,
    total: parseInt(countResult.rows[0].count, 10)
  };
}

async function getBusinessById(id) {
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

  return result.rows[0];
}

async function createBusiness(data) {
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
    latitude,
    longitude
  } = data;

  const lat = latitude !== undefined && latitude !== null ? Number(latitude) : null;
  const lng = longitude !== undefined && longitude !== null ? Number(longitude) : null;

  const result = await pool.query(`
    WITH inserted AS (
      INSERT INTO businesses
      (
        name, address, phone, email, website,
        city_id, category_id, source, claimed,
        latitude, longitude
      )
      VALUES
      (
        $1,$2,$3,$4,$5,
        $6,$7,COALESCE($8,'manual'),COALESCE($9,false),
        $10,$11
      )
      RETURNING id, name, latitude, longitude
    ),
    updated AS (
      UPDATE businesses b
      SET geom = CASE
        WHEN i.latitude IS NOT NULL AND i.longitude IS NOT NULL
        THEN ST_SetSRID(
          ST_MakePoint(
            i.longitude::double precision,
            i.latitude::double precision
          ),
          4326
        )
        ELSE NULL
      END,
      updated_at = NOW()
      FROM inserted i
      WHERE b.id = i.id
      RETURNING b.*
    )
    SELECT * FROM updated
  `, [
    name,
    address || null,
    phone || null,
    email || null,
    website || null,
    city_id || null,
    category_id || null,
    source || 'manual',
    claimed ?? false,
    lat,
    lng
  ]);

  return result.rows[0];
}

module.exports = {
  getBusinesses,
  getBusinessById,
  createBusiness
};
