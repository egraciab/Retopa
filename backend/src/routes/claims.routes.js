const express = require('express');
const router = express.Router();
const { createClaim } = require('../controllers/claims.controller');

router.post('/', createClaim);

module.exports = router;
