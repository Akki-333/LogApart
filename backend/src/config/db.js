const mysql = require('mysql2/promise');
require('dotenv').config();

// Create a connection pool instead of a single connection
// This helps manage multiple connections efficiently
// These defaults exist for a developer's first run and nothing else.
// config/env.js refuses to boot in production without every one of them set,
// so none of the fallbacks below can ever apply to a real deployment.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'apartment_admin',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // DATE columns are calendar days, not instants. Left as JS Date objects the
  // driver anchors them to local midnight, and serialising to JSON shifts them
  // back a day in any timezone ahead of UTC. A due date of the 10th reached the
  // browser as the 9th. Returning them as 'YYYY-MM-DD' strings keeps the day
  // intact. TIMESTAMP columns are genuine instants and stay as Date objects.
  dateStrings: ['DATE']
});

module.exports = pool;
