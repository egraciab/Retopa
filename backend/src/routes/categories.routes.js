const express = require('express');
const router = express.Router();

const { requireAdmin } = require('../middleware/auth.middleware');
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categories.controller');

router.get('/', requireAdmin, getCategories);
router.post('/', requireAdmin, createCategory);
router.put('/:id', requireAdmin, updateCategory);
router.delete('/:id', requireAdmin, deleteCategory);

module.exports = router;
