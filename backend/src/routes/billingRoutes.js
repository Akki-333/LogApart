const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// Admin only for now. Residents read their own invoices through the resident
// portal in the next phase, which needs per-unit scoping first.
const adminOnly = requireRole('ADMIN');

// Collection dashboard and per-unit balances.
router.get('/overview', adminOnly, billingController.getOverview);
router.get('/unit-balances', adminOnly, billingController.getUnitBalances);

// Monthly dues runs.
router.get('/runs', adminOnly, billingController.getRuns);
router.post('/runs/preview', adminOnly, billingController.previewRun);
router.post(
  '/runs',
  adminOnly,
  validate({
    period: { required: true, type: 'month', label: 'Billing month' },
    due_date: { required: true, type: 'date', label: 'Due date' }
  }),
  billingController.createRun
);
router.delete('/runs/:id', adminOnly, billingController.deleteRun);

// Invoices and the payment ledger.
router.get('/invoices', adminOnly, billingController.getInvoices);
router.get('/invoices/:id', adminOnly, billingController.getInvoice);
router.post(
  '/invoices/:id/payments',
  adminOnly,
  validate({
    amount: { required: true, type: 'number', min: 1, label: 'Amount' },
    mode: { oneOf: ['UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'], label: 'Payment mode' },
    reference: { type: 'string', maxLength: 100, label: 'Reference' },
    paid_on: { type: 'date', label: 'Payment date' }
  }),
  billingController.recordPayment
);

module.exports = router;
