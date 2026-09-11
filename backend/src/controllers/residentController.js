const crypto = require('crypto');
const db = require('../config/db');
const { displayStatus, daysOverdue, toPaise, toRupees } = require('../services/billing');
const { createNotification } = require('./notificationController');

// Codes are read aloud and typed at a gate, so O/0 and I/1 are left out.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PASS_CODE_LENGTH = 6;

const generatePassCode = () =>
  Array.from(crypto.randomBytes(PASS_CODE_LENGTH))
    .map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
    .join('');

/**
 * The flat this user currently lives in. Every resident endpoint scopes to it,
 * so a resident can only ever read their own unit.
 */
const getActiveUnit = async (userId) => {
  const [rows] = await db.execute(
    `SELECT u.id AS unit_id, u.number, u.floor, u.type, u.area, r.move_in_date, r.emergency_contact
     FROM residents r
     JOIN units u ON r.unit_id = u.id
     WHERE r.user_id = ? AND r.is_active = true
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
};

/** Wraps a handler so it always has a resolved unit, or answers 404 once. */
const withUnit = (handler) => async (req, res) => {
  try {
    const unit = await getActiveUnit(req.user.id);

    if (!unit) {
      return res.status(404).json({
        success: false,
        code: 'NO_ACTIVE_UNIT',
        message: 'Your account is not currently linked to a flat. Please contact the building admin.'
      });
    }

    return await handler(req, res, unit);
  } catch (error) {
    console.error('Resident portal error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const decorateInvoice = (invoice) => ({
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

/** 1. Everything the home screen needs, in one call. */
exports.getSummary = withUnit(async (req, res, unit) => {
  const [invoiceRows] = await db.execute(
    `SELECT * FROM invoices WHERE unit_id = ? ORDER BY period_month DESC LIMIT 6`,
    [unit.unit_id]
  );

  const invoices = invoiceRows.map(decorateInvoice);
  const open = invoices.filter((invoice) => invoice.status !== 'PAID');

  const [[tickets]] = await db.execute(
    `SELECT
       SUM(CASE WHEN status <> 'RESOLVED' AND status <> 'CLOSED' THEN 1 ELSE 0 END) AS open_count,
       COUNT(*) AS total_count
     FROM maintenance_tickets WHERE unit_id = ?`,
    [unit.unit_id]
  );

  const [visitors] = await db.execute(
    `SELECT id, visitor_name, purpose, company, status, entry_time, exit_time
     FROM visitor_logs
     WHERE unit_id = ? AND entry_time IS NOT NULL AND deleted_at IS NULL
     ORDER BY entry_time DESC
     LIMIT 5`,
    [unit.unit_id]
  );

  const [passes] = await db.execute(
    `SELECT id, visitor_name, pass_code, expected_on, purpose
     FROM visitor_logs
     WHERE unit_id = ? AND status = 'APPROVED' AND pass_code IS NOT NULL
       AND expected_on >= CURDATE() AND deleted_at IS NULL
     ORDER BY expected_on ASC`,
    [unit.unit_id]
  );

  res.json({
    success: true,
    data: {
      unit,
      dues: {
        balance: toRupees(open.reduce((sum, invoice) => sum + toPaise(invoice.balance), 0)),
        open_invoices: open.length,
        latest: invoices[0] || null
      },
      tickets: {
        open_count: Number(tickets.open_count || 0),
        total_count: Number(tickets.total_count || 0)
      },
      recent_visitors: visitors,
      active_passes: passes
    }
  });
});

/** 2. Every invoice ever raised against this flat, with its settlements. */
exports.getInvoices = withUnit(async (req, res, unit) => {
  const [rows] = await db.execute(
    `SELECT i.*, b.note AS run_note
     FROM invoices i
     LEFT JOIN billing_runs b ON i.billing_run_id = b.id
     WHERE i.unit_id = ?
     ORDER BY i.period_month DESC`,
    [unit.unit_id]
  );

  const invoices = rows.map(decorateInvoice);

  // Attach settlements in one extra query rather than one per invoice.
  if (invoices.length > 0) {
    const ids = invoices.map((invoice) => invoice.id);
    const [payments] = await db.query(
      `SELECT invoice_id, amount, mode, reference, paid_on FROM payment_records
       WHERE invoice_id IN (?) ORDER BY paid_on DESC`,
      [ids]
    );

    const byInvoice = new Map();
    for (const payment of payments) {
      const list = byInvoice.get(payment.invoice_id) || [];
      list.push({ ...payment, amount: Number(payment.amount) });
      byInvoice.set(payment.invoice_id, list);
    }

    invoices.forEach((invoice) => {
      invoice.payments = byInvoice.get(invoice.id) || [];
    });
  }

  res.json({
    success: true,
    data: {
      unit,
      invoices,
      total_outstanding: toRupees(
        invoices.filter((i) => i.status !== 'PAID').reduce((sum, i) => sum + toPaise(i.balance), 0)
      )
    }
  });
});

/**
 * 3. Issues for this flat, plus every common-area issue. A stuck lift concerns
 * this resident too, and seeing it already reported stops a second report.
 */
exports.getTickets = withUnit(async (req, res, unit) => {
  const [rows] = await db.execute(
    `SELECT t.id, t.title, t.description, t.category, t.priority, t.status,
            t.scope, t.location, t.unit_id, t.created_at, t.resolved_at, t.raised_by_resident,
            usr.name AS reported_by, assignee.name AS assigned_to
     FROM maintenance_tickets t
     JOIN users usr ON t.created_by_id = usr.id
     LEFT JOIN users assignee ON t.assigned_to_id = assignee.id
     WHERE t.unit_id = ? OR t.scope = 'COMMON'
     ORDER BY t.created_at DESC`,
    [unit.unit_id]
  );

  res.json({
    success: true,
    data: rows.map((row) => ({
      ...row,
      place: row.scope === 'COMMON' ? row.location || 'Common area' : `Flat ${unit.number}`,
      is_mine: row.scope !== 'COMMON'
    }))
  });
});

/**
 * 4. Raise an issue. Scope is fixed to the resident's own flat and priority is
 * set by the admin, not the reporter, so the SLA clock cannot be gamed from the
 * portal. Everything arrives as MEDIUM for triage.
 */
exports.createTicket = withUnit(async (req, res, unit) => {
  const { title, description, category, scope, location } = req.body;

  if (!String(title || '').trim() || !String(description || '').trim()) {
    return res.status(400).json({ success: false, message: 'Give the issue a title and a description.' });
  }

  const isCommon = scope === 'COMMON';

  if (isCommon && !String(location || '').trim()) {
    return res.status(400).json({ success: false, message: 'Say where it is, such as the lift or the stairwell.' });
  }

  await db.execute(
    `INSERT INTO maintenance_tickets
      (unit_id, scope, location, created_by_id, title, description, category, priority, raised_by_resident)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'MEDIUM', 1)`,
    [
      isCommon ? null : unit.unit_id,
      isCommon ? 'COMMON' : 'UNIT',
      isCommon ? String(location).trim() : null,
      req.user.id,
      String(title).trim(),
      String(description).trim(),
      category || 'GENERAL'
    ]
  );

  createNotification({
    title: isCommon
      ? `Common area issue: ${String(location).trim()}`
      : `New issue from Flat ${unit.number}`,
    message: `${req.user.name}: ${String(title).trim()}`,
    target_role: 'ADMIN',
    type: 'MAINTENANCE'
  });

  res.json({ success: true, message: 'Issue reported. The building admin has been notified.' });
});

/** 5. Gate activity for this flat only. */
exports.getVisitorLogs = withUnit(async (req, res, unit) => {
  const [rows] = await db.execute(
    `SELECT id, visitor_name, visitor_phone, vehicle_number, vehicle_type,
            purpose, company, status, entry_time, exit_time, pass_code, expected_on
     FROM visitor_logs
     WHERE unit_id = ? AND deleted_at IS NULL
     ORDER BY COALESCE(entry_time, expected_on) DESC, id DESC
     LIMIT 100`,
    [unit.unit_id]
  );

  res.json({ success: true, data: rows });
});

/** 6. Passes the resident has raised that have not been used yet. */
exports.getPasses = withUnit(async (req, res, unit) => {
  const [rows] = await db.execute(
    `SELECT id, visitor_name, visitor_phone, purpose, vehicle_number, pass_code,
            expected_on, status, entry_time
     FROM visitor_logs
     WHERE unit_id = ? AND pass_code IS NOT NULL AND deleted_at IS NULL
     ORDER BY expected_on DESC, id DESC
     LIMIT 50`,
    [unit.unit_id]
  );

  res.json({ success: true, data: rows });
});

/**
 * 7. Pre-approve a visitor. Creates the gate entry ahead of time with a short
 * code; the guard searches that code and admits the guest without ringing the
 * flat. Nothing is marked as entered until the guard admits it.
 */
exports.createPass = withUnit(async (req, res, unit) => {
  const { visitor_name: visitorName, visitor_phone: visitorPhone, purpose, vehicle_number: vehicleNumber, expected_on: expectedOn } = req.body;

  if (!String(visitorName || '').trim()) {
    return res.status(400).json({ success: false, message: 'Who is visiting?' });
  }

  if (!expectedOn || !/^\d{4}-\d{2}-\d{2}$/.test(expectedOn)) {
    return res.status(400).json({ success: false, message: 'Pick the day you expect them, as YYYY-MM-DD.' });
  }

  const today = new Date().toISOString().slice(0, 10);

  if (expectedOn < today) {
    return res.status(400).json({ success: false, message: 'That date has already passed.' });
  }

  // Codes are short enough to collide occasionally; the unique index catches it.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generatePassCode();

    try {
      await db.execute(
        `INSERT INTO visitor_logs
          (visitor_name, visitor_phone, vehicle_number, unit_id, purpose, pass_code,
           expected_on, status, created_by_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?)`,
        [
          String(visitorName).trim(),
          visitorPhone || '',
          vehicleNumber || '',
          unit.unit_id,
          purpose || 'GUEST',
          code,
          expectedOn,
          req.user.id
        ]
      );

      createNotification({
        title: `Expected visitor for Flat ${unit.number}`,
        message: `${String(visitorName).trim()} is pre-approved for ${expectedOn}. Gate code ${code}.`,
        target_role: 'SECURITY',
        type: 'GATE'
      });

      return res.json({
        success: true,
        message: 'Visitor pre-approved.',
        data: { pass_code: code, visitor_name: String(visitorName).trim(), expected_on: expectedOn }
      });
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
    }
  }

  res.status(500).json({ success: false, message: 'Could not allocate a gate code. Please try again.' });
});

/** 8. Cancel a pass, allowed only while the visitor has not arrived. */
exports.cancelPass = withUnit(async (req, res, unit) => {
  const [rows] = await db.execute(
    'SELECT id, status, entry_time FROM visitor_logs WHERE id = ? AND unit_id = ? AND pass_code IS NOT NULL AND deleted_at IS NULL',
    [req.params.id, unit.unit_id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Pass not found for your flat.' });
  }

  if (rows[0].entry_time) {
    return res.status(409).json({ success: false, message: 'That visitor has already been admitted.' });
  }

  await db.execute("UPDATE visitor_logs SET status = 'DENIED' WHERE id = ?", [rows[0].id]);

  res.json({ success: true, message: 'Pass cancelled.' });
});

exports.getActiveUnit = getActiveUnit;
