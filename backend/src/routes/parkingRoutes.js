const express = require('express');
const router = express.Router();
const parkingController = require('../controllers/parkingController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// The guard needs the bay list to know which car belongs where.
router.get('/bays', requireRole('ADMIN', 'SECURITY'), parkingController.getBays);
router.get('/violations', requireRole('ADMIN', 'SECURITY'), parkingController.getViolations);

// Allotment is administrative.
router.post(
  '/bays',
  requireRole('ADMIN'),
  validate({
    bay_number: { required: true, type: 'string', minLength: 1, maxLength: 20, label: 'Bay number' },
    level: { type: 'string', maxLength: 20, label: 'Level' },
    unit_id: { type: 'integer', label: 'Home' },
    vehicle_number: { type: 'string', maxLength: 50, label: 'Vehicle number' },
    notes: { type: 'string', maxLength: 255, label: 'Notes' }
  }),
  parkingController.createBay
);
router.put(
  '/bays/:id',
  requireRole('ADMIN'),
  validate({
    unit_id: { type: 'integer', label: 'Home' },
    vehicle_number: { type: 'string', maxLength: 50, label: 'Vehicle number' },
    level: { type: 'string', maxLength: 20, label: 'Level' },
    notes: { type: 'string', maxLength: 255, label: 'Notes' }
  }),
  parkingController.updateBay
);
router.delete('/bays/:id', requireRole('ADMIN'), parkingController.deleteBay);

// The guard spots the offending car, the admin closes the matter.
router.post(
  '/violations',
  requireRole('ADMIN', 'SECURITY'),
  validate({
    bay_id: { required: true, type: 'integer', label: 'Bay' },
    vehicle_number: { required: true, type: 'string', minLength: 3, maxLength: 50, label: 'Vehicle number' },
    note: { type: 'string', maxLength: 255, label: 'Note' }
  }),
  parkingController.createViolation
);
router.put(
  '/violations/:id',
  requireRole('ADMIN'),
  validate({ status: { required: true, type: 'string', maxLength: 30, label: 'Status' } }),
  parkingController.updateViolation
);

module.exports = router;
