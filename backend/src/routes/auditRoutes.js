const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { requireRole } = require('../middleware/auth');

// Read-only, and administrative. Nothing writes here through the API: rows are
// written by the actions themselves so the trail cannot be edited after the fact.
router.get('/', requireRole('ADMIN'), auditController.getAuditLog);
router.get('/:id', requireRole('ADMIN'), auditController.getAuditEntry);

module.exports = router;
