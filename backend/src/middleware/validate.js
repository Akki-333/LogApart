/**
 * One place to check a request body, because every controller was hand-rolling
 * the same three checks and each did it slightly differently. A missing field
 * returned 400 in one handler and a MySQL error in the next.
 *
 * Deliberately small. It answers "is this shaped like what the handler expects",
 * not "is this a valid business request", which stays in the controller where
 * the database is.
 *
 *   validate({ amount: { required: true, type: 'number', min: 1 } })
 */

const asNumber = (value) => (value === '' || value === null ? NaN : Number(value));

const CHECKS = {
  string: (value) => typeof value === 'string',
  number: (value) => Number.isFinite(asNumber(value)),
  integer: (value) => Number.isInteger(asNumber(value)),
  boolean: (value) => typeof value === 'boolean' || value === 'true' || value === 'false',
  date: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)),
  month: (value) => /^\d{4}-\d{2}$/.test(String(value))
};

function checkField(name, value, rule) {
  const missing = value === undefined || value === null || value === '';

  if (missing) {
    return rule.required ? `${rule.label || name} is required.` : null;
  }

  if (rule.type && CHECKS[rule.type] && !CHECKS[rule.type](value)) {
    return `${rule.label || name} must be a valid ${rule.type}.`;
  }

  if (rule.maxLength && String(value).trim().length > rule.maxLength) {
    return `${rule.label || name} must be ${rule.maxLength} characters or fewer.`;
  }

  if (rule.minLength && String(value).trim().length < rule.minLength) {
    return `${rule.label || name} must be at least ${rule.minLength} characters.`;
  }

  if (rule.oneOf && !rule.oneOf.includes(value)) {
    return `${rule.label || name} must be one of: ${rule.oneOf.join(', ')}.`;
  }

  if (rule.min !== undefined && asNumber(value) < rule.min) {
    return `${rule.label || name} must be at least ${rule.min}.`;
  }

  if (rule.max !== undefined && asNumber(value) > rule.max) {
    return `${rule.label || name} must be no more than ${rule.max}.`;
  }

  return null;
}

const validate = (schema) => (req, res, next) => {
  const body = req.body || {};

  // Every problem at once. Fixing a form one field per round trip is miserable.
  const errors = Object.entries(schema)
    .map(([name, rule]) => checkField(name, body[name], rule))
    .filter(Boolean);

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_REQUEST',
      message: errors[0],
      errors
    });
  }

  next();
};

module.exports = { validate };
