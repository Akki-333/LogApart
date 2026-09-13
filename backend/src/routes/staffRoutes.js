const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Mounted behind protect + requirePasswordSet in server.js, so req.user is set here.
//
// Salaries are on these records, so the whole module is administrative.
const adminOnly = requireRole('ADMIN');

router.get('/', adminOnly, staffController.getStaff);
router.post(
  '/',
  adminOnly,
  validate({
    name: { required: true, type: 'string', minLength: 2, maxLength: 255, label: 'Name' },
    role_title: { required: true, type: 'string', minLength: 2, maxLength: 100, label: 'Role' },
    phone: { type: 'string', maxLength: 20, label: 'Phone' },
    monthly_salary: { type: 'number', min: 0, label: 'Monthly pay' },
    joined_on: { type: 'date', label: 'Joined on' },
    user_id: { type: 'integer', label: 'Linked account' }
  }),
  staffController.createStaff
);
router.put(
  '/:id',
  adminOnly,
  validate({
    name: { type: 'string', minLength: 2, maxLength: 255, label: 'Name' },
    role_title: { type: 'string', minLength: 2, maxLength: 100, label: 'Role' },
    phone: { type: 'string', maxLength: 20, label: 'Phone' },
    monthly_salary: { type: 'number', min: 0, label: 'Monthly pay' },
    joined_on: { type: 'date', label: 'Joined on' },
    is_active: { type: 'boolean', label: 'Active' }
  }),
  staffController.updateStaff
);

router.get('/attendance', adminOnly, staffController.getAttendance);
router.post(
  '/attendance',
  adminOnly,
  validate({
    staff_id: { required: true, type: 'integer', label: 'Staff member' },
    attendance_date: { required: true, type: 'date', label: 'Date' },
    status: { required: true, type: 'string', maxLength: 20, label: 'Status' },
    note: { type: 'string', maxLength: 255, label: 'Note' }
  }),
  staffController.markAttendance
);

module.exports = router;
