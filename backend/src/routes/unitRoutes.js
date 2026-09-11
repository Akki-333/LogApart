const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unitController');
const { requireRole } = require('../middleware/auth');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// The guard desk reads units to populate its "visiting flat" dropdown.
router.get('/', requireRole('ADMIN', 'SECURITY'), unitController.getUnits);

// Resident lifecycle is administrative only.
router.post('/assign', requireRole('ADMIN'), unitController.assignResident);
router.put('/:unit_id/resident', requireRole('ADMIN'), unitController.updateResident);
router.get('/:unit_id/dues', requireRole('ADMIN'), unitController.getUnitDues);
router.post('/vacate', requireRole('ADMIN'), unitController.vacateUnit);

// The only password recovery path there is, so it is admin-issued and audited.
router.post('/:unit_id/resident/password', requireRole('ADMIN'), unitController.reissuePassword);

module.exports = router;
