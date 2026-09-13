const express = require('express');
const router = express.Router();
const emergencyController = require('../controllers/emergencyController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Readable by everyone signed in, because a list nobody can reach is not a list.
router.get('/contacts', emergencyController.getContacts);

router.post(
  '/contacts',
  requireRole('ADMIN'),
  validate({
    label: { required: true, type: 'string', maxLength: 100, label: 'Label' },
    phone: { required: true, type: 'string', minLength: 3, maxLength: 20, label: 'Phone' }
  }),
  emergencyController.createContact
);
router.delete('/contacts/:id', requireRole('ADMIN'), emergencyController.deleteContact);

// The button wakes the gate and the admins. It does not dial anyone, and the
// screen says so.
router.post(
  '/alert',
  requireRole('RESIDENT'),
  validate({ detail: { type: 'string', maxLength: 200, label: 'What is happening' } }),
  emergencyController.raiseAlert
);

module.exports = router;
