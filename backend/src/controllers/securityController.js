const db = require('../config/db');
const { createNotification } = require('./notificationController');

// 1. Get all visitor logs
exports.getVisitorLogs = async (req, res) => {
  try {
    const query = `
      SELECT 
        v.id, v.visitor_name, v.visitor_phone, v.vehicle_number, v.vehicle_type,
        v.purpose, v.company, v.status, v.entry_time, v.exit_time, v.unit_id,
        u.number as unit_number, u.floor as unit_floor,
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
    res.status(500).json({ success: false, message: 'Server error fetching visitor logs' });
  }
};

// 2. Log a new visitor entry
exports.logVisitor = async (req, res) => {
  const { visitor_name, visitor_phone, vehicle_number, vehicle_type, unit_id, purpose, company } = req.body;
  const logged_by_id = req.user.id;

  if (!visitor_name || !unit_id) {
    return res.status(400).json({ success: false, message: 'Visitor name and visiting flat are required.' });
  }

  try {
    const query = `
      INSERT INTO visitor_logs 
      (visitor_name, visitor_phone, vehicle_number, vehicle_type, unit_id, purpose, company, status, logged_by_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ENTERED', ?)
    `;
    
    await db.execute(query, [
      visitor_name, 
      visitor_phone || '', 
      vehicle_number || '', 
      vehicle_type || 'NONE', 
      unit_id, 
      purpose || 'GUEST', 
      company || '', 
      logged_by_id
    ]);

    // Send notification bridge to Admin
    const [unitRow] = await db.execute('SELECT number FROM units WHERE id = ?', [unit_id]);
    const flatNum = unitRow[0]?.number || 'Flat';
    const tagInfo = company ? `${company} Delivery` : purpose;

    createNotification({
      title: `Gate Entry • Flat ${flatNum}`,
      message: `${visitor_name} (${tagInfo}) entered the premises.`,
      target_role: 'ADMIN',
      type: 'GATE'
    });

    res.json({ success: true, message: 'Visitor entry logged successfully' });
  } catch (error) {
    console.error('Error logging visitor:', error);
    res.status(500).json({ success: false, message: 'Server error logging visitor' });
  }
};

// 3. Edit / Update an existing visitor entry
exports.updateVisitor = async (req, res) => {
  const { id } = req.params;
  const { visitor_name, visitor_phone, vehicle_number, vehicle_type, unit_id, purpose, company } = req.body;

  try {
    const query = `
      UPDATE visitor_logs 
      SET 
        visitor_name = IFNULL(?, visitor_name),
        visitor_phone = IFNULL(?, visitor_phone),
        vehicle_number = IFNULL(?, vehicle_number),
        vehicle_type = IFNULL(?, vehicle_type),
        unit_id = IFNULL(?, unit_id),
        purpose = IFNULL(?, purpose),
        company = IFNULL(?, company)
      WHERE id = ?
    `;
    
    await db.execute(query, [
      visitor_name || null,
      visitor_phone !== undefined ? visitor_phone : null,
      vehicle_number !== undefined ? vehicle_number : null,
      vehicle_type || null,
      unit_id || null,
      purpose || null,
      company !== undefined ? company : null,
      id
    ]);

    res.json({ success: true, message: 'Visitor entry updated successfully' });
  } catch (error) {
    console.error('Error updating visitor:', error);
    res.status(500).json({ success: false, message: 'Server error updating visitor' });
  }
};

// 4. Mark visitor as checked out
exports.checkoutVisitor = async (req, res) => {
  const { id } = req.params;

  try {
    const [visitor] = await db.execute('SELECT visitor_name, unit_id FROM visitor_logs WHERE id = ?', [id]);

    await db.execute(`
      UPDATE visitor_logs 
      SET status = 'EXITED', exit_time = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [id]);

    if (visitor.length > 0) {
      createNotification({
        title: 'Gate Exit',
        message: `${visitor[0].visitor_name} has checked out and exited the building.`,
        target_role: 'ADMIN',
        type: 'GATE'
      });
    }

    res.json({ success: true, message: 'Visitor marked as checked out' });
  } catch (error) {
    console.error('Error checking out visitor:', error);
    res.status(500).json({ success: false, message: 'Server error checking out visitor' });
  }
};

// 5. Delete a visitor entry
exports.deleteVisitor = async (req, res) => {
  const { id } = req.params;

  try {
    await db.execute('DELETE FROM visitor_logs WHERE id = ?', [id]);
    res.json({ success: true, message: 'Visitor entry deleted' });
  } catch (error) {
    console.error('Error deleting visitor log:', error);
    res.status(500).json({ success: false, message: 'Server error deleting visitor log' });
  }
};
