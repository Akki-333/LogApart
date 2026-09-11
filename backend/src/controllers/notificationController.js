const db = require('../config/db');

/**
 * Notifications are addressed to a role, but read state belongs to a person.
 *
 * This used to be a single is_read flag on the notification itself, so the
 * first admin to open the bell cleared the badge for every other admin. Reads
 * now live in notification_reads, one row per person per notification.
 */

// Helper to create notifications internally from any controller.
exports.createNotification = async ({ title, message, target_role = 'ALL', type = 'INFO' }) => {
  try {
    await db.execute(
      'INSERT INTO notifications (title, message, target_role, type) VALUES (?, ?, ?, ?)',
      [title, message, target_role, type]
    );
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};

// Rows addressed to this user's role. The parentheses matter: AND binds tighter
// than OR, so without them an appended condition would apply only to the
// role-matched half and every 'ALL' row would slip through it.
const VISIBLE = `WHERE (n.target_role = 'ALL' OR n.target_role = ?)`;

// 1. The bell: recent notifications for this role, flagged read for this person.
exports.getNotifications = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT n.id, n.title, n.message, n.target_role, n.type, n.created_at,
              r.id IS NOT NULL AS is_read
       FROM notifications n
       LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
       ${VISIBLE}
       ORDER BY n.created_at DESC
       LIMIT 20`,
      [req.user.id, req.user.role]
    );

    const data = rows.map((row) => ({ ...row, is_read: Boolean(row.is_read) }));

    // Counted over everything addressed to them, not just the twenty shown,
    // so the badge does not quietly under-report a backlog.
    const [[unread]] = await db.execute(
      `SELECT COUNT(*) AS count
       FROM notifications n
       LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
       ${VISIBLE} AND r.id IS NULL`,
      [req.user.id, req.user.role]
    );

    res.json({ success: true, data, unreadCount: Number(unread.count) });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Server error fetching notifications' });
  }
};

// 2. Mark one as read, for this person only. Idempotent.
exports.markAsRead = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id FROM notifications n ${VISIBLE} AND n.id = ?`,
      [req.user.role, req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    await db.execute(
      'INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)',
      [req.params.id, req.user.id]
    );

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 3. Clear the badge for this person, leaving everyone else's alone.
exports.markAllAsRead = async (req, res) => {
  try {
    const [result] = await db.execute(
      `INSERT IGNORE INTO notification_reads (notification_id, user_id)
       SELECT n.id, ? FROM notifications n ${VISIBLE}`,
      [req.user.id, req.user.role]
    );

    res.json({ success: true, message: 'All notifications marked as read', data: { marked: result.affectedRows } });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
