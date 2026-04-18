const express = require('express');
const router = express.Router();
const { getCities } = require('../controllers/cities.controller');

router.get('/', getCities);

module.exports = router;
