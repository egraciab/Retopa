const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth.middleware');
const {
  getAdminBusinesses,
  getAdminBusinessById,
  updateBusiness,
  createAdminBusiness
} = require('../controllers/admin.businesses.controller');

router.get('/', requireAdmin, getAdminBusinesses);
router.get('/:id', requireAdmin, getAdminBusinessById);
router.put('/:id', requireAdmin, updateBusiness);
router.post('/', requireAdmin, createAdminBusiness);


module.exports = router;
