const db = require('../config/db');
const log = require('../services/log');
const { recordAudit } = require('../services/audit');
const { outstandingForUnit } = require('./billingController');

/**
 * Moving out as a workflow rather than a button.
 *
 * Vacating used to be one action: the certificate was issued while a maid was
 * still linked to the home, the parking bay still carried the old number plate
 * and a guest pass for next week still worked at the gate. Once notice is given
 * the certificate waits until those loose ends are tied.
 *
 * None of the steps is stored. Each is read from the records it is about, so
 * the checklist cannot say a bay is released while the bay still says otherwise.
 */

// The steps that must be done before the certificate is issued. Dues are not
// here because the move-out itself already refuses a balance without a written
// waiver, and that rule should stay in one place.
const BLOCKING_STEPS = ['HELPERS_UNLINKED', 'PARKING_RELEASED', 'PASSES_CANCELLED'];

const LIVE_PASSES = `unit_id = ? AND pass_code IS NOT NULL AND entry_time IS NULL
  AND status IN ('PENDING', 'APPROVED') AND deleted_at IS NULL`;

async function checklistFor(connection, moveOut) {
  const unitId = moveOut.unit_id;
  const dues = await outstandingForUnit(unitId, connection);
  const [[helpers]] = await connection.execute('SELECT COUNT(*) AS n FROM helper_units WHERE unit_id = ?', [unitId]);
  const [[bays]] = await connection.execute('SELECT COUNT(*) AS n FROM parking_bays WHERE unit_id = ?', [unitId]);
  const [[passes]] = await connection.execute(`SELECT COUNT(*) AS n FROM visitor_logs WHERE ${LIVE_PASSES}`, [unitId]);

  const helperCount = Number(helpers.n);
  const bayCount = Number(bays.n);
  const passCount = Number(passes.n);
  const completed = moveOut.status === 'COMPLETED';

  const steps = [
    {
      key: 'NOTICE_GIVEN',
      label: 'Notice given',
      done: true,
      detail: `On ${moveOut.notice_given_on}, moving out ${moveOut.planned_move_out}`
    },
    {
      key: 'DUES_CLEARED',
      label: 'Dues cleared',
      done: dues.balance <= 0,
      detail: dues.balance <= 0
        ? 'Nothing outstanding'
        : `${dues.balance} outstanding across ${dues.open_invoices} invoice(s); settle it or record a waiver at move-out`
    },
    {
      key: 'HELPERS_UNLINKED',
      label: 'Helper links closed',
      done: helperCount === 0,
      detail: helperCount === 0 ? 'No helper is linked to the home' : `${helperCount} helper(s) still linked`
    },
    {
      key: 'PARKING_RELEASED',
      label: 'Parking bay released',
      done: bayCount === 0,
      detail: bayCount === 0 ? 'No bay allotted' : `${bayCount} bay(s) still allotted`
    },
    {
      key: 'PASSES_CANCELLED',
      label: 'Gate passes cancelled',
      done: passCount === 0,
      detail: passCount === 0 ? 'No pass is still usable' : `${passCount} pass(es) would still open the gate`
    },
    {
      key: 'NOC_ISSUED',
      label: 'Clearance certificate issued',
      done: completed,
      detail: completed ? moveOut.certificate_number : 'Issued when the home is vacated'
    }
  ];

  return {
    steps,
    dues,
    ready: steps.filter((step) => BLOCKING_STEPS.includes(step.key)).every((step) => step.done)
  };
}

const failed = (req, res, what, error) => {
  log.error(`${what} failed`, { request_id: req.id, error });
  res.status(500).json({ success: false, message: `Server error: ${what}` });
};

const MOVE_OUT_SELECT = `
  SELECT m.*, u.number AS unit_number, usr.name AS resident_name
  FROM move_outs m
  JOIN units u ON m.unit_id = u.id
  JOIN users usr ON m.resident_user_id = usr.id`;

/** 1. Every open move-out, for the admin who has to chase them. */
exports.getOpenMoveOuts = async (req, res) => {
  try {
    const [rows] = await db.query(`${MOVE_OUT_SELECT} WHERE m.status = 'OPEN' ORDER BY m.planned_move_out ASC`);
    const data = [];

    for (const moveOut of rows) {
      const { steps, ready } = await checklistFor(db, moveOut);
      data.push({ ...moveOut, steps, ready });
    }

    res.json({ success: true, data });
  } catch (error) {
    failed(req, res, 'reading open move-outs', error);
  }
};

/** 2. The move-out for one home: the open one, else the most recent. */
exports.getMoveOut = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `${MOVE_OUT_SELECT} WHERE m.unit_id = ? ORDER BY m.status = 'OPEN' DESC, m.id DESC LIMIT 1`,
      [req.params.unit_id]
    );

    if (rows.length === 0) {
      return res.json({ success: true, data: null });
    }

    const { steps, ready, dues } = await checklistFor(db, rows[0]);
    res.json({ success: true, data: { ...rows[0], steps, ready, dues } });
  } catch (error) {
    failed(req, res, 'reading the move-out', error);
  }
};

/** 3. Record that the resident has given notice. */
exports.giveNotice = async (req, res) => {
  const unitId = Number(req.params.unit_id);
  const noticeOn = req.body.notice_given_on || new Date().toISOString().slice(0, 10);
  const planned = req.body.planned_move_out;

  if (planned < noticeOn) {
    return res.status(400).json({ success: false, message: 'The move-out date cannot be before the notice date.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [residents] = await connection.execute(
      `SELECT r.user_id, usr.name, u.number FROM residents r
       JOIN users usr ON r.user_id = usr.id JOIN units u ON r.unit_id = u.id
       WHERE r.unit_id = ? AND r.is_active = true LIMIT 1`,
      [unitId]
    );

    if (residents.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'That home has no active resident to move out.' });
    }

    const [result] = await connection.execute(
      `INSERT INTO move_outs (unit_id, resident_user_id, notice_given_on, planned_move_out, note, created_by_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [unitId, residents[0].user_id, noticeOn, planned, req.body.note || null, req.user.id]
    );

    await recordAudit(req, {
      action: 'GIVE_MOVE_OUT_NOTICE',
      entity: 'move_outs',
      entity_id: result.insertId,
      summary: `${residents[0].name} gave notice to leave home ${residents[0].number} on ${planned}`,
      after: { notice_given_on: noticeOn, planned_move_out: planned }
    }, connection);

    await connection.commit();
    res.json({ success: true, message: 'Notice recorded. The checklist is open.', data: { id: result.insertId } });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, code: 'MOVE_OUT_ALREADY_OPEN', message: 'This home already has a move-out in progress.' });
    }

    failed(req, res, 'recording notice', error);
  } finally {
    connection.release();
  }
};

const RELEASES = {
  HELPERS_UNLINKED: ['DELETE FROM helper_units WHERE unit_id = ?', 'helper links closed'],
  PARKING_RELEASED: ['UPDATE parking_bays SET unit_id = NULL, vehicle_number = NULL WHERE unit_id = ?', 'bays released'],
  PASSES_CANCELLED: [`UPDATE visitor_logs SET status = 'DENIED' WHERE ${LIVE_PASSES}`, 'passes cancelled']
};

/** 4. Tie off one step of the checklist, or all three at once. */
exports.releaseStep = async (req, res) => {
  const unitId = Number(req.params.unit_id);
  const keys = req.body.step ? [req.body.step] : BLOCKING_STEPS;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [open] = await connection.execute(
      "SELECT id FROM move_outs WHERE unit_id = ? AND status = 'OPEN' FOR UPDATE",
      [unitId]
    );

    if (open.length === 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, code: 'NO_OPEN_MOVE_OUT', message: 'Record the notice before closing anything off.' });
    }

    const done = [];

    for (const key of keys) {
      const [sql, words] = RELEASES[key];
      const [result] = await connection.execute(sql, [unitId]);
      done.push(`${result.affectedRows} ${words}`);
    }

    await recordAudit(req, {
      action: 'MOVE_OUT_RELEASE',
      entity: 'move_outs',
      entity_id: open[0].id,
      summary: `Move-out for home ${unitId}: ${done.join(', ')}`,
      after: { steps: keys }
    }, connection);

    await connection.commit();
    res.json({ success: true, message: `Done: ${done.join(', ')}.` });
  } catch (error) {
    await connection.rollback();
    failed(req, res, 'closing off a move-out step', error);
  } finally {
    connection.release();
  }
};

/** 5. The resident is staying after all. */
exports.cancelMoveOut = async (req, res) => {
  try {
    const [result] = await db.execute(
      "UPDATE move_outs SET status = 'CANCELLED' WHERE unit_id = ? AND status = 'OPEN'",
      [req.params.unit_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'No move-out in progress for that home.' });
    }

    await recordAudit(req, {
      action: 'CANCEL_MOVE_OUT',
      entity: 'move_outs',
      entity_id: req.params.unit_id,
      summary: `Move-out for home ${req.params.unit_id} withdrawn`
    });

    res.json({ success: true, message: 'Move-out withdrawn.' });
  } catch (error) {
    failed(req, res, 'withdrawing a move-out', error);
  }
};

exports.checklistFor = checklistFor;
exports.BLOCKING_STEPS = BLOCKING_STEPS;
