const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireRole } = require('../middleware/auth');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

router.get('/stats', requireRole('ADMIN'), dashboardController.getDashboardStats);

module.exports = router;
