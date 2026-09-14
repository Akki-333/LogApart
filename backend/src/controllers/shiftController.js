const db = require('../config/db');
const log = require('../services/log');
const { recordAudit } = require('../services/audit');

/**
 * Guard shifts and the handover between them.
 *
 * The note is what a night guard knows that the day guard needs: the tanker due
 * at six, the resident who asked not to be buzzed, the gate latch that sticks.
 * The next guard cannot start a shift without acknowledging it, so it cannot
 * be missed, and the acknowledgement is on the record.
 */

const MAX_PAGE = 100;
const DEFAULT_PAGE = 30;

const SHIFT_SELECT = `
  SELECT s.id, s.guard_id, g.name AS guard_name, s.started_at, s.ended_at, s.handover_note,
         s.acknowledged_at, ack.name AS acknowledged_by,
         TIMESTAMPDIFF(MINUTE, s.started_at, COALESCE(s.ended_at, NOW())) AS minutes
  FROM guard_shifts s
  JOIN users g ON s.guard_id = g.id
  LEFT JOIN users ack ON s.acknowledged_by_id = ack.id`;

const failed = (req, res, what, error) => {
  log.error(`${what} failed`, { request_id: req.id, error });
  res.status(500).json({ success: false, message: `Server error: ${what}` });
};

/**
 * The most recently ended shift, if it left a note nobody has acknowledged.
 * With lock set, the row is held until the caller's transaction ends, so two
 * guards starting at once are handled one after the other.
 */
async function pendingHandover(connection = db, lock = false) {
  const [rows] = await connection.execute(
    `${SHIFT_SELECT}
     WHERE s.ended_at IS NOT NULL
     ORDER BY s.ended_at DESC, s.id DESC
     LIMIT 1${lock ? ' FOR UPDATE' : ''}`
  );
  const last = rows[0];

  return last && last.handover_note && !last.acknowledged_at ? { ...last, minutes: Number(last.minutes) } : null;
}

/** 1. The desk's view: this guard's open shift, and a handover waiting to be read. */
exports.getCurrent = async (req, res) => {
  try {
    const [mine] = await db.execute(`${SHIFT_SELECT} WHERE s.guard_id = ? AND s.ended_at IS NULL`, [req.user.id]);
    const [[inside]] = await db.execute(
      "SELECT COUNT(*) AS visitors FROM visitor_logs WHERE status = 'ENTERED' AND deleted_at IS NULL"
    );

    res.json({
      success: true,
      data: {
        shift: mine[0] ? { ...mine[0], minutes: Number(mine[0].minutes) } : null,
        pending_handover: await pendingHandover(),
        visitors_inside: Number(inside.visitors)
      }
    });
  } catch (error) {
    failed(req, res, 'reading the current shift', error);
  }
};

/** 2. Start a shift. Refused while the last handover note is unread. */
exports.startShift = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const pending = await pendingHandover(connection, true);

    if (pending) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        code: 'HANDOVER_UNACKNOWLEDGED',
        message: `Read and acknowledge the handover note from ${pending.guard_name} before starting.`,
        data: pending
      });
    }

    const [result] = await connection.execute('INSERT INTO guard_shifts (guard_id) VALUES (?)', [req.user.id]);

    await recordAudit(req, {
      action: 'START_SHIFT',
      entity: 'guard_shifts',
      entity_id: result.insertId,
      summary: `${req.user.name} started a shift at the gate`
    }, connection);

    await connection.commit();
    res.json({ success: true, message: 'Shift started.', data: { id: result.insertId } });
  } catch (error) {
    await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        code: 'SHIFT_ALREADY_OPEN',
        message: 'You already have a shift open. End it before starting another.'
      });
    }

    failed(req, res, 'starting a shift', error);
  } finally {
    connection.release();
  }
};

/** 3. End a shift, leaving a note for whoever comes next. */
exports.endShift = async (req, res) => {
  const note = String(req.body.handover_note || '').trim();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [open] = await connection.execute(
      'SELECT id FROM guard_shifts WHERE guard_id = ? AND ended_at IS NULL FOR UPDATE',
      [req.user.id]
    );

    if (open.length === 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, code: 'NO_OPEN_SHIFT', message: 'You have no shift open.' });
    }

    await connection.execute(
      'UPDATE guard_shifts SET ended_at = NOW(), handover_note = ? WHERE id = ?',
      [note || null, open[0].id]
    );

    await recordAudit(req, {
      action: 'END_SHIFT',
      entity: 'guard_shifts',
      entity_id: open[0].id,
      summary: note
        ? `${req.user.name} ended a shift and left a handover note`
        : `${req.user.name} ended a shift with no handover note`,
      after: { handover_note: note || null }
    }, connection);

    await connection.commit();

    res.json({
      success: true,
      message: note ? 'Shift ended. The next guard will be asked to read your note.' : 'Shift ended.'
    });
  } catch (error) {
    await connection.rollback();
    failed(req, res, 'ending a shift', error);
  } finally {
    connection.release();
  }
};

/** 4. Acknowledge the handover note left at the end of the last shift. */
exports.acknowledge = async (req, res) => {
  const id = Number(req.params.id);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT id, ended_at, handover_note, acknowledged_at FROM guard_shifts WHERE id = ? FOR UPDATE',
      [id]
    );
    const shift = rows[0];

    if (!shift) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'No such shift.' });
    }

    if (!shift.ended_at || !shift.handover_note) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'That shift has no handover note to acknowledge.' });
    }

    if (shift.acknowledged_at) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'That handover has already been acknowledged.' });
    }

    await connection.execute(
      'UPDATE guard_shifts SET acknowledged_by_id = ?, acknowledged_at = NOW() WHERE id = ?',
      [req.user.id, id]
    );

    await recordAudit(req, {
      action: 'ACKNOWLEDGE_HANDOVER',
      entity: 'guard_shifts',
      entity_id: id,
      summary: `${req.user.name} acknowledged the handover note`
    }, connection);

    await connection.commit();
    res.json({ success: true, message: 'Handover acknowledged.' });
  } catch (error) {
    await connection.rollback();
    failed(req, res, 'acknowledging a handover', error);
  } finally {
    connection.release();
  }
};

/** 5. The shift log, newest first, a page at a time. */
exports.getShifts = async (req, res) => {
  const limit = Math.min(MAX_PAGE, Math.max(1, Number(req.query.limit) || DEFAULT_PAGE));
  const beforeId = Number(req.query.before_id) || null;

  try {
    const [rows] = await db.execute(
      `${SHIFT_SELECT}
       ${beforeId ? 'WHERE s.id < ?' : ''}
       ORDER BY s.id DESC
       LIMIT ${limit}`,
      beforeId ? [beforeId] : []
    );

    res.json({
      success: true,
      data: rows.map((row) => ({ ...row, minutes: Number(row.minutes) })),
      next_before_id: rows.length === limit ? rows[rows.length - 1].id : null
    });
  } catch (error) {
    failed(req, res, 'reading the shift log', error);
  }
};
