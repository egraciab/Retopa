const pool = require('../db');
const { success, error } = require('../utils/response');

async function getCities(req, res) {
  try {
    const result = await pool.query(`
      SELECT id, name, slug
      FROM cities
      ORDER BY name ASC
    `);

    return success(res, result.rows);

  } catch (err) {
    console.error(err);
    return error(res, 'Error fetching cities');
  }
}

module.exports = { getCities };
