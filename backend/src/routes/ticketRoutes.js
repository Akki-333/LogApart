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

module.exports = router;
