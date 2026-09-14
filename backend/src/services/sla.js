const db = require('../config/db');
const log = require('./log');

/**
 * Service levels on maintenance tickets.
 *
 * The countdown on the board used to be computed in the browser and nothing
 * happened when it ran out. The hours now live here, the board reads them from
 * the API, and a breach is escalated: the ticket is stamped and every admin is
 * told, once.
 */

const SLA_HOURS = { URGENT: 4, HIGH: 24, MEDIUM: 48, LOW: 48 };
const HOUR_MS = 60 * 60 * 1000;
const CLOSED = ['RESOLVED', 'CLOSED'];

const hoursFor = (priority) => SLA_HOURS[priority] || SLA_HOURS.MEDIUM;

/** The SLA view of one ticket, derived from its priority and timestamps. */
function slaFor(ticket, now = new Date()) {
  const due = new Date(new Date(ticket.created_at).getTime() + hoursFor(ticket.priority) * HOUR_MS);
  const closed = CLOSED.includes(ticket.status);
  const finishedAt = closed && ticket.resolved_at ? new Date(ticket.resolved_at) : null;

  return {
    sla_hours: hoursFor(ticket.priority),
    sla_due_at: due.toISOString(),
    sla_breached: closed ? Boolean(finishedAt && finishedAt > due) : now > due,
    sla_hours_left: closed ? null : Math.round(((due - now) / HOUR_MS) * 10) / 10
  };
}

// The same rule as slaFor, in SQL, so a sweep is one statement however many
// tickets are open.
const OVERDUE = `
  t.status IN ('OPEN', 'IN_PROGRESS')
  AND t.sla_breached_at IS NULL
  AND t.created_at < NOW() - INTERVAL (CASE t.priority WHEN 'URGENT' THEN 4 WHEN 'HIGH' THEN 24 ELSE 48 END) HOUR`;

/**
 * Stamps every newly breached ticket and tells the admins. The rows are locked
 * inside a transaction, so two API processes sweeping at once cannot both
 * notify about the same ticket. Returns how many were escalated.
 */
async function escalateBreaches() {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [breached] = await connection.query(
      `SELECT t.id, t.title, t.priority, t.scope, t.location, u.number AS unit_number
       FROM maintenance_tickets t
       LEFT JOIN units u ON t.unit_id = u.id
       WHERE ${OVERDUE}
       FOR UPDATE`
    );

    if (breached.length === 0) {
      await connection.commit();
      return 0;
    }

    await connection.query(
      'UPDATE maintenance_tickets SET sla_breached_at = NOW() WHERE id IN (?) AND sla_breached_at IS NULL',
      [breached.map((ticket) => ticket.id)]
    );

    await connection.query(
      'INSERT INTO notifications (title, message, target_role, type) VALUES ?',
      [breached.map((ticket) => [
        `SLA missed: ${ticket.title}`.slice(0, 255),
        `${ticket.scope === 'COMMON' ? ticket.location || 'Common area' : `Home ${ticket.unit_number}`}, ${ticket.priority.toLowerCase()} priority, past its ${hoursFor(ticket.priority)} hour target.`,
        'ADMIN',
        'MAINTENANCE'
      ])]
    );

    await connection.commit();
    return breached.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Sweeps now and then every few minutes, without holding the process open. */
function startSlaWatch(intervalMs = 5 * 60 * 1000) {
  const sweep = () =>
    escalateBreaches()
      .then((count) => { if (count > 0) log.info('sla breaches escalated', { count }); })
      .catch((error) => log.error('sla escalation failed', { error }));

  sweep();
  const timer = setInterval(sweep, intervalMs);
  timer.unref();
  return timer;
}

module.exports = { SLA_HOURS, slaFor, escalateBreaches, startSlaWatch };
