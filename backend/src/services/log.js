/**
 * One JSON line per event, on stdout for information and stderr for trouble.
 *
 * JSON rather than prose because the first thing anyone does with a log off a
 * real host is search it: "every 500 for this request id", "every slow call
 * to the statement export". A line a machine can parse answers that with one
 * filter instead of a regular expression.
 *
 *   log.info('request', { request_id, status, ms })
 *   log.error('readiness check failed', { error })
 *
 * LOG_LEVEL is debug, info, warn or error. Anything below it is dropped.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const threshold = () => LEVELS[process.env.LOG_LEVEL] || LEVELS.info;

// An Error does not survive JSON.stringify; its fields are not enumerable.
const serialise = (fields) => {
  const out = {};

  for (const [key, value] of Object.entries(fields || {})) {
    out[key] = value instanceof Error
      ? { message: value.message, code: value.code, stack: value.stack }
      : value;
  }

  return out;
};

const write = (level, msg, fields) => {
  if (LEVELS[level] < threshold()) return;

  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...serialise(fields) });
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;

  stream.write(`${line}\n`);
};

module.exports = {
  debug: (msg, fields) => write('debug', msg, fields),
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields)
};
