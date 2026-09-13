const db = require('../config/db');
const { activeHomeFor } = require('../services/residency');
const { createNotification } = require('./notificationController');
const { isAdminRole } = require('../middleware/auth');

/**
 * Maintenance tickets cover the building's structure and its shared parts.
 *
 * A ticket is either raised against a home or against the common area. The
 * common ones carry a location instead of a unit, because a stuck lift or a
 * failed water pump belongs to the building, not to anybody's home.
 */

const TICKET_SELECT = `
  SELECT
    t.id, t.title, t.description, t.category, t.priority, t.status,
    t.scope, t.location, t.unit_id, t.created_at, t.resolved_at, t.raised_by_resident,
    t.rating, t.rating_note, t.reopen_count,
    (SELECT COUNT(*) FROM ticket_comments c WHERE c.ticket_id = t.id) AS comment_count,
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
  ticket.scope === 'COMMON' ? ticket.location || 'Common area' : `Home ${ticket.unit_number}`;

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
    return res.status(400).json({ success: false, message: 'Pick the home, or mark this as a common-area issue.' });
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

/**
 * Comments, a rating and a reopen window.
 *
 * A resident used to report an issue and hear nothing until it closed, which
 * made "resolved" a claim rather than an agreement. Resolution now has to
 * survive contact with the person who reported it.
 */
const REOPEN_WINDOW_DAYS = 7;

/**
 * The ticket, if this caller is allowed to see it. An admin sees every ticket.
 * A resident sees their own home's and every common-area one, which is the same
 * rule their ticket list already follows.
 */
const readableTicket = async (req, ticketId) => {
  const [rows] = await db.execute('SELECT * FROM maintenance_tickets WHERE id = ?', [ticketId]);

  if (rows.length === 0) return null;

  const ticket = rows[0];

  if (isAdminRole(req.user.role)) return ticket;

  const unitId = (await activeHomeFor(req.user.id))?.unit_id ?? null;

  if (ticket.scope === 'COMMON') return ticket;
  if (unitId && ticket.unit_id === unitId) return ticket;

  return null;
};

exports.getComments = async (req, res) => {
  try {
    const ticket = await readableTicket(req, req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'No such issue.' });
    }

    const [rows] = await db.execute(
      `SELECT c.id, c.body, c.created_at, usr.name AS author, usr.role AS author_role
       FROM ticket_comments c
       JOIN users usr ON c.author_id = usr.id
       WHERE c.ticket_id = ?
       ORDER BY c.created_at ASC`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: rows,
      ticket: {
        id: ticket.id,
        status: ticket.status,
        rating: ticket.rating,
        rating_note: ticket.rating_note,
        reopen_count: ticket.reopen_count,
        can_reopen: ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
      }
    });
  } catch (error) {
    console.error('Error reading comments:', error);
    res.status(500).json({ success: false, message: 'Server error reading that conversation' });
  }
};

exports.addComment = async (req, res) => {
  const body = String(req.body?.body || '').trim();

  if (body.length < 2) {
    return res.status(400).json({ success: false, message: 'Write something before sending.' });
  }

  try {
    const ticket = await readableTicket(req, req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'No such issue.' });
    }

    await db.execute(
      'INSERT INTO ticket_comments (ticket_id, author_id, body) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, body.slice(0, 1000)]
    );

    // The other side of the conversation is told. An admin comment reaches the
    // resident who raised it, and a resident comment reaches the admins.
    if (isAdminRole(req.user.role)) {
      if (ticket.created_by_id) {
        await createNotification({
          title: `Update on "${ticket.title}"`,
          message: body.slice(0, 160),
          target_role: 'RESIDENT',
          target_user_id: ticket.created_by_id,
          type: 'MAINTENANCE'
        });
      }
    } else {
      await createNotification({
        title: `Reply on "${ticket.title}"`,
        message: body.slice(0, 160),
        target_role: 'ADMIN',
        type: 'MAINTENANCE'
      });
    }

    res.json({ success: true, message: 'Sent.' });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ success: false, message: 'Server error sending that' });
  }
};

/** The resident who raised it says whether the fix held. */
exports.rateTicket = async (req, res) => {
  const rating = Number(req.body?.rating);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'Rate the fix from one to five.' });
  }

  try {
    const ticket = await readableTicket(req, req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'No such issue.' });
    }

    if (ticket.created_by_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only whoever reported it can rate the fix.' });
    }

    if (!['RESOLVED', 'CLOSED'].includes(ticket.status)) {
      return res.status(409).json({ success: false, message: 'Rate it once the work is done.' });
    }

    await db.execute(
      'UPDATE maintenance_tickets SET rating = ?, rating_note = ? WHERE id = ?',
      [rating, String(req.body?.note || '').trim().slice(0, 255) || null, req.params.id]
    );

    res.json({ success: true, message: 'Thank you. That is on the record.' });
  } catch (error) {
    console.error('Error rating ticket:', error);
    res.status(500).json({ success: false, message: 'Server error recording that rating' });
  }
};

/** Reopening, within a week of the work being called done. */
exports.reopenTicket = async (req, res) => {
  const reason = String(req.body?.reason || '').trim();

  if (reason.length < 4) {
    return res.status(400).json({ success: false, message: 'Say what is still wrong.' });
  }

  try {
    const ticket = await readableTicket(req, req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'No such issue.' });
    }

    if (!['RESOLVED', 'CLOSED'].includes(ticket.status)) {
      return res.status(409).json({ success: false, message: 'That issue is already open.' });
    }

    const resolvedAt = ticket.resolved_at ? new Date(ticket.resolved_at) : null;
    const daysSince = resolvedAt ? Math.floor((Date.now() - resolvedAt.getTime()) / 86400000) : 0;

    if (daysSince > REOPEN_WINDOW_DAYS) {
      return res.status(409).json({
        success: false,
        message: `That was closed ${daysSince} days ago. Raise it as a new issue instead.`
      });
    }

    await db.execute(
      `UPDATE maintenance_tickets
       SET status = 'OPEN', resolved_at = NULL, reopened_at = CURRENT_TIMESTAMP,
           reopen_count = reopen_count + 1
       WHERE id = ?`,
      [req.params.id]
    );

    await db.execute(
      'INSERT INTO ticket_comments (ticket_id, author_id, body) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, `Reopened: ${reason}`]
    );

    await createNotification({
      title: `Reopened: ${ticket.title}`,
      message: reason.slice(0, 160),
      target_role: 'ADMIN',
      type: 'MAINTENANCE'
    });

    res.json({ success: true, message: 'Reopened. The building has been told.' });
  } catch (error) {
    console.error('Error reopening ticket:', error);
    res.status(500).json({ success: false, message: 'Server error reopening that issue' });
  }
};
