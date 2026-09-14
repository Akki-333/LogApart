const db = require('../config/db');

/**
 * Building staff and their attendance. Kept apart from users because a cleaner
 * or plumber belongs on the payroll without ever needing a login.
 *
 * Pay is computed from attendance rather than stored: a half day counts as
 * half, leave counts as a full day, and absence counts as none.
 */

const DAY_WEIGHT = { PRESENT: 1, HALF_DAY: 0.5, LEAVE: 1, ABSENT: 0 };

const daysInMonth = (period) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month, 0).getDate();
};

const validPeriod = (period) => /^\d{4}-\d{2}$/.test(String(period || ''));

/**
 * The roster for a month, with attendance rolled up and pay worked out.
 * Shared by the staff screen and the pay export, so the two cannot disagree.
 */
async function payrollFor(period) {
  const [rows] = await db.execute(
    `SELECT s.id, s.name, s.phone, s.role_title, s.monthly_salary, s.joined_on,
            s.is_active, s.user_id, usr.email AS login_email,
            SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) AS present_days,
            SUM(CASE WHEN a.status = 'HALF_DAY' THEN 1 ELSE 0 END) AS half_days,
            SUM(CASE WHEN a.status = 'LEAVE' THEN 1 ELSE 0 END) AS leave_days,
            SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent_days
     FROM staff s
     LEFT JOIN users usr ON s.user_id = usr.id
     LEFT JOIN staff_attendance a
       ON a.staff_id = s.id AND DATE_FORMAT(a.attendance_date, '%Y-%m') = ?
     GROUP BY s.id, usr.email
     ORDER BY s.is_active DESC, s.name ASC`,
    [period]
  );

  const totalDays = daysInMonth(period);

  return rows.map((row) => {
    const present = Number(row.present_days || 0);
    const half = Number(row.half_days || 0);
    const leave = Number(row.leave_days || 0);
    const absent = Number(row.absent_days || 0);
    const credited = present * DAY_WEIGHT.PRESENT + half * DAY_WEIGHT.HALF_DAY + leave * DAY_WEIGHT.LEAVE;
    const salary = Number(row.monthly_salary);

    return {
      ...row,
      monthly_salary: salary,
      present_days: present,
      half_days: half,
      leave_days: leave,
      absent_days: absent,
      marked_days: present + half + leave + absent,
      days_in_month: totalDays,
      credited_days: Number(credited.toFixed(1)),
      // Indicative only: the admin still decides what actually gets paid.
      payable: Number(((salary / totalDays) * credited).toFixed(2))
    };
  });
}

exports.payrollFor = payrollFor;

/** 1. The roster, with this month's attendance rolled up per person. */
exports.getStaff = async (req, res) => {
  const period = validPeriod(req.query.period) ? req.query.period : new Date().toISOString().slice(0, 7);

  try {
    res.json({ success: true, data: await payrollFor(period), period });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ success: false, message: 'Server error fetching staff' });
  }
};

/** 2. Add someone to the roster. */
exports.createStaff = async (req, res) => {
  const { name, phone, role_title: roleTitle, monthly_salary: salary, joined_on: joinedOn, user_id: userId } = req.body;

  if (!String(name || '').trim() || !String(roleTitle || '').trim()) {
    return res.status(400).json({ success: false, message: 'A name and a role are both required.' });
  }

  try {
    await db.execute(
      'INSERT INTO staff (name, phone, role_title, monthly_salary, joined_on, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [
        String(name).trim(),
        phone || null,
        String(roleTitle).trim(),
        Number(salary || 0),
        joinedOn || null,
        userId || null
      ]
    );

    res.json({ success: true, message: `${String(name).trim()} added to the roster.` });
  } catch (error) {
    console.error('Error creating staff:', error);
    res.status(500).json({ success: false, message: 'Server error adding staff' });
  }
};

/** 3. Update a staff record, including taking someone off the roster. */
exports.updateStaff = async (req, res) => {
  const { name, phone, role_title: roleTitle, monthly_salary: salary, joined_on: joinedOn, is_active: isActive } = req.body;

  try {
    const [result] = await db.execute(
      `UPDATE staff
       SET name = IFNULL(?, name), phone = ?, role_title = IFNULL(?, role_title),
           monthly_salary = IFNULL(?, monthly_salary), joined_on = IFNULL(?, joined_on),
           is_active = IFNULL(?, is_active)
       WHERE id = ?`,
      [
        name ? String(name).trim() : null,
        phone !== undefined ? phone : null,
        roleTitle ? String(roleTitle).trim() : null,
        salary === undefined ? null : Number(salary),
        joinedOn || null,
        isActive === undefined ? null : (isActive ? 1 : 0),
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Staff member not found.' });
    }

    res.json({ success: true, message: 'Staff record updated.' });
  } catch (error) {
    console.error('Error updating staff:', error);
    res.status(500).json({ success: false, message: 'Server error updating staff' });
  }
};

/**
 * 4. Mark attendance for one person on one day. Re-marking the same day
 * corrects it rather than adding a second row.
 */
exports.markAttendance = async (req, res) => {
  const { staff_id: staffId, attendance_date: date, status, note } = req.body;

  if (!staffId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ success: false, message: 'Pick a person and a date as YYYY-MM-DD.' });
  }

  if (!['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be PRESENT, ABSENT, HALF_DAY or LEAVE.' });
  }

  if (date > new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ success: false, message: 'Attendance cannot be marked for a future day.' });
  }

  try {
    await db.execute(
      `INSERT INTO staff_attendance (staff_id, attendance_date, status, note, marked_by_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note), marked_by_id = VALUES(marked_by_id)`,
      [staffId, date, status, note || null, req.user.id]
    );

    res.json({ success: true, message: 'Attendance recorded.' });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ success: false, message: 'Server error marking attendance' });
  }
};

/** 5. The attendance grid for a month. */
exports.getAttendance = async (req, res) => {
  const period = validPeriod(req.query.period) ? req.query.period : new Date().toISOString().slice(0, 7);

  try {
    const [rows] = await db.execute(
      `SELECT a.id, a.staff_id, a.attendance_date, a.status, a.note, usr.name AS marked_by
       FROM staff_attendance a
       JOIN users usr ON a.marked_by_id = usr.id
       WHERE DATE_FORMAT(a.attendance_date, '%Y-%m') = ?
       ORDER BY a.attendance_date DESC`,
      [period]
    );

    // Keyed by staff and day, which is how the grid reads it.
    const byStaff = {};
    for (const row of rows) {
      const day = String(row.attendance_date).slice(0, 10);
      byStaff[row.staff_id] = byStaff[row.staff_id] || {};
      byStaff[row.staff_id][day] = { status: row.status, note: row.note, marked_by: row.marked_by };
    }

    res.json({ success: true, data: { period, days_in_month: daysInMonth(period), by_staff: byStaff } });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ success: false, message: 'Server error fetching attendance' });
  }
};
