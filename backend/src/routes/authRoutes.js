const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { protect } = require('../middleware/auth');

router.post(
  '/login',
  validate({
    email: { required: true, type: 'string', maxLength: 255, label: 'Email' },
    password: { required: true, type: 'string', maxLength: 200, label: 'Password' }
  }),
  authController.login
);
router.get('/me', protect, authController.getMe);
router.post(
  '/change-password',
  protect,
  validate({
    current_password: { required: true, type: 'string', label: 'Current password' },
    new_password: { required: true, type: 'string', minLength: 10, maxLength: 200, label: 'New password' }
  }),
  authController.changePassword
);

module.exports = router;
