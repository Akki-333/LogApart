const rateLimit = require('express-rate-limit');
const { clientIp } = require('../services/audit');

/**
 * Request limits across the whole API.
 *
 * The sign-in ladder in services/loginGuard.js is a different thing and stays:
 * it locks one account after repeated wrong passwords, which is about guessing.
 * This is about volume. Without it any signed-in account could hold all ten
 * database connections open indefinitely, and sixty parallel reads went through
 * untouched when the audit tried it.
 *
 * Counted per account once somebody is signed in, so one busy resident cannot
 * throttle the guard behind the same office router, and per address before that.
 */
const keyFor = (req) => (req.user ? `user:${req.user.id}` : `ip:${clientIp(req) || 'unknown'}`);

const refuse = (message) => (req, res) => {
  res.status(429).json({ success: false, code: 'TOO_MANY_REQUESTS', message });
};

/** The normal ceiling. Generous enough that no honest screen ever meets it. */
const standard = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyFor,
  handler: refuse('You are sending requests faster than we can answer them. Wait a moment and try again.')
});

/**
 * A tighter ceiling for the handful of endpoints that do real work per call:
 * pricing a dues run across every home, building a month's statement, or
 * writing the CSV export. These are the ones worth hammering.
 */
const expensive = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyFor,
  handler: refuse('That report is still being prepared. Give it a minute before asking again.')
});

module.exports = { standard, expensive };
