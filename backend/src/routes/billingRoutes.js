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
// Late fees are priced before they are charged, on the same code path.
router.post('/late-fees/preview', adminOnly, billingController.previewLateFees);
router.post(
  '/late-fees',
  adminOnly,
  validate({
    amount: { required: true, type: 'number', min: 0, label: 'Fee' },
    basis: { oneOf: ['FLAT', 'PERCENT'], label: 'Fee basis' },
    grace_days: { type: 'integer', min: 0, max: 90, label: 'Grace period' },
    period: { type: 'month', label: 'Billing month' }
  }),
  billingController.applyLateFees
);

// Waivers, credits and corrections, each with a reason on the record.
router.get('/invoices/:id/adjustments', adminOnly, billingController.getAdjustments);
router.post(
  '/invoices/:id/adjustments',
  adminOnly,
  validate({
    kind: { required: true, oneOf: ['WAIVER', 'CREDIT', 'CORRECTION', 'LATE_FEE'], label: 'Adjustment' },
    amount: { required: true, type: 'number', min: 1, label: 'Amount' },
    reason: { required: true, type: 'string', minLength: 4, maxLength: 255, label: 'Reason' }
  }),
  billingController.addAdjustment
);

// Chasing the homes that are behind, one resident at a time.
router.get('/reminders', adminOnly, billingController.getReminderHistory);
router.post('/reminders', adminOnly, billingController.sendReminders);

// What residents say they have paid.
router.get('/declarations', adminOnly, billingController.getDeclarations);
router.post('/declarations/:id/review', adminOnly, billingController.reviewDeclaration);

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
