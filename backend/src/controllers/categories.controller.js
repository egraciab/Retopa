const pool = require('../db');

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function getCategories(req, res) {
  const result = await pool.query(
    `SELECT id, name, slug FROM categories ORDER BY name`
  );

  res.json({
    success: true,
    data: result.rows
  });
}

async function createCategory(req, res) {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    const slug = String(req.body.slug || slugify(name));
    const result = await pool.query(
      `
      INSERT INTO categories (name, slug)
      VALUES ($1, $2)
      RETURNING id, name, slug
      `,
      [name, slug]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/admin/categories error:', err);
    return res.status(500).json({ success: false, message: 'Error creating category' });
  }
}

async function updateCategory(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid category id' });
    }

    const name = req.body.name !== undefined ? String(req.body.name).trim() : null;
    const slug = req.body.slug !== undefined
      ? String(req.body.slug).trim()
      : (name ? slugify(name) : null);

    const result = await pool.query(
      `
      UPDATE categories
      SET
        name = COALESCE($2, name),
        slug = COALESCE($3, slug)
      WHERE id = $1
      RETURNING id, name, slug
      `,
      [id, name || null, slug || null]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/admin/categories/:id error:', err);
    return res.status(500).json({ success: false, message: 'Error updating category' });
  }
}

async function deleteCategory(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid category id' });
    }

    const result = await pool.query(
      `
      DELETE FROM categories
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/categories/:id error:', err);
    return res.status(500).json({ success: false, message: 'Error deleting category' });
  }
}

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
};
