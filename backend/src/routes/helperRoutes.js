const express = require('express');
const router = express.Router();
const helperController = require('../controllers/helperController');
const { requireRole } = require('../middleware/auth');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// Residents see only the helpers who work for their own flat.
router.get('/mine', requireRole('RESIDENT'), helperController.getMyHelpers);

// The guard reads the registry to check people in; the admin manages it.
router.get('/', requireRole('ADMIN', 'SECURITY'), helperController.getHelpers);
router.get('/attendance', requireRole('ADMIN', 'SECURITY'), helperController.getAttendance);

router.post('/', requireRole('ADMIN'), helperController.createHelper);
router.put('/:id', requireRole('ADMIN'), helperController.updateHelper);

// One tap at the gate, guard only.
router.post('/:id/check-in', requireRole('SECURITY'), helperController.checkIn);
router.post('/:id/check-out', requireRole('SECURITY'), helperController.checkOut);

module.exports = router;
