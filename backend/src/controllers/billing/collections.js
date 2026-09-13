/**
 * Chasing what is owed: late fees, waivers and corrections, and reminders.
 */
const db = require('../../config/db');
const { recordAudit } = require('../../services/audit');
const {
  daysOverdue,
  periodToDate,
  toPaise,
  toRupees,
  lateFeeFor
} = require('../../services/billing');

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

  // One home, from the defaulter worklist, or every home that is behind.
  const unitId = req.body.unit_id ? Number(req.body.unit_id) : null;
  const params = [];
  if (periodMonth) params.push(periodMonth);
  if (unitId) params.push(unitId);

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
         ${unitId ? 'AND i.unit_id = ?' : ''}
       ORDER BY i.due_date ASC`,
      params
    );

    // Once a day is a reminder; twice is harassment, and a second tap on the
    // worklist should not become a second notification.
    const [todays] = await connection.query(
      'SELECT DISTINCT invoice_id FROM dues_reminders WHERE sent_at >= CURDATE()'
    );
    const remindedToday = new Set(todays.map((row) => row.invoice_id));

    // A home between tenants has nobody to remind. It stays in the defaulter
    // list, but sending a notification to no one is not a reminder.
    const withResident = invoices.filter((invoice) => invoice.resident_id);
    const reachable = withResident.filter((invoice) => !remindedToday.has(invoice.id));
    const alreadyToday = withResident.length - reachable.length;

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
      message: reachable.length > 0
        ? `Sent ${reachable.length} reminder${reachable.length === 1 ? '' : 's'}.`
        : alreadyToday > 0
          ? 'Already reminded today. Try again tomorrow.'
          : 'Nothing to chase. No overdue home has a resident to remind.',
      data: {
        reminded: reachable.length,
        already_reminded_today: alreadyToday,
        unreachable: invoices.length - withResident.length
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
