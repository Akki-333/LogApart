const express = require('express');
const router = express.Router();
const pollController = require('../controllers/pollController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

router.get('/', requireRole('ADMIN', 'RESIDENT'), pollController.getPolls);
router.post(
  '/:id/vote',
  requireRole('RESIDENT'),
  validate({ option_id: { required: true, type: 'integer', label: 'Option' } }),
  pollController.vote
);

router.post(
  '/',
  requireRole('ADMIN'),
  validate({
    question: { required: true, type: 'string', minLength: 5, maxLength: 255, label: 'Question' },
    opens_on: { required: true, type: 'date', label: 'Opens on' },
    closes_on: { required: true, type: 'date', label: 'Closes on' }
  }),
  pollController.createPoll
);
router.put(
  '/:id',
  requireRole('ADMIN'),
  validate({
    close_now: { type: 'boolean', label: 'Close now' },
    is_published: { type: 'boolean', label: 'Published' }
  }),
  pollController.updatePoll
);

// Which homes have voted, never which way.
router.get('/:id/turnout', requireRole('ADMIN'), pollController.getTurnout);

module.exports = router;
