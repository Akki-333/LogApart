const express = require('express');
const router = express.Router();
const securityController = require('../controllers/securityController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.

// Admins get oversight of the gate log, but never write to it. This mirrors the
// read-only admin gate view and stops the portal interfering with live tracking.
router.get('/visitors', requireRole('ADMIN', 'SECURITY'), securityController.getVisitorLogs);

// Pre-approved passes raised by residents.
router.get('/passes/lookup', requireRole('SECURITY'), securityController.findPass);
router.put(
  '/passes/:id/admit',
  requireRole('SECURITY'),
  validate({
    vehicle_number: { type: 'string', maxLength: 50, label: 'Vehicle number' },
    vehicle_type: { type: 'string', maxLength: 20, label: 'Vehicle type' }
  }),
  securityController.admitPass
);

router.post(
  '/visitors',
  requireRole('SECURITY'),
  validate({
    visitor_name: { required: true, type: 'string', maxLength: 255, label: 'Visitor name' },
    unit_id: { required: true, type: 'integer', label: 'Visiting home' },
    visitor_phone: { type: 'string', maxLength: 20, label: 'Phone' },
    vehicle_number: { type: 'string', maxLength: 50, label: 'Vehicle number' }
  }),
  securityController.logVisitor
);
router.put(
  '/visitors/:id',
  requireRole('SECURITY'),
  validate({
    visitor_name: { type: 'string', minLength: 2, maxLength: 255, label: 'Visitor name' },
    visitor_phone: { type: 'string', maxLength: 20, label: 'Phone' },
    unit_id: { type: 'integer', label: 'Visiting home' },
    purpose: { oneOf: ['GUEST', 'DELIVERY', 'SERVICE', 'MAID', 'OTHER'], label: 'Purpose' },
    company: { type: 'string', maxLength: 50, label: 'Company' },
    vehicle_number: { type: 'string', maxLength: 50, label: 'Vehicle number' },
    vehicle_type: { type: 'string', maxLength: 20, label: 'Vehicle type' }
  }),
  securityController.updateVisitor
);
router.put('/visitors/:id/checkout', requireRole('SECURITY'), securityController.checkoutVisitor);
router.delete(
  '/visitors/:id',
  requireRole('SECURITY'),
  validate({ reason: { required: true, type: 'string', minLength: 4, maxLength: 255, label: 'Reason' } }),
  securityController.deleteVisitor
);

module.exports = router;
