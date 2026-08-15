const mysql = require('mysql2/promise');
require('dotenv').config();

// Create a connection pool instead of a single connection
// This helps manage multiple connections efficiently
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'apartment_admin',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
