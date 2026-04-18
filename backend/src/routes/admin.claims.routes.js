const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth.middleware');
const {
  getAdminClaims,
  updateClaimStatus
} = require('../controllers/admin.claims.controller');

router.get('/', requireAdmin, getAdminClaims);
router.patch('/:id', requireAdmin, updateClaimStatus);

module.exports = router;
