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
      `SELECT invoice_id, receipt_number, amount, mode, reference, paid_on FROM payment_records
       WHERE invoice_id IN (?) ORDER BY paid_on DESC`,
      [ids]
    );

    const byInvoice = new Map();
    for (const payment of payments) {
      const list = byInvoice.get(payment.invoice_id) || [];
      list.push({ ...payment, amount: Number(payment.amount) });
      byInvoice.set(payment.invoice_id, list);
    }

    const [declarations] = await db.query(
      `SELECT id, invoice_id, amount, mode, reference, paid_on, status, review_note, created_at
       FROM payment_declarations WHERE invoice_id IN (?) ORDER BY created_at DESC`,
      [ids]
    );

    const declaredByInvoice = new Map();
    for (const declaration of declarations) {
      const list = declaredByInvoice.get(declaration.invoice_id) || [];
      list.push({ ...declaration, amount: Number(declaration.amount) });
      declaredByInvoice.set(declaration.invoice_id, list);
    }

    const [adjustments] = await db.query(
      `SELECT invoice_id, kind, amount, reason, created_at
       FROM invoice_adjustments WHERE invoice_id IN (?) ORDER BY created_at ASC`,
      [ids]
    );

    const adjustedByInvoice = new Map();
    for (const adjustment of adjustments) {
      const list = adjustedByInvoice.get(adjustment.invoice_id) || [];
      list.push({ ...adjustment, amount: Number(adjustment.amount) });
      adjustedByInvoice.set(adjustment.invoice_id, list);
    }

    invoices.forEach((invoice) => {
      invoice.payments = byInvoice.get(invoice.id) || [];
      invoice.declarations = declaredByInvoice.get(invoice.id) || [];
      // A late fee is a charge the resident is entitled to see explained rather
      // than discovering their bill grew overnight.
      invoice.adjustments = adjustedByInvoice.get(invoice.id) || [];
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
            t.rating, t.reopen_count, t.created_by_id,
            (SELECT COUNT(*) FROM ticket_comments c WHERE c.ticket_id = t.id) AS comment_count,
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
      is_mine: row.scope !== 'COMMON',
      // Rating and reopening belong to whoever raised it, which is not the same
      // thing as the flat it was raised against.
      raised_by_me: row.created_by_id === req.user.id
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

/**
 * 9. Tell the building about a payment already made.
 *
 * The friction this removes is real: a resident pays by UPI in ten seconds and
 * then spends a week reminding somebody to write it down. A declaration is
 * their side of that conversation. It never moves the balance on its own, so
 * nothing here can be used to mark a flat paid without an admin agreeing.
 */
exports.declarePayment = withUnit(async (req, res, unit) => {
  const { invoice_id: invoiceId, amount, mode, reference, paid_on: paidOn, note } = req.body;

  const [invoices] = await db.execute(
    'SELECT * FROM invoices WHERE id = ? AND unit_id = ?',
    [invoiceId, unit.unit_id]
  );

  if (invoices.length === 0) {
    return res.status(404).json({ success: false, message: 'That bill is not one of yours.' });
  }

  const invoice = invoices[0];
  const balancePaise = toPaise(invoice.total_amount) - toPaise(invoice.amount_paid);

  if (balancePaise <= 0) {
    return res.status(409).json({ success: false, message: 'That bill is already settled.' });
  }

  const amountPaise = toPaise(amount);

  if (amountPaise > balancePaise) {
    return res.status(400).json({
      success: false,
      message: `That is more than the ${toRupees(balancePaise)} outstanding on this bill.`
    });
  }

  // One open declaration per bill. A second one is a resident wondering whether
  // the first went through, not a second payment.
  const [pending] = await db.execute(
    "SELECT id FROM payment_declarations WHERE invoice_id = ? AND status = 'PENDING'",
    [invoiceId]
  );

  if (pending.length > 0) {
    return res.status(409).json({
      success: false,
      message: 'You have already told us about a payment on this bill. It is waiting to be confirmed.'
    });
  }

  const [result] = await db.execute(
    `INSERT INTO payment_declarations
      (invoice_id, unit_id, declared_by_id, amount, mode, reference, paid_on, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      invoiceId,
      unit.unit_id,
      req.user.id,
      toRupees(amountPaise),
      mode || 'UPI',
      reference || null,
      paidOn || new Date().toISOString().slice(0, 10),
      note || null
    ]
  );

  await createNotification({
    title: `Payment declared by flat ${unit.number}`,
    message: `${toRupees(amountPaise)} by ${mode || 'UPI'}${reference ? `, reference ${reference}` : ''}. Confirm it against the account.`,
    target_role: 'ADMIN',
    type: 'BILLING'
  });

  res.json({
    success: true,
    message: 'Thank you. The building will confirm it against the account.',
    data: { id: result.insertId, status: 'PENDING' }
  });
});

/** 10. Every payment this flat has declared, and what came of it. */
exports.getDeclarations = withUnit(async (req, res, unit) => {
  const [rows] = await db.execute(
    `SELECT d.*, i.period_month
     FROM payment_declarations d
     JOIN invoices i ON d.invoice_id = i.id
     WHERE d.unit_id = ?
     ORDER BY d.created_at DESC
     LIMIT 50`,
    [unit.unit_id]
  );

  res.json({ success: true, data: rows.map((row) => ({ ...row, amount: Number(row.amount) })) });
});

/**
 * 11. The document vault.
 *
 * Nothing new is stored here. Bills, receipts, clearance certificates and the
 * notices addressed to the flat already exist in four different tables, and a
 * resident who wants last March's receipt should not have to remember which
 * screen it was on.
 */
exports.getDocuments = withUnit(async (req, res, unit) => {
  const [invoices] = await db.execute(
    `SELECT id, period_month, total_amount, amount_paid, due_date, status
     FROM invoices WHERE unit_id = ? ORDER BY period_month DESC LIMIT 36`,
    [unit.unit_id]
  );

  const [receipts] = await db.execute(
    `SELECT p.receipt_number, p.amount, p.mode, p.reference, p.paid_on, i.period_month
     FROM payment_records p
     JOIN invoices i ON p.invoice_id = i.id
     WHERE i.unit_id = ? AND p.receipt_number IS NOT NULL
     ORDER BY p.paid_on DESC LIMIT 60`,
    [unit.unit_id]
  );

  // Certificates are keyed on the person as well as the flat, so a previous
  // tenant's clearance never turns up in the current resident's vault.
  const [certificates] = await db.execute(
    `SELECT certificate_number, move_out_date, outstanding_at_issue, dues_waived, waiver_reason
     FROM noc_certificates WHERE unit_id = ? AND resident_user_id = ?
     ORDER BY move_out_date DESC`,
    [unit.unit_id, req.user.id]
  );

  const [notices] = await db.execute(
    `SELECT id, title, body, starts_on, ends_on, created_at
     FROM notices
     WHERE audience IN ('ALL', 'RESIDENT') AND is_published = 1
     ORDER BY starts_on DESC LIMIT 30`
  );

  res.json({
    success: true,
    data: {
      unit,
      invoices: invoices.map((row) => ({
        ...row,
        total_amount: Number(row.total_amount),
        amount_paid: Number(row.amount_paid),
        balance: toRupees(toPaise(row.total_amount) - toPaise(row.amount_paid)),
        display_status: displayStatus(row)
      })),
      receipts: receipts.map((row) => ({ ...row, amount: Number(row.amount) })),
      certificates: certificates.map((row) => ({ ...row, outstanding_at_issue: Number(row.outstanding_at_issue) })),
      notices
    }
  });
});
