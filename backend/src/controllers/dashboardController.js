const db = require('../config/db');

exports.getDashboardStats = async (req, res) => {
  try {
    // 1. Occupancy Stats
    const [unitCounts] = await db.execute(`
      SELECT 
        COUNT(*) as total_units,
        SUM(CASE WHEN is_occupied = 1 THEN 1 ELSE 0 END) as occupied_units,
        SUM(CASE WHEN is_occupied = 0 THEN 1 ELSE 0 END) as vacant_units,
        SUM(CASE WHEN type = 'OWNER' AND is_occupied = 1 THEN 1 ELSE 0 END) as owner_occupied,
        SUM(CASE WHEN type = 'TENANT' AND is_occupied = 1 THEN 1 ELSE 0 END) as tenant_occupied
      FROM units
    `);

    // 2. Visitor Stats
    const [visitorCounts] = await db.execute(`
      SELECT 
        COUNT(*) as total_today,
        SUM(CASE WHEN status = 'ENTERED' THEN 1 ELSE 0 END) as currently_inside
      FROM visitor_logs
      WHERE DATE(entry_time) = CURRENT_DATE()
    `);

    // 3. Ticket Stats
    const [ticketCounts] = await db.execute(`
      SELECT 
        COUNT(*) as total_tickets,
        SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as open_tickets,
        SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress_tickets,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved_tickets,
        SUM(CASE WHEN status != 'RESOLVED' AND priority IN ('HIGH', 'URGENT') THEN 1 ELSE 0 END) as critical_tickets
      FROM maintenance_tickets
    `);

    // 4. Recent Active Visitors Inside
    const [activeVisitors] = await db.execute(`
      SELECT 
        v.id, v.visitor_name, v.visitor_phone, v.purpose, v.entry_time,
        u.number as unit_number
      FROM visitor_logs v
      JOIN units u ON v.unit_id = u.id
      WHERE v.status = 'ENTERED'
      ORDER BY v.entry_time DESC
      LIMIT 4
    `);

    // 5. Recent Open Maintenance Tickets
    const [recentTickets] = await db.execute(`
      SELECT 
        t.id, t.title, t.priority, t.status, t.created_at, t.category,
        u.number as unit_number,
        usr.name as reported_by
      FROM maintenance_tickets t
      JOIN units u ON t.unit_id = u.id
      JOIN users usr ON t.created_by_id = usr.id
      WHERE t.status != 'RESOLVED'
      ORDER BY 
        CASE WHEN t.priority = 'URGENT' THEN 1 WHEN t.priority = 'HIGH' THEN 2 ELSE 3 END,
        t.created_at ASC
      LIMIT 4
    `);

    const occupancy = unitCounts[0] || { total_units: 0, occupied_units: 0, vacant_units: 0, owner_occupied: 0, tenant_occupied: 0 };
    const visitors = visitorCounts[0] || { total_today: 0, currently_inside: 0 };
    const tickets = ticketCounts[0] || { total_tickets: 0, open_tickets: 0, in_progress_tickets: 0, resolved_tickets: 0, critical_tickets: 0 };

    const occupancyRate = occupancy.total_units > 0 
      ? Math.round((occupancy.occupied_units / occupancy.total_units) * 100) 
      : 0;

    res.json({
      success: true,
      data: {
        occupancy: {
          ...occupancy,
          occupancy_rate: occupancyRate
        },
        visitors: {
          total_today: visitors.total_today || 0,
          currently_inside: visitors.currently_inside || 0,
          active_list: activeVisitors
        },
        tickets: {
          ...tickets,
          recent_list: recentTickets
        }
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Server error loading dashboard stats' });
  }
};
