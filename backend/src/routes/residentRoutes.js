const express = require('express');
const router = express.Router();
const residentController = require('../controllers/residentController');
const { requireRole } = require('../middleware/auth');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.
//
// Every handler resolves the caller's own flat before touching anything, so a
// resident can never read or write another unit's records.
const residentOnly = requireRole('RESIDENT');

router.get('/summary', residentOnly, residentController.getSummary);
router.get('/invoices', residentOnly, residentController.getInvoices);
router.get('/tickets', residentOnly, residentController.getTickets);
router.post('/tickets', residentOnly, residentController.createTicket);
router.get('/visitors', residentOnly, residentController.getVisitorLogs);
router.get('/passes', residentOnly, residentController.getPasses);
router.post('/passes', residentOnly, residentController.createPass);
router.delete('/passes/:id', residentOnly, residentController.cancelPass);

module.exports = router;
