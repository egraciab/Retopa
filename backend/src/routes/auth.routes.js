const express = require('express');
const router = express.Router();
const { login, me } = require('../controllers/auth.controller');
const { requireAdmin } = require('../middleware/auth.middleware');

router.post('/login', login);
router.get('/me', requireAdmin, me);

module.exports = router;
