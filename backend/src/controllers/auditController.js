const db = require('../config/db');

const MAX_PAGE = 200;
const DEFAULT_PAGE = 50;

/**
 * The trail, read back. Admin only.
 *
 * Paging is by id rather than OFFSET: the log only ever grows at the head, so
 * an offset would shift under the reader between pages and quietly skip rows.
 */
exports.getAuditLog = async (req, res) => {
  const limit = Math.min(MAX_PAGE, Math.max(1, Number(req.query.limit) || DEFAULT_PAGE));
  const filters = [];
  const params = [];

  if (req.query.actor_id) {
    filters.push('a.actor_id = ?');
    params.push(Number(req.query.actor_id));
  }

  if (req.query.entity) {
    filters.push('a.entity = ?');
    params.push(String(req.query.entity));
  }

  if (req.query.action) {
    filters.push('a.action = ?');
    params.push(String(req.query.action));
  }

  if (req.query.search) {
    filters.push('(a.summary LIKE ? OR a.actor_name LIKE ?)');
    const like = `%${String(req.query.search).slice(0, 60)}%`;
    params.push(like, like);
  }

  if (req.query.before_id) {
    filters.push('a.id < ?');
    params.push(Number(req.query.before_id));
  }

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    // The limit is interpolated after being clamped to an integer, because a
    // placeholder in LIMIT is not portable across prepared-statement drivers.
    const [rows] = await db.execute(
      `SELECT a.id, a.actor_id, a.actor_name, a.actor_role, a.action, a.entity,
              a.entity_id, a.summary, a.ip, a.created_at
       FROM audit_log a
       ${where}
       ORDER BY a.id DESC
       LIMIT ${limit}`,
      params
    );

    const [actions] = await db.execute(
      'SELECT DISTINCT action FROM audit_log ORDER BY action ASC'
    );

    res.json({
      success: true,
      data: rows,
      // Null once the reader has reached the beginning of the log.
      next_before_id: rows.length === limit ? rows[rows.length - 1].id : null,
      actions: actions.map((row) => row.action)
    });
  } catch (error) {
    console.error('Error reading audit log:', error);
    res.status(500).json({ success: false, message: 'Server error reading the activity log' });
  }
};

/** One entry in full, including the before and after state. */
exports.getAuditEntry = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM audit_log WHERE id = ?', [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No such activity entry.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error reading audit entry:', error);
    res.status(500).json({ success: false, message: 'Server error reading that entry' });
  }
};
