const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unitController');
const moveOutController = require('../controllers/moveOutController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// The guard desk reads units to populate its "visiting home" dropdown.
router.get('/', requireRole('ADMIN', 'SECURITY'), unitController.getUnits);

// Resident lifecycle is administrative only.
router.post(
  '/assign',
  requireRole('ADMIN'),
  validate({
    unit_id: { required: true, type: 'integer', label: 'Home' },
    name: { required: true, type: 'string', minLength: 2, maxLength: 255, label: 'Name' },
    email: { required: true, type: 'string', maxLength: 255, label: 'Email' },
    phone: { type: 'string', maxLength: 20, label: 'Phone' },
    type: { oneOf: ['OWNER', 'TENANT'], label: 'Tenancy' },
    move_in_date: { type: 'date', label: 'Move-in date' },
    emergency_contact: { type: 'string', maxLength: 20, label: 'Emergency contact' },
    area: { type: 'number', min: 0, label: 'Carpet area' }
  }),
  unitController.assignResident
);
router.put(
  '/:unit_id/resident',
  requireRole('ADMIN'),
  validate({
    name: { type: 'string', minLength: 2, maxLength: 255, label: 'Name' },
    phone: { type: 'string', maxLength: 20, label: 'Phone' },
    emergency_contact: { type: 'string', maxLength: 20, label: 'Emergency contact' },
    type: { oneOf: ['OWNER', 'TENANT'], label: 'Tenancy' },
    area: { type: 'number', min: 0, label: 'Carpet area' }
  }),
  unitController.updateResident
);
router.get('/:unit_id/dues', requireRole('ADMIN'), unitController.getUnitDues);
router.post(
  '/vacate',
  requireRole('ADMIN'),
  validate({
    unit_id: { required: true, type: 'integer', label: 'Home' },
    move_out_date: { type: 'date', label: 'Move-out date' },
    waive_dues: { type: 'boolean', label: 'Waiver' },
    waiver_reason: { type: 'string', maxLength: 255, label: 'Waiver reason' }
  }),
  unitController.vacateUnit
);

// Moving out as a checklist. Once notice is recorded, /vacate waits on it.
router.get('/move-outs', requireRole('ADMIN'), moveOutController.getOpenMoveOuts);
router.get('/:unit_id/move-out', requireRole('ADMIN'), moveOutController.getMoveOut);
router.post(
  '/:unit_id/move-out',
  requireRole('ADMIN'),
  validate({
    notice_given_on: { type: 'date', label: 'Notice given on' },
    planned_move_out: { required: true, type: 'date', label: 'Moving out on' },
    note: { type: 'string', maxLength: 255, label: 'Note' }
  }),
  moveOutController.giveNotice
);
router.post(
  '/:unit_id/move-out/release',
  requireRole('ADMIN'),
  validate({ step: { oneOf: ['HELPERS_UNLINKED', 'PARKING_RELEASED', 'PASSES_CANCELLED'], label: 'Step' } }),
  moveOutController.releaseStep
);
router.post('/:unit_id/move-out/cancel', requireRole('ADMIN'), moveOutController.cancelMoveOut);

// The only password recovery path there is, so it is admin-issued and audited.
router.post(
  '/:unit_id/resident/password',
  requireRole('ADMIN'),
  validate({ reason: { required: true, type: 'string', minLength: 4, maxLength: 255, label: 'Reason' } }),
  unitController.reissuePassword
);

module.exports = router;
