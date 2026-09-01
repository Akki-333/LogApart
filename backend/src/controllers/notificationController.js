const db = require('../config/db');

// Helper to create notifications internally from any controller
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

// 1. Get notifications for the logged in role
exports.getNotifications = async (req, res) => {
  try {
    const userRole = req.user.role; // 'ADMIN', 'SECURITY', 'RESIDENT'
    
    const query = `
      SELECT id, title, message, target_role, type, is_read, created_at
      FROM notifications
      WHERE target_role = 'ALL' OR target_role = ?
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const [rows] = await db.execute(query, [userRole]);
    const unreadCount = rows.filter(n => !n.is_read).length;

    res.json({
      success: true,
      data: rows,
      unreadCount
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Server error fetching notifications' });
  }
};

// 2. Mark single notification as read
exports.markAsRead = async (req, res) => {
  const { id } = req.params;
  try {
    await db.execute('UPDATE notifications SET is_read = true WHERE id = ?', [id]);
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 3. Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userRole = req.user.role;
    await db.execute('UPDATE notifications SET is_read = true WHERE target_role = "ALL" OR target_role = ?', [userRole]);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
