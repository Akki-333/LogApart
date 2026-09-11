const db = require('../config/db');
const {
  buildRunLines,
  displayStatus,
  daysOverdue,
  agingBucket,
  periodToDate,
  toPaise,
  toRupees
} = require('../services/billing');
const { createNotification } = require('./notificationController');

/** Occupied flats with their active resident, the population a run bills. */
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
  balance: toRupees(toPaise(invoice.total_amount) - toPaise(invoice.amount_paid)),
  display_status: displayStatus(invoice),
  days_overdue: daysOverdue(invoice)
});

const readConfig = (body) => ({
  maintenanceRate: Number(body.maintenance_rate || 0),
  rateBasis: body.rate_basis === 'PER_SQFT' ? 'PER_SQFT' : 'FLAT',
  commonElectricityTotal: Number(body.common_electricity_total || 0),
  commonWaterTotal: Number(body.common_water_total || 0),
  splitBasis: body.split_basis === 'PER_SQFT' ? 'PER_SQFT' : 'EQUAL'
});

/**
 * 1. Dry run. Shows the admin exactly what each flat would be charged before
 * anything is written, which is the difference between a billing tool people
 * trust and one they re-check by hand.
 */
exports.previewRun = async (req, res) => {
  try {
    const [units] = await db.query(OCCUPIED_UNITS_QUERY);

    if (units.length === 0) {
      return res.status(400).json({ success: false, message: 'No occupied flats to bill.' });
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

/** 2. Generate a month of dues. One invoice per occupied flat. */
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
      return res.status(400).json({ success: false, message: 'No occupied flats to bill.' });
    }

    const { lines, totals } = buildRunLines(units, config);

    const [run] = await connection.execute(
      `INSERT INTO billing_runs
        (period_month, maintenance_rate, rate_basis, common_electricity_total, common_water_total,
         split_basis, due_date, units_billed, total_billed, note, generated_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        periodMonth,
        config.maintenanceRate,
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
           electricity_amount, water_amount, total_amount, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          run.insertId,
          line.unit_id,
          line.resident_user_id,
          periodMonth,
          line.maintenance_amount,
          line.electricity_amount,
          line.water_amount,
          line.total_amount,
          dueDate
        ]
      );
    }

    await connection.commit();

    createNotification({
      title: `Dues raised for ${req.body.period}`,
      message: `${totals.units_billed} flats billed. Payment is due by ${dueDate}.`,
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

  try {
    const [[collected]] = await db.execute(
      'SELECT COALESCE(SUM(amount_paid), 0) AS paid FROM invoices WHERE billing_run_id = ?',
      [id]
    );

    if (Number(collected.paid) > 0) {
      return res.status(409).json({
        success: false,
        message: 'Payments have already been recorded against this run, so it cannot be deleted.'
      });
    }

    const [result] = await db.execute('DELETE FROM billing_runs WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Billing run not found' });
    }

    res.json({ success: true, message: 'Billing run and its invoices removed.' });
  } catch (error) {
    console.error('Error deleting billing run:', error);
    res.status(500).json({ success: false, message: 'Server error deleting billing run' });
  }
};

/** 5. Invoices, filterable by month, unit and settlement state. */
exports.getInvoices = async (req, res) => {
  const { period, unit_id: unitId, status } = req.query;

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

  try {
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
       ORDER BY i.period_month DESC, u.floor ASC, u.number ASC`,
      params
    );

    let data = rows.map(decorate);

    // OVERDUE is derived rather than stored, so this filter runs after decoration.
    if (status && status !== 'ALL') {
      data = data.filter((invoice) => invoice.display_status === status);
    }

    res.json({ success: true, data });
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
    const alreadyPaid = toPaise(invoice.amount_paid);
    const total = toPaise(invoice.total_amount);

    if (alreadyPaid + amountPaise > total) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `That exceeds the balance of ${toRupees(total - alreadyPaid)} on this invoice.`
      });
    }

    await connection.execute(
      `INSERT INTO payment_records (invoice_id, amount, mode, reference, paid_on, note, recorded_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        toRupees(amountPaise),
        mode || 'UPI',
        reference || null,
        paidOn || new Date().toISOString().slice(0, 10),
        note || null,
        req.user.id
      ]
    );

    const nextPaid = alreadyPaid + amountPaise;
    const nextStatus = nextPaid >= total ? 'PAID' : 'PARTIAL';

    await connection.execute(
      `UPDATE invoices
       SET amount_paid = ?, status = ?, paid_at = IF(? = 'PAID', CURRENT_TIMESTAMP, NULL)
       WHERE id = ?`,
      [toRupees(nextPaid), nextStatus, nextStatus, id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: nextStatus === 'PAID' ? 'Invoice settled in full.' : 'Part payment recorded.',
      data: {
        amount_paid: toRupees(nextPaid),
        balance: toRupees(total - nextPaid),
        status: nextStatus
      }
    });
  } catch (error) {
    await connection.rollback();
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

    // Outstanding spans every month, not just the one on screen. A flat that
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
