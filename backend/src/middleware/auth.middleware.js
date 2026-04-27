const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim();
  return token || null;
}

function verifyRequestToken(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  return jwt.verify(token, JWT_SECRET);
}

function requireAuth(req, res, next) {
  try {
    const payload = verifyRequestToken(req);
    if (!payload) {
      return res.status(401).json({
        success: false,
        message: 'Missing or invalid token'
      });
    }

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
  return requireAuth(req, res, () => {
    const role = String(req.user?.role || '').toLowerCase();
    const allowedRoles = new Set(['admin', 'superadmin']);

    if (!allowedRoles.has(role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden'
      });
    }

    next();
  });
}

module.exports = { requireAuth, requireAdmin };
