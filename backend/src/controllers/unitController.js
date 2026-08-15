const db = require('../config/db');

exports.getUnits = async (req, res) => {
  try {
    // We want all units, and IF they have a resident, we want the resident's info
    const query = `
      SELECT 
        u.id as unit_id, u.number, u.floor, u.block_name, u.type, u.area, u.is_occupied,
        r.id as resident_id, r.move_in_date, r.is_active,
        usr.name as resident_name, usr.email as resident_email, usr.phone as resident_phone
      FROM units u
      LEFT JOIN residents r ON u.id = r.unit_id AND r.is_active = true
      LEFT JOIN users usr ON r.user_id = usr.id
      ORDER BY u.block_name, u.floor, u.number
    `;
    
    const [rows] = await db.execute(query);
    
    // Transform flat SQL rows into a nested structure grouped by Block
    const buildingMap = {};
    
    rows.forEach(row => {
      const { block_name, floor, ...unitData } = row;
      
      if (!buildingMap[block_name]) {
        buildingMap[block_name] = { block: block_name, floors: {} };
      }
      
      if (!buildingMap[block_name].floors[floor]) {
        buildingMap[block_name].floors[floor] = [];
      }
      
      buildingMap[block_name].floors[floor].push({
        ...unitData,
        floor
      });
    });

    res.json({ success: true, data: buildingMap });
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
