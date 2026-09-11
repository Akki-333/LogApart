const db = require('../config/db');
const { createNotification } = require('./notificationController');

/**
 * Maintenance tickets cover the building's structure and its shared parts.
 *
 * A ticket is either raised against a flat or against the common area. The
 * common ones carry a location instead of a unit, because a stuck lift or a
 * failed water pump belongs to the building, not to anybody's home.
 */

const TICKET_SELECT = `
  SELECT
    t.id, t.title, t.description, t.category, t.priority, t.status,
    t.scope, t.location, t.unit_id, t.created_at, t.resolved_at, t.raised_by_resident,
    u.number AS unit_number,
    usr.name AS reported_by,
    assignee.name AS assigned_to
  FROM maintenance_tickets t
  LEFT JOIN units u ON t.unit_id = u.id
  JOIN users usr ON t.created_by_id = usr.id
  LEFT JOIN users assignee ON t.assigned_to_id = assignee.id
`;

/** Where the ticket is, in words, for any screen that needs one label. */
const placeOf = (ticket) =>
  ticket.scope === 'COMMON' ? ticket.location || 'Common area' : `Flat ${ticket.unit_number}`;

const shape = (ticket) => ({ ...ticket, place: placeOf(ticket) });

exports.getTickets = async (req, res) => {
  const { scope } = req.query;

  try {
    const [rows] = await db.execute(
      `${TICKET_SELECT}
       WHERE (? IS NULL OR t.scope = ?)
       ORDER BY t.created_at DESC`,
      [scope || null, scope || null]
    );

    res.json({ success: true, data: rows.map(shape) });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ success: false, message: 'Server error fetching tickets' });
  }
};

exports.updateTicketStatus = async (req, res) => {
  const { id } = req.params;
  const { status, priority, assigned_to_id: assignedToId } = req.body;

  if (status && !['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Unknown ticket status.' });
  }

  if (priority && !['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority)) {
    return res.status(400).json({ success: false, message: 'Unknown priority.' });
  }

  try {
    const [result] = await db.execute(
      `UPDATE maintenance_tickets
       SET status = IFNULL(?, status),
           priority = IFNULL(?, priority),
           assigned_to_id = IFNULL(?, assigned_to_id),
           resolved_at = CASE
             WHEN ? IN ('RESOLVED', 'CLOSED') THEN CURRENT_TIMESTAMP
             WHEN ? IS NOT NULL THEN NULL
             ELSE resolved_at
           END
       WHERE id = ?`,
      [status || null, priority || null, assignedToId || null, status || null, status || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found.' });
    }

    res.json({ success: true, message: 'Ticket updated successfully' });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ success: false, message: 'Server error updating ticket' });
  }
};

exports.createTicket = async (req, res) => {
  const { unit_id: unitId, title, description, category, priority, scope, location } = req.body;

  if (!String(title || '').trim() || !String(description || '').trim()) {
    return res.status(400).json({ success: false, message: 'Give the issue a title and a description.' });
  }

  const isCommon = scope === 'COMMON';

  if (!isCommon && !unitId) {
    return res.status(400).json({ success: false, message: 'Pick the flat, or mark this as a common-area issue.' });
  }

  if (isCommon && !String(location || '').trim()) {
    return res.status(400).json({ success: false, message: 'Say where the common-area issue is, such as Lift A or the terrace.' });
  }

  try {
    await db.execute(
      `INSERT INTO maintenance_tickets
        (unit_id, scope, location, created_by_id, title, description, category, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        isCommon ? null : unitId,
        isCommon ? 'COMMON' : 'UNIT',
        isCommon ? String(location).trim() : null,
        req.user.id,
        String(title).trim(),
        String(description).trim(),
        category || 'GENERAL',
        priority || 'MEDIUM'
      ]
    );

    // A common-area fault affects everybody, so residents are told about it.
    if (isCommon) {
      createNotification({
        title: `Issue reported: ${String(location).trim()}`,
        message: String(title).trim(),
        target_role: 'RESIDENT',
        type: 'MAINTENANCE'
      });
    }

    res.json({ success: true, message: 'Ticket created successfully' });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ success: false, message: 'Server error creating ticket' });
  }
};

exports.placeOf = placeOf;
