const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const { requireRole } = require('../middleware/auth');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.
//
// Salaries are on these records, so the whole module is administrative.
const adminOnly = requireRole('ADMIN');

router.get('/', adminOnly, staffController.getStaff);
router.post('/', adminOnly, staffController.createStaff);
router.put('/:id', adminOnly, staffController.updateStaff);

router.get('/attendance', adminOnly, staffController.getAttendance);
router.post('/attendance', adminOnly, staffController.markAttendance);

module.exports = router;
