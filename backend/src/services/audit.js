const db = require('../config/db');

/**
 * The audit trail. Every destructive or financial write records who did it,
 * what it looked like before, and what it looks like now.
 *
 * Two failure rules, and they differ on purpose:
 *
 *   - Given a transaction connection, the audit row is written inside the same
 *     transaction and any error propagates. The action and its record commit
 *     together or not at all.
 *   - Without one, the action has already committed by the time we get here, so
 *     failing the response would be a lie. The error is logged loudly instead.
 *     It is never swallowed silently.
 */

// Behind a proxy the socket address is the proxy. Trust the forwarded header
// only for the first hop, which is the client as far as we can know.
const clientIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || req.ip || req.socket?.remoteAddress || '').slice(0, 45) || null;
};

const asJson = (value) =>
  value === undefined || value === null ? null : JSON.stringify(value);

async function recordAudit(req, entry, connection = null) {
  const { action, entity, entity_id: entityId, summary, before, after } = entry;

  const params = [
    req.user?.id ?? null,
    req.user?.name || 'Unknown',
    req.user?.role || 'UNKNOWN',
    action,
    entity,
    entityId === undefined || entityId === null ? null : String(entityId),
    String(summary).slice(0, 255),
    asJson(before),
    asJson(after),
    clientIp(req)
  ];

  const sql = `
    INSERT INTO audit_log
      (actor_id, actor_name, actor_role, action, entity, entity_id, summary,
       before_state, after_state, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  if (connection) {
    await connection.execute(sql, params);
    return;
  }

  try {
    await db.execute(sql, params);
  } catch (error) {
    console.error(
      `AUDIT WRITE FAILED. action=${action} entity=${entity} id=${entityId} actor=${req.user?.id}`,
      error
    );
  }
}

module.exports = { recordAudit, clientIp };
