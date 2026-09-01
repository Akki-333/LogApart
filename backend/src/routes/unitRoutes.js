const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unitController');
const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return res.status(401).json({ message: 'Not authorized' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token failed' });
  }
};

router.get('/', protect, unitController.getUnits);
router.post('/assign', protect, unitController.assignResident);
router.put('/:unit_id/resident', protect, unitController.updateResident);
router.post('/vacate', protect, unitController.vacateUnit);

module.exports = router;
