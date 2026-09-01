const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
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

router.get('/stats', protect, dashboardController.getDashboardStats);

module.exports = router;
