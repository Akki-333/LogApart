/**
 * Seeds a fresh database: 20 units across 4 floors, one admin, one guard.
 * Safe to re-run. Existing rows are left untouched.
 *
 *   npm run db:seed
 *
 * Passwords come from SEED_ADMIN_PASSWORD / SEED_GUARD_PASSWORD when set,
 * otherwise a random one is generated and printed once.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

const FLOORS = 4;
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

// Floor 1 has no suffix, floor 2 is -1, floor 3 is -2, floor 4 is -3.
const unitNumber = (letter, floor) => (floor === 1 ? letter : `${letter}-${floor - 1}`);

const randomPassword = () => crypto.randomBytes(9).toString('base64url');

async function seedUnits() {
  const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM units');

  if (count > 0) {
    console.log(`Units: ${count} already present, skipping.`);
    return;
  }

  for (let floor = 1; floor <= FLOORS; floor += 1) {
    for (const letter of LETTERS) {
      await db.execute(
        'INSERT INTO units (number, floor, block_name, type, is_occupied) VALUES (?, ?, ?, ?, 0)',
        [unitNumber(letter, floor), floor, 'Main Block', 'TENANT']
      );
    }
  }

  console.log(`Units: created ${FLOORS * LETTERS.length}.`);
}

async function seedUser({ name, email, role, phone, envKey }) {
  const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);

  if (existing.length > 0) {
    console.log(`${role}: ${email} already exists, skipping.`);
    return;
  }

  const password = process.env[envKey] || randomPassword();
  const hash = await bcrypt.hash(password, 10);

  await db.execute(
    'INSERT INTO users (name, email, password, role, phone, must_change_password) VALUES (?, ?, ?, ?, ?, 1)',
    [name, email, hash, role, phone]
  );

  console.log(`${role}: created ${email}`);
  if (!process.env[envKey]) {
    console.log(`  temporary password: ${password}   (change at first login)`);
  }
}

async function run() {
  await seedUnits();

  await seedUser({
    name: 'Building Admin',
    email: 'admin@apartadmin.com',
    role: 'ADMIN',
    phone: '9000000000',
    envKey: 'SEED_ADMIN_PASSWORD'
  });

  await seedUser({
    name: 'Night Shift Guard',
    email: 'guard@apartadmin.com',
    role: 'SECURITY',
    phone: '9999999999',
    envKey: 'SEED_GUARD_PASSWORD'
  });

  console.log('\nSeed complete.');
}

run()
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
