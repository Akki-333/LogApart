const crypto = require('crypto');
const db = require('../config/db');
const bcrypt = require('bcryptjs');

// One-time password handed to a newly onboarded resident. They are forced to
// replace it at first login, so it never becomes a shared building password.
const generateTempPassword = () => crypto.randomBytes(6).toString('base64url');

// 1. Get all units with resident details
exports.getUnits = async (req, res) => {
  try {
    const query = `
      SELECT 
        u.id as unit_id, u.number, u.floor, u.block_name, u.type, u.area, u.is_occupied,
        r.id as resident_id, r.move_in_date, r.emergency_contact, r.is_active,
        usr.id as user_id, usr.name as resident_name, usr.email as resident_email, usr.phone as resident_phone
      FROM units u
      LEFT JOIN residents r ON u.id = r.unit_id AND r.is_active = true
      LEFT JOIN users usr ON r.user_id = usr.id
      ORDER BY u.floor ASC, u.number ASC
    `;
    
    const [rows] = await db.execute(query);
    
    // Group into building hierarchy
    const buildingMap = {};
    
    rows.forEach(row => {
      const blockName = row.block_name || '';
      const floor = row.floor;
      
      if (!buildingMap[blockName]) {
        buildingMap[blockName] = { block: blockName, floors: {} };
      }
      
      if (!buildingMap[blockName].floors[floor]) {
        buildingMap[blockName].floors[floor] = [];
      }
      
      buildingMap[blockName].floors[floor].push({
        ...row,
        floor
      });
    });

    res.json({ 
      success: true, 
      data: buildingMap,
      flatList: rows
    });
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({ success: false, message: 'Server error fetching units' });
  }
};

// 2. Assign / Onboard a resident into a unit
exports.assignResident = async (req, res) => {
  const { unit_id, name, email, phone, type, move_in_date, emergency_contact, area } = req.body;

  if (!unit_id || !name || !email) {
    return res.status(400).json({ success: false, message: 'Unit ID, Name, and Email are required.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [unitCheck] = await connection.execute('SELECT id FROM units WHERE id = ?', [unit_id]);
    if (unitCheck.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }

    // Reuse the user record if this person already has one, otherwise mint a
    // resident account with a one-time password.
    let userId;
    let tempPassword = null;

    const [userCheck] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);

    if (userCheck.length > 0) {
      userId = userCheck[0].id;
      await connection.execute('UPDATE users SET name = ?, phone = ? WHERE id = ?', [name, phone || '', userId]);
    } else {
      tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const [newUser] = await connection.execute(
        'INSERT INTO users (name, email, password, role, phone, must_change_password) VALUES (?, ?, ?, ?, ?, 1)',
        [name, email, passwordHash, 'RESIDENT', phone || '']
      );
      userId = newUser.insertId;
    }

    await connection.execute('UPDATE residents SET is_active = false WHERE unit_id = ?', [unit_id]);

    const moveDate = move_in_date ? new Date(move_in_date) : new Date();
    await connection.execute(
      'INSERT INTO residents (user_id, unit_id, move_in_date, emergency_contact, is_active) VALUES (?, ?, ?, ?, true)',
      [userId, unit_id, moveDate, emergency_contact || '']
    );

    await connection.execute(
      'UPDATE units SET is_occupied = true, type = ?, area = IFNULL(?, area) WHERE id = ?',
      [type || 'TENANT', area || null, unit_id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Resident successfully assigned to unit.',
      // Shown to the admin once so they can pass it on. Never stored in plain text.
      temp_password: tempPassword
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error assigning resident:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'That email is already registered.' });
    }

    res.status(500).json({ success: false, message: 'Server error assigning resident.' });
  } finally {
    connection.release();
  }
};

// 3. Edit resident contact info
exports.updateResident = async (req, res) => {
  const { unit_id } = req.params;
  const { name, phone, emergency_contact, type, area } = req.body;

  try {
    // Update Unit info
    if (type || area) {
      await db.execute(
        'UPDATE units SET type = IFNULL(?, type), area = IFNULL(?, area) WHERE id = ?',
        [type || null, area || null, unit_id]
      );
    }

    // Find active resident for this unit
    const [activeRes] = await db.execute(
      'SELECT id, user_id FROM residents WHERE unit_id = ? AND is_active = true',
      [unit_id]
    );

    if (activeRes.length > 0) {
      const { id: residentId, user_id: userId } = activeRes[0];

      if (emergency_contact !== undefined) {
        await db.execute('UPDATE residents SET emergency_contact = ? WHERE id = ?', [emergency_contact, residentId]);
      }

      if (name || phone !== undefined) {
        await db.execute('UPDATE users SET name = IFNULL(?, name), phone = IFNULL(?, phone) WHERE id = ?', [name || null, phone || null, userId]);
      }
    }

    res.json({ success: true, message: 'Resident details updated successfully.' });
  } catch (error) {
    console.error('Error updating resident:', error);
    res.status(500).json({ success: false, message: 'Server error updating resident.' });
  }
};

// 4. Vacate unit & generate NOC data
exports.vacateUnit = async (req, res) => {
  const { unit_id, move_out_date } = req.body;

  if (!unit_id) {
    return res.status(400).json({ success: false, message: 'Unit ID is required.' });
  }

  try {
    const outDate = move_out_date ? new Date(move_out_date) : new Date();

    // Mark active resident inactive with move out date
    await db.execute(
      'UPDATE residents SET is_active = false, move_out_date = ? WHERE unit_id = ? AND is_active = true',
      [outDate, unit_id]
    );

    // Mark unit as vacant
    await db.execute('UPDATE units SET is_occupied = false WHERE id = ?', [unit_id]);

    res.json({ success: true, message: 'Unit vacated successfully and marked vacant.' });
  } catch (error) {
    console.error('Error vacating unit:', error);
    res.status(500).json({ success: false, message: 'Server error vacating unit.' });
  }
};
