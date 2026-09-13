const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const { requireRole } = require('../middleware/auth');

// Mounted behind protect, requirePasswordSet and the stricter ceiling for
// expensive calls in server.js. Admin only: every one of these lists names
// residents or visitors.
const adminOnly = requireRole('ADMIN');

router.get('/defaulters.csv', adminOnly, exportController.defaulters);
router.get('/gate.csv', adminOnly, exportController.gateTraffic);
router.get('/helper-attendance.csv', adminOnly, exportController.helperAttendance);

module.exports = router;
