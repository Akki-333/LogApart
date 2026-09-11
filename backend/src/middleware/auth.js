const jwt = require('jsonwebtoken');

// Roles that may administer the building. The users.role enum carries both,
// and the seeded admin account uses 'ADMIN'.
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

/**
 * Verifies the bearer token and attaches the decoded payload to req.user.
 * Authentication only. Use requireRole for authorisation.
 */
const protect = (req, res, next) => {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  const token = header.slice(7).trim();

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
};

/**
 * Restricts a route to the listed roles. Must run after protect.
 * Pass 'ADMIN' to allow every administrative role.
 */
const requireRole = (...allowed) => {
  const roles = new Set(
    allowed.flatMap((role) => (role === 'ADMIN' ? ADMIN_ROLES : [role]))
  );

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    if (!roles.has(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Your role does not have access to this action.'
      });
    }

    next();
  };
};

/**
 * Blocks every protected route while the user still holds a one-time password.
 * The client is expected to send them to the change-password screen.
 * /api/auth stays open so they can actually complete the change.
 */
const requirePasswordSet = (req, res, next) => {
  if (req.user && req.user.must_change_password) {
    return res.status(403).json({
      success: false,
      code: 'PASSWORD_CHANGE_REQUIRED',
      message: 'Set a new password before using LogApart.'
    });
  }

  next();
};

const isAdminRole = (role) => ADMIN_ROLES.includes(role);

module.exports = { protect, requireRole, requirePasswordSet, isAdminRole, ADMIN_ROLES };
