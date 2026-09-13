/**
 * Money arriving: payments an admin records and payments a resident declares.
 */
const db = require('../../config/db');
const { recordAudit } = require('../../services/audit');
const {
  toPaise,
  toRupees
} = require('../../services/billing');
const { createNotification } = require('../notificationController');
const { settleInvoice, readReceipt } = require('./shared');

/**
 * 7. Record money that arrived. LogApart is a ledger, not a payment gateway:
 * dues are settled over UPI, cash or transfer and then written down here.
 */
exports.recordPayment = async (req, res) => {
  const { id } = req.params;
  const { amount, mode, reference, paid_on: paidOn, note } = req.body;

  const amountPaise = toPaise(amount);

  if (!amountPaise || amountPaise <= 0) {
    return res.status(400).json({ success: false, message: 'Enter an amount above zero.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute('SELECT * FROM invoices WHERE id = ? FOR UPDATE', [id]);

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const invoice = rows[0];
    const settled = await settleInvoice(connection, invoice, {
      amount,
      mode,
      reference,
      paidOn,
      note,
      userId: req.user.id
    });

    await recordAudit(req, {
      action: 'RECORD_PAYMENT',
      entity: 'invoices',
      entity_id: id,
      summary: `Recorded ${amount} against invoice ${id} by ${mode || 'UPI'}, receipt ${settled.receipt_number}`,
      before: { amount_paid: invoice.amount_paid, status: invoice.status },
      after: settled
    }, connection);

    await connection.commit();

    res.json({
      success: true,
      message: settled.status === 'PAID'
        ? `Invoice settled in full. Receipt ${settled.receipt_number}.`
        : `Part payment recorded. Receipt ${settled.receipt_number}.`,
      data: settled
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'OVER_PAYMENT') {
      return res.status(400).json({ success: false, message: error.message });
    }

    console.error('Error recording payment:', error);
    res.status(500).json({ success: false, message: 'Server error recording payment' });
  } finally {
    connection.release();
  }
};

/** 16. What residents say they have paid, waiting on an admin to confirm it. */
exports.getDeclarations = async (req, res) => {
  const status = ['PENDING', 'VERIFIED', 'REJECTED'].includes(req.query.status)
    ? req.query.status
    : 'PENDING';

  try {
    const [rows] = await db.execute(
      `SELECT d.*, u.number AS unit_number, usr.name AS declared_by,
              i.period_month, i.total_amount, i.amount_paid, i.due_date,
              reviewer.name AS reviewed_by
       FROM payment_declarations d
       JOIN units u ON d.unit_id = u.id
       JOIN invoices i ON d.invoice_id = i.id
       LEFT JOIN users usr ON d.declared_by_id = usr.id
       LEFT JOIN users reviewer ON d.reviewed_by_id = reviewer.id
       WHERE d.status = ?
       ORDER BY d.created_at ASC
       LIMIT 200`,
      [status]
    );

    res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        amount: Number(row.amount),
        total_amount: Number(row.total_amount),
        amount_paid: Number(row.amount_paid),
        balance: toRupees(toPaise(row.total_amount) - toPaise(row.amount_paid))
      }))
    });
  } catch (error) {
    console.error('Error reading declarations:', error);
    res.status(500).json({ success: false, message: 'Server error reading declared payments' });
  }
};

/**
 * 17. Confirm or refuse a declared payment.
 *
 * Verifying is what turns a resident's word into money in the ledger, and it is
 * the same settlement the admin performs by hand, so a declared payment and a
 * recorded one are indistinguishable afterwards apart from where they came from.
 */
exports.reviewDeclaration = async (req, res) => {
  const { id } = req.params;
  const approve = req.body.approve === true || req.body.approve === 'true';
  const note = String(req.body.note || '').trim();

  if (!approve && note.length < 4) {
    return res.status(400).json({ success: false, message: 'Say why the declared payment is being refused.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT * FROM payment_declarations WHERE id = ? FOR UPDATE',
      [id]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'No such declared payment.' });
    }

    const declaration = rows[0];

    if (declaration.status !== 'PENDING') {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: `That declaration was already ${declaration.status.toLowerCase()}.`
      });
    }

    let settled = null;

    if (approve) {
      const [invoices] = await connection.execute(
        'SELECT * FROM invoices WHERE id = ? FOR UPDATE',
        [declaration.invoice_id]
      );

      if (invoices.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'The invoice behind that declaration is gone.' });
      }

      settled = await settleInvoice(connection, invoices[0], {
        amount: declaration.amount,
        mode: declaration.mode,
        reference: declaration.reference,
        paidOn: declaration.paid_on,
        note: `Declared by the resident. ${declaration.note || ''}`.trim(),
        userId: req.user.id
      });
    }

    await connection.execute(
      `UPDATE payment_declarations
       SET status = ?, reviewed_by_id = ?, reviewed_at = CURRENT_TIMESTAMP,
           review_note = ?, payment_record_id = ?
       WHERE id = ?`,
      [
        approve ? 'VERIFIED' : 'REJECTED',
        req.user.id,
        note || null,
        settled ? settled.payment_record_id : null,
        id
      ]
    );

    await recordAudit(req, {
      action: approve ? 'VERIFY_DECLARED_PAYMENT' : 'REJECT_DECLARED_PAYMENT',
      entity: 'payment_declarations',
      entity_id: id,
      summary: approve
        ? `Verified ${declaration.amount} declared by home ${declaration.unit_id}, receipt ${settled.receipt_number}`
        : `Refused ${declaration.amount} declared by home ${declaration.unit_id}: ${note}`,
      before: declaration,
      after: settled
    }, connection);

    await createNotification({
      title: approve ? 'Payment confirmed' : 'Payment could not be confirmed',
      message: approve
        ? `${declaration.amount} has been recorded. Receipt ${settled.receipt_number}.`
        : `${declaration.amount} was not recorded: ${note}`,
      target_role: 'RESIDENT',
      target_user_id: declaration.declared_by_id,
      type: 'BILLING'
    });

    await connection.commit();

    res.json({
      success: true,
      message: approve ? `Payment confirmed. Receipt ${settled.receipt_number}.` : 'Declared payment refused.',
      data: settled
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'OVER_PAYMENT') {
      return res.status(400).json({ success: false, message: error.message });
    }

    console.error('Error reviewing declaration:', error);
    res.status(500).json({ success: false, message: 'Server error reviewing that declaration' });
  } finally {
    connection.release();
  }
};

/** 18. One receipt for printing. Any receipt, since this is the admin side. */
exports.getReceipt = async (req, res) => {
  try {
    const receipt = await readReceipt(req.params.number);

    if (!receipt) {
      return res.status(404).json({ success: false, message: 'No receipt with that number.' });
    }

    res.json({ success: true, data: receipt });
  } catch (error) {
    console.error('Error reading a receipt:', error);
    res.status(500).json({ success: false, message: 'Server error reading that receipt' });
  }
};
