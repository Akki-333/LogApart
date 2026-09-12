const db = require('../config/db');
const { recordAudit } = require('../services/audit');
const { createNotification } = require('./notificationController');
const { isAdminRole } = require('../middleware/auth');

/**
 * How the society decides things.
 *
 * One vote per home, not per person. A household is one stake in the building
 * whether two people live in it or five, and the unique key on the unit is what
 * enforces that rather than a check that a second family member could race.
 *
 * Results stay closed until the poll does. A running tally changes how people
 * vote, and a committee that publishes one has run a different exercise from
 * the one it announced.
 */

const activeUnitFor = async (userId) => {
  const [rows] = await db.execute(
    `SELECT u.id AS unit_id, u.number FROM residents r
     JOIN units u ON r.unit_id = u.id
     WHERE r.user_id = ? AND r.is_active = true LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
};

const tallyFor = async (pollId) => {
  const [rows] = await db.execute(
    `SELECT o.id, o.label, o.position, COUNT(v.id) AS votes
     FROM poll_options o
     LEFT JOIN poll_votes v ON v.option_id = o.id
     WHERE o.poll_id = ?
     GROUP BY o.id
     ORDER BY o.position ASC, o.id ASC`,
    [pollId]
  );

  const total = rows.reduce((sum, row) => sum + Number(row.votes), 0);

  return rows.map((row) => ({
    ...row,
    votes: Number(row.votes),
    share: total > 0 ? Math.round((Number(row.votes) / total) * 1000) / 10 : 0
  }));
};

/** 1. Polls a caller can see, with their own home's vote and the state of play. */
exports.getPolls = async (req, res) => {
  const admin = isAdminRole(req.user.role);

  try {
    const unit = admin ? null : await activeUnitFor(req.user.id);

    const [polls] = await db.query(
      `SELECT p.*, usr.name AS created_by,
              (SELECT COUNT(*) FROM poll_votes v WHERE v.poll_id = p.id) AS votes_cast,
              p.closes_on < CURDATE() AS has_closed
       FROM polls p
       LEFT JOIN users usr ON p.created_by_id = usr.id
       ${admin ? '' : 'WHERE p.is_published = 1 AND p.opens_on <= CURDATE()'}
       ORDER BY p.closes_on DESC
       LIMIT 100`
    );

    // Occupied homes, because that is the number a turnout figure means
    // something against. An empty home cannot vote.
    const [[population]] = await db.query(
      'SELECT COUNT(*) AS homes FROM units WHERE is_occupied = 1'
    );

    const data = [];

    for (const poll of polls) {
      const closed = Boolean(Number(poll.has_closed));
      const [options] = await db.execute(
        'SELECT id, label, position FROM poll_options WHERE poll_id = ? ORDER BY position ASC, id ASC',
        [poll.id]
      );

      let ownVote = null;

      if (unit) {
        const [votes] = await db.execute(
          'SELECT option_id FROM poll_votes WHERE poll_id = ? AND unit_id = ?',
          [poll.id, unit.unit_id]
        );
        ownVote = votes[0]?.option_id ?? null;
      }

      data.push({
        ...poll,
        has_closed: closed,
        votes_cast: Number(poll.votes_cast),
        eligible_homes: Number(population.homes),
        options,
        own_vote: ownVote,
        // An admin needs the tally to run the meeting. A resident gets it when
        // the poll closes and not a moment before.
        results: closed || admin ? await tallyFor(poll.id) : null
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error reading polls:', error);
    res.status(500).json({ success: false, message: 'Server error reading polls' });
  }
};

/** 2. Cast the home's vote. */
exports.vote = async (req, res) => {
  const { option_id: optionId } = req.body;

  try {
    const unit = await activeUnitFor(req.user.id);

    if (!unit) {
      return res.status(404).json({ success: false, code: 'NO_ACTIVE_UNIT', message: 'You are not listed against a home.' });
    }

    const [options] = await db.execute(
      `SELECT o.id, o.label, p.id AS poll_id, p.question, p.closes_on, p.opens_on, p.is_published
       FROM poll_options o JOIN polls p ON o.poll_id = p.id
       WHERE o.id = ? AND p.id = ?`,
      [optionId, req.params.id]
    );

    if (options.length === 0) {
      return res.status(404).json({ success: false, message: 'That is not an option on this poll.' });
    }

    const option = options[0];
    const today = new Date().toISOString().slice(0, 10);

    if (!option.is_published || option.opens_on > today) {
      return res.status(409).json({ success: false, message: 'That poll is not open yet.' });
    }

    if (option.closes_on < today) {
      return res.status(409).json({ success: false, message: 'That poll has closed.' });
    }

    await db.execute(
      'INSERT INTO poll_votes (poll_id, option_id, unit_id, voted_by_id) VALUES (?, ?, ?, ?)',
      [option.poll_id, option.id, unit.unit_id, req.user.id]
    );

    res.json({ success: true, message: `Home ${unit.number} voted for ${option.label}.` });
  } catch (error) {
    // One vote per home. A second member of the same household is told whose
    // vote already stands rather than quietly overwriting it.
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Your home has already voted on this. A household gets one vote.'
      });
    }

    console.error('Error casting vote:', error);
    res.status(500).json({ success: false, message: 'Server error casting that vote' });
  }
};

/** 3. Raise a question. Admin only. */
exports.createPoll = async (req, res) => {
  const { question, detail, opens_on: opensOn, closes_on: closesOn, options } = req.body;
  const labels = (options || []).map((label) => String(label).trim()).filter(Boolean);

  if (labels.length < 2) {
    return res.status(400).json({ success: false, message: 'A poll needs at least two options.' });
  }

  if (closesOn < opensOn) {
    return res.status(400).json({ success: false, message: 'A poll cannot close before it opens.' });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [poll] = await connection.execute(
      'INSERT INTO polls (question, detail, opens_on, closes_on, created_by_id) VALUES (?, ?, ?, ?, ?)',
      [String(question).trim(), detail || null, opensOn, closesOn, req.user.id]
    );

    for (const [index, label] of labels.entries()) {
      await connection.execute(
        'INSERT INTO poll_options (poll_id, label, position) VALUES (?, ?, ?)',
        [poll.insertId, label, index]
      );
    }

    await recordAudit(req, {
      action: 'RAISE_POLL',
      entity: 'polls',
      entity_id: poll.insertId,
      summary: `Raised the poll "${question}", closing ${closesOn}`,
      after: { question, opens_on: opensOn, closes_on: closesOn, options: labels }
    }, connection);

    await connection.commit();

    createNotification({
      title: 'A decision needs your home',
      message: `${question} Voting closes ${closesOn}.`,
      target_role: 'RESIDENT',
      type: 'COMMUNITY'
    });

    res.json({ success: true, message: 'Poll raised.', data: { id: poll.insertId } });
  } catch (error) {
    await connection.rollback();
    console.error('Error raising poll:', error);
    res.status(500).json({ success: false, message: 'Server error raising that poll' });
  } finally {
    connection.release();
  }
};

/**
 * 4. Close a poll early, or withdraw one. Closing is moving the closing date to
 * today rather than deleting anything, so the result and the votes behind it
 * stay readable afterwards.
 */
exports.updatePoll = async (req, res) => {
  const { close_now: closeNow, is_published: isPublished } = req.body;

  try {
    const [polls] = await db.execute('SELECT * FROM polls WHERE id = ?', [req.params.id]);

    if (polls.length === 0) {
      return res.status(404).json({ success: false, message: 'No such poll.' });
    }

    await db.execute(
      `UPDATE polls
       SET closes_on = IF(?, CURDATE() - INTERVAL 1 DAY, closes_on),
           is_published = IFNULL(?, is_published)
       WHERE id = ?`,
      [closeNow ? 1 : 0, isPublished === undefined ? null : (isPublished ? 1 : 0), req.params.id]
    );

    await recordAudit(req, {
      action: closeNow ? 'CLOSE_POLL' : 'EDIT_POLL',
      entity: 'polls',
      entity_id: req.params.id,
      summary: closeNow
        ? `Closed the poll "${polls[0].question}" early`
        : `Edited the poll "${polls[0].question}"`,
      before: polls[0],
      after: req.body
    });

    res.json({ success: true, message: closeNow ? 'Poll closed. Results are now visible to residents.' : 'Poll updated.' });
  } catch (error) {
    console.error('Error updating poll:', error);
    res.status(500).json({ success: false, message: 'Server error updating that poll' });
  }
};

/**
 * 5. Which homes have voted and which have not, so the committee can chase a
 * quorum. Deliberately not which way anybody voted.
 */
exports.getTurnout = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT u.number AS unit_number, u.floor,
              v.id IS NOT NULL AS has_voted
       FROM units u
       LEFT JOIN poll_votes v ON v.unit_id = u.id AND v.poll_id = ?
       WHERE u.is_occupied = 1
       ORDER BY u.floor ASC, u.number ASC`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: rows.map((row) => ({ ...row, has_voted: Boolean(row.has_voted) }))
    });
  } catch (error) {
    console.error('Error reading turnout:', error);
    res.status(500).json({ success: false, message: 'Server error reading turnout' });
  }
};
