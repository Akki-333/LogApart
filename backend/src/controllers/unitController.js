const crypto = require('crypto');
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { outstandingForUnit } = require('./billingController');
const { recordAudit } = require('../services/audit');

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
      homeList: rows
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

    const [unitCheck] = await connection.execute('SELECT id, number FROM units WHERE id = ?', [unit_id]);
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

    await recordAudit(req, {
      action: 'ONBOARD_RESIDENT',
      entity: 'units',
      entity_id: unit_id,
      summary: `Onboarded ${name} into home ${unitCheck[0].number}`,
      after: { user_id: userId, name, email, phone: phone || '', type: type || 'TENANT', move_in_date: moveDate }
    }, connection);

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

    await recordAudit(req, {
      action: 'EDIT_RESIDENT',
      entity: 'units',
      entity_id: unit_id,
      summary: `Edited the resident record on home ${unit_id}`,
      after: { name, phone, emergency_contact, type, area }
    });

    res.json({ success: true, message: 'Resident details updated successfully.' });
  } catch (error) {
    console.error('Error updating resident:', error);
    res.status(500).json({ success: false, message: 'Server error updating resident.' });
  }
};

// 4. Vacate unit, check dues, and issue a stored NOC.
//
// The clearance certificate used to assert zero dues as fixed text. It now
// refuses to issue while a balance is open, unless an admin records an explicit
// waiver and a reason, which is kept on the certificate.
exports.vacateUnit = async (req, res) => {
  const { unit_id: unitId, move_out_date: moveOutDate, waive_dues: waiveDues, waiver_reason: waiverReason } = req.body;

  if (!unitId) {
    return res.status(400).json({ success: false, message: 'Unit ID is required.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [unitRows] = await connection.execute('SELECT id, number FROM units WHERE id = ?', [unitId]);

    if (unitRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Unit not found' });
    }

    const [residentRows] = await connection.execute(
      `SELECT r.id AS resident_id, usr.id AS user_id, usr.name
       FROM residents r
       JOIN users usr ON r.user_id = usr.id
       WHERE r.unit_id = ? AND r.is_active = true`,
      [unitId]
    );

    if (residentRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'That home has no active resident to move out.' });
    }

    const resident = residentRows[0];
    const dues = await outstandingForUnit(unitId, connection);

    if (dues.balance > 0 && !waiveDues) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        code: 'OUTSTANDING_DUES',
        message: `Home ${unitRows[0].number} has ${dues.balance} outstanding across ${dues.open_invoices} invoice(s). Settle the dues or record a waiver.`,
        data: dues
      });
    }

    if (dues.balance > 0 && waiveDues && !String(waiverReason || '').trim()) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'A dues waiver needs a written reason.' });
    }

    const outDate = moveOutDate || new Date().toISOString().slice(0, 10);

    await connection.execute(
      'UPDATE residents SET is_active = false, move_out_date = ? WHERE unit_id = ? AND is_active = true',
      [outDate, unitId]
    );

    await connection.execute('UPDATE units SET is_occupied = false WHERE id = ?', [unitId]);

    // Certificate numbers run per calendar year: NOC-2026-0001.
    const year = new Date(outDate).getFullYear();
    const [[counted]] = await connection.execute(
      'SELECT COUNT(*) AS issued FROM noc_certificates WHERE YEAR(move_out_date) = ?',
      [year]
    );
    const certificateNumber = `NOC-${year}-${String(Number(counted.issued) + 1).padStart(4, '0')}`;

    await connection.execute(
      `INSERT INTO noc_certificates
        (certificate_number, unit_id, unit_number, resident_user_id, resident_name,
         move_out_date, outstanding_at_issue, dues_waived, waiver_reason, issued_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        certificateNumber,
        unitId,
        unitRows[0].number,
        resident.user_id,
        resident.name,
        outDate,
        dues.balance,
        dues.balance > 0 ? 1 : 0,
        dues.balance > 0 ? String(waiverReason).trim() : null,
        req.user.id
      ]
    );

    // Their token is good for another day and still says RESIDENT. Bumping the
    // version ends it now, and an account with no other home is closed outright
    // rather than left signed in to a building they have left.
    const [otherHomes] = await connection.execute(
      'SELECT COUNT(*) AS live FROM residents WHERE user_id = ? AND is_active = true',
      [resident.user_id]
    );

    const stillLivesHere = Number(otherHomes[0].live) > 0;

    await connection.execute(
      'UPDATE users SET token_version = token_version + 1, is_active = ? WHERE id = ?',
      [stillLivesHere ? 1 : 0, resident.user_id]
    );

    await recordAudit(req, {
      action: 'VACATE_UNIT',
      entity: 'units',
      entity_id: unitId,
      summary: dues.balance > 0
        ? `Moved ${resident.name} out of home ${unitRows[0].number} with ${dues.balance} waived: ${String(waiverReason).trim()}`
        : `Moved ${resident.name} out of home ${unitRows[0].number}, dues clear`,
      before: { resident_user_id: resident.user_id, outstanding: dues },
      after: {
        certificate_number: certificateNumber,
        move_out_date: outDate,
        dues_waived: dues.balance > 0,
        waiver_reason: dues.balance > 0 ? String(waiverReason).trim() : null,
        account_closed: !stillLivesHere
      }
    }, connection);

    await connection.commit();

    res.json({
      success: true,
      message: 'Unit vacated and clearance certificate issued.',
      data: {
        certificate_number: certificateNumber,
        unit_number: unitRows[0].number,
        resident_name: resident.name,
        move_out_date: outDate,
        outstanding_at_issue: dues.balance,
        dues_waived: dues.balance > 0,
        waiver_reason: dues.balance > 0 ? String(waiverReason).trim() : null
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error vacating unit:', error);
    res.status(500).json({ success: false, message: 'Server error vacating unit.' });
  } finally {
    connection.release();
  }
};

// 5. Outstanding dues for one home, used by the move-out screen before it asks
// the admin to confirm.
exports.getUnitDues = async (req, res) => {
  try {
    const dues = await outstandingForUnit(req.params.unit_id);
    res.json({ success: true, data: dues });
  } catch (error) {
    console.error('Error fetching unit dues:', error);
    res.status(500).json({ success: false, message: 'Server error fetching unit dues.' });
  }
};

// 6. Re-issue a one-time password for the home's resident.
//
// Onboarding was the only thing that ever issued a password, so a resident who
// forgot theirs was locked out for good. This is the recovery path, and it runs
// through an admin rather than an inbox because the building has no mail server.
exports.reissuePassword = async (req, res) => {
  const { unit_id: unitId } = req.params;
  const reason = String(req.body?.reason || '').trim();

  if (reason.length < 4) {
    return res.status(400).json({
      success: false,
      message: 'Record why this password is being re-issued.'
    });
  }

  try {
    const [rows] = await db.execute(
      `SELECT usr.id, usr.name, usr.email, u.number AS unit_number
       FROM residents r
       JOIN users usr ON r.user_id = usr.id
       JOIN units u ON r.unit_id = u.id
       WHERE r.unit_id = ? AND r.is_active = true`,
      [unitId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'That home has no active resident.' });
    }

    const person = rows[0];
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // Bumping the version matters here: if the account was taken over, the
    // person holding it is signed out the moment the password is replaced.
    await db.execute(
      `UPDATE users
       SET password = ?, must_change_password = 1, is_active = 1, token_version = token_version + 1
       WHERE id = ?`,
      [passwordHash, person.id]
    );

    await recordAudit(req, {
      action: 'REISSUE_PASSWORD',
      entity: 'users',
      entity_id: person.id,
      summary: `Re-issued the password for ${person.name} of home ${person.unit_number}: ${reason}`,
      after: { forced_change: true, sessions_ended: true }
    });

    res.json({
      success: true,
      message: `A one-time password was issued for ${person.name}. They must replace it at first sign-in.`,
      data: {
        resident_name: person.name,
        email: person.email,
        unit_number: person.unit_number,
        // Shown to the admin once so they can pass it on. Never stored in plain text.
        temp_password: tempPassword
      }
    });
  } catch (error) {
    console.error('Error re-issuing password:', error);
    res.status(500).json({ success: false, message: 'Server error re-issuing that password.' });
  }
};
