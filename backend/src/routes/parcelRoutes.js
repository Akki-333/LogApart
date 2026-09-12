const express = require('express');
const router = express.Router();
const parcelController = require('../controllers/parcelController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

router.get('/', parcelController.getParcels);
router.get('/waiting', parcelController.getWaitingCount);

// Taking one in and handing it over both happen at the desk.
router.post(
  '/',
  requireRole('SECURITY'),
  validate({
    unit_id: { required: true, type: 'integer', label: 'Home' },
    courier: { type: 'string', maxLength: 60, label: 'Courier' },
    description: { type: 'string', maxLength: 255, label: 'Description' }
  }),
  parcelController.receiveParcel
);
router.put(
  '/:id/release',
  requireRole('SECURITY'),
  validate({ collected_by_name: { required: true, type: 'string', minLength: 2, maxLength: 120, label: 'Collected by' } }),
  parcelController.releaseParcel
);

module.exports = router;
