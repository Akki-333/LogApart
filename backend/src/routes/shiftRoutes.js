const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Mounted behind protect and requirePasswordSet in src/app.js. Guards run their
// own shifts; an admin can read the log but never starts or ends one.
const guardOnly = requireRole('SECURITY');

router.get('/', requireRole('ADMIN', 'SECURITY'), shiftController.getShifts);
router.get('/current', guardOnly, shiftController.getCurrent);
router.post('/start', guardOnly, shiftController.startShift);
router.post(
  '/end',
  guardOnly,
  validate({ handover_note: { type: 'string', maxLength: 1000, label: 'Handover note' } }),
  shiftController.endShift
);
router.post('/:id/acknowledge', guardOnly, shiftController.acknowledge);

module.exports = router;
