const pool = require('../db');

async function getAdminClaims(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        bc.id,
        bc.business_id,
        bc.full_name,
        bc.email,
        bc.phone,
        bc.message,
        bc.status,
        bc.created_at,
        b.name AS business_name
      FROM business_claims bc
      LEFT JOIN businesses b ON b.id = bc.business_id
      ORDER BY bc.id DESC
    `);

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('GET /api/admin/claims error:', err);
    return res.status(500).json({
      success: false,
      message: 'Error fetching claims'
    });
  }
}

async function updateClaimStatus(req, res) {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid claim id'
      });
    }

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const result = await pool.query(
      `
      UPDATE business_claims
      SET status = $2
      WHERE id = $1
      RETURNING *
      `,
      [id, status]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    if (status === 'approved') {
      await pool.query(
        `
        UPDATE businesses
        SET claimed = true, updated_at = NOW()
        WHERE id = (
          SELECT business_id FROM business_claims WHERE id = $1
        )
        `,
        [id]
      );
    }

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('PATCH /api/admin/claims/:id error:', err);
    return res.status(500).json({
      success: false,
      message: 'Error updating claim'
    });
  }
}

module.exports = {
  getAdminClaims,
  updateClaimStatus
};
