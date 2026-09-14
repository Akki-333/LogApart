const db = require('../config/db');
const { recordAudit } = require('../services/audit');
const { toPaise, toRupees, financialYear } = require('../services/billing');

// Kept in one place so the API, the budget screen and the statement all agree
// on what the building spends money on.
const CATEGORIES = [
  'COMMON_ELECTRICITY', 'COMMON_WATER', 'LIFT_AMC', 'HOUSEKEEPING', 'SECURITY_AGENCY',
  'REPAIRS', 'GARDENING', 'PEST_CONTROL', 'ADMINISTRATION', 'OTHER'
];

const CATEGORY_LABELS = {
  COMMON_ELECTRICITY: 'Common electricity',
  COMMON_WATER: 'Common water',
  LIFT_AMC: 'Lift AMC',
  HOUSEKEEPING: 'Housekeeping',
  SECURITY_AGENCY: 'Security agency',
  REPAIRS: 'Repairs',
  GARDENING: 'Gardening',
  PEST_CONTROL: 'Pest control',
  ADMINISTRATION: 'Administration',
  OTHER: 'Other'
};

const decorate = (row) => ({
  ...row,
  amount: Number(row.amount),
  category_label: CATEGORY_LABELS[row.category] || row.category,
  // An approved bill the building has not actually paid yet is the difference
  // between what it owes and what has left the account.
  is_settled: Boolean(row.paid_on)
});

exports.CATEGORIES = CATEGORIES;
exports.CATEGORY_LABELS = CATEGORY_LABELS;

/** 1. The spend list, filtered the way a committee actually asks for it. */
exports.getExpenses = async (req, res) => {
  const filters = [];
  const params = [];

  if (req.query.from) {
    filters.push('e.bill_date >= ?');
    params.push(req.query.from);
  }

  if (req.query.to) {
    filters.push('e.bill_date <= ?');
    params.push(req.query.to);
  }

  if (req.query.category && CATEGORIES.includes(req.query.category)) {
    filters.push('e.category = ?');
    params.push(req.query.category);
  }

  if (req.query.fund) {
    filters.push('e.fund = ?');
    params.push(req.query.fund === 'CORPUS' ? 'CORPUS' : 'MAINTENANCE');
  }

  if (req.query.vendor_id) {
    filters.push('e.vendor_id = ?');
    params.push(Number(req.query.vendor_id));
  }

  if (req.query.ticket_id) {
    filters.push('e.ticket_id = ?');
    params.push(Number(req.query.ticket_id));
  }

  if (req.query.unpaid === 'true') {
    filters.push('e.paid_on IS NULL');
  }

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const [rows] = await db.execute(
      `SELECT e.*, v.name AS vendor_name, t.title AS ticket_title, usr.name AS recorded_by
       FROM expenses e
       LEFT JOIN vendors v ON e.vendor_id = v.id
       LEFT JOIN maintenance_tickets t ON e.ticket_id = t.id
       LEFT JOIN users usr ON e.recorded_by_id = usr.id
       ${where}
       ORDER BY e.bill_date DESC, e.id DESC
       LIMIT 500`,
      params
    );

    const totalPaise = rows.reduce((sum, row) => sum + toPaise(row.amount), 0);
    const unpaidPaise = rows
      .filter((row) => !row.paid_on)
      .reduce((sum, row) => sum + toPaise(row.amount), 0);

    res.json({
      success: true,
      data: rows.map(decorate),
      totals: {
        count: rows.length,
        total: toRupees(totalPaise),
        unpaid: toRupees(unpaidPaise)
      },
      categories: CATEGORIES.map((code) => ({ code, label: CATEGORY_LABELS[code] }))
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ success: false, message: 'Server error fetching expenses' });
  }
};

/** 2. Record a bill the building has to pay, or has already paid. */
exports.createExpense = async (req, res) => {
  const {
    vendor_id: vendorId, payee_name: payeeName, category, fund, amount,
    bill_date: billDate, paid_on: paidOn, mode, reference, note, ticket_id: ticketId, asset_id: assetId
  } = req.body;

  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ success: false, message: 'Choose a spending category.' });
  }

  try {
    // A vendor named on the bill fills in the payee, so the two can never
    // disagree about who was paid.
    let payee = String(payeeName || '').trim();

    if (vendorId) {
      const [vendors] = await db.execute('SELECT name FROM vendors WHERE id = ?', [vendorId]);

      if (vendors.length === 0) {
        return res.status(404).json({ success: false, message: 'That vendor is not on the registry.' });
      }

      payee = payee || vendors[0].name;
    }

    if (!payee) {
      return res.status(400).json({ success: false, message: 'Name who is being paid.' });
    }

    const [result] = await db.execute(
      `INSERT INTO expenses
        (vendor_id, payee_name, category, fund, amount, bill_date, paid_on, mode, reference, note, ticket_id, asset_id, recorded_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vendorId || null,
        payee,
        category,
        fund === 'CORPUS' ? 'CORPUS' : 'MAINTENANCE',
        Number(amount),
        billDate,
        paidOn || null,
        mode || 'BANK_TRANSFER',
        reference || null,
        note || null,
        ticketId || null,
        assetId || null,
        req.user.id
      ]
    );

    await recordAudit(req, {
      action: 'RECORD_EXPENSE',
      entity: 'expenses',
      entity_id: result.insertId,
      summary: `Recorded ${amount} to ${payee} for ${CATEGORY_LABELS[category]}`,
      after: { payee, category, amount: Number(amount), bill_date: billDate, paid_on: paidOn || null }
    });

    res.json({ success: true, message: 'Expense recorded.', data: { id: result.insertId } });
  } catch (error) {
    console.error('Error recording expense:', error);
    res.status(500).json({ success: false, message: 'Server error recording that expense' });
  }
};

/** 3. Correct a bill, or mark an approved one as paid. */
exports.updateExpense = async (req, res) => {
  const { id } = req.params;
  const { amount, category, paid_on: paidOn, mode, reference, note, fund } = req.body;

  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({ success: false, message: 'Choose a spending category.' });
  }

  try {
    const [existing] = await db.execute('SELECT * FROM expenses WHERE id = ?', [id]);

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'That expense no longer exists.' });
    }

    await db.execute(
      `UPDATE expenses
       SET amount = IFNULL(?, amount),
           category = IFNULL(?, category),
           fund = IFNULL(?, fund),
           paid_on = ?,
           mode = IFNULL(?, mode),
           reference = IFNULL(?, reference),
           note = IFNULL(?, note)
       WHERE id = ?`,
      [
        amount === undefined ? null : Number(amount),
        category || null,
        fund || null,
        paidOn === undefined ? existing[0].paid_on : (paidOn || null),
        mode || null,
        reference === undefined ? null : reference,
        note === undefined ? null : note,
        id
      ]
    );

    const [updated] = await db.execute('SELECT * FROM expenses WHERE id = ?', [id]);

    await recordAudit(req, {
      action: 'EDIT_EXPENSE',
      entity: 'expenses',
      entity_id: id,
      summary: `Edited the expense to ${existing[0].payee_name}`,
      before: existing[0],
      after: updated[0]
    });

    res.json({ success: true, message: 'Expense updated.' });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ success: false, message: 'Server error updating that expense' });
  }
};

/** 4. Remove a bill that should never have been recorded. */
exports.deleteExpense = async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || '').trim();

  try {
    const [existing] = await db.execute('SELECT * FROM expenses WHERE id = ?', [id]);

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'That expense no longer exists.' });
    }

    await db.execute('DELETE FROM expenses WHERE id = ?', [id]);

    await recordAudit(req, {
      action: 'DELETE_EXPENSE',
      entity: 'expenses',
      entity_id: id,
      summary: `Removed the ${existing[0].amount} expense to ${existing[0].payee_name}: ${reason}`,
      before: existing[0],
      after: null
    });

    res.json({ success: true, message: 'Expense removed.' });
  } catch (error) {
    console.error('Error removing expense:', error);
    res.status(500).json({ success: false, message: 'Server error removing that expense' });
  }
};

/** 5. What one repair actually cost, gathered from the bills against it. */
exports.getTicketCost = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT e.id, e.payee_name, e.category, e.amount, e.bill_date, e.paid_on
       FROM expenses e WHERE e.ticket_id = ? ORDER BY e.bill_date ASC`,
      [req.params.ticket_id]
    );

    res.json({
      success: true,
      data: rows.map(decorate),
      total: toRupees(rows.reduce((sum, row) => sum + toPaise(row.amount), 0)),
      financial_year: financialYear()
    });
  } catch (error) {
    console.error('Error reading ticket cost:', error);
    res.status(500).json({ success: false, message: 'Server error reading that cost' });
  }
};
