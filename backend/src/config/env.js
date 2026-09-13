require('dotenv').config();

/**
 * Validates required configuration at boot. A missing JWT secret used to fall
 * back to the literal string 'secret', which made every token forgeable.
 */
const REQUIRED = ['JWT_SECRET', 'DB_NAME'];

// In production the pieces that carry a convenient local default become
// dangerous: an unset DB_USER connects as root with no password, and an unset
// CORS_ORIGIN quietly admits localhost instead of the real front end. A missing
// value should refuse to boot, the way a missing JWT_SECRET already does.
const REQUIRED_IN_PRODUCTION = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'CORS_ORIGIN'];

function loadEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  const required = isProduction ? REQUIRED.concat(REQUIRED_IN_PRODUCTION) : REQUIRED;
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `\nMissing required environment variables: ${missing.join(', ')}\n` +
      `Copy backend/.env.example to backend/.env and fill them in.\n`
    );
    process.exit(1);
  }

  // A production origin has to be a real one. Pointing the only allowed caller
  // at a developer's machine is the kind of mistake that looks like it works.
  if (isProduction && /localhost|127[.]0[.]0[.]1/.test(process.env.CORS_ORIGIN)) {
    console.error([
      '',
      'CORS_ORIGIN still points at localhost.',
      'Set it to the origin the app is actually served from.',
      ''
    ].join(String.fromCharCode(10)));
    process.exit(1);
  }

  if (process.env.JWT_SECRET.length < 24) {
    console.error('\nJWT_SECRET must be at least 24 characters. Generate one with:\n  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n');
    process.exit(1);
  }

  return {
    isProduction,
    port: Number(process.env.PORT) || 5000,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173'
  };
}

module.exports = { loadEnv };
