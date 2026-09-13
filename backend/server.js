const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { loadEnv } = require('./src/config/env');

const config = loadEnv();

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));

// Nothing this API accepts is large. A visitor name, an invoice, a notice body.
// A cap keeps a single request from being an easy way to exhaust memory.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'LogApart API is running' });
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

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

/**
 * The last stop. Express 5 forwards a rejected async handler here, so a bug in
 * a controller returns a clean 500 instead of a hung request. The reference is
 * printed alongside the stack, which is how a report of "it said error 4f2a1c"
 * turns into a line in the log.
 */
app.use((error, req, res, next) => {
  const reference = Math.random().toString(16).slice(2, 8);

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'That request was too large.' });
  }

  console.error(`[${reference}] ${req.method} ${req.originalUrl}`, error);

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
  console.log(`LogApart API listening on port ${config.port}.`);
});
