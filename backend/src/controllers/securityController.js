const db = require('../config/db');
const { createNotification } = require('./notificationController');
const { recordAudit } = require('../services/audit');

// 1. Get all visitor logs
exports.getVisitorLogs = async (req, res) => {
  try {
    const query = `
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
      LEFT JOIN users resident ON v.created_by_id = resident.id
      WHERE v.status <> 'DENIED' AND v.deleted_at IS NULL
      ORDER BY
        CASE
          WHEN v.status = 'ENTERED' THEN 1
          WHEN v.status = 'APPROVED' AND v.expected_on >= CURDATE() THEN 2
          ELSE 3
        END,
        COALESCE(v.entry_time, v.expected_on) DESC, v.id DESC
    `;
    
    const [rows] = await db.execute(query);
    res.json({ success: true, data: rows });
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
    return res.status(400).json({ success: false, message: 'Visitor name and visiting flat are required.' });
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
    const flatNum = unitRow[0]?.number || 'Flat';
    const tagInfo = company ? `${company} Delivery` : purpose;

    createNotification({
      title: `Gate Entry • Flat ${flatNum}`,
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
 * The guard types six characters instead of ringing the flat.
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
      title: `Gate Entry • Flat ${pass.unit_number}`,
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
