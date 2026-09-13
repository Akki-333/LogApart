const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { loadEnv } = require('./src/config/env');
const db = require('./src/config/db');
const log = require('./src/services/log');
const requestLog = require('./src/middleware/requestLog');

const config = loadEnv();

const app = express();

// First, so even a request refused by a later layer leaves a line with an id.
app.use(requestLog);

// Middleware
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));

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

// Import Routes
const authRoutes = require('./src/routes/authRoutes');
const unitRoutes = require('./src/routes/unitRoutes');
const ticketRoutes = require('./src/routes/ticketRoutes');
const securityRoutes = require('./src/routes/securityRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const billingRoutes = require('./src/routes/billingRoutes');
const residentRoutes = require('./src/routes/residentRoutes');
const helperRoutes = require('./src/routes/helperRoutes');
const noticeRoutes = require('./src/routes/noticeRoutes');
const parkingRoutes = require('./src/routes/parkingRoutes');
const staffRoutes = require('./src/routes/staffRoutes');
const auditRoutes = require('./src/routes/auditRoutes');
const financeRoutes = require('./src/routes/financeRoutes');
const amenityRoutes = require('./src/routes/amenityRoutes');
const householdRoutes = require('./src/routes/householdRoutes');
const pollRoutes = require('./src/routes/pollRoutes');
const parcelRoutes = require('./src/routes/parcelRoutes');
const emergencyRoutes = require('./src/routes/emergencyRoutes');
const exportRoutes = require('./src/routes/exportRoutes');

const { protect, requirePasswordSet } = require('./src/middleware/auth');
const { standard, expensive } = require('./src/middleware/rateLimit');

// Everything except /api/auth is sealed until a one-time password is replaced.
// The limiter runs after protect so it can count per account rather than per
// address: one busy resident should not throttle the guard on the same router.
const guarded = [protect, requirePasswordSet, standard];

// Mount Routes
app.use('/api/auth', standard, authRoutes);
app.use('/api/units', guarded, unitRoutes);
app.use('/api/tickets', guarded, ticketRoutes);
app.use('/api/security', guarded, securityRoutes);
app.use('/api/dashboard', guarded, dashboardRoutes);
app.use('/api/notifications', guarded, notificationRoutes);
app.use('/api/billing', guarded, billingRoutes);
app.use('/api/resident', guarded, residentRoutes);
app.use('/api/helpers', guarded, helperRoutes);
app.use('/api/notices', guarded, noticeRoutes);
app.use('/api/parking', guarded, parkingRoutes);
app.use('/api/staff', guarded, staffRoutes);
app.use('/api/audit', guarded, auditRoutes);
// Pricing a run, building a statement and writing the export each do real work
// per call, so they answer to a tighter ceiling as well as the standard one.
app.use('/api/finance/statement', guarded, expensive);
app.use('/api/billing/runs/preview', guarded, expensive);
app.use('/api/billing/late-fees/preview', guarded, expensive);

app.use('/api/finance', guarded, financeRoutes);
app.use('/api/amenities', guarded, amenityRoutes);
app.use('/api/household', guarded, householdRoutes);
app.use('/api/polls', guarded, pollRoutes);
app.use('/api/parcels', guarded, parcelRoutes);
app.use('/api/emergency', guarded, emergencyRoutes);
// Each export reads a whole list and names people, so it answers to the
// tighter ceiling as well.
app.use('/api/exports', guarded, expensive, exportRoutes);

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

app.listen(config.port, () => {
  log.info('listening', { port: config.port, production: config.isProduction });
});
