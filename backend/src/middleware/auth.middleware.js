const jwt = require('jsonwebtoken');

function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Missing or invalid token'
      });
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'retopa_dev_secret');

    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }
}

module.exports = { requireAdmin };
