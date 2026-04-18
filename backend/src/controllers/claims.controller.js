const pool = require('../db');
const { success, error } = require('../utils/response');

async function createClaim(req, res) {
  try {
    const { business_id, full_name, email, phone, message } = req.body;

    // ===== validaciones mínimas =====
    if (!business_id || !full_name || !email) {
      return error(res, 'Missing required fields', 400);
    }

    const result = await pool.query(
      `
      INSERT INTO business_claims
      (business_id, full_name, email, phone, message)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, status
      `,
      [
        business_id,
        full_name,
        email,
        phone || null,
        message || null
      ]
    );

    return success(res, result.rows[0]);

  } catch (err) {
    console.error(err);
    return error(res, 'Error creating claim');
  }
}

module.exports = { createClaim };
