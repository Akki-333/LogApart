const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unitController');
const jwt = require('jsonwebtoken');

// Simple Middleware to protect routes (Should ideally be refactored into a shared middleware file)
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

module.exports = router;
