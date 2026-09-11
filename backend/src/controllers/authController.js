const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { checkLock, recordAttempt, describeWait } = require('../services/loginGuard');
const { recordAudit, clientIp } = require('../services/audit');

const MIN_PASSWORD_LENGTH = 10;

// Not a password policy so much as a floor. These are what people actually
// choose when a building hands them an account and asks them to pick something.
const REFUSED_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd1', '1234567890',
  '123456789', 'qwertyuiop', 'letmein123', 'welcome123', 'iloveyou1',
  'admin12345', 'apartment1', 'logapart11'
]);

const signToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      role: user.role,
      name: user.name,
      must_change_password: Boolean(user.must_change_password),
      // Compared against the account on every request, so bumping the counter
      // ends every session already signed in.
      tv: Number(user.token_version || 0)
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const ip = clientIp(req);

  if (!email || !password) {
    return res.status(400).json({ message: 'Please provide email and password' });
  }

  // One spelling of the address, so attempts against the same account always
  // land in the same bucket. The column collation is case-insensitive anyway.
  const address = String(email).trim().toLowerCase();

  try {
    const lock = await checkLock(address, ip);

    if (lock.locked) {
      return res.status(429).json({
        success: false,
        code: 'TOO_MANY_ATTEMPTS',
        message: `Too many failed sign-in attempts. Try again in ${describeWait(lock.retryAfterSeconds)}.`,
        retry_after_seconds: lock.retryAfterSeconds
      });
    }

    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [address]);

    // The same answer whether the address is unknown or the password is wrong,
    // so the form cannot be used to find out who lives here.
    if (rows.length === 0) {
      await recordAttempt(address, ip, false);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      await recordAttempt(address, ip, false);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.is_active) {
      await recordAttempt(address, ip, false);
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DISABLED',
        message: 'This account has been closed. Speak to the building admin.'
      });
    }

    await recordAttempt(address, ip, true);

    const token = signToken(user);
    delete user.password;

    res.json({
      message: 'Login successful',
      token,
      user: { ...user, must_change_password: Boolean(user.must_change_password) }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, name, email, role, phone, must_change_password FROM users WHERE id = ?',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ ...rows[0], must_change_password: Boolean(rows[0].must_change_password) });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Lets a signed-in user replace their password. Residents onboarded by an admin
 * start with a one-time password and are forced through here before the rest of
 * the API will answer them.
 */
exports.changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ success: false, message: 'Current and new password are both required.' });
  }

  if (new_password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    });
  }

  if (current_password === new_password) {
    return res.status(400).json({ success: false, message: 'New password must be different from the current one.' });
  }

  if (REFUSED_PASSWORDS.has(new_password.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: 'That password is one of the first things anyone would try. Pick another.'
    });
  }

  try {
    const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(current_password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    const hash = await bcrypt.hash(new_password, 10);

    // Bumping the version ends every other session signed in as this person,
    // which is the whole point of changing a password you think someone else has.
    await db.execute(
      'UPDATE users SET password = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?',
      [hash, user.id]
    );

    const nextVersion = Number(user.token_version || 0) + 1;

    await recordAudit(req, {
      action: 'CHANGE_PASSWORD',
      entity: 'users',
      entity_id: user.id,
      summary: `${user.name} changed their own password`
    });

    // The old token carries the stale password flag and the stale version, so
    // hand back a fresh one or the caller locks themselves out.
    const token = signToken({ ...user, must_change_password: 0, token_version: nextVersion });
    delete user.password;

    res.json({
      success: true,
      message: 'Password updated successfully.',
      token,
      user: { ...user, must_change_password: false }
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Server error updating password' });
  }
};
