const db = require('../config/db');
const { recordAudit } = require('../services/audit');
const { createNotification } = require('./notificationController');

/**
 * The numbers somebody needs at two in the morning, and the button that wakes
 * the gate.
 *
 * An SOS is deliberately thin: it raises an urgent notification to the guard on
 * duty and every admin, carrying the flat and whatever the resident had time to
 * type. It does not dial anyone. Pretending otherwise would be worse than not
 * having it.
 */

/** 1. The list. Readable by anyone signed in, because that is the point. */
exports.getContacts = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, label, phone, note FROM emergency_contacts WHERE is_active = 1 ORDER BY position ASC, id ASC'
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error reading emergency contacts:', error);
    res.status(500).json({ success: false, message: 'Server error reading emergency contacts' });
  }
};

exports.createContact = async (req, res) => {
  const { label, phone, note, position } = req.body;

  try {
    const [result] = await db.execute(
      'INSERT INTO emergency_contacts (label, phone, note, position) VALUES (?, ?, ?, ?)',
      [String(label).trim(), String(phone).trim(), note || null, Number(position) || 0]
    );

    res.json({ success: true, message: `${label} added.`, data: { id: result.insertId } });
  } catch (error) {
    console.error('Error adding emergency contact:', error);
    res.status(500).json({ success: false, message: 'Server error adding that contact' });
  }
};

exports.deleteContact = async (req, res) => {
  try {
    const [result] = await db.execute(
      'UPDATE emergency_contacts SET is_active = 0 WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'No such contact.' });
    }

    res.json({ success: true, message: 'Contact removed from the list.' });
  } catch (error) {
    console.error('Error removing emergency contact:', error);
    res.status(500).json({ success: false, message: 'Server error removing that contact' });
  }
};

/**
 * 2. The button. Raises an urgent notification to the desk and the admins with
 * the flat attached, and puts the call on the record so it can be reviewed.
 */
exports.raiseAlert = async (req, res) => {
  const detail = String(req.body?.detail || '').trim().slice(0, 200);

  try {
    const [rows] = await db.execute(
      `SELECT u.id AS unit_id, u.number, u.floor, usr.name, usr.phone
       FROM residents r
       JOIN units u ON r.unit_id = u.id
       JOIN users usr ON r.user_id = usr.id
       WHERE r.user_id = ? AND r.is_active = true LIMIT 1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, code: 'NO_ACTIVE_UNIT', message: 'You are not listed against a flat.' });
    }

    const caller = rows[0];
    const message = `${caller.name}, flat ${caller.number} on floor ${caller.floor}${caller.phone ? `, ${caller.phone}` : ''}.${detail ? ` ${detail}` : ''}`;

    // The guard is the one who can physically go, so the desk is told first and
    // separately rather than relying on an admin to relay it.
    await createNotification({
      title: `EMERGENCY · Flat ${caller.number}`,
      message,
      target_role: 'SECURITY',
      type: 'EMERGENCY'
    });

    await createNotification({
      title: `EMERGENCY · Flat ${caller.number}`,
      message,
      target_role: 'ADMIN',
      type: 'EMERGENCY'
    });

    await recordAudit(req, {
      action: 'RAISE_EMERGENCY',
      entity: 'units',
      entity_id: caller.unit_id,
      summary: `Flat ${caller.number} raised an emergency alert`,
      after: { detail: detail || null }
    });

    res.json({
      success: true,
      message: 'The gate and the building admins have been alerted. Call the numbers below as well.'
    });
  } catch (error) {
    console.error('Error raising alert:', error);
    res.status(500).json({ success: false, message: 'Server error raising that alert' });
  }
};
