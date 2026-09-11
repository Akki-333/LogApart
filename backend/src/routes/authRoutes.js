const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/login', authController.login);
router.get('/me', protect, authController.getMe);
router.post('/change-password', protect, authController.changePassword);

module.exports = router;
