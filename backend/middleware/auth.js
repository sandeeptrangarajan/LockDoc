/* ============================================================
   LockDoc — JWT Authentication Middleware
   Verifies Bearer token from Authorization header.
   Attaches decoded user to req.user.
   ============================================================ */
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'lockdoc_jwt_secret_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate a JWT token for the given user
 * @param {Object} user - Mongoose user document
 * @returns {string} JWT token
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      lockdocId: user.lockdocId
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify and decode a JWT token
 * @param {string} token 
 * @returns {Object|null} decoded payload or null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Express middleware — protects routes
 * Expects: Authorization: Bearer <token>
 */
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token.'
      });
    }

    // Verify user still exists
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Token is invalid.'
      });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Authentication error.'
    });
  }
}

module.exports = {
  generateToken,
  verifyToken,
  authMiddleware
};

