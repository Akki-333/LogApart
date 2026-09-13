/**
 * Helpers more than one part of billing needs: the invoice shape a reader sees,
 * the population a run bills, and the one path that settles money against an
 * invoice.
 */
const db = require('../../config/db');
const {
  displayStatus,
  daysOverdue,
  toPaise,
  toRupees
} = require('../../services/billing');

/** Occupied homes with their active resident, the population a run bills. */
const OCCUPIED_UNITS_QUERY = `
  SELECT u.id AS unit_id, u.number, u.floor, u.area, usr.id AS resident_user_id, usr.name AS resident_name
  FROM units u
  LEFT JOIN residents r ON u.id = r.unit_id AND r.is_active = true
  LEFT JOIN users usr ON r.user_id = usr.id
  WHERE u.is_occupied = 1
  ORDER BY u.floor ASC, u.number ASC
`;

const decorate = (invoice) => ({
  ...invoice,
  total_amount: Number(invoice.total_amount),
  amount_paid: Number(invoice.amount_paid),
  maintenance_amount: Number(invoice.maintenance_amount),
  electricity_amount: Number(invoice.electricity_amount),
  water_amount: Number(invoice.water_amount),
  corpus_amount: Number(invoice.corpus_amount || 0),
  balance: toRupees(toPaise(invoice.total_amount) - toPaise(invoice.amount_paid)),
  display_status: displayStatus(invoice),
  days_overdue: daysOverdue(invoice)
});

const readConfig = (body) => ({
  maintenanceRate: Number(body.maintenance_rate || 0),
  rateBasis: body.rate_basis === 'PER_SQFT' ? 'PER_SQFT' : 'FLAT',
  corpusRate: Number(body.corpus_rate || 0),
  commonElectricityTotal: Number(body.common_electricity_total || 0),
  commonWaterTotal: Number(body.common_water_total || 0),
  splitBasis: body.split_basis === 'PER_SQFT' ? 'PER_SQFT' : 'EQUAL'
});

/**
 * Issues a receipt number for the calendar year the payment falls in.
 * Counted inside the caller's transaction and under a row lock on the year, so
 * two admins recording a payment at the same moment cannot mint the same number.
 */
const nextReceiptNumber = async (connection, paidOn) => {
  const year = new Date(`${paidOn}T00:00:00`).getFullYear();
  const [[counted]] = await connection.execute(
    'SELECT COUNT(*) AS issued FROM payment_records WHERE receipt_number LIKE ? FOR UPDATE',
    [`RCP-${year}-%`]
  );

  return `RCP-${year}-${String(Number(counted.issued) + 1).padStart(4, '0')}`;
};

/**
 * Puts money against an invoice and moves its status. Shared by the admin
 * recording a payment directly and by an admin verifying one a resident
 * declared, so both routes settle an invoice exactly the same way.
 *
 * The caller has already locked the invoice row.
 */
const settleInvoice = async (connection, invoice, details) => {
  const amountPaise = toPaise(details.amount);
  const alreadyPaid = toPaise(invoice.amount_paid);
  const total = toPaise(invoice.total_amount);

  if (alreadyPaid + amountPaise > total) {
    const error = new Error(
      `That exceeds the balance of ${toRupees(total - alreadyPaid)} on this invoice.`
    );
    error.code = 'OVER_PAYMENT';
    throw error;
  }

  const paidOn = details.paidOn || new Date().toISOString().slice(0, 10);
  const receiptNumber = await nextReceiptNumber(connection, paidOn);

  const [record] = await connection.execute(
    `INSERT INTO payment_records
      (receipt_number, invoice_id, amount, mode, reference, paid_on, note, recorded_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      receiptNumber,
      invoice.id,
      toRupees(amountPaise),
      details.mode || 'UPI',
      details.reference || null,
      paidOn,
      details.note || null,
      details.userId
    ]
  );

  const nextPaid = alreadyPaid + amountPaise;
  const nextStatus = nextPaid >= total ? 'PAID' : 'PARTIAL';

  await connection.execute(
    `UPDATE invoices
     SET amount_paid = ?, status = ?, paid_at = IF(? = 'PAID', CURRENT_TIMESTAMP, NULL)
     WHERE id = ?`,
    [toRupees(nextPaid), nextStatus, nextStatus, invoice.id]
  );

  return {
    payment_record_id: record.insertId,
    receipt_number: receiptNumber,
    paid_on: paidOn,
    amount_paid: toRupees(nextPaid),
    balance: toRupees(total - nextPaid),
    status: nextStatus
  };
};

/**
 * One receipt, in the shape the printable page needs. Scoped to a home when a
 * resident asks, so a receipt number guessed from the sequence reads as not
 * found rather than as somebody else's payment.
 */
const RECEIPT_NUMBER = /^RCP-\d{4}-\d{4,}$/;

const readReceipt = async (receiptNumber, unitId = null) => {
  if (!RECEIPT_NUMBER.test(String(receiptNumber))) return null;

  const [rows] = await db.execute(
    `SELECT p.receipt_number, p.amount, p.mode, p.reference, p.paid_on,
            i.id AS invoice_id, i.period_month, i.due_date, i.total_amount, i.amount_paid,
            u.number AS unit_number, u.floor AS unit_floor,
            resident.name AS resident_name, recorder.name AS recorded_by
     FROM payment_records p
     JOIN invoices i ON p.invoice_id = i.id
     JOIN units u ON i.unit_id = u.id
     LEFT JOIN users resident ON i.resident_user_id = resident.id
     LEFT JOIN users recorder ON p.recorded_by_id = recorder.id
     WHERE p.receipt_number = ? ${unitId ? 'AND i.unit_id = ?' : ''}`,
    unitId ? [receiptNumber, unitId] : [receiptNumber]
  );

  if (rows.length === 0) return null;

  const row = rows[0];

  return {
    ...row,
    amount: Number(row.amount),
    total_amount: Number(row.total_amount),
    amount_paid: Number(row.amount_paid),
    balance: toRupees(toPaise(row.total_amount) - toPaise(row.amount_paid))
  };
};

module.exports = { OCCUPIED_UNITS_QUERY, decorate, readConfig, nextReceiptNumber, settleInvoice, readReceipt };
