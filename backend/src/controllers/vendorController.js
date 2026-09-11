const db = require('../config/db');
const { recordAudit } = require('../services/audit');
const { createNotification } = require('./notificationController');

/**
 * The people the building pays, and the contracts it is bound by.
 *
 * A lift AMC that lapses without anyone noticing is the failure this exists to
 * prevent, so a contract is not a note on a vendor: it carries the day it ends
 * and how much warning the committee wants before that day arrives.
 */

/** 1. The registry, each vendor with what has been spent and what is running. */
exports.getVendors = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT v.*,
              COALESCE(SUM(e.amount), 0) AS spent_total,
              COUNT(DISTINCT c.id) AS live_contracts
       FROM vendors v
       LEFT JOIN expenses e ON e.vendor_id = v.id
       LEFT JOIN vendor_contracts c ON c.vendor_id = v.id AND c.is_active = 1 AND c.end_date >= CURDATE()
       GROUP BY v.id
       ORDER BY v.is_active DESC, v.name ASC`
    );

    res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        spent_total: Number(row.spent_total),
        live_contracts: Number(row.live_contracts)
      }))
    });
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ success: false, message: 'Server error fetching vendors' });
  }
};

exports.createVendor = async (req, res) => {
  const { name, service, contact_person: contact, phone, email, note } = req.body;

  try {
    const [result] = await db.execute(
      'INSERT INTO vendors (name, service, contact_person, phone, email, note) VALUES (?, ?, ?, ?, ?, ?)',
      [String(name).trim(), String(service).trim(), contact || null, phone || null, email || null, note || null]
    );

    await recordAudit(req, {
      action: 'ADD_VENDOR',
      entity: 'vendors',
      entity_id: result.insertId,
      summary: `Added ${name} to the vendor registry for ${service}`,
      after: { name, service, phone: phone || null }
    });

    res.json({ success: true, message: `${name} added to the registry.`, data: { id: result.insertId } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'A vendor by that name is already on the registry.' });
    }

    console.error('Error adding vendor:', error);
    res.status(500).json({ success: false, message: 'Server error adding that vendor' });
  }
};

exports.updateVendor = async (req, res) => {
  const { id } = req.params;
  const { name, service, contact_person: contact, phone, email, note, is_active: isActive } = req.body;

  try {
    const [existing] = await db.execute('SELECT * FROM vendors WHERE id = ?', [id]);

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'No such vendor.' });
    }

    await db.execute(
      `UPDATE vendors
       SET name = IFNULL(?, name), service = IFNULL(?, service),
           contact_person = IFNULL(?, contact_person), phone = IFNULL(?, phone),
           email = IFNULL(?, email), note = IFNULL(?, note),
           is_active = IFNULL(?, is_active)
       WHERE id = ?`,
      [
        name || null, service || null, contact === undefined ? null : contact,
        phone === undefined ? null : phone, email === undefined ? null : email,
        note === undefined ? null : note,
        isActive === undefined ? null : (isActive ? 1 : 0),
        id
      ]
    );

    await recordAudit(req, {
      action: 'EDIT_VENDOR',
      entity: 'vendors',
      entity_id: id,
      summary: `Edited the vendor record for ${existing[0].name}`,
      before: existing[0],
      after: req.body
    });

    res.json({ success: true, message: 'Vendor updated.' });
  } catch (error) {
    console.error('Error updating vendor:', error);
    res.status(500).json({ success: false, message: 'Server error updating that vendor' });
  }
};

// Days left is computed by MySQL rather than in Node, so a machine in another
// timezone cannot make a contract look a day longer than it is.
const CONTRACT_SELECT = `
  SELECT c.*, v.name AS vendor_name, v.service, v.phone,
         DATEDIFF(c.end_date, CURDATE()) AS days_remaining
  FROM vendor_contracts c
  JOIN vendors v ON c.vendor_id = v.id
`;

const decorateContract = (row) => ({
  ...row,
  amount: Number(row.amount),
  days_remaining: Number(row.days_remaining),
  has_expired: Number(row.days_remaining) < 0,
  // Inside its own reminder window, which each contract sets for itself: a lift
  // needs longer notice than a pest control visit.
  needs_renewal:
    Number(row.days_remaining) >= 0 &&
    Number(row.days_remaining) <= Number(row.remind_days_before)
});

/** 2. Contracts, newest expiry first, so what is about to lapse is at the top. */
exports.getContracts = async (req, res) => {
  const onlyLive = req.query.live === 'true';

  try {
    const [rows] = await db.query(
      `${CONTRACT_SELECT}
       ${onlyLive ? 'WHERE c.is_active = 1 AND c.end_date >= CURDATE()' : ''}
       ORDER BY c.end_date ASC`
    );

    res.json({ success: true, data: rows.map(decorateContract) });
  } catch (error) {
    console.error('Error fetching contracts:', error);
    res.status(500).json({ success: false, message: 'Server error fetching contracts' });
  }
};

/**
 * 3. What is about to lapse. The admin dashboard reads this, and raising a
 * notification here means the committee hears about a lift AMC in the bell
 * rather than from the lift.
 */
exports.getExpiringContracts = async (req, res) => {
  try {
    const [rows] = await db.query(
      `${CONTRACT_SELECT}
       WHERE c.is_active = 1
         AND DATEDIFF(c.end_date, CURDATE()) <= c.remind_days_before
       ORDER BY c.end_date ASC`
    );

    res.json({ success: true, data: rows.map(decorateContract) });
  } catch (error) {
    console.error('Error fetching expiring contracts:', error);
    res.status(500).json({ success: false, message: 'Server error reading renewals' });
  }
};

exports.createContract = async (req, res) => {
  const {
    vendor_id: vendorId, title, start_date: startDate, end_date: endDate,
    amount, remind_days_before: remindDays, note
  } = req.body;

  if (endDate < startDate) {
    return res.status(400).json({ success: false, message: 'A contract cannot end before it starts.' });
  }

  try {
    const [vendors] = await db.execute('SELECT name FROM vendors WHERE id = ?', [vendorId]);

    if (vendors.length === 0) {
      return res.status(404).json({ success: false, message: 'That vendor is not on the registry.' });
    }

    const [result] = await db.execute(
      `INSERT INTO vendor_contracts
        (vendor_id, title, start_date, end_date, amount, remind_days_before, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [vendorId, String(title).trim(), startDate, endDate, Number(amount || 0), Number(remindDays) || 30, note || null]
    );

    await recordAudit(req, {
      action: 'ADD_CONTRACT',
      entity: 'vendor_contracts',
      entity_id: result.insertId,
      summary: `Recorded the ${title} contract with ${vendors[0].name}, ending ${endDate}`,
      after: { vendor: vendors[0].name, title, start_date: startDate, end_date: endDate, amount: Number(amount || 0) }
    });

    createNotification({
      title: 'Contract recorded',
      message: `${vendors[0].name}: ${title} runs to ${endDate}.`,
      target_role: 'ADMIN',
      type: 'FINANCE'
    });

    res.json({ success: true, message: 'Contract recorded.', data: { id: result.insertId } });
  } catch (error) {
    console.error('Error recording contract:', error);
    res.status(500).json({ success: false, message: 'Server error recording that contract' });
  }
};

/** 4. Renewing is recording the next term, not editing away the last one. */
exports.updateContract = async (req, res) => {
  const { id } = req.params;
  const { end_date: endDate, amount, remind_days_before: remindDays, note, is_active: isActive } = req.body;

  try {
    const [existing] = await db.execute('SELECT * FROM vendor_contracts WHERE id = ?', [id]);

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'No such contract.' });
    }

    await db.execute(
      `UPDATE vendor_contracts
       SET end_date = IFNULL(?, end_date), amount = IFNULL(?, amount),
           remind_days_before = IFNULL(?, remind_days_before),
           note = IFNULL(?, note), is_active = IFNULL(?, is_active)
       WHERE id = ?`,
      [
        endDate || null,
        amount === undefined ? null : Number(amount),
        remindDays === undefined ? null : Number(remindDays),
        note === undefined ? null : note,
        isActive === undefined ? null : (isActive ? 1 : 0),
        id
      ]
    );

    await recordAudit(req, {
      action: 'EDIT_CONTRACT',
      entity: 'vendor_contracts',
      entity_id: id,
      summary: `Edited the ${existing[0].title} contract`,
      before: existing[0],
      after: req.body
    });

    res.json({ success: true, message: 'Contract updated.' });
  } catch (error) {
    console.error('Error updating contract:', error);
    res.status(500).json({ success: false, message: 'Server error updating that contract' });
  }
};
