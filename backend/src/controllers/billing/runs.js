/**
 * Monthly dues runs: priced as a preview, then written, listed and undone.
 */
const db = require('../../config/db');
const { recordAudit } = require('../../services/audit');
const {
  buildRunLines,
  periodToDate,
  toPaise,
  toRupees
} = require('../../services/billing');
const { createNotification } = require('../notificationController');
const { OCCUPIED_UNITS_QUERY, readConfig } = require('./shared');

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
