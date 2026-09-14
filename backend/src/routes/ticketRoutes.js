const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// Admin only for now. Resident-scoped ticket access arrives with the
// resident portal, which needs per-unit filtering before it can be opened up.
router.get('/', requireRole('ADMIN'), ticketController.getTickets);
// The SLA breach report, and a way to run the escalation sweep on demand.
router.get('/sla/breaches', requireRole('ADMIN'), ticketController.getBreaches);
router.post('/sla/escalate', requireRole('ADMIN'), ticketController.escalateNow);
router.post(
  '/',
  requireRole('ADMIN'),
  validate({
    title: { required: true, type: 'string', minLength: 3, maxLength: 255, label: 'Title' },
    description: { required: true, type: 'string', minLength: 3, maxLength: 2000, label: 'Description' },
    category: { oneOf: ['PLUMBING', 'ELECTRICAL', 'STRUCTURAL', 'LIFT', 'COMMON', 'OTHER'], label: 'Category' },
    scope: { oneOf: ['UNIT', 'COMMON'], label: 'Scope' },
    location: { type: 'string', maxLength: 100, label: 'Location' },
    unit_id: { type: 'integer', label: 'Home' },
    asset_id: { type: 'integer', label: 'Asset' },
    priority: { oneOf: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], label: 'Priority' }
  }),
  ticketController.createTicket
);
router.put(
  '/:id',
  requireRole('ADMIN'),
  validate({
    status: { oneOf: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'], label: 'Status' },
    priority: { oneOf: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], label: 'Priority' },
    assigned_to_id: { type: 'integer', label: 'Assignee' },
    asset_id: { type: 'integer', label: 'Asset' }
  }),
  ticketController.updateTicketStatus
);

// The conversation on a ticket. An admin sees every one, a resident sees their
// own home's and every common-area issue, and the handler enforces that.
const bothSides = requireRole('ADMIN', 'RESIDENT');

router.get('/:id/comments', bothSides, ticketController.getComments);
router.post(
  '/:id/comments',
  bothSides,
  validate({ body: { required: true, type: 'string', minLength: 2, maxLength: 1000, label: 'Message' } }),
  ticketController.addComment
);
router.post(
  '/:id/rating',
  requireRole('RESIDENT'),
  validate({
    rating: { required: true, type: 'integer', min: 1, max: 5, label: 'Rating' },
    note: { type: 'string', maxLength: 255, label: 'Note' }
  }),
  ticketController.rateTicket
);
router.post(
  '/:id/reopen',
  requireRole('RESIDENT'),
  validate({ reason: { required: true, type: 'string', minLength: 4, maxLength: 255, label: 'Reason' } }),
  ticketController.reopenTicket
);

module.exports = router;
