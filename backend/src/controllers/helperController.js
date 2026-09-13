const db = require('../config/db');
const { activeHomeFor } = require('../services/residency');
const { createNotification } = require('./notificationController');

/**
 * Daily helpers: the maids, cooks, drivers and milkmen who come every morning.
 * They are registered once and then checked in with a single tap, rather than
 * being retyped into the visitor log every day.
 */

const HELPER_WITH_UNITS = `
  SELECT
    h.id, h.name, h.phone, h.helper_type, h.id_proof_type, h.id_proof_number,
    h.is_active, h.created_at,
    GROUP_CONCAT(u.number ORDER BY u.floor, u.number SEPARATOR ', ') AS unit_numbers,
    GROUP_CONCAT(u.id ORDER BY u.floor, u.number) AS unit_ids,
    a.id AS open_attendance_id, a.check_in AS current_check_in
  FROM helpers h
  LEFT JOIN helper_units hu ON hu.helper_id = h.id
  LEFT JOIN units u ON hu.unit_id = u.id
  LEFT JOIN helper_attendance a
    ON a.helper_id = h.id AND a.check_out IS NULL AND DATE(a.check_in) = CURRENT_DATE()
  GROUP BY h.id, a.id, a.check_in
`;

const shape = (row) => ({
  ...row,
  unit_ids: row.unit_ids ? row.unit_ids.split(',').map(Number) : [],
  unit_numbers: row.unit_numbers || '',
  is_inside: Boolean(row.open_attendance_id)
});

/** 1. The registry. Guards see it to check people in, admins to manage it. */
exports.getHelpers = async (req, res) => {
  try {
    const [rows] = await db.query(`${HELPER_WITH_UNITS} ORDER BY h.is_active DESC, h.name ASC`);
    res.json({ success: true, data: rows.map(shape) });
  } catch (error) {
    console.error('Error fetching helpers:', error);
    res.status(500).json({ success: false, message: 'Server error fetching helpers' });
  }
};

/** 2. Register a helper and link the homes they work for. */
exports.createHelper = async (req, res) => {
  const { name, phone, helper_type: helperType, id_proof_type: idProofType, id_proof_number: idProofNumber, unit_ids: unitIds } = req.body;

  if (!String(name || '').trim()) {
    return res.status(400).json({ success: false, message: 'Give the helper a name.' });
  }

  if (!Array.isArray(unitIds) || unitIds.length === 0) {
    return res.status(400).json({ success: false, message: 'Link the helper to at least one home.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [helper] = await connection.execute(
      `INSERT INTO helpers (name, phone, helper_type, id_proof_type, id_proof_number, created_by_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [String(name).trim(), phone || null, helperType || 'MAID', idProofType || null, idProofNumber || null, req.user.id]
    );

    for (const unitId of unitIds) {
      await connection.execute(
        'INSERT INTO helper_units (helper_id, unit_id) VALUES (?, ?)',
        [helper.insertId, unitId]
      );
    }

    await connection.commit();
    res.json({ success: true, message: `${String(name).trim()} added to the helper registry.` });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating helper:', error);
    res.status(500).json({ success: false, message: 'Server error adding helper' });
  } finally {
    connection.release();
  }
};

/** 3. Update a helper and re-link their homes. */
exports.updateHelper = async (req, res) => {
  const { id } = req.params;
  const { name, phone, helper_type: helperType, id_proof_type: idProofType, id_proof_number: idProofNumber, unit_ids: unitIds, is_active: isActive } = req.body;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `UPDATE helpers
       SET name = IFNULL(?, name), phone = ?, helper_type = IFNULL(?, helper_type),
           id_proof_type = ?, id_proof_number = ?, is_active = IFNULL(?, is_active)
       WHERE id = ?`,
      [
        name ? String(name).trim() : null,
        phone !== undefined ? phone : null,
        helperType || null,
        idProofType !== undefined ? idProofType : null,
        idProofNumber !== undefined ? idProofNumber : null,
        isActive === undefined ? null : (isActive ? 1 : 0),
        id
      ]
    );

    if (Array.isArray(unitIds)) {
      if (unitIds.length === 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'A helper must be linked to at least one home.' });
      }

      await connection.execute('DELETE FROM helper_units WHERE helper_id = ?', [id]);

      for (const unitId of unitIds) {
        await connection.execute('INSERT INTO helper_units (helper_id, unit_id) VALUES (?, ?)', [id, unitId]);
      }
    }

    await connection.commit();
    res.json({ success: true, message: 'Helper updated.' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating helper:', error);
    res.status(500).json({ success: false, message: 'Server error updating helper' });
  } finally {
    connection.release();
  }
};

/**
 * 4. One tap at the gate. Every home the helper works for is told they have
 * arrived, which is the point of the registry: the resident knows without
 * anyone having to call them.
 */
exports.checkIn = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.execute(
      `SELECT h.id, h.name, h.helper_type, h.is_active,
              GROUP_CONCAT(u.number ORDER BY u.floor, u.number SEPARATOR ', ') AS unit_numbers
       FROM helpers h
       LEFT JOIN helper_units hu ON hu.helper_id = h.id
       LEFT JOIN units u ON hu.unit_id = u.id
       WHERE h.id = ?
       GROUP BY h.id`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Helper not found.' });
    }

    const helper = rows[0];

    if (!helper.is_active) {
      return res.status(409).json({ success: false, message: `${helper.name} is no longer on the registry.` });
    }

    const [open] = await db.execute(
      'SELECT id FROM helper_attendance WHERE helper_id = ? AND check_out IS NULL AND DATE(check_in) = CURRENT_DATE()',
      [id]
    );

    if (open.length > 0) {
      return res.status(409).json({ success: false, message: `${helper.name} is already inside.` });
    }

    await db.execute(
      'INSERT INTO helper_attendance (helper_id, logged_by_id) VALUES (?, ?)',
      [id, req.user.id]
    );

    createNotification({
      title: `${helper.name} has arrived`,
      message: `Your ${String(helper.helper_type).toLowerCase()} checked in at the gate for Home ${helper.unit_numbers}.`,
      target_role: 'RESIDENT',
      type: 'GATE'
    });

    res.json({ success: true, message: `${helper.name} checked in.` });
  } catch (error) {
    console.error('Error checking helper in:', error);
    res.status(500).json({ success: false, message: 'Server error checking helper in' });
  }
};

/** 5. Check a helper out when they leave. */
exports.checkOut = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.execute(
      `SELECT a.id, h.name FROM helper_attendance a
       JOIN helpers h ON a.helper_id = h.id
       WHERE a.helper_id = ? AND a.check_out IS NULL AND DATE(a.check_in) = CURRENT_DATE()`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(409).json({ success: false, message: 'That helper is not currently checked in.' });
    }

    await db.execute('UPDATE helper_attendance SET check_out = CURRENT_TIMESTAMP WHERE id = ?', [rows[0].id]);

    res.json({ success: true, message: `${rows[0].name} checked out.` });
  } catch (error) {
    console.error('Error checking helper out:', error);
    res.status(500).json({ success: false, message: 'Server error checking helper out' });
  }
};

/** 6. Attendance history, for a helper or across the building. */
exports.getAttendance = async (req, res) => {
  const { helper_id: helperId, days } = req.query;
  const window = Math.min(Number(days) || 30, 90);

  const where = ['a.check_in >= DATE_SUB(CURRENT_DATE(), INTERVAL ? DAY)'];
  const params = [window];

  if (helperId) {
    where.push('a.helper_id = ?');
    params.push(helperId);
  }

  try {
    const [rows] = await db.execute(
      `SELECT a.id, a.helper_id, a.check_in, a.check_out,
              h.name, h.helper_type, usr.name AS logged_by
       FROM helper_attendance a
       JOIN helpers h ON a.helper_id = h.id
       JOIN users usr ON a.logged_by_id = usr.id
       WHERE ${where.join(' AND ')}
       ORDER BY a.check_in DESC
       LIMIT 300`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching helper attendance:', error);
    res.status(500).json({ success: false, message: 'Server error fetching attendance' });
  }
};

/**
 * 7. The helpers who work for the caller's own home, for the resident portal.
 * Scoped by unit, so a resident sees their own help and nobody else's.
 */
exports.getMyHelpers = async (req, res) => {
  try {
    const home = await activeHomeFor(req.user.id);

    if (!home) {
      return res.status(404).json({
        success: false,
        code: 'NO_ACTIVE_UNIT',
        message: 'Your account is not currently linked to a home.'
      });
    }

    const [rows] = await db.execute(
      `SELECT h.id, h.name, h.phone, h.helper_type, h.is_active,
              a.check_in AS current_check_in, a.check_out AS last_check_out,
              last_seen.check_in AS last_seen_at
       FROM helpers h
       JOIN helper_units hu ON hu.helper_id = h.id
       LEFT JOIN helper_attendance a
         ON a.helper_id = h.id AND a.check_out IS NULL AND DATE(a.check_in) = CURRENT_DATE()
       LEFT JOIN (
         SELECT helper_id, MAX(check_in) AS check_in FROM helper_attendance GROUP BY helper_id
       ) last_seen ON last_seen.helper_id = h.id
       WHERE hu.unit_id = ? AND h.is_active = 1
       ORDER BY h.name ASC`,
      [home.unit_id]
    );

    res.json({
      success: true,
      data: rows.map((row) => ({ ...row, is_inside: Boolean(row.current_check_in) }))
    });
  } catch (error) {
    console.error('Error fetching resident helpers:', error);
    res.status(500).json({ success: false, message: 'Server error fetching your helpers' });
  }
};
