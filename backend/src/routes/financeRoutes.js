const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const vendorController = require('../controllers/vendorController');
const financeController = require('../controllers/financeController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// The building's outgoings are the committee's business and nobody else's.
const adminOnly = requireRole('ADMIN');

// Expenses
router.get('/expenses', adminOnly, expenseController.getExpenses);
router.post(
  '/expenses',
  adminOnly,
  validate({
    category: { required: true, type: 'string', label: 'Category' },
    amount: { required: true, type: 'number', min: 1, label: 'Amount' },
    bill_date: { required: true, type: 'date', label: 'Bill date' },
    paid_on: { type: 'date', label: 'Payment date' },
    payee_name: { type: 'string', maxLength: 150, label: 'Payee' },
    reference: { type: 'string', maxLength: 100, label: 'Reference' },
    asset_id: { type: 'integer', label: 'Asset' }
  }),
  expenseController.createExpense
);
router.put(
  '/expenses/:id',
  adminOnly,
  validate({
    amount: { type: 'number', min: 0, label: 'Amount' },
    category: { type: 'string', maxLength: 40, label: 'Category' },
    fund: { oneOf: ['MAINTENANCE', 'CORPUS'], label: 'Fund' },
    paid_on: { type: 'date', label: 'Payment date' },
    mode: { oneOf: ['UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'], label: 'Mode' },
    reference: { type: 'string', maxLength: 100, label: 'Reference' },
    note: { type: 'string', maxLength: 255, label: 'Note' }
  }),
  expenseController.updateExpense
);
router.delete(
  '/expenses/:id',
  adminOnly,
  validate({ reason: { required: true, type: 'string', minLength: 4, maxLength: 255, label: 'Reason' } }),
  expenseController.deleteExpense
);
router.get('/expenses/ticket/:ticket_id', adminOnly, expenseController.getTicketCost);

// Vendors and the contracts the building is bound by
router.get('/vendors', adminOnly, vendorController.getVendors);
router.post(
  '/vendors',
  adminOnly,
  validate({
    name: { required: true, type: 'string', maxLength: 150, label: 'Vendor name' },
    service: { required: true, type: 'string', maxLength: 100, label: 'Service' },
    phone: { type: 'string', maxLength: 20, label: 'Phone' }
  }),
  vendorController.createVendor
);
router.put(
  '/vendors/:id',
  adminOnly,
  validate({
    name: { type: 'string', minLength: 2, maxLength: 150, label: 'Vendor name' },
    service: { type: 'string', maxLength: 100, label: 'Service' },
    contact_person: { type: 'string', maxLength: 120, label: 'Contact' },
    phone: { type: 'string', maxLength: 20, label: 'Phone' },
    email: { type: 'string', maxLength: 255, label: 'Email' },
    note: { type: 'string', maxLength: 255, label: 'Note' },
    is_active: { type: 'boolean', label: 'Active' }
  }),
  vendorController.updateVendor
);

router.get('/contracts', adminOnly, vendorController.getContracts);
router.get('/contracts/expiring', adminOnly, vendorController.getExpiringContracts);
router.post(
  '/contracts',
  adminOnly,
  validate({
    vendor_id: { required: true, type: 'integer', label: 'Vendor' },
    title: { required: true, type: 'string', maxLength: 150, label: 'Contract' },
    start_date: { required: true, type: 'date', label: 'Start date' },
    end_date: { required: true, type: 'date', label: 'End date' },
    amount: { type: 'number', min: 0, label: 'Contract value' }
  }),
  vendorController.createContract
);
router.put(
  '/contracts/:id',
  adminOnly,
  validate({
    end_date: { type: 'date', label: 'End date' },
    amount: { type: 'number', min: 0, label: 'Contract value' },
    remind_days_before: { type: 'integer', min: 0, max: 365, label: 'Reminder window' },
    note: { type: 'string', maxLength: 255, label: 'Note' },
    is_active: { type: 'boolean', label: 'Active' }
  }),
  vendorController.updateContract
);

// The books
router.get('/statement', adminOnly, financeController.getStatement);
router.get('/statement/export', adminOnly, financeController.exportStatement);
router.get('/close', adminOnly, financeController.getClose);
router.get('/corpus', adminOnly, financeController.getCorpus);
router.get('/budget', adminOnly, financeController.getBudget);
router.post(
  '/budget',
  adminOnly,
  validate({
    financial_year: { required: true, type: 'string', label: 'Financial year' },
    category: { required: true, type: 'string', label: 'Category' },
    amount: { required: true, type: 'number', min: 0, label: 'Amount' }
  }),
  financeController.setBudget
);

module.exports = router;
