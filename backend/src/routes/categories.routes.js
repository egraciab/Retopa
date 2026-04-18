const express = require('express');
const router = express.Router();

const { requireAdmin } = require('../middleware/auth.middleware');
const { getCategories } = require('../controllers/categories.controller');

router.get('/', requireAdmin, getCategories);

module.exports = router;
