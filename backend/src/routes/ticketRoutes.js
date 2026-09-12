const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { requireRole } = require('../middleware/auth');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// Admin only for now. Resident-scoped ticket access arrives with the
// resident portal, which needs per-unit filtering before it can be opened up.
router.get('/', requireRole('ADMIN'), ticketController.getTickets);
router.post('/', requireRole('ADMIN'), ticketController.createTicket);
router.put('/:id', requireRole('ADMIN'), ticketController.updateTicketStatus);

// The conversation on a ticket. An admin sees every one, a resident sees their
// own home's and every common-area issue, and the handler enforces that.
const bothSides = requireRole('ADMIN', 'RESIDENT');

router.get('/:id/comments', bothSides, ticketController.getComments);
router.post('/:id/comments', bothSides, ticketController.addComment);
router.post('/:id/rating', requireRole('RESIDENT'), ticketController.rateTicket);
router.post('/:id/reopen', requireRole('RESIDENT'), ticketController.reopenTicket);

module.exports = router;
