const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth.middleware');
const {
  getAdminBusinesses,
  getAdminDashboardStats,
  getAdminBusinessById,
  updateBusiness,
  createAdminBusiness,
  deleteBusiness
} = require('../controllers/admin.businesses.controller');

router.get('/', requireAdmin, getAdminBusinesses);
router.get('/stats', requireAdmin, getAdminDashboardStats);
router.get('/:id', requireAdmin, getAdminBusinessById);
router.put('/:id', requireAdmin, updateBusiness);
router.delete('/:id', requireAdmin, deleteBusiness);
router.post('/', requireAdmin, createAdminBusiness);


module.exports = router;
