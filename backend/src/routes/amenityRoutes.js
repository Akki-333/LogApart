const express = require('express');
const router = express.Router();
const amenityController = require('../controllers/amenityController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Anyone signed in can see what the building has and when it is free. Booking
// is a resident's act, and the handler resolves their flat itself.
router.get('/', amenityController.getAmenities);
router.get('/:id/availability', amenityController.getAvailability);

router.get('/bookings/all', amenityController.getBookings);
router.post(
  '/bookings',
  requireRole('RESIDENT'),
  validate({
    amenity_id: { required: true, type: 'integer', label: 'Amenity' },
    booking_date: { required: true, type: 'date', label: 'Date' },
    starts_at: { required: true, type: 'string', label: 'Slot' },
    note: { type: 'string', maxLength: 255, label: 'Note' }
  }),
  amenityController.book
);
router.delete('/bookings/:id', requireRole('ADMIN', 'RESIDENT'), amenityController.cancelBooking);

router.post(
  '/',
  requireRole('ADMIN'),
  validate({
    name: { required: true, type: 'string', maxLength: 100, label: 'Name' },
    slot_hours: { type: 'integer', min: 1, max: 12, label: 'Slot length' },
    charge: { type: 'number', min: 0, label: 'Charge' }
  }),
  amenityController.createAmenity
);
router.put('/:id', requireRole('ADMIN'), amenityController.updateAmenity);

module.exports = router;
