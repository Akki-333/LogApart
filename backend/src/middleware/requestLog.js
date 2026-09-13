const crypto = require('crypto');
const log = require('../services/log');

// A caller's own id is kept only if it looks like one, so a header cannot be
// used to write arbitrary text into the log.
const USABLE_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Gives every request an id and writes one line when it finishes.
 *
 * The id goes back in X-Request-Id and into the 500 body as its reference, so
 * a screenshot of an error leads straight to its line. Before this only a
 * failure got a reference, and a slow or refused request left no trace.
 *
 * The path is logged without its query string: that is where search terms and
 * phone numbers travel, and they have no business in a log.
 */
module.exports = function requestLog(req, res, next) {
  const offered = req.get('x-request-id');
  req.id = offered && USABLE_ID.test(offered) ? offered : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    log[level]('request', {
      request_id: req.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
      // Set by protect on guarded routes; null on sign-in and the health probes.
      user_id: req.user ? req.user.id : null
    });
  });

  next();
};
