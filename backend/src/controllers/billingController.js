const db = require('../config/db');
const { recordAudit } = require('../services/audit');
const {
  buildRunLines,
  displayStatus,
  daysOverdue,
  agingBucket,
  periodToDate,
  toPaise,
  toRupees,
  lateFeeFor
} = require('../services/billing');
const { createNotification } = require('./notificationController');

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
 * 1. Dry run. Shows the admin exactly what each home would be charged before
 * anything is written, which is the difference between a billing tool people
 * trust and one they re-check by hand.
 */
exports.previewRun = async (req, res) => {
  try {
    const [units] = await db.query(OCCUPIED_UNITS_QUERY);

    if (units.length === 0) {
      return res.status(400).json({ success: false, message: 'No occupied homes to bill.' });
    }

    const { lines, totals } = buildRunLines(units, readConfig(req.body));

    res.json({ success: true, data: { lines, totals } });
  } catch (error) {
    if (error.code === 'MISSING_AREA') {
      return res.status(400).json({ success: false, message: error.message, units: error.units });
    }

    console.error('Billing preview error:', error);
    res.status(500).json({ success: false, message: 'Server error building billing preview' });
  }
};

/** 2. Generate a month of dues. One invoice per occupied home. */
exports.createRun = async (req, res) => {
  const periodMonth = periodToDate(req.body.period);
  const dueDate = req.body.due_date;

  if (!periodMonth) {
    return res.status(400).json({ success: false, message: 'Provide the billing month as YYYY-MM.' });
  }

  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return res.status(400).json({ success: false, message: 'Provide a due date as YYYY-MM-DD.' });
  }

  const config = readConfig(req.body);

  if (
    config.maintenanceRate <= 0 &&
    config.corpusRate <= 0 &&
    config.commonElectricityTotal <= 0 &&
    config.commonWaterTotal <= 0
  ) {
    return res.status(400).json({ success: false, message: 'A run needs at least one charge above zero.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [existing] = await connection.execute(
      'SELECT id FROM billing_runs WHERE period_month = ?',
      [periodMonth]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Dues for that month have already been generated. Delete the existing run first.'
      });
    }

    const [units] = await connection.query(OCCUPIED_UNITS_QUERY);

    if (units.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'No occupied homes to bill.' });
    }

    const { lines, totals } = buildRunLines(units, config);

    const [run] = await connection.execute(
      `INSERT INTO billing_runs
        (period_month, maintenance_rate, corpus_rate, rate_basis, common_electricity_total,
         common_water_total, split_basis, due_date, units_billed, total_billed, note, generated_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        periodMonth,
        config.maintenanceRate,
        config.corpusRate,
        config.rateBasis,
        config.commonElectricityTotal,
        config.commonWaterTotal,
        config.splitBasis,
        dueDate,
        totals.units_billed,
        totals.total_billed,
        req.body.note || null,
        req.user.id
      ]
    );

    for (const line of lines) {
      await connection.execute(
        `INSERT INTO invoices
          (billing_run_id, unit_id, resident_user_id, period_month, maintenance_amount,
           electricity_amount, water_amount, corpus_amount, total_amount, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          run.insertId,
          line.unit_id,
          line.resident_user_id,
          periodMonth,
          line.maintenance_amount,
          line.electricity_amount,
          line.water_amount,
          line.corpus_amount,
          line.total_amount,
          dueDate
        ]
      );
    }

    await recordAudit(req, {
      action: 'CREATE_BILLING_RUN',
      entity: 'billing_runs',
      entity_id: run.insertId,
      summary: `Raised dues for ${req.body.period}: ${totals.units_billed} homes, ${totals.total_billed} billed`,
      after: { period: req.body.period, due_date: dueDate, config, totals }
    }, connection);

    await connection.commit();

    createNotification({
      title: `Dues raised for ${req.body.period}`,
      message: `${totals.units_billed} homes billed. Payment is due by ${dueDate}.`,
      target_role: 'RESIDENT',
      type: 'BILLING'
    });

    res.json({
      success: true,
      message: `Generated ${totals.units_billed} invoices for ${req.body.period}.`,
      data: { run_id: run.insertId, totals }
    });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'MISSING_AREA') {
      return res.status(400).json({ success: false, message: error.message, units: error.units });
    }

    console.error('Billing run error:', error);
    res.status(500).json({ success: false, message: 'Server error generating dues' });
  } finally {
    connection.release();
  }
};

/** 3. Every run, newest first, with what has been collected against each. */
exports.getRuns = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        b.id, b.period_month, b.maintenance_rate, b.rate_basis,
        b.common_electricity_total, b.common_water_total, b.split_basis,
        b.due_date, b.units_billed, b.total_billed, b.note, b.created_at,
        usr.name AS generated_by,
        COALESCE(SUM(i.amount_paid), 0) AS total_collected,
        SUM(CASE WHEN i.status = 'PAID' THEN 1 ELSE 0 END) AS units_settled
      FROM billing_runs b
      JOIN users usr ON b.generated_by_id = usr.id
      LEFT JOIN invoices i ON i.billing_run_id = b.id
      GROUP BY b.id
      ORDER BY b.period_month DESC
    `);

    res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        total_billed: Number(r.total_billed),
        total_collected: Number(r.total_collected),
        outstanding: toRupees(toPaise(r.total_billed) - toPaise(r.total_collected))
      }))
    });
  } catch (error) {
    console.error('Error fetching billing runs:', error);
    res.status(500).json({ success: false, message: 'Server error fetching billing runs' });
  }
};

/** 4. Undo a run, allowed only while nothing has been collected against it. */
exports.deleteRun = async (req, res) => {
  const { id } = req.params;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [runs] = await connection.execute(
      'SELECT * FROM billing_runs WHERE id = ? FOR UPDATE',
      [id]
    );

    if (runs.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Billing run not found' });
    }

    const [[collected]] = await connection.execute(
      'SELECT COALESCE(SUM(amount_paid), 0) AS paid, COUNT(*) AS invoices FROM invoices WHERE billing_run_id = ?',
      [id]
    );

    if (Number(collected.paid) > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Payments have already been recorded against this run, so it cannot be deleted.'
      });
    }

    await connection.execute('DELETE FROM billing_runs WHERE id = ?', [id]);

    // A month of invoices disappearing is the kind of thing a committee asks
    // about later, so the run it removed is kept in full.
    await recordAudit(req, {
      action: 'DELETE_BILLING_RUN',
      entity: 'billing_runs',
      entity_id: id,
      summary: `Deleted the dues run for ${runs[0].period_month}, withdrawing ${collected.invoices} unpaid invoices`,
      before: runs[0],
      after: null
    }, connection);

    await connection.commit();

    res.json({ success: true, message: 'Billing run and its invoices removed.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting billing run:', error);
    res.status(500).json({ success: false, message: 'Server error deleting billing run' });
  } finally {
    connection.release();
  }
};

const INVOICE_MAX_PAGE = 500;
const INVOICE_DEFAULT_PAGE = 100;

exports.getInvoices = async (req, res) => {
  const { period, unit_id: unitId, status } = req.query;
  const limit = Math.min(INVOICE_MAX_PAGE, Math.max(1, Number(req.query.limit) || INVOICE_DEFAULT_PAGE));
  const afterId = Number(req.query.after_id) || null;

  const where = [];
  const params = [];

  if (period) {
    const periodMonth = periodToDate(period);
    if (!periodMonth) {
      return res.status(400).json({ success: false, message: 'Period must be YYYY-MM.' });
    }
    where.push('i.period_month = ?');
    params.push(periodMonth);
  }

  if (unitId) {
    where.push('i.unit_id = ?');
    params.push(unitId);
  }

  // OVERDUE is derived rather than stored, so each status is translated into
  // the test decorate applies. Filtering in SQL keeps a filtered page full; a
  // filter applied after LIMIT would hand back a page with holes in it.
  if (status && status !== 'ALL') {
    if (status === 'PAID') {
      where.push("i.status = 'PAID'");
    } else if (status === 'OVERDUE') {
      where.push("i.status <> 'PAID' AND i.due_date < CURDATE()");
    } else {
      where.push('i.status = ? AND i.due_date >= CURDATE()');
      params.push(String(status));
    }
  }

  try {
    if (afterId) {
      const [[anchor]] = await db.execute(
        'SELECT i.id, i.period_month, u.floor, u.number FROM invoices i JOIN units u ON i.unit_id = u.id WHERE i.id = ?',
        [afterId]
      );

      if (!anchor) {
        return res.status(400).json({ success: false, message: 'That page marker is not an invoice.' });
      }

      // The same order as the ORDER BY below, spelled out because it runs in
      // mixed directions: newest month first, then floor and home ascending.
      where.push(`(i.period_month < ? OR (i.period_month = ? AND (u.floor > ? OR (u.floor = ? AND
        (u.number > ? OR (u.number = ? AND i.id > ?))))))`);
      params.push(
        anchor.period_month, anchor.period_month, anchor.floor, anchor.floor,
        anchor.number, anchor.number, anchor.id
      );
    }

    const [rows] = await db.execute(
      `SELECT
         i.id, i.billing_run_id, i.unit_id, i.period_month, i.maintenance_amount,
         i.electricity_amount, i.water_amount, i.total_amount, i.amount_paid,
         i.status, i.due_date, i.paid_at,
         u.number AS unit_number, u.floor AS unit_floor,
         usr.name AS resident_name, usr.phone AS resident_phone
       FROM invoices i
       JOIN units u ON i.unit_id = u.id
       LEFT JOIN users usr ON i.resident_user_id = usr.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY i.period_month DESC, u.floor ASC, u.number ASC, i.id ASC
       LIMIT ${limit}`,
      params
    );

    let data = rows.map(decorate);

    // SQL and decorate can disagree for a few hours around midnight, since the
    // database's day and the UTC day differ. The derived status is the one a
    // reader sees, so it has the last word.
    if (status && status !== 'ALL') {
      data = data.filter((invoice) => invoice.display_status === status);
    }

    res.json({
      success: true,
      data,
      next_after_id: rows.length === limit ? rows[rows.length - 1].id : null
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ success: false, message: 'Server error fetching invoices' });
  }
};

/** 6. One invoice with its settlement history. */
exports.getInvoice = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.execute(
      `SELECT i.*, u.number AS unit_number, u.floor AS unit_floor, usr.name AS resident_name
       FROM invoices i
       JOIN units u ON i.unit_id = u.id
       LEFT JOIN users usr ON i.resident_user_id = usr.id
       WHERE i.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const [payments] = await db.execute(
      `SELECT p.id, p.amount, p.mode, p.reference, p.paid_on, p.note, p.created_at, usr.name AS recorded_by
       FROM payment_records p
       JOIN users usr ON p.recorded_by_id = usr.id
       WHERE p.invoice_id = ?
       ORDER BY p.paid_on DESC, p.id DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...decorate(rows[0]),
        payments: payments.map((payment) => ({ ...payment, amount: Number(payment.amount) }))
      }
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ success: false, message: 'Server error fetching invoice' });
  }
};

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

/**
 * 8. The collection dashboard. Billed against collected for a month, plus the
 * defaulter list bucketed by how long each balance has been outstanding.
 */
exports.getOverview = async (req, res) => {
  const period = req.query.period;
  const periodMonth = period ? periodToDate(period) : null;

  if (period && !periodMonth) {
    return res.status(400).json({ success: false, message: 'Period must be YYYY-MM.' });
  }

  try {
    const [monthRows] = periodMonth
      ? await db.execute(
          `SELECT
             COUNT(*) AS invoice_count,
             COALESCE(SUM(total_amount), 0) AS billed,
             COALESCE(SUM(amount_paid), 0) AS collected,
             SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS settled_count
           FROM invoices WHERE period_month = ?`,
          [periodMonth]
        )
      : [[{ invoice_count: 0, billed: 0, collected: 0, settled_count: 0 }]];

    // Outstanding spans every month, not just the one on screen. A home that
    // skipped March still owes for March while April is being viewed.
    const [openRows] = await db.execute(
      `SELECT i.id, i.unit_id, i.period_month, i.total_amount, i.amount_paid, i.status, i.due_date,
              i.maintenance_amount, i.electricity_amount, i.water_amount,
              u.number AS unit_number, u.floor AS unit_floor,
              usr.name AS resident_name, usr.phone AS resident_phone
       FROM invoices i
       JOIN units u ON i.unit_id = u.id
       LEFT JOIN users usr ON i.resident_user_id = usr.id
       WHERE i.status <> 'PAID'
       ORDER BY i.due_date ASC`
    );

    const open = openRows.map(decorate);

    const aging = { CURRENT: 0, DAYS_1_30: 0, DAYS_31_60: 0, DAYS_61_90: 0, DAYS_90_PLUS: 0 };
    const byUnit = new Map();

    for (const invoice of open) {
      const bucket = agingBucket(invoice.days_overdue);
      aging[bucket] = toRupees(toPaise(aging[bucket]) + toPaise(invoice.balance));

      const current = byUnit.get(invoice.unit_id) || {
        unit_id: invoice.unit_id,
        unit_number: invoice.unit_number,
        unit_floor: invoice.unit_floor,
        resident_name: invoice.resident_name,
        resident_phone: invoice.resident_phone,
        balance: 0,
        open_invoices: 0,
        oldest_due_date: invoice.due_date,
        days_overdue: 0
      };

      current.balance = toRupees(toPaise(current.balance) + toPaise(invoice.balance));
      current.open_invoices += 1;
      current.days_overdue = Math.max(current.days_overdue, invoice.days_overdue);
      byUnit.set(invoice.unit_id, current);
    }

    const defaulters = [...byUnit.values()]
      .map((unit) => ({ ...unit, aging_bucket: agingBucket(unit.days_overdue) }))
      .sort((a, b) => b.days_overdue - a.days_overdue || b.balance - a.balance);

    const month = monthRows[0];
    const billed = Number(month.billed);
    const collected = Number(month.collected);

    res.json({
      success: true,
      data: {
        period: period || null,
        month: {
          invoice_count: Number(month.invoice_count),
          settled_count: Number(month.settled_count),
          billed,
          collected,
          outstanding: toRupees(toPaise(billed) - toPaise(collected)),
          collection_rate: billed > 0 ? Math.round((collected / billed) * 100) : 0
        },
        all_time_outstanding: toRupees(open.reduce((sum, i) => sum + toPaise(i.balance), 0)),
        aging,
        defaulters
      }
    });
  } catch (error) {
    console.error('Error building billing overview:', error);
    res.status(500).json({ success: false, message: 'Server error building billing overview' });
  }
};

/**
 * 9. Outstanding balance per unit, keyed by unit id. Drives the financial mode
 * of the building heatmap and the dues check on a move-out clearance.
 */
exports.getUnitBalances = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT i.unit_id, i.total_amount, i.amount_paid, i.status, i.due_date, u.number AS unit_number
       FROM invoices i
       JOIN units u ON i.unit_id = u.id
       WHERE i.status <> 'PAID'`
    );

    const balances = {};

    for (const row of rows) {
      const invoice = decorate(row);
      const current = balances[row.unit_id] || {
        unit_id: row.unit_id,
        unit_number: row.unit_number,
        balance: 0,
        open_invoices: 0,
        days_overdue: 0
      };

      current.balance = toRupees(toPaise(current.balance) + toPaise(invoice.balance));
      current.open_invoices += 1;
      current.days_overdue = Math.max(current.days_overdue, invoice.days_overdue);
      balances[row.unit_id] = current;
    }

    res.json({ success: true, data: balances });
  } catch (error) {
    console.error('Error fetching unit balances:', error);
    res.status(500).json({ success: false, message: 'Server error fetching unit balances' });
  }
};

/**
 * What a unit still owes across every month. Exported as a plain function
 * rather than a route so the move-out flow in unitController can call it.
 */
exports.outstandingForUnit = async (unitId, connection = db) => {
  const [rows] = await connection.execute(
    `SELECT id, period_month, total_amount, amount_paid, status, due_date,
            maintenance_amount, electricity_amount, water_amount
     FROM invoices WHERE unit_id = ? AND status <> 'PAID'`,
    [unitId]
  );

  const invoices = rows.map(decorate);

  return {
    balance: toRupees(invoices.reduce((sum, invoice) => sum + toPaise(invoice.balance), 0)),
    open_invoices: invoices.length,
    invoices
  };
};

/**
 * 11. Late fees, priced before they are charged.
 *
 * A fee is raised as a real adjustment that moves what the home owes, never
 * derived at read time, so a resident who saw a figure on Monday sees the same
 * figure on Tuesday. The preview runs the same code path as the commit, which
 * is what makes the table in front of the admin worth trusting.
 *
 * One fee per invoice per calendar month. A second run in the same month finds
 * the homes it already charged and leaves them alone, so an admin who clicks
 * twice does not double a defaulter's bill.
 */
const priceLateFees = async (connection, body) => {
  const rule = {
    basis: body.basis === 'PERCENT' ? 'PERCENT' : 'FLAT',
    amount: Number(body.amount || 0),
    graceDays: Number(body.grace_days || 0),
    maxAmount: Number(body.max_amount || 0)
  };

  const params = [];
  let periodFilter = '';

  if (body.period) {
    const periodMonth = periodToDate(body.period);
    if (!periodMonth) return { rule, lines: [], error: 'Provide the billing month as YYYY-MM.' };
    periodFilter = 'AND i.period_month = ?';
    params.push(periodMonth);
  }

  const [invoices] = await connection.execute(
    `SELECT i.*, u.number AS unit_number,
            EXISTS (
              SELECT 1 FROM invoice_adjustments a
              WHERE a.invoice_id = i.id AND a.kind = 'LATE_FEE'
                AND YEAR(a.created_at) = YEAR(CURDATE()) AND MONTH(a.created_at) = MONTH(CURDATE())
            ) AS charged_this_month
     FROM invoices i
     JOIN units u ON i.unit_id = u.id
     WHERE i.status <> 'PAID' AND i.due_date < CURDATE() ${periodFilter}
     ORDER BY i.due_date ASC`,
    params
  );

  const lines = invoices
    .map((invoice) => ({
      invoice_id: invoice.id,
      unit_number: invoice.unit_number,
      due_date: invoice.due_date,
      days_overdue: daysOverdue(invoice),
      balance: toRupees(toPaise(invoice.total_amount) - toPaise(invoice.amount_paid)),
      fee: lateFeeFor(invoice, rule),
      already_charged: Boolean(Number(invoice.charged_this_month))
    }))
    .filter((line) => line.fee > 0);

  return { rule, lines };
};

exports.previewLateFees = async (req, res) => {
  try {
    const { rule, lines, error } = await priceLateFees(db, req.body);

    if (error) return res.status(400).json({ success: false, message: error });

    const chargeable = lines.filter((line) => !line.already_charged);

    res.json({
      success: true,
      data: {
        rule,
        lines,
        total_fee: toRupees(chargeable.reduce((sum, line) => sum + toPaise(line.fee), 0)),
        chargeable: chargeable.length,
        skipped: lines.length - chargeable.length
      }
    });
  } catch (err) {
    console.error('Error pricing late fees:', err);
    res.status(500).json({ success: false, message: 'Server error pricing late fees' });
  }
};

exports.applyLateFees = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { rule, lines, error } = await priceLateFees(connection, req.body);

    if (error) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: error });
    }

    const chargeable = lines.filter((line) => !line.already_charged);

    // Two statements for the whole batch rather than two per invoice. Both sit
    // inside the transaction, so a failure part-way still charges nobody.
    if (chargeable.length > 0) {
      await connection.query(
        'INSERT INTO invoice_adjustments (invoice_id, kind, amount, reason, created_by_id) VALUES ?',
        [chargeable.map((line) => [
          line.invoice_id,
          'LATE_FEE',
          line.fee,
          `${line.days_overdue} days past the due date of ${line.due_date}`,
          req.user.id
        ])]
      );

      // The adjustment rows explain the charge. This is the charge.
      await connection.query(
        `UPDATE invoices
         SET total_amount = total_amount + CASE id ${chargeable.map(() => 'WHEN ? THEN ?').join(' ')} END
         WHERE id IN (?)`,
        [...chargeable.flatMap((line) => [line.invoice_id, line.fee]), chargeable.map((line) => line.invoice_id)]
      );
    }

    const totalFee = toRupees(chargeable.reduce((sum, line) => sum + toPaise(line.fee), 0));

    await recordAudit(req, {
      action: 'APPLY_LATE_FEES',
      entity: 'invoices',
      entity_id: req.body.period || 'all',
      summary: `Charged ${totalFee} in late fees across ${chargeable.length} invoices`,
      after: { rule, charged: chargeable }
    }, connection);

    await connection.commit();

    res.json({
      success: true,
      message: chargeable.length === 0
        ? 'Nothing to charge. Every overdue home has already been charged this month.'
        : `Charged ${totalFee} across ${chargeable.length} invoices.`,
      data: { charged: chargeable.length, total_fee: totalFee, skipped: lines.length - chargeable.length }
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error applying late fees:', err);
    res.status(500).json({ success: false, message: 'Server error applying late fees' });
  } finally {
    connection.release();
  }
};

/** 12. A waiver or a correction on one invoice, always with a reason. */
exports.addAdjustment = async (req, res) => {
  const { id } = req.params;
  const { kind, amount, reason } = req.body;

  if (!['WAIVER', 'CREDIT', 'CORRECTION', 'LATE_FEE'].includes(kind)) {
    return res.status(400).json({ success: false, message: 'Choose what kind of adjustment this is.' });
  }

  // A waiver or credit reduces the bill whichever sign the caller sent, so a
  // mistyped minus cannot quietly turn relief into a charge.
  const magnitude = Math.abs(Number(amount));
  const signed = ['WAIVER', 'CREDIT'].includes(kind) ? -magnitude : magnitude;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute('SELECT * FROM invoices WHERE id = ? FOR UPDATE', [id]);

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const invoice = rows[0];
    const nextTotalPaise = toPaise(invoice.total_amount) + toPaise(signed);

    if (nextTotalPaise < toPaise(invoice.amount_paid)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `That would take the bill below the ${invoice.amount_paid} already paid against it. Refund the difference instead.`
      });
    }

    await connection.execute(
      `INSERT INTO invoice_adjustments (invoice_id, kind, amount, reason, created_by_id)
       VALUES (?, ?, ?, ?, ?)`,
      [id, kind, signed, String(reason).trim(), req.user.id]
    );

    // A waiver that closes the gap settles the invoice, rather than leaving it
    // open at a balance of nothing.
    const settled = nextTotalPaise <= toPaise(invoice.amount_paid);

    await connection.execute(
      'UPDATE invoices SET total_amount = ?, status = ? WHERE id = ?',
      [toRupees(nextTotalPaise), settled ? 'PAID' : invoice.status, id]
    );

    await recordAudit(req, {
      action: kind === 'WAIVER' ? 'WAIVE_DUES' : 'ADJUST_INVOICE',
      entity: 'invoices',
      entity_id: id,
      summary: `${kind} of ${magnitude} on invoice ${id}: ${reason}`,
      before: { total_amount: invoice.total_amount, status: invoice.status },
      after: { total_amount: toRupees(nextTotalPaise), kind, amount: signed }
    }, connection);

    await connection.commit();

    res.json({
      success: true,
      message: 'Adjustment recorded.',
      data: {
        total_amount: toRupees(nextTotalPaise),
        balance: toRupees(nextTotalPaise - toPaise(invoice.amount_paid))
      }
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error adjusting invoice:', err);
    res.status(500).json({ success: false, message: 'Server error adjusting that invoice' });
  } finally {
    connection.release();
  }
};

/** 13. What has been added to or taken off one invoice, and why. */
exports.getAdjustments = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT a.*, usr.name AS created_by
       FROM invoice_adjustments a
       LEFT JOIN users usr ON a.created_by_id = usr.id
       WHERE a.invoice_id = ?
       ORDER BY a.created_at ASC`,
      [req.params.id]
    );

    res.json({ success: true, data: rows.map((row) => ({ ...row, amount: Number(row.amount) })) });
  } catch (error) {
    console.error('Error reading adjustments:', error);
    res.status(500).json({ success: false, message: 'Server error reading adjustments' });
  }
};

/**
 * 14. Chase the homes that are behind, and remember having done it.
 *
 * Each reminder is addressed to one resident, so a defaulter list never
 * becomes a notice to the building. The record of who was chased and when is
 * the point: without it a committee argues from memory.
 */
exports.sendReminders = async (req, res) => {
  const periodMonth = req.body.period ? periodToDate(req.body.period) : null;

  if (req.body.period && !periodMonth) {
    return res.status(400).json({ success: false, message: 'Provide the billing month as YYYY-MM.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [invoices] = await connection.execute(
      `SELECT i.*, u.number AS unit_number, usr.id AS resident_id, usr.name AS resident_name
       FROM invoices i
       JOIN units u ON i.unit_id = u.id
       LEFT JOIN residents r ON r.unit_id = i.unit_id AND r.is_active = true
       LEFT JOIN users usr ON r.user_id = usr.id
       WHERE i.status <> 'PAID' AND i.due_date < CURDATE()
         ${periodMonth ? 'AND i.period_month = ?' : ''}
       ORDER BY i.due_date ASC`,
      periodMonth ? [periodMonth] : []
    );

    // A home between tenants has nobody to remind. It stays in the defaulter
    // list, but sending a notification to no one is not a reminder.
    const reachable = invoices.filter((invoice) => invoice.resident_id);

    // One insert for the reminder record and one for the notifications,
    // rather than two per home. The notifications now go through the same
    // transaction, so a home is never recorded as chased without being told.
    if (reachable.length > 0) {
      await connection.query(
        'INSERT INTO dues_reminders (invoice_id, unit_id, sent_by_id, days_overdue) VALUES ?',
        [reachable.map((invoice) => [invoice.id, invoice.unit_id, req.user.id, daysOverdue(invoice)])]
      );

      await connection.query(
        'INSERT INTO notifications (title, message, target_role, target_user_id, type) VALUES ?',
        [reachable.map((invoice) => {
          const balance = toRupees(toPaise(invoice.total_amount) - toPaise(invoice.amount_paid));
          return [
            `Dues pending for home ${invoice.unit_number}`,
            `${balance} is outstanding, ${daysOverdue(invoice)} days past the due date of ${invoice.due_date}.`,
            'RESIDENT',
            invoice.resident_id,
            'BILLING'
          ];
        })]
      );
    }

    await recordAudit(req, {
      action: 'SEND_DUES_REMINDERS',
      entity: 'invoices',
      entity_id: req.body.period || 'all',
      summary: `Reminded ${reachable.length} homes about outstanding dues`,
      after: { reminded: reachable.map((invoice) => invoice.unit_number) }
    }, connection);

    await connection.commit();

    res.json({
      success: true,
      message: reachable.length === 0
        ? 'Nothing to chase. No overdue home has a resident to remind.'
        : `Reminded ${reachable.length} homes.`,
      data: {
        reminded: reachable.length,
        unreachable: invoices.length - reachable.length
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error sending reminders:', error);
    res.status(500).json({ success: false, message: 'Server error sending reminders' });
  } finally {
    connection.release();
  }
};

/** 15. When each invoice was last chased, so nobody is chased twice a day. */
exports.getReminderHistory = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT invoice_id, MAX(sent_at) AS last_sent_at, COUNT(*) AS times_reminded
       FROM dues_reminders GROUP BY invoice_id`
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error reading reminder history:', error);
    res.status(500).json({ success: false, message: 'Server error reading reminders' });
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
