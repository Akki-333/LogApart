const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/noticeController');
const { requireRole } = require('../middleware/auth');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// Everyone reads the notices addressed to their role.
router.get('/', noticeController.getActiveNotices);
router.post('/:id/acknowledge', noticeController.acknowledgeNotice);

// Posting and withdrawing is administrative.
router.get('/all', requireRole('ADMIN'), noticeController.getAllNotices);
router.post('/', requireRole('ADMIN'), noticeController.createNotice);
router.put('/:id', requireRole('ADMIN'), noticeController.updateNotice);
router.delete('/:id', requireRole('ADMIN'), noticeController.deleteNotice);

module.exports = router;
