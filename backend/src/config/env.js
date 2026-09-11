require('dotenv').config();

/**
 * Validates required configuration at boot. A missing JWT secret used to fall
 * back to the literal string 'secret', which made every token forgeable.
 */
const REQUIRED = ['JWT_SECRET', 'DB_NAME'];

function loadEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `\nMissing required environment variables: ${missing.join(', ')}\n` +
      `Copy backend/.env.example to backend/.env and fill them in.\n`
    );
    process.exit(1);
  }

  if (process.env.JWT_SECRET.length < 24) {
    console.error('\nJWT_SECRET must be at least 24 characters. Generate one with:\n  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n');
    process.exit(1);
  }

  return {
    port: Number(process.env.PORT) || 5000,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173'
  };
}

module.exports = { loadEnv };
