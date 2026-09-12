const db = require('../config/db');
const { recordAudit } = require('../services/audit');
const { createNotification } = require('./notificationController');

/**
 * The clubhouse, the terrace, the party hall.
 *
 * Slots are generated from the amenity's own hours rather than stored, so
 * changing the opening time does not leave a table of stale rows behind. A
 * booking claims one slot, and the database enforces that: two residents
 * tapping the same slot at the same moment is exactly the race a check in this
 * file would lose.
 */

const pad = (value) => String(value).padStart(2, '0');
const toTime = (hour) => `${pad(hour)}:00:00`;

/** Slots an amenity offers on any day, as plain start and end times. */
const slotsFor = (amenity) => {
  const open = Number(String(amenity.opens_at).slice(0, 2));
  const close = Number(String(amenity.closes_at).slice(0, 2));
  const step = Math.max(1, Number(amenity.slot_hours));
  const slots = [];

  for (let hour = open; hour + step <= close; hour += step) {
    slots.push({ starts_at: toTime(hour), ends_at: toTime(hour + step) });
  }

  return slots;
};

/** 1. What the building has, and the charge for using it. */
exports.getAmenities = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM amenities WHERE is_active = 1 ORDER BY name ASC'
    );

    res.json({
      success: true,
      data: rows.map((row) => ({ ...row, charge: Number(row.charge), slots: slotsFor(row) }))
    });
  } catch (error) {
    console.error('Error fetching amenities:', error);
    res.status(500).json({ success: false, message: 'Server error fetching amenities' });
  }
};

/** 2. One day for one amenity: every slot, and who has taken which. */
exports.getAvailability = async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const [amenities] = await db.execute('SELECT * FROM amenities WHERE id = ?', [req.params.id]);

    if (amenities.length === 0) {
      return res.status(404).json({ success: false, message: 'No such amenity.' });
    }

    const [booked] = await db.execute(
      `SELECT b.starts_at, b.status, u.number AS unit_number
       FROM amenity_bookings b
       JOIN units u ON b.unit_id = u.id
       WHERE b.amenity_id = ? AND b.booking_date = ? AND b.status IN ('PENDING', 'CONFIRMED')`,
      [req.params.id, date]
    );

    const taken = new Map(booked.map((row) => [String(row.starts_at), row]));

    res.json({
      success: true,
      data: {
        amenity: { ...amenities[0], charge: Number(amenities[0].charge) },
        date,
        slots: slotsFor(amenities[0]).map((slot) => {
          const holder = taken.get(slot.starts_at);
          return {
            ...slot,
            // The home is shown rather than the person, which is what a
            // neighbour needs to know and all they need to know.
            taken_by: holder ? `Home ${holder.unit_number}` : null,
            status: holder ? holder.status : 'FREE'
          };
        })
      }
    });
  } catch (error) {
    console.error('Error reading availability:', error);
    res.status(500).json({ success: false, message: 'Server error reading that day' });
  }
};

/** 3. Add or change an amenity. Admin only. */
exports.createAmenity = async (req, res) => {
  const { name, description, opens_at: opensAt, closes_at: closesAt, slot_hours: slotHours, charge, needs_approval: needsApproval } = req.body;

  try {
    const [result] = await db.execute(
      `INSERT INTO amenities (name, description, opens_at, closes_at, slot_hours, charge, needs_approval)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(name).trim(),
        description || null,
        opensAt || '06:00:00',
        closesAt || '22:00:00',
        Number(slotHours) || 2,
        Number(charge || 0),
        needsApproval ? 1 : 0
      ]
    );

    await recordAudit(req, {
      action: 'ADD_AMENITY',
      entity: 'amenities',
      entity_id: result.insertId,
      summary: `Opened ${name} for booking`,
      after: { name, charge: Number(charge || 0), needs_approval: Boolean(needsApproval) }
    });

    res.json({ success: true, message: `${name} can now be booked.`, data: { id: result.insertId } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Something by that name can already be booked.' });
    }

    console.error('Error adding amenity:', error);
    res.status(500).json({ success: false, message: 'Server error adding that amenity' });
  }
};

exports.updateAmenity = async (req, res) => {
  const { id } = req.params;
  const { charge, needs_approval: needsApproval, is_active: isActive, opens_at: opensAt, closes_at: closesAt, slot_hours: slotHours } = req.body;

  try {
    await db.execute(
      `UPDATE amenities
       SET charge = IFNULL(?, charge), needs_approval = IFNULL(?, needs_approval),
           is_active = IFNULL(?, is_active), opens_at = IFNULL(?, opens_at),
           closes_at = IFNULL(?, closes_at), slot_hours = IFNULL(?, slot_hours)
       WHERE id = ?`,
      [
        charge === undefined ? null : Number(charge),
        needsApproval === undefined ? null : (needsApproval ? 1 : 0),
        isActive === undefined ? null : (isActive ? 1 : 0),
        opensAt || null,
        closesAt || null,
        slotHours === undefined ? null : Number(slotHours),
        id
      ]
    );

    res.json({ success: true, message: 'Amenity updated.' });
  } catch (error) {
    console.error('Error updating amenity:', error);
    res.status(500).json({ success: false, message: 'Server error updating that amenity' });
  }
};

// Every resident endpoint resolves the caller's own home first, exactly as the
// rest of the resident API does. A unit id from the client is never trusted.
const activeUnitFor = async (userId) => {
  const [rows] = await db.execute(
    `SELECT u.id AS unit_id, u.number
     FROM residents r JOIN units u ON r.unit_id = u.id
     WHERE r.user_id = ? AND r.is_active = true LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
};

/** 4. Book a slot. The unique key decides who got there first. */
exports.book = async (req, res) => {
  const { amenity_id: amenityId, booking_date: date, starts_at: startsAt, note } = req.body;

  try {
    const unit = await activeUnitFor(req.user.id);

    if (!unit) {
      return res.status(404).json({ success: false, code: 'NO_ACTIVE_UNIT', message: 'You are not listed against a home.' });
    }

    const [amenities] = await db.execute('SELECT * FROM amenities WHERE id = ? AND is_active = 1', [amenityId]);

    if (amenities.length === 0) {
      return res.status(404).json({ success: false, message: 'That cannot be booked.' });
    }

    const amenity = amenities[0];
    const slot = slotsFor(amenity).find((option) => option.starts_at === startsAt);

    if (!slot) {
      return res.status(400).json({ success: false, message: 'That is not one of the slots on offer.' });
    }

    if (date < new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ success: false, message: 'That day has already passed.' });
    }

    const status = amenity.needs_approval ? 'PENDING' : 'CONFIRMED';

    const [result] = await db.execute(
      `INSERT INTO amenity_bookings
        (amenity_id, unit_id, booked_by_id, booking_date, starts_at, ends_at, status, charge, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [amenityId, unit.unit_id, req.user.id, date, slot.starts_at, slot.ends_at, status, amenity.charge, note || null]
    );

    createNotification({
      title: `${amenity.name} booked by home ${unit.number}`,
      message: `${date} from ${slot.starts_at.slice(0, 5)} to ${slot.ends_at.slice(0, 5)}.`,
      target_role: 'ADMIN',
      type: 'COMMUNITY'
    });

    res.json({
      success: true,
      message: amenity.needs_approval
        ? 'Requested. The building will confirm it.'
        : `${amenity.name} is yours for that slot.`,
      data: { id: result.insertId, status, charge: Number(amenity.charge) }
    });
  } catch (error) {
    // The unique key is the arbiter, not a check above, so the loser of a race
    // is told plainly rather than silently double-booked.
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Somebody took that slot first. Pick another.' });
    }

    console.error('Error booking amenity:', error);
    res.status(500).json({ success: false, message: 'Server error making that booking' });
  }
};

/** 5. Bookings, scoped to the caller's home unless they administer the building. */
exports.getBookings = async (req, res) => {
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

  try {
    const params = [];
    let scope = '';

    if (!isAdmin) {
      const unit = await activeUnitFor(req.user.id);

      if (!unit) {
        return res.json({ success: true, data: [] });
      }

      scope = 'WHERE b.unit_id = ?';
      params.push(unit.unit_id);
    } else if (req.query.status) {
      scope = 'WHERE b.status = ?';
      params.push(req.query.status);
    }

    const [rows] = await db.execute(
      `SELECT b.*, a.name AS amenity_name, u.number AS unit_number, usr.name AS booked_by
       FROM amenity_bookings b
       JOIN amenities a ON b.amenity_id = a.id
       JOIN units u ON b.unit_id = u.id
       LEFT JOIN users usr ON b.booked_by_id = usr.id
       ${scope}
       ORDER BY b.booking_date DESC, b.starts_at ASC
       LIMIT 200`,
      params
    );

    res.json({ success: true, data: rows.map((row) => ({ ...row, charge: Number(row.charge) })) });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ success: false, message: 'Server error fetching bookings' });
  }
};

/** 6. Cancel. A resident may drop their own home's booking, an admin any. */
exports.cancelBooking = async (req, res) => {
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

  try {
    const [rows] = await db.execute(
      `SELECT b.*, a.name AS amenity_name FROM amenity_bookings b
       JOIN amenities a ON b.amenity_id = a.id WHERE b.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No such booking.' });
    }

    const booking = rows[0];

    if (!isAdmin) {
      const unit = await activeUnitFor(req.user.id);

      if (!unit || unit.unit_id !== booking.unit_id) {
        return res.status(404).json({ success: false, message: 'No such booking.' });
      }
    }

    if (booking.status === 'CANCELLED') {
      return res.status(409).json({ success: false, message: 'That booking was already cancelled.' });
    }

    // Cancelled rather than deleted, so the slot frees up while the fact that
    // somebody held it and let it go stays on the record.
    await db.execute(
      'UPDATE amenity_bookings SET status = ?, review_note = ? WHERE id = ?',
      ['CANCELLED', req.body?.reason || null, req.params.id]
    );

    res.json({ success: true, message: 'Booking cancelled.' });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ success: false, message: 'Server error cancelling that booking' });
  }
};

/**
 * 7. Confirm or refuse a booking on an amenity that needs approval.
 *
 * Refusing frees the slot, because a refused request that keeps holding the
 * terrace is worse for the building than no booking system at all.
 */
exports.reviewBooking = async (req, res) => {
  const approve = req.body.approve === true || req.body.approve === 'true';
  const note = String(req.body.note || '').trim();

  if (!approve && note.length < 4) {
    return res.status(400).json({ success: false, message: 'Say why the booking is being refused.' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT b.*, a.name AS amenity_name, u.number AS unit_number
       FROM amenity_bookings b
       JOIN amenities a ON b.amenity_id = a.id
       JOIN units u ON b.unit_id = u.id
       WHERE b.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No such booking.' });
    }

    const booking = rows[0];

    if (booking.status !== 'PENDING') {
      return res.status(409).json({
        success: false,
        message: `That booking is already ${booking.status.toLowerCase()}.`
      });
    }

    await db.execute(
      'UPDATE amenity_bookings SET status = ?, reviewed_by_id = ?, review_note = ? WHERE id = ?',
      [approve ? 'CONFIRMED' : 'REJECTED', req.user.id, note || null, req.params.id]
    );

    await recordAudit(req, {
      action: approve ? 'CONFIRM_BOOKING' : 'REFUSE_BOOKING',
      entity: 'amenity_bookings',
      entity_id: req.params.id,
      summary: `${approve ? 'Confirmed' : 'Refused'} ${booking.amenity_name} for home ${booking.unit_number} on ${booking.booking_date}`,
      before: { status: 'PENDING' },
      after: { status: approve ? 'CONFIRMED' : 'REJECTED', note: note || null }
    });

    await createNotification({
      title: approve ? `${booking.amenity_name} confirmed` : `${booking.amenity_name} not available`,
      message: approve
        ? `${booking.booking_date}, ${String(booking.starts_at).slice(0, 5)} to ${String(booking.ends_at).slice(0, 5)}.`
        : `Your request for ${booking.booking_date} was refused: ${note}`,
      target_role: 'RESIDENT',
      target_user_id: booking.booked_by_id,
      type: 'COMMUNITY'
    });

    res.json({ success: true, message: approve ? 'Booking confirmed.' : 'Booking refused and the slot freed.' });
  } catch (error) {
    console.error('Error reviewing booking:', error);
    res.status(500).json({ success: false, message: 'Server error reviewing that booking' });
  }
};
