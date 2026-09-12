const db = require('../config/db');
const { createNotification } = require('./notificationController');

/** Parking bays belong to the building and are allotted to homes. */

/** 1. Every bay with its allotted home and any open violation. */
exports.getBays = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT b.id, b.bay_number, b.level, b.unit_id, b.vehicle_number, b.notes, b.created_at,
              u.number AS unit_number, u.floor AS unit_floor,
              usr.name AS resident_name,
              COUNT(CASE WHEN v.status = 'OPEN' THEN 1 END) AS open_violations
       FROM parking_bays b
       LEFT JOIN units u ON b.unit_id = u.id
       LEFT JOIN residents r ON r.unit_id = u.id AND r.is_active = true
       LEFT JOIN users usr ON r.user_id = usr.id
       LEFT JOIN parking_violations v ON v.bay_id = b.id
       GROUP BY b.id, u.number, u.floor, usr.name
       ORDER BY b.level ASC, b.bay_number ASC`
    );

    res.json({
      success: true,
      data: rows.map((row) => ({ ...row, open_violations: Number(row.open_violations) }))
    });
  } catch (error) {
    console.error('Error fetching parking bays:', error);
    res.status(500).json({ success: false, message: 'Server error fetching parking bays' });
  }
};

/** 2. Add a bay. */
exports.createBay = async (req, res) => {
  const { bay_number: bayNumber, level, unit_id: unitId, vehicle_number: vehicleNumber, notes } = req.body;

  if (!String(bayNumber || '').trim()) {
    return res.status(400).json({ success: false, message: 'Give the bay a number.' });
  }

  try {
    await db.execute(
      'INSERT INTO parking_bays (bay_number, level, unit_id, vehicle_number, notes) VALUES (?, ?, ?, ?, ?)',
      [
        String(bayNumber).trim().toUpperCase(),
        level || 'Ground',
        unitId || null,
        vehicleNumber ? String(vehicleNumber).trim().toUpperCase() : null,
        notes || null
      ]
    );

    res.json({ success: true, message: `Bay ${String(bayNumber).trim().toUpperCase()} added.` });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'That bay number already exists.' });
    }

    console.error('Error creating parking bay:', error);
    res.status(500).json({ success: false, message: 'Server error adding bay' });
  }
};

/** 3. Allot a bay to a home, change its registered vehicle, or free it. */
exports.updateBay = async (req, res) => {
  const { unit_id: unitId, vehicle_number: vehicleNumber, level, notes } = req.body;

  try {
    const [result] = await db.execute(
      `UPDATE parking_bays
       SET unit_id = ?, vehicle_number = ?, level = IFNULL(?, level), notes = ?
       WHERE id = ?`,
      [
        unitId || null,
        vehicleNumber ? String(vehicleNumber).trim().toUpperCase() : null,
        level || null,
        notes !== undefined ? notes : null,
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Bay not found.' });
    }

    res.json({ success: true, message: 'Bay updated.' });
  } catch (error) {
    console.error('Error updating parking bay:', error);
    res.status(500).json({ success: false, message: 'Server error updating bay' });
  }
};

/** 4. Remove a bay. */
exports.deleteBay = async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM parking_bays WHERE id = ?', [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Bay not found.' });
    }

    res.json({ success: true, message: 'Bay removed.' });
  } catch (error) {
    console.error('Error deleting parking bay:', error);
    res.status(500).json({ success: false, message: 'Server error deleting bay' });
  }
};

/**
 * 5. Log a car parked where it should not be. The guard sees the bay, the home
 * it belongs to, and whether that plate has done this before.
 */
exports.createViolation = async (req, res) => {
  const { bay_id: bayId, vehicle_number: vehicleNumber, note } = req.body;

  if (!bayId || !String(vehicleNumber || '').trim()) {
    return res.status(400).json({ success: false, message: 'Pick the bay and enter the vehicle number.' });
  }

  const plate = String(vehicleNumber).trim().toUpperCase();

  try {
    const [bays] = await db.execute(
      `SELECT b.id, b.bay_number, b.vehicle_number, u.number AS unit_number
       FROM parking_bays b LEFT JOIN units u ON b.unit_id = u.id
       WHERE b.id = ?`,
      [bayId]
    );

    if (bays.length === 0) {
      return res.status(404).json({ success: false, message: 'Bay not found.' });
    }

    const bay = bays[0];

    if (bay.vehicle_number && bay.vehicle_number === plate) {
      return res.status(400).json({
        success: false,
        message: `${plate} is the vehicle registered to bay ${bay.bay_number}.`
      });
    }

    await db.execute(
      'INSERT INTO parking_violations (bay_id, vehicle_number, note, reported_by_id) VALUES (?, ?, ?, ?)',
      [bayId, plate, note || null, req.user.id]
    );

    const [[repeat]] = await db.execute(
      'SELECT COUNT(*) AS times FROM parking_violations WHERE vehicle_number = ?',
      [plate]
    );

    const times = Number(repeat.times);

    createNotification({
      title: `Parking violation in bay ${bay.bay_number}`,
      message: `${plate} is parked in bay ${bay.bay_number}${bay.unit_number ? `, allotted to Home ${bay.unit_number}` : ''}.${times > 1 ? ` That plate has been logged ${times} times.` : ''}`,
      target_role: 'ADMIN',
      type: 'ALERT'
    });

    res.json({
      success: true,
      message: times > 1 ? `Logged. ${plate} has now been reported ${times} times.` : 'Violation logged.',
      data: { repeat_count: times }
    });
  } catch (error) {
    console.error('Error logging parking violation:', error);
    res.status(500).json({ success: false, message: 'Server error logging violation' });
  }
};

/** 6. Violations, with repeat offenders surfaced. */
exports.getViolations = async (req, res) => {
  const status = req.query.status;

  try {
    const [rows] = await db.execute(
      `SELECT v.id, v.bay_id, v.vehicle_number, v.note, v.status, v.occurred_at, v.resolved_at,
              b.bay_number, b.level, u.number AS unit_number, usr.name AS reported_by,
              repeats.times AS repeat_count
       FROM parking_violations v
       JOIN parking_bays b ON v.bay_id = b.id
       LEFT JOIN units u ON b.unit_id = u.id
       JOIN users usr ON v.reported_by_id = usr.id
       JOIN (
         SELECT vehicle_number, COUNT(*) AS times FROM parking_violations GROUP BY vehicle_number
       ) repeats ON repeats.vehicle_number = v.vehicle_number
       WHERE (? IS NULL OR v.status = ?)
       ORDER BY v.occurred_at DESC
       LIMIT 200`,
      [status || null, status || null]
    );

    res.json({
      success: true,
      data: rows.map((row) => ({ ...row, repeat_count: Number(row.repeat_count) }))
    });
  } catch (error) {
    console.error('Error fetching violations:', error);
    res.status(500).json({ success: false, message: 'Server error fetching violations' });
  }
};

/** 7. Close a violation once the car has moved or the matter is settled. */
exports.updateViolation = async (req, res) => {
  const { status } = req.body;

  if (!['OPEN', 'RESOLVED', 'WAIVED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be OPEN, RESOLVED or WAIVED.' });
  }

  try {
    const [result] = await db.execute(
      `UPDATE parking_violations
       SET status = ?, resolved_at = IF(? = 'OPEN', NULL, CURRENT_TIMESTAMP)
       WHERE id = ?`,
      [status, status, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Violation not found.' });
    }

    res.json({ success: true, message: 'Violation updated.' });
  } catch (error) {
    console.error('Error updating violation:', error);
    res.status(500).json({ success: false, message: 'Server error updating violation' });
  }
};
