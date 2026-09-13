const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/noticeController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// Everyone reads the notices addressed to their role.
router.get('/', noticeController.getActiveNotices);
router.post('/:id/acknowledge', noticeController.acknowledgeNotice);

// Posting and withdrawing is administrative.
router.get('/all', requireRole('ADMIN'), noticeController.getAllNotices);
router.post(
  '/',
  requireRole('ADMIN'),
  validate({
    title: { required: true, type: 'string', minLength: 3, maxLength: 255, label: 'Title' },
    body: { required: true, type: 'string', minLength: 3, maxLength: 5000, label: 'Notice' },
    category: { oneOf: ['GENERAL', 'MAINTENANCE', 'UTILITY', 'EVENT', 'URGENT'], label: 'Category' },
    audience: { oneOf: ['ALL', 'RESIDENT', 'SECURITY'], label: 'Audience' },
    starts_on: { type: 'date', label: 'Starts on' },
    ends_on: { type: 'date', label: 'Ends on' }
  }),
  noticeController.createNotice
);
router.put(
  '/:id',
  requireRole('ADMIN'),
  validate({
    title: { type: 'string', minLength: 3, maxLength: 255, label: 'Title' },
    body: { type: 'string', minLength: 3, maxLength: 5000, label: 'Notice' },
    category: { oneOf: ['GENERAL', 'MAINTENANCE', 'UTILITY', 'EVENT', 'URGENT'], label: 'Category' },
    audience: { oneOf: ['ALL', 'RESIDENT', 'SECURITY'], label: 'Audience' },
    starts_on: { type: 'date', label: 'Starts on' },
    ends_on: { type: 'date', label: 'Ends on' },
    is_published: { type: 'boolean', label: 'Published' }
  }),
  noticeController.updateNotice
);
router.delete('/:id', requireRole('ADMIN'), noticeController.deleteNotice);

module.exports = router;
