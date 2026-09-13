const express = require('express');
const router = express.Router();
const householdController = require('../controllers/householdController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const residentOnly = requireRole('RESIDENT');

router.get('/', residentOnly, householdController.getHousehold);

router.post(
  '/members',
  residentOnly,
  validate({
    name: { required: true, type: 'string', maxLength: 120, label: 'Name' },
    relation: { type: 'string', maxLength: 40, label: 'Relation' },
    phone: { type: 'string', maxLength: 20, label: 'Phone' }
  }),
  householdController.addMember
);
router.delete('/members/:id', residentOnly, householdController.removeMember);

router.post(
  '/vehicles',
  residentOnly,
  validate({
    number_plate: { required: true, type: 'string', minLength: 4, maxLength: 20, label: 'Number plate' },
    vehicle_type: { oneOf: ['CAR', 'BIKE', 'SCOOTER', 'CYCLE', 'OTHER'], label: 'Vehicle' },
    model: { type: 'string', maxLength: 60, label: 'Model' }
  }),
  householdController.addVehicle
);
router.delete('/vehicles/:id', residentOnly, householdController.removeVehicle);

router.put(
  '/directory',
  residentOnly,
  validate({ show_in_directory: { required: true, type: 'boolean', label: 'Listing' } }),
  householdController.setDirectoryVisibility
);

// Neighbours reading neighbours. Residents only, and only those who opted in.
router.get('/directory', residentOnly, householdController.getDirectory);

module.exports = router;
