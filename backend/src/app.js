const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { loadEnv } = require('./config/env');
const db = require('./config/db');
const log = require('./services/log');
const requestLog = require('./middleware/requestLog');
const { protect, requirePasswordSet } = require('./middleware/auth');
const { standard, expensive } = require('./middleware/rateLimit');

/**
 * The application, without a port. server.js listens on it; the API reference
 * generator reads its route table without starting anything.
 */

const config = loadEnv();

const app = express();

// First, so even a request refused by a later layer leaves a line with an id.
app.use(requestLog);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

const isAllowedOrigin = (origin, callback) => {
  // Allow requests with no origin (like curl, mobile apps, server-to-server)
  if (!origin) return callback(null, true);

  if (config.isProduction) {
    if (origin === config.corsOrigin) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  }

  // In development, allow localhost and 127.0.0.1 on any port (5173, 5174, etc.)
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === config.corsOrigin) {
    return callback(null, true);
  }

  return callback(null, false);
};

app.use(cors({ origin: isAllowedOrigin, credentials: true }));

// Nothing this API accepts is large. A visitor name, an invoice, a notice body.
// A cap keeps a single request from being an easy way to exhaust memory.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.get('/', (req, res) => {
  res.json({ message: 'LogApart API is running' });
});

// Liveness: the process is up and answering. Deliberately touches nothing
// else, so a database outage restarts nothing that a restart would not fix.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime_s: Math.round(process.uptime()) });
});

// Readiness: the process can do its job, which means reaching the database.
// Outside the rate limiter, because a load balancer asks every few seconds.
app.get('/api/health/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (error) {
    log.error('readiness check failed', { request_id: req.id, error });
    res.status(503).json({ status: 'unavailable' });
  }
});

/**
 * Every route group, in the order it is mounted.
 *
 * public:  reachable without signing in. Everything else is sealed until a
 *          one-time password is replaced.
 * limit:   'expensive' adds the tighter ceiling on top of the standard one.
 *
 * The limiter runs after protect so it can count per account rather than per
 * address: one busy resident should not throttle the guard on the same router.
 * An entry without a router only adds a ceiling to part of a later group.
 */
const MOUNTS = [
  { path: '/api/auth', public: true, router: require('./routes/authRoutes') },
  { path: '/api/units', router: require('./routes/unitRoutes') },
  { path: '/api/tickets', router: require('./routes/ticketRoutes') },
  { path: '/api/security', router: require('./routes/securityRoutes') },
  { path: '/api/dashboard', router: require('./routes/dashboardRoutes') },
  { path: '/api/notifications', router: require('./routes/notificationRoutes') },
  { path: '/api/billing', router: require('./routes/billingRoutes') },
  { path: '/api/resident', router: require('./routes/residentRoutes') },
  { path: '/api/helpers', router: require('./routes/helperRoutes') },
  { path: '/api/notices', router: require('./routes/noticeRoutes') },
  { path: '/api/parking', router: require('./routes/parkingRoutes') },
  { path: '/api/staff', router: require('./routes/staffRoutes') },
  { path: '/api/audit', router: require('./routes/auditRoutes') },
  // Pricing a run, building a statement and writing the export each do real
  // work per call.
  { path: '/api/finance/statement', limit: 'expensive' },
  { path: '/api/billing/runs/preview', limit: 'expensive' },
  { path: '/api/billing/late-fees/preview', limit: 'expensive' },
  { path: '/api/finance', router: require('./routes/financeRoutes') },
  { path: '/api/amenities', router: require('./routes/amenityRoutes') },
  { path: '/api/household', router: require('./routes/householdRoutes') },
  { path: '/api/polls', router: require('./routes/pollRoutes') },
  { path: '/api/parcels', router: require('./routes/parcelRoutes') },
  { path: '/api/emergency', router: require('./routes/emergencyRoutes') },
  { path: '/api/assets', router: require('./routes/assetRoutes') },
  { path: '/api/shifts', router: require('./routes/shiftRoutes') },
  // Each export reads a whole list and names people.
  { path: '/api/exports', limit: 'expensive', router: require('./routes/exportRoutes') }
];

for (const mount of MOUNTS) {
  app.use(
    mount.path,
    ...(mount.public ? [] : [protect, requirePasswordSet]),
    standard,
    ...(mount.limit === 'expensive' ? [expensive] : []),
    ...(mount.router ? [mount.router] : [])
  );
}

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

/**
 * The last stop. Express 5 forwards a rejected async handler here, so a bug in
 * a controller returns a clean 500 instead of a hung request. The reference is
 * the request id, which is how a report of "it said error 3f1c..." turns into
 * the exact lines in the log.
 */
app.use((error, req, res, next) => {
  const reference = req.id;

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'That request was too large.' });
  }

  log.error('unhandled error', {
    request_id: reference,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    error
  });

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    message: 'Something went wrong at our end.',
    reference
  });
});

module.exports = { app, config, MOUNTS };
