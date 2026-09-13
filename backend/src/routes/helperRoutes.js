const express = require('express');
const router = express.Router();
const helperController = require('../controllers/helperController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// Residents see only the helpers who work for their own home.
router.get('/mine', requireRole('RESIDENT'), helperController.getMyHelpers);

// The guard reads the registry to check people in; the admin manages it.
router.get('/', requireRole('ADMIN', 'SECURITY'), helperController.getHelpers);
router.get('/attendance', requireRole('ADMIN', 'SECURITY'), helperController.getAttendance);

router.post(
  '/',
  requireRole('ADMIN'),
  validate({
    name: { required: true, type: 'string', minLength: 2, maxLength: 255, label: 'Name' },
    helper_type: { required: true, type: 'string', maxLength: 30, label: 'Kind of helper' },
    phone: { type: 'string', maxLength: 20, label: 'Phone' },
    id_proof_type: { type: 'string', maxLength: 40, label: 'ID type' },
    id_proof_number: { type: 'string', maxLength: 60, label: 'ID number' },
    unit_ids: { required: true, isList: true, of: 'integer', minItems: 1, label: 'Homes' }
  }),
  helperController.createHelper
);
router.put(
  '/:id',
  requireRole('ADMIN'),
  validate({
    name: { type: 'string', minLength: 2, maxLength: 255, label: 'Name' },
    helper_type: { type: 'string', maxLength: 30, label: 'Kind of helper' },
    phone: { type: 'string', maxLength: 20, label: 'Phone' },
    id_proof_type: { type: 'string', maxLength: 40, label: 'ID type' },
    id_proof_number: { type: 'string', maxLength: 60, label: 'ID number' },
    unit_ids: { isList: true, of: 'integer', minItems: 1, label: 'Homes' },
    is_active: { type: 'boolean', label: 'Active' }
  }),
  helperController.updateHelper
);

// One tap at the gate, guard only.
router.post('/:id/check-in', requireRole('SECURITY'), helperController.checkIn);
router.post('/:id/check-out', requireRole('SECURITY'), helperController.checkOut);

module.exports = router;
