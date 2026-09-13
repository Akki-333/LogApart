const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Roles that may administer the building. The users.role enum carries both,
// and the seeded admin account uses 'ADMIN'.
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

/**
 * Verifies the bearer token, then re-reads the account behind it.
 *
 * The second half is the point. A JWT lives a day and used to be the only
 * source of truth for the caller's role, so demoting an admin, closing an
 * account or vacating a home changed nothing until the token expired. The
 * token now carries a version, the account carries the same counter, and a
 * mismatch ends the session immediately. Role and password state are taken
 * from the row rather than the token for the same reason.
 *
 * That costs one primary-key lookup per request, which is the right trade at a
 * building's scale for permissions that can actually be withdrawn.
 */
const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  const token = header.slice(7).trim();

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  let claims;

  try {
    // Pinned, so a token can only ever be checked the way it was signed. An
    // unpinned verify lets the token's own header choose the algorithm.
    claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }

  try {
    const [rows] = await db.execute(
      'SELECT id, name, role, must_change_password, token_version, is_active FROM users WHERE id = ?',
      [claims.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, code: 'ACCOUNT_GONE', message: 'That account no longer exists.' });
    }

    const account = rows[0];

    if (!account.is_active) {
      return res.status(401).json({
        success: false,
        code: 'ACCOUNT_DISABLED',
        message: 'This account has been closed. Speak to the building admin.'
      });
    }

    if (Number(claims.tv) !== Number(account.token_version)) {
      return res.status(401).json({
        success: false,
        code: 'SESSION_REVOKED',
        message: 'This session has ended. Sign in again.'
      });
    }

    req.user = {
      id: account.id,
      name: account.name,
      role: account.role,
      must_change_password: Boolean(account.must_change_password),
      token_version: account.token_version
    };

    next();
  } catch (error) {
    console.error('Auth lookup failed:', error);
    res.status(500).json({ success: false, message: 'Server error verifying your session' });
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

  const guard = (req, res, next) => {
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

  // Read by scripts/api-reference.js, so the reference says who may call a route.
  guard.roles = allowed;

  return guard;
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

// Read by scripts/api-reference.js: a route carrying protect needs a signed-in user
// even inside a group that is otherwise open.
protect.requiresSignIn = true;

module.exports = { protect, requireRole, requirePasswordSet, isAdminRole, ADMIN_ROLES };
