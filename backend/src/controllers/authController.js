const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const MIN_PASSWORD_LENGTH = 8;

const signToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      role: user.role,
      name: user.name,
      must_change_password: Boolean(user.must_change_password)
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Please provide email and password' });
  }

  try {
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

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
    await db.execute(
      'UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?',
      [hash, user.id]
    );

    // The old token still carries must_change_password, so hand back a fresh one.
    const token = signToken({ ...user, must_change_password: 0 });
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
