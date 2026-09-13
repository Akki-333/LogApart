const db = require('../config/db');
const { createNotification } = require('./notificationController');
const { recordAudit } = require('../services/audit');

const GATE_MAX_PAGE = 200;
const GATE_DEFAULT_PAGE = 50;

// Who is inside right now, and passes still to be used. The desk works from
// this list, so it always arrives whole; it is small by nature.
const LIVE = "(v.status = 'ENTERED' OR (v.status = 'APPROVED' AND v.expected_on >= CURDATE()))";

// A row with neither time sorts last instead of falling out of a comparison.
const seenAt = (alias) => `COALESCE(${alias}.entry_time, ${alias}.expected_on, TIMESTAMP('1970-01-01'))`;

const GATE_COLUMNS = `
  SELECT
    v.id, v.visitor_name, v.visitor_phone, v.vehicle_number, v.vehicle_type,
    v.purpose, v.company, v.status, v.entry_time, v.exit_time, v.unit_id,
    v.pass_code, v.expected_on,
    u.number as unit_number, u.floor as unit_floor,
    usr.name as logged_by,
    resident.name as pre_approved_by
  FROM visitor_logs v
  JOIN units u ON v.unit_id = u.id
  LEFT JOIN users usr ON v.logged_by_id = usr.id
  LEFT JOIN users resident ON v.created_by_id = resident.id`;

/**
 * The gate log: the live list in full, then history a page at a time.
 *
 * History pages on the record's time and id rather than OFFSET, for the reason
 * the activity log does: rows arrive at the head while a guard reads, and an
 * offset would shift under them and skip a visitor.
 */
exports.getVisitorLogs = async (req, res) => {
  const limit = Math.min(GATE_MAX_PAGE, Math.max(1, Number(req.query.limit) || GATE_DEFAULT_PAGE));
  const beforeId = Number(req.query.before_id) || null;

  try {
    let live = [];
    const history = ["v.status <> 'DENIED'", 'v.deleted_at IS NULL', `NOT ${LIVE}`];
    const params = [];

    if (beforeId) {
      history.push(`(${seenAt('v')}, v.id) < (SELECT ${seenAt('x')}, x.id FROM visitor_logs x WHERE x.id = ?)`);
      params.push(beforeId);
    } else {
      [live] = await db.execute(
        `${GATE_COLUMNS}
         WHERE v.deleted_at IS NULL AND ${LIVE}
         ORDER BY CASE WHEN v.status = 'ENTERED' THEN 1 ELSE 2 END, ${seenAt('v')} DESC, v.id DESC`
      );
    }

    // The limit is interpolated after being clamped to an integer.
    const [older] = await db.execute(
      `${GATE_COLUMNS}
       WHERE ${history.join(' AND ')}
       ORDER BY ${seenAt('v')} DESC, v.id DESC
       LIMIT ${limit}`,
      params
    );

    // Counted on the server, because a paged list can no longer count itself.
    const [[counts]] = await db.execute(
      `SELECT COALESCE(SUM(status = 'ENTERED'), 0) AS inside,
              COALESCE(SUM(DATE(entry_time) = CURDATE()), 0) AS entries_today,
              COALESCE(SUM(purpose = 'DELIVERY' AND DATE(entry_time) = CURDATE()), 0) AS deliveries_today
       FROM visitor_logs
       WHERE deleted_at IS NULL AND status <> 'DENIED'`
    );

    res.json({
      success: true,
      data: [...live, ...older],
      // Null once the reader has reached the oldest record.
      next_before_id: older.length === limit ? older[older.length - 1].id : null,
      counts: {
        inside: Number(counts.inside),
        entries_today: Number(counts.entries_today),
        deliveries_today: Number(counts.deliveries_today)
      }
    });
  } catch (error) {
    console.error('Error fetching visitors:', error);
    res.status(500).json({ success: false, message: 'Server error fetching visitor logs' });
  }
};

// 2. Log a new visitor entry
exports.logVisitor = async (req, res) => {
  const { visitor_name, visitor_phone, vehicle_number, vehicle_type, unit_id, purpose, company } = req.body;
  const logged_by_id = req.user.id;

  if (!visitor_name || !unit_id) {
    return res.status(400).json({ success: false, message: 'Visitor name and visiting home are required.' });
  }

  try {
    // entry_time is set explicitly: it lost its column default when pre-approved
    // passes arrived, since a pass exists before anyone walks through the gate.
    const query = `
      INSERT INTO visitor_logs
      (visitor_name, visitor_phone, vehicle_number, vehicle_type, unit_id, purpose, company, status, logged_by_id, entry_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ENTERED', ?, CURRENT_TIMESTAMP)
    `;
    
    await db.execute(query, [
      visitor_name, 
      visitor_phone || '', 
      vehicle_number || '', 
      vehicle_type || 'NONE', 
      unit_id, 
      purpose || 'GUEST', 
      company || '', 
      logged_by_id
    ]);

    // Send notification bridge to Admin
    const [unitRow] = await db.execute('SELECT number FROM units WHERE id = ?', [unit_id]);
    const homeNum = unitRow[0]?.number || 'Home';
    const tagInfo = company ? `${company} Delivery` : purpose;

    createNotification({
      title: `Gate Entry • Home ${homeNum}`,
      message: `${visitor_name} (${tagInfo}) entered the premises.`,
      target_role: 'ADMIN',
      type: 'GATE'
    });

    res.json({ success: true, message: 'Visitor entry logged successfully' });
  } catch (error) {
    console.error('Error logging visitor:', error);
    res.status(500).json({ success: false, message: 'Server error logging visitor' });
  }
};

// 3. Edit / Update an existing visitor entry
exports.updateVisitor = async (req, res) => {
  const { id } = req.params;
  const { visitor_name, visitor_phone, vehicle_number, vehicle_type, unit_id, purpose, company } = req.body;

  try {
    const [existing] = await db.execute(
      'SELECT * FROM visitor_logs WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'That gate record no longer exists.' });
    }

    const query = `
      UPDATE visitor_logs 
      SET 
        visitor_name = IFNULL(?, visitor_name),
        visitor_phone = IFNULL(?, visitor_phone),
        vehicle_number = IFNULL(?, vehicle_number),
        vehicle_type = IFNULL(?, vehicle_type),
        unit_id = IFNULL(?, unit_id),
        purpose = IFNULL(?, purpose),
        company = IFNULL(?, company)
      WHERE id = ?
    `;
    
    await db.execute(query, [
      visitor_name || null,
      visitor_phone !== undefined ? visitor_phone : null,
      vehicle_number !== undefined ? vehicle_number : null,
      vehicle_type || null,
      unit_id || null,
      purpose || null,
      company !== undefined ? company : null,
      id
    ]);

    const [updated] = await db.execute('SELECT * FROM visitor_logs WHERE id = ?', [id]);

    await recordAudit(req, {
      action: 'EDIT_GATE_LOG',
      entity: 'visitor_logs',
      entity_id: id,
      summary: `Edited the gate record for ${existing[0].visitor_name}`,
      before: existing[0],
      after: updated[0]
    });

    res.json({ success: true, message: 'Visitor entry updated successfully' });
  } catch (error) {
    console.error('Error updating visitor:', error);
    res.status(500).json({ success: false, message: 'Server error updating visitor' });
  }
};

// 4. Mark visitor as checked out
exports.checkoutVisitor = async (req, res) => {
  const { id } = req.params;

  try {
    const [visitor] = await db.execute('SELECT visitor_name, unit_id FROM visitor_logs WHERE id = ?', [id]);

    await db.execute(`
      UPDATE visitor_logs 
      SET status = 'EXITED', exit_time = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [id]);

    if (visitor.length > 0) {
      createNotification({
        title: 'Gate Exit',
        message: `${visitor[0].visitor_name} has checked out and exited the building.`,
        target_role: 'ADMIN',
        type: 'GATE'
      });
    }

    res.json({ success: true, message: 'Visitor marked as checked out' });
  } catch (error) {
    console.error('Error checking out visitor:', error);
    res.status(500).json({ success: false, message: 'Server error checking out visitor' });
  }
};

// 5. Withdraw a visitor entry from the desk.
//
// This used to be a hard DELETE. A gate record is evidence of who was in the
// building, so it now leaves the desk and stays in the audit trail, and the
// guard has to say why.
exports.deleteVisitor = async (req, res) => {
  const { id } = req.params;
  const reason = String(req.body?.reason || '').trim();

  if (reason.length < 4) {
    return res.status(400).json({
      success: false,
      message: 'Say why this gate record is being removed.'
    });
  }

  try {
    const [rows] = await db.execute(
      'SELECT * FROM visitor_logs WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'That gate record no longer exists.' });
    }

    await db.execute(
      `UPDATE visitor_logs
       SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = ?, delete_reason = ?
       WHERE id = ?`,
      [req.user.id, reason.slice(0, 255), id]
    );

    await recordAudit(req, {
      action: 'DELETE_GATE_LOG',
      entity: 'visitor_logs',
      entity_id: id,
      summary: `Removed the gate record for ${rows[0].visitor_name}: ${reason}`,
      before: rows[0],
      after: null
    });

    res.json({ success: true, message: 'Visitor entry removed from the desk.' });
  } catch (error) {
    console.error('Error removing visitor log:', error);
    res.status(500).json({ success: false, message: 'Server error removing visitor log' });
  }
};

/**
 * 6. Look up a pre-approved visitor by the code their host gave them.
 * The guard types six characters instead of ringing the home.
 */
exports.findPass = async (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();

  if (code.length < 4) {
    return res.status(400).json({ success: false, message: 'Enter the full gate code.' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT v.id, v.visitor_name, v.visitor_phone, v.vehicle_number, v.purpose,
              v.pass_code, v.expected_on, v.status, v.entry_time,
              u.number AS unit_number, u.floor AS unit_floor,
              resident.name AS pre_approved_by
       FROM visitor_logs v
       JOIN units u ON v.unit_id = u.id
       LEFT JOIN users resident ON v.created_by_id = resident.id
       WHERE v.pass_code = ? AND v.deleted_at IS NULL`,
      [code]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No pass matches that code.' });
    }

    const pass = rows[0];

    if (pass.status === 'DENIED') {
      return res.status(409).json({ success: false, message: 'That pass was cancelled by the resident.' });
    }

    if (pass.entry_time) {
      return res.status(409).json({ success: false, message: 'That pass has already been used.' });
    }

    res.json({ success: true, data: pass });
  } catch (error) {
    console.error('Error finding pass:', error);
    res.status(500).json({ success: false, message: 'Server error looking up that pass' });
  }
};

/** 7. Admit a pre-approved visitor, turning the pass into a live entry. */
exports.admitPass = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.execute(
      `SELECT v.id, v.visitor_name, v.status, v.entry_time, v.purpose, v.company, u.number AS unit_number
       FROM visitor_logs v JOIN units u ON v.unit_id = u.id
       WHERE v.id = ? AND v.pass_code IS NOT NULL AND v.deleted_at IS NULL`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pass not found.' });
    }

    const pass = rows[0];

    if (pass.status === 'DENIED') {
      return res.status(409).json({ success: false, message: 'That pass was cancelled by the resident.' });
    }

    if (pass.entry_time) {
      return res.status(409).json({ success: false, message: 'That visitor is already inside.' });
    }

    await db.execute(
      `UPDATE visitor_logs
       SET status = 'ENTERED', entry_time = CURRENT_TIMESTAMP,
           logged_by_id = ?, vehicle_type = IFNULL(?, vehicle_type), vehicle_number = IFNULL(?, vehicle_number)
       WHERE id = ?`,
      [req.user.id, req.body.vehicle_type || null, req.body.vehicle_number || null, id]
    );

    createNotification({
      title: `Gate Entry • Home ${pass.unit_number}`,
      message: `${pass.visitor_name} entered on a pre-approved pass.`,
      target_role: 'ADMIN',
      type: 'GATE'
    });

    res.json({ success: true, message: `${pass.visitor_name} admitted.` });
  } catch (error) {
    console.error('Error admitting pass:', error);
    res.status(500).json({ success: false, message: 'Server error admitting that visitor' });
  }
};
