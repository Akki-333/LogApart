const db = require('../config/db');
const { createNotification } = require('./notificationController');
const { isAdminRole } = require('../middleware/auth');

/**
 * Parcels the desk is holding.
 *
 * A delivery arriving at an empty home used to be a guard's memory and a note
 * on a pad. It is recorded against the home, the resident is told, and
 * collection is signed for by name, so "I never got it" has an answer.
 */

const activeUnitFor = async (userId) => {
  const [rows] = await db.execute(
    'SELECT unit_id FROM residents WHERE user_id = ? AND is_active = true LIMIT 1',
    [userId]
  );

  return rows[0]?.unit_id || null;
};

const SELECT = `
  SELECT p.*, u.number AS unit_number, u.floor,
         guard.name AS received_by, releaser.name AS released_by
  FROM parcels p
  JOIN units u ON p.unit_id = u.id
  LEFT JOIN users guard ON p.received_by_id = guard.id
  LEFT JOIN users releaser ON p.released_by_id = releaser.id
`;

/** 1. What the desk is holding. A resident sees only their own home's. */
exports.getParcels = async (req, res) => {
  try {
    const filters = [];
    const params = [];

    if (req.user.role === 'RESIDENT') {
      const unitId = await activeUnitFor(req.user.id);

      if (!unitId) return res.json({ success: true, data: [] });

      filters.push('p.unit_id = ?');
      params.push(unitId);
    }

    if (req.query.waiting === 'true') {
      filters.push('p.collected_at IS NULL');
    }

    const [rows] = await db.execute(
      `${SELECT}
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY p.collected_at IS NOT NULL ASC, p.received_at DESC
       LIMIT 200`,
      params
    );

    res.json({
      success: true,
      data: rows.map((row) => ({ ...row, is_waiting: !row.collected_at }))
    });
  } catch (error) {
    console.error('Error reading parcels:', error);
    res.status(500).json({ success: false, message: 'Server error reading parcels' });
  }
};

/** 2. Take one in at the gate. */
exports.receiveParcel = async (req, res) => {
  const { unit_id: unitId, courier, description } = req.body;

  try {
    const [units] = await db.execute('SELECT number FROM units WHERE id = ?', [unitId]);

    if (units.length === 0) {
      return res.status(404).json({ success: false, message: 'No such home.' });
    }

    const [result] = await db.execute(
      'INSERT INTO parcels (unit_id, courier, description, received_by_id) VALUES (?, ?, ?, ?)',
      [unitId, courier || null, description || null, req.user.id]
    );

    // Addressed to the residents of that home, so the whole building is not
    // told that somebody has a parcel waiting.
    const [residents] = await db.execute(
      'SELECT user_id FROM residents WHERE unit_id = ? AND is_active = true',
      [unitId]
    );

    for (const resident of residents) {
      await createNotification({
        title: 'A parcel is waiting at the gate',
        message: `${courier || 'A delivery'} for home ${units[0].number}${description ? `: ${description}` : ''}.`,
        target_role: 'RESIDENT',
        target_user_id: resident.user_id,
        type: 'GATE'
      });
    }

    res.json({
      success: true,
      message: `Held for home ${units[0].number}. They have been told.`,
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Error receiving parcel:', error);
    res.status(500).json({ success: false, message: 'Server error recording that parcel' });
  }
};

/** 3. Hand it over, signed for by whoever collected it. */
exports.releaseParcel = async (req, res) => {
  const collectedBy = String(req.body?.collected_by_name || '').trim();

  if (collectedBy.length < 2) {
    return res.status(400).json({ success: false, message: 'Record who collected it.' });
  }

  try {
    const [rows] = await db.execute('SELECT * FROM parcels WHERE id = ?', [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No such parcel.' });
    }

    if (rows[0].collected_at) {
      return res.status(409).json({
        success: false,
        message: `That was already collected by ${rows[0].collected_by_name}.`
      });
    }

    await db.execute(
      `UPDATE parcels
       SET collected_at = CURRENT_TIMESTAMP, collected_by_name = ?, released_by_id = ?
       WHERE id = ?`,
      [collectedBy, req.user.id, req.params.id]
    );

    res.json({ success: true, message: `Handed to ${collectedBy}.` });
  } catch (error) {
    console.error('Error releasing parcel:', error);
    res.status(500).json({ success: false, message: 'Server error releasing that parcel' });
  }
};

/** 4. How many are stacked up, for the desk header and the admin dashboard. */
exports.getWaitingCount = async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT COUNT(*) AS waiting FROM parcels WHERE collected_at IS NULL'
    );

    res.json({ success: true, data: { waiting: Number(row.waiting), can_release: !isAdminRole(req.user.role) } });
  } catch (error) {
    console.error('Error counting parcels:', error);
    res.status(500).json({ success: false, message: 'Server error counting parcels' });
  }
};
