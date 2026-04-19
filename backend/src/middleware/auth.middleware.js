const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Missing or invalid token'
      });
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);

    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden'
    });
  }

  const role = (req.user.role || '').toLowerCase();

  if (role !== 'admin' && role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden'
    });
  }

  next();
}

module.exports = { requireAuth, requireAdmin };
