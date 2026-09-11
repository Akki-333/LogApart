const db = require('../config/db');

/**
 * Who lives in the flat, what they drive, and whether they want to be listed.
 *
 * Everything here is scoped to the caller's own flat by the server. The
 * directory is the one read that crosses flats, and it shows only the residents
 * who switched themselves on.
 */

const activeUnitFor = async (userId) => {
  const [rows] = await db.execute(
    `SELECT u.id AS unit_id, u.number, r.id AS resident_id, r.show_in_directory, r.emergency_contact
     FROM residents r JOIN units u ON r.unit_id = u.id
     WHERE r.user_id = ? AND r.is_active = true LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
};

const withUnit = (handler) => async (req, res) => {
  try {
    const unit = await activeUnitFor(req.user.id);

    if (!unit) {
      return res.status(404).json({
        success: false,
        code: 'NO_ACTIVE_UNIT',
        message: 'You are not currently listed against a flat.'
      });
    }

    await handler(req, res, unit);
  } catch (error) {
    console.error('Household error:', error);
    res.status(500).json({ success: false, message: 'Server error reading your household' });
  }
};

/** 1. The flat's own profile. */
exports.getHousehold = withUnit(async (req, res, unit) => {
  const [members] = await db.execute(
    'SELECT * FROM household_members WHERE unit_id = ? ORDER BY is_minor ASC, name ASC',
    [unit.unit_id]
  );

  const [vehicles] = await db.execute(
    `SELECT v.*, b.bay_number
     FROM household_vehicles v
     LEFT JOIN parking_bays b ON REPLACE(UPPER(b.vehicle_number), ' ', '') = v.number_plate
     WHERE v.unit_id = ? ORDER BY v.vehicle_type ASC`,
    [unit.unit_id]
  );

  res.json({
    success: true,
    data: {
      unit,
      members,
      vehicles,
      show_in_directory: Boolean(unit.show_in_directory)
    }
  });
});

exports.addMember = withUnit(async (req, res, unit) => {
  const { name, relation, phone, is_minor: isMinor } = req.body;

  const [result] = await db.execute(
    'INSERT INTO household_members (unit_id, name, relation, phone, is_minor) VALUES (?, ?, ?, ?, ?)',
    [unit.unit_id, String(name).trim(), relation || null, phone || null, isMinor ? 1 : 0]
  );

  res.json({ success: true, message: `${name} added to your household.`, data: { id: result.insertId } });
});

exports.removeMember = withUnit(async (req, res, unit) => {
  const [result] = await db.execute(
    'DELETE FROM household_members WHERE id = ? AND unit_id = ?',
    [req.params.id, unit.unit_id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ success: false, message: 'Nobody by that record in your household.' });
  }

  res.json({ success: true, message: 'Removed.' });
});

/**
 * 2. Vehicles. The plate is unique across the building on purpose: the same car
 * cannot belong to two flats, and that is what lets a parking violation say
 * whose car it is rather than reporting an unknown plate.
 */
exports.addVehicle = withUnit(async (req, res, unit) => {
  const { vehicle_type: type, number_plate: plate, model } = req.body;
  const normalised = String(plate).trim().toUpperCase().replace(/\s+/g, '');

  try {
    const [result] = await db.execute(
      'INSERT INTO household_vehicles (unit_id, vehicle_type, number_plate, model) VALUES (?, ?, ?, ?)',
      [unit.unit_id, type || 'CAR', normalised, model || null]
    );

    res.json({ success: true, message: `${normalised} registered to your flat.`, data: { id: result.insertId } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'That number is already registered in the building. Speak to the admin if it is yours.'
      });
    }

    throw error;
  }
});

exports.removeVehicle = withUnit(async (req, res, unit) => {
  const [result] = await db.execute(
    'DELETE FROM household_vehicles WHERE id = ? AND unit_id = ?',
    [req.params.id, unit.unit_id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ success: false, message: 'No such vehicle on your flat.' });
  }

  res.json({ success: true, message: 'Vehicle removed.' });
});

/** 3. The directory, off until a resident switches themselves on. */
exports.setDirectoryVisibility = withUnit(async (req, res, unit) => {
  const listed = req.body.show_in_directory === true || req.body.show_in_directory === 'true';

  await db.execute('UPDATE residents SET show_in_directory = ? WHERE id = ?', [listed ? 1 : 0, unit.resident_id]);

  res.json({
    success: true,
    message: listed
      ? 'You are now listed in the resident directory.'
      : 'You have been taken out of the resident directory.'
  });
});

/**
 * 4. Read the directory. Residents only, and only the neighbours who opted in.
 * A resident who has not switched themselves on can still read it: the choice
 * is about being listed, not about being allowed to look.
 */
exports.getDirectory = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT usr.name, usr.phone, u.number AS unit_number, u.floor
       FROM residents r
       JOIN users usr ON r.user_id = usr.id
       JOIN units u ON r.unit_id = u.id
       WHERE r.is_active = true AND r.show_in_directory = 1 AND usr.is_active = 1
       ORDER BY u.floor ASC, u.number ASC`
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error reading the directory:', error);
    res.status(500).json({ success: false, message: 'Server error reading the directory' });
  }
};
