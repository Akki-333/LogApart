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

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.listen(config.port, () => {
  console.log(`LogApart API listening on port ${config.port}.`);
});
