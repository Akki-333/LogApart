const express = require('express');
const router = express.Router();
const parkingController = require('../controllers/parkingController');
const { requireRole } = require('../middleware/auth');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// The guard needs the bay list to know which car belongs where.
router.get('/bays', requireRole('ADMIN', 'SECURITY'), parkingController.getBays);
router.get('/violations', requireRole('ADMIN', 'SECURITY'), parkingController.getViolations);

// Allotment is administrative.
router.post('/bays', requireRole('ADMIN'), parkingController.createBay);
router.put('/bays/:id', requireRole('ADMIN'), parkingController.updateBay);
router.delete('/bays/:id', requireRole('ADMIN'), parkingController.deleteBay);

// The guard spots the offending car, the admin closes the matter.
router.post('/violations', requireRole('ADMIN', 'SECURITY'), parkingController.createViolation);
router.put('/violations/:id', requireRole('ADMIN'), parkingController.updateViolation);

module.exports = router;
