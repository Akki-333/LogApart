const db = require('../config/db');

/**
 * The home a signed-in resident lives in today, or null.
 *
 * Every resident-scoped read starts here, which is how a resident's home is
 * never taken from the client. It used to be written out in six controllers in
 * two shapes, one returning the home and one only its id; a copy drifting from
 * the others would scope somebody to the wrong home, or to none.
 */
async function activeHomeFor(userId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT u.id AS unit_id, u.number, u.floor, r.id AS resident_id,
            r.show_in_directory, r.emergency_contact
     FROM residents r
     JOIN units u ON r.unit_id = u.id
     WHERE r.user_id = ? AND r.is_active = true
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

module.exports = { activeHomeFor };
