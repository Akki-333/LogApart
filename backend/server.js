const express = require('express');
const cors = require('cors');
const { loadEnv } = require('./src/config/env');

const config = loadEnv();

const app = express();

// Middleware
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

const { protect, requirePasswordSet } = require('./src/middleware/auth');

// Everything except /api/auth is sealed until a one-time password is replaced.
const guarded = [protect, requirePasswordSet];

// Mount Routes
app.use('/api/auth', authRoutes);
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

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.listen(config.port, () => {
  console.log(`LogApart API listening on port ${config.port}.`);
});
