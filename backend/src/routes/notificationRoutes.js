const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// Every signed-in role has a notification bell; the query scopes rows by role.
router.get('/', notificationController.getNotifications);
router.put('/read-all', notificationController.markAllAsRead);
router.put('/:id/read', notificationController.markAsRead);

module.exports = router;
