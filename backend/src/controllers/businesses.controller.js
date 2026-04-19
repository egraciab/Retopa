const pool = require('../db');
const { success, error } = require('../utils/response');
const businessService = require('../services/businesses.service');

async function getBusinesses(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const cityId = req.query.city_id ? parseInt(req.query.city_id) : null;
    const categoryId = req.query.category_id ? parseInt(req.query.category_id) : null;
    const q = req.query.q ? req.query.q.trim() : null;

    const { rows, total } = await businessService.getBusinesses({
      page,
      limit,
      cityId,
      categoryId,
      q
    });

    return success(res, rows, {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit)
    });

  } catch (err) {
    console.error(err);
    return error(res, 'Error fetching businesses');
  }
}
async function getBusinessById(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (!id) return error(res, 'Invalid ID', 400);

    const data = await businessService.getBusinessById(id);

    if (!data) {
      return error(res, 'Business not found', 404);
    }

    return success(res, data);

  } catch (err) {
    console.error(err);
    return error(res, 'Error fetching business');
  }
}

async function createBusiness(req, res) {
  try {
    if (!req.body.name) return error(res, 'name es requerido', 400);

    const data = await businessService.createBusiness(req.body);

    return success(res, data, {
      message: 'Negocio creado'
    });

  } catch (err) {
    console.error(err);
    return error(res, 'Error creating business');
  }
}

module.exports = {
  getBusinesses,
  getBusinessById,
  createBusiness
};
