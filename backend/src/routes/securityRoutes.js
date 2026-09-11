const express = require('express');
const router = express.Router();
const securityController = require('../controllers/securityController');
const { requireRole } = require('../middleware/auth');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// Admins get oversight of the gate log, but never write to it. This mirrors the
// read-only admin gate view and stops the portal interfering with live tracking.
router.get('/visitors', requireRole('ADMIN', 'SECURITY'), securityController.getVisitorLogs);

router.post('/visitors', requireRole('SECURITY'), securityController.logVisitor);
router.put('/visitors/:id', requireRole('SECURITY'), securityController.updateVisitor);
router.put('/visitors/:id/checkout', requireRole('SECURITY'), securityController.checkoutVisitor);
router.delete('/visitors/:id', requireRole('SECURITY'), securityController.deleteVisitor);

module.exports = router;
