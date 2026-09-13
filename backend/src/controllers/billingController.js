/**
 * Billing, split by what an admin is doing. At 1,232 lines this file had become
 * the one nobody could hold in their head; the parts now live in ./billing.
 *
 * It stays as the entry point, so the routes and unitController, which reads
 * what one home owes before a move-out, import exactly what they did before.
 */
module.exports = {
  ...require('./billing/runs'),
  ...require('./billing/invoices'),
  ...require('./billing/payments'),
  ...require('./billing/collections')
};
