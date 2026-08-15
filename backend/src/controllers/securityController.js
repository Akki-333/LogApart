const db = require('../config/db');

exports.getVisitorLogs = async (req, res) => {
  try {
    const query = `
      SELECT 
        v.id, v.visitor_name, v.visitor_phone, v.purpose, v.status, v.entry_time, v.exit_time,
        u.number as unit_number,
        usr.name as logged_by
      FROM visitor_logs v
      JOIN units u ON v.unit_id = u.id
      JOIN users usr ON v.logged_by_id = usr.id
      ORDER BY 
        CASE WHEN v.status = 'ENTERED' THEN 1 ELSE 2 END, 
        v.entry_time DESC
    `;
    
    const [rows] = await db.execute(query);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching visitors:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.logVisitor = async (req, res) => {
  const { visitor_name, visitor_phone, unit_id, purpose } = req.body;
  const logged_by_id = req.user.id; // From auth middleware

  try {
    const query = `
      INSERT INTO visitor_logs 
      (visitor_name, visitor_phone, unit_id, purpose, status, logged_by_id) 
      VALUES (?, ?, ?, ?, 'ENTERED', ?)
    `;
    
    await db.execute(query, [visitor_name, visitor_phone, unit_id, purpose || 'GUEST', logged_by_id]);
    res.json({ success: true, message: 'Visitor logged in successfully' });
  } catch (error) {
    console.error('Error logging visitor:', error);
    res.status(500).json({ success: false, message: 'Server error logging visitor' });
  }
};

exports.checkoutVisitor = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      UPDATE visitor_logs 
      SET status = 'EXITED', exit_time = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    await db.execute(query, [id]);
    res.json({ success: true, message: 'Visitor checked out successfully' });
  } catch (error) {
    console.error('Error checking out visitor:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
