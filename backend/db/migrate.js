/**
 * Applies db/schema.sql once, then every unapplied file in db/migrations
 * in filename order. Tracked in the schema_migrations table.
 *
 *   npm run db:migrate
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

// Splits a .sql file into statements, ignoring comment-only lines.
function statements(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: false,
    ssl: (process.env.DB_SSL === 'true' || process.env.DB_SSL === '1') ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      minVersion: 'TLSv1.2'
    } : undefined
  });

  const dbName = process.env.DB_NAME || 'apartment_admin';
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
    );
  } catch (err) {
    if (!['ER_DBACCESS_DENIED_ERROR', 'ER_ACCESS_DENIED_ERROR'].includes(err.code)) {
      throw err;
    }
  }
  await connection.changeUser({ database: dbName });

  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  const [applied] = await connection.query('SELECT name FROM schema_migrations');
  const done = new Set(applied.map((r) => r.name));

  const pending = ['schema.sql', ...fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()]
    .filter((name) => !done.has(name));

  if (pending.length === 0) {
    console.log('Database is up to date.');
    await connection.end();
    return;
  }

  for (const name of pending) {
    const file = name === 'schema.sql' ? SCHEMA_FILE : path.join(MIGRATIONS_DIR, name);
    process.stdout.write(`Applying ${name} ... `);

    try {
      for (const statement of statements(fs.readFileSync(file, 'utf8'))) {
        await connection.query(statement);
      }
      await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
      console.log('done');
    } catch (error) {
      // A column or table already added by hand should not block the rest.
      if (['ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME'].includes(error.code)) {
        await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
        console.log(`already present (${error.code}), recorded`);
        continue;
      }
      console.log('FAILED');
      throw error;
    }
  }

  await connection.end();
  console.log('\nMigrations complete.');
}

run().catch((error) => {
  console.error('\nMigration failed:', error.message);
  process.exit(1);
});
