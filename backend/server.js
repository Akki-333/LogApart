const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic Route
app.get('/', (req, res) => {
  res.json({ message: 'ApartAdmin API is running' });
});

// Import Routes
const authRoutes = require('./src/routes/authRoutes');
const unitRoutes = require('./src/routes/unitRoutes');
const ticketRoutes = require('./src/routes/ticketRoutes');
const securityRoutes = require('./src/routes/securityRoutes');

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/security', securityRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});
