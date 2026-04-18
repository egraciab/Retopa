const pool = require('../db');

async function getCategories(req, res) {
  const result = await pool.query(
    `SELECT id, name FROM categories ORDER BY name`
  );

  res.json({
    success: true,
    data: result.rows
  });
}

module.exports = { getCategories };
