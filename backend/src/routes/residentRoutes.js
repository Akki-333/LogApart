const express = require('express');
const router = express.Router();
const residentController = require('../controllers/residentController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.
//
// Every handler resolves the caller's own home before touching anything, so a
// resident can never read or write another unit's records.
const residentOnly = requireRole('RESIDENT');

router.get('/summary', residentOnly, residentController.getSummary);
router.get('/invoices', residentOnly, residentController.getInvoices);
// Telling the building about a payment already made. It never moves a balance.
router.get('/declarations', residentOnly, residentController.getDeclarations);
router.post(
  '/declarations',
  residentOnly,
  validate({
    invoice_id: { required: true, type: 'integer', label: 'Bill' },
    amount: { required: true, type: 'number', min: 1, label: 'Amount' },
    mode: { oneOf: ['UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'], label: 'How you paid' },
    reference: { type: 'string', maxLength: 100, label: 'Reference' },
    paid_on: { type: 'date', label: 'Payment date' }
  }),
  residentController.declarePayment
);

// Bills, receipts, clearance certificates and notices, gathered rather than
// stored again.
router.get('/documents', residentOnly, residentController.getDocuments);
router.get('/receipts/:number', residentOnly, residentController.getReceipt);

router.get('/tickets', residentOnly, residentController.getTickets);
router.post(
  '/tickets',
  residentOnly,
  validate({
    title: { required: true, type: 'string', minLength: 3, maxLength: 255, label: 'Title' },
    description: { required: true, type: 'string', minLength: 3, maxLength: 2000, label: 'Description' },
    category: { oneOf: ['PLUMBING', 'ELECTRICAL', 'STRUCTURAL', 'LIFT', 'COMMON', 'OTHER'], label: 'Category' },
    scope: { oneOf: ['UNIT', 'COMMON'], label: 'Scope' },
    location: { type: 'string', maxLength: 100, label: 'Location' }
  }),
  residentController.createTicket
);
router.get('/visitors', residentOnly, residentController.getVisitorLogs);
router.get('/passes', residentOnly, residentController.getPasses);
router.post(
  '/passes',
  residentOnly,
  validate({
    visitor_name: { required: true, type: 'string', minLength: 2, maxLength: 255, label: 'Visitor name' },
    visitor_phone: { type: 'string', maxLength: 20, label: 'Phone' },
    vehicle_number: { type: 'string', maxLength: 50, label: 'Vehicle number' },
    expected_on: { type: 'date', label: 'Expected on' },
    purpose: { oneOf: ['GUEST', 'DELIVERY', 'SERVICE', 'MAID', 'OTHER'], label: 'Purpose' }
  }),
  residentController.createPass
);
router.delete('/passes/:id', residentOnly, residentController.cancelPass);

module.exports = router;
