const db = require('../config/db');

exports.getTickets = async (req, res) => {
  try {
    const query = `
      SELECT 
        t.id, t.title, t.description, t.category, t.priority, t.status, t.created_at,
        u.number as unit_number,
        usr.name as reported_by
      FROM maintenance_tickets t
      JOIN units u ON t.unit_id = u.id
      JOIN users usr ON t.created_by_id = usr.id
      ORDER BY t.created_at DESC
    `;
    
    const [rows] = await db.execute(query);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ success: false, message: 'Server error fetching tickets' });
  }
};

exports.updateTicketStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const query = `
      UPDATE maintenance_tickets 
      SET status = ?, resolved_at = IF(? = 'RESOLVED', CURRENT_TIMESTAMP, NULL)
      WHERE id = ?
    `;
    
    await db.execute(query, [status, status, id]);
    res.json({ success: true, message: 'Ticket updated successfully' });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ success: false, message: 'Server error updating ticket' });
  }
};

exports.createTicket = async (req, res) => {
  const { unit_id, title, description, category, priority } = req.body;
  const created_by_id = req.user.id; // From auth middleware

  try {
    const query = `
      INSERT INTO maintenance_tickets 
      (unit_id, created_by_id, title, description, category, priority) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    await db.execute(query, [unit_id, created_by_id, title, description, category, priority || 'MEDIUM']);
    res.json({ success: true, message: 'Ticket created successfully' });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ success: false, message: 'Server error creating ticket' });
  }
};
