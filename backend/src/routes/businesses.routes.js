const express = require('express');
const router = express.Router();
const {
  getBusinesses,
  getBusinessById,
  createBusiness
} = require('../controllers/businesses.controller');

router.get('/', getBusinesses);
router.get('/:id', getBusinessById);
router.post('/', createBusiness);

module.exports = router;
