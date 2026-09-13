/**
 * Reading invoices and balances: the ledger, the collection dashboard and what
 * one home owes.
 */
const db = require('../../config/db');
const {
  agingBucket,
  periodToDate,
  toPaise,
  toRupees
} = require('../../services/billing');
const { decorate } = require('./shared');

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
 * Every home with an unpaid invoice: what it owes, for how long, and when it
 * was last chased. The collection dashboard and the defaulter export both read
 * this, so the list a committee prints is the list on screen.
 *
 * Outstanding spans every month, not just the one on screen. A home that
 * skipped March still owes for March while April is being viewed.
 */
const openBalancesByHome = async (connection = db) => {
  const [openRows] = await connection.execute(
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

  const [chased] = await connection.query(
    `SELECT unit_id, DATE_FORMAT(MAX(sent_at), '%Y-%m-%d %H:%i') AS last_reminded_at,
            DATEDIFF(CURDATE(), MAX(sent_at)) AS days_since_reminded, COUNT(*) AS times_reminded
     FROM dues_reminders
     GROUP BY unit_id`
  );
  const chasedByUnit = new Map(chased.map((row) => [row.unit_id, row]));

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

  const homes = [...byUnit.values()]
    .map((unit) => {
      const chase = chasedByUnit.get(unit.unit_id);

      return {
        ...unit,
        aging_bucket: agingBucket(unit.days_overdue),
        last_reminded_at: chase ? chase.last_reminded_at : null,
        days_since_reminded: chase ? Number(chase.days_since_reminded) : null,
        times_reminded: chase ? Number(chase.times_reminded) : 0
      };
    })
    .sort((a, b) => b.days_overdue - a.days_overdue || b.balance - a.balance);

  return { open, aging, homes };
};

exports.openBalancesByHome = openBalancesByHome;

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

    const { open, aging, homes: defaulters } = await openBalancesByHome();

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
