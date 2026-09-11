const db = require('../config/db');
const { createNotification } = require('./notificationController');
const { isAdminRole } = require('../middleware/auth');

/**
 * Notices replace the community banner that was hardcoded into the admin
 * dashboard. A notice has a window: it starts on a day, optionally ends, and
 * readers can confirm they have seen it.
 */

const audienceFor = (role) => (isAdminRole(role) ? null : role);

/** 1. Notices currently showing for the caller's role. */
exports.getActiveNotices = async (req, res) => {
  try {
    const audience = audienceFor(req.user.role);

    // Admins see everything live; everyone else sees ALL plus their own audience.
    const [rows] = await db.execute(
      `SELECT n.id, n.title, n.body, n.category, n.audience, n.starts_on, n.ends_on,
              n.created_at, usr.name AS posted_by,
              ack.id IS NOT NULL AS acknowledged
       FROM notices n
       JOIN users usr ON n.posted_by_id = usr.id
       LEFT JOIN notice_acknowledgements ack ON ack.notice_id = n.id AND ack.user_id = ?
       WHERE n.is_published = 1
         AND n.starts_on <= CURRENT_DATE()
         AND (n.ends_on IS NULL OR n.ends_on >= CURRENT_DATE())
         AND (? IS NULL OR n.audience = 'ALL' OR n.audience = ?)
       ORDER BY FIELD(n.category, 'URGENT', 'UTILITY', 'MAINTENANCE', 'EVENT', 'GENERAL'), n.starts_on DESC`,
      [req.user.id, audience, audience]
    );

    res.json({
      success: true,
      data: rows.map((row) => ({ ...row, acknowledged: Boolean(row.acknowledged) }))
    });
  } catch (error) {
    console.error('Error fetching notices:', error);
    res.status(500).json({ success: false, message: 'Server error fetching notices' });
  }
};

/** 2. Every notice including drafts and expired ones, for the admin. */
exports.getAllNotices = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT n.id, n.title, n.body, n.category, n.audience, n.starts_on, n.ends_on,
              n.is_published, n.created_at, usr.name AS posted_by,
              COUNT(ack.id) AS acknowledgement_count
       FROM notices n
       JOIN users usr ON n.posted_by_id = usr.id
       LEFT JOIN notice_acknowledgements ack ON ack.notice_id = n.id
       GROUP BY n.id
       ORDER BY n.starts_on DESC, n.id DESC`
    );

    // How many people each notice is actually addressed to, so a count of
    // acknowledgements means something.
    const [[audienceCounts]] = await db.query(
      `SELECT
         SUM(CASE WHEN role = 'RESIDENT' THEN 1 ELSE 0 END) AS residents,
         SUM(CASE WHEN role = 'SECURITY' THEN 1 ELSE 0 END) AS security,
         COUNT(*) AS everyone
       FROM users`
    );

    const reach = (audience) => {
      if (audience === 'RESIDENT') return Number(audienceCounts.residents);
      if (audience === 'SECURITY') return Number(audienceCounts.security);
      return Number(audienceCounts.everyone);
    };

    res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        acknowledgement_count: Number(row.acknowledgement_count),
        audience_size: reach(row.audience)
      }))
    });
  } catch (error) {
    console.error('Error fetching all notices:', error);
    res.status(500).json({ success: false, message: 'Server error fetching notices' });
  }
};

/** 3. Post a notice. */
exports.createNotice = async (req, res) => {
  const { title, body, category, audience, starts_on: startsOn, ends_on: endsOn } = req.body;

  if (!String(title || '').trim() || !String(body || '').trim()) {
    return res.status(400).json({ success: false, message: 'A notice needs a title and a body.' });
  }

  const start = startsOn || new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return res.status(400).json({ success: false, message: 'Start date must be YYYY-MM-DD.' });
  }

  if (endsOn && endsOn < start) {
    return res.status(400).json({ success: false, message: 'A notice cannot end before it starts.' });
  }

  try {
    await db.execute(
      `INSERT INTO notices (title, body, category, audience, starts_on, ends_on, posted_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        String(title).trim(),
        String(body).trim(),
        category || 'GENERAL',
        audience || 'ALL',
        start,
        endsOn || null,
        req.user.id
      ]
    );

    // Only notify once the notice is actually live; a future-dated one waits.
    if (start <= new Date().toISOString().slice(0, 10)) {
      createNotification({
        title: `Notice: ${String(title).trim()}`,
        message: String(body).trim().slice(0, 180),
        target_role: audience || 'ALL',
        type: category === 'URGENT' ? 'ALERT' : 'INFO'
      });
    }

    res.json({ success: true, message: 'Notice posted.' });
  } catch (error) {
    console.error('Error creating notice:', error);
    res.status(500).json({ success: false, message: 'Server error posting notice' });
  }
};

/** 4. Edit a notice, or take it down by unpublishing it. */
exports.updateNotice = async (req, res) => {
  const { id } = req.params;
  const { title, body, category, audience, starts_on: startsOn, ends_on: endsOn, is_published: isPublished } = req.body;

  try {
    const [result] = await db.execute(
      `UPDATE notices
       SET title = IFNULL(?, title), body = IFNULL(?, body),
           category = IFNULL(?, category), audience = IFNULL(?, audience),
           starts_on = IFNULL(?, starts_on), ends_on = ?,
           is_published = IFNULL(?, is_published)
       WHERE id = ?`,
      [
        title ? String(title).trim() : null,
        body ? String(body).trim() : null,
        category || null,
        audience || null,
        startsOn || null,
        endsOn !== undefined ? endsOn || null : null,
        isPublished === undefined ? null : (isPublished ? 1 : 0),
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Notice not found.' });
    }

    res.json({ success: true, message: 'Notice updated.' });
  } catch (error) {
    console.error('Error updating notice:', error);
    res.status(500).json({ success: false, message: 'Server error updating notice' });
  }
};

/** 5. Delete a notice outright. */
exports.deleteNotice = async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM notices WHERE id = ?', [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Notice not found.' });
    }

    res.json({ success: true, message: 'Notice removed.' });
  } catch (error) {
    console.error('Error deleting notice:', error);
    res.status(500).json({ success: false, message: 'Server error deleting notice' });
  }
};

/** 6. Confirm you have read it. Idempotent, so tapping twice is harmless. */
exports.acknowledgeNotice = async (req, res) => {
  try {
    await db.execute(
      'INSERT IGNORE INTO notice_acknowledgements (notice_id, user_id) VALUES (?, ?)',
      [req.params.id, req.user.id]
    );

    res.json({ success: true, message: 'Marked as read.' });
  } catch (error) {
    console.error('Error acknowledging notice:', error);
    res.status(500).json({ success: false, message: 'Server error acknowledging notice' });
  }
};
