/**
 * The one seed.
 *
 *   npm run db:seed         20 homes, an admin and a guard. Nothing else.
 *   npm run db:seed:demo    the above, plus a building with a year behind it.
 *
 * Two rules this file exists to keep, both learned the hard way.
 *
 * It is idempotent. Every insert is guarded by a unique key that actually
 * exists, or by a read first. The script it replaces leaned on
 * ON DUPLICATE KEY UPDATE against a key `units` did not have, so each run added
 * twenty more homes and the September dues run billed every one of them four
 * times.
 *
 * It issues one-time passwords. Every account it creates is flagged for a
 * forced change, exactly as onboarding through the app does. Set
 * SEED_DEMO_PASSWORD to give the demo residents a shared password you can walk
 * through the app with; that is a deliberate opt-out and it prints a warning.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

const DEMO = process.argv.includes('--demo');

const FLOORS = 4;
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

// Floor 1 has no suffix, floor 2 is -1, floor 3 is -2, floor 4 is -3.
const homeNumber = (letter, floor) => (floor === 1 ? letter : `${letter}-${floor - 1}`);

const randomPassword = () => crypto.randomBytes(9).toString('base64url');
const rupees = (value) => Number(Number(value).toFixed(2));
const dayOf = (date) => date.toISOString().slice(0, 10);
const monthsAgo = (n) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return d;
};

const say = (line) => console.log(line);

/* ------------------------------------------------------------------ base */

async function seedHomes() {
  const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM units');

  if (count > 0) {
    say(`Homes: ${count} already present, leaving them alone.`);
    return;
  }

  for (let floor = 1; floor <= FLOORS; floor += 1) {
    for (const letter of LETTERS) {
      await db.execute(
        'INSERT INTO units (number, floor, block_name, type, area, is_occupied) VALUES (?, ?, ?, ?, ?, 0)',
        [homeNumber(letter, floor), floor, 'Main Block', 'TENANT', 900 + LETTERS.indexOf(letter) * 120]
      );
    }
  }

  say(`Homes: created ${FLOORS * LETTERS.length}.`);
}

/** Creates an account with a one-time password, or leaves an existing one be. */
async function seedUser({ name, email, role, phone, envKey }) {
  const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);

  if (existing.length > 0) return { id: existing[0].id, created: false };

  const shared = !envKey && process.env.SEED_DEMO_PASSWORD;
  const password = (envKey && process.env[envKey]) || shared || randomPassword();
  const forceChange = shared ? 0 : 1;
  const hash = await bcrypt.hash(password, 10);

  const [result] = await db.execute(
    'INSERT INTO users (name, email, password, role, phone, must_change_password) VALUES (?, ?, ?, ?, ?, ?)',
    [name, email, hash, role, phone, forceChange]
  );

  if (!shared && !(envKey && process.env[envKey])) {
    say(`  ${email}   password: ${password}   (change at first sign-in)`);
  }

  return { id: result.insertId, created: true };
}

/* ------------------------------------------------------------------ demo */

const RESIDENTS = [
  ['Rahul Sharma', 'rahul.sharma', '9840112233', 'OWNER'],
  ['Ananya Iyer', 'ananya.iyer', '9840223344', 'OWNER'],
  ['Vikram Patel', 'vikram.patel', '9840334455', 'TENANT'],
  ['Priya Nair', 'priya.nair', '9840445566', 'TENANT'],
  ['Karthik Menon', 'karthik.menon', '9840556677', 'OWNER'],
  ['Deepa Venkatesh', 'deepa.venkatesh', '9840667788', 'OWNER'],
  ['Arjun Reddy', 'arjun.reddy', '9840778899', 'TENANT'],
  ['Meera Krishnan', 'meera.krishnan', '9840889900', 'OWNER'],
  ['Sanjay Gupta', 'sanjay.gupta', '9840990011', 'TENANT'],
  ['Lakshmi Rao', 'lakshmi.rao', '9841001122', 'OWNER'],
  ['Imran Qureshi', 'imran.qureshi', '9841112233', 'TENANT'],
  ['Nisha Bhatt', 'nisha.bhatt', '9841223344', 'OWNER'],
  ['Rohit Desai', 'rohit.desai', '9841334455', 'TENANT'],
  ['Fatima Sheikh', 'fatima.sheikh', '9841445566', 'OWNER'],
  ['Gopal Subramanian', 'gopal.s', '9841556677', 'OWNER'],
  ['Tanvi Joshi', 'tanvi.joshi', '9841667788', 'TENANT']
];

async function seedResidents() {
  const [homes] = await db.query('SELECT id, number FROM units ORDER BY floor ASC, number ASC');
  let placed = 0;

  for (const [index, resident] of RESIDENTS.entries()) {
    const home = homes[index];
    if (!home) break;

    const [[live]] = await db.query(
      'SELECT COUNT(*) AS c FROM residents WHERE unit_id = ? AND is_active = true', [home.id]
    );
    if (Number(live.c) > 0) continue;

    const { id } = await seedUser({
      name: resident[0], email: `${resident[1]}@logapart.local`, role: 'RESIDENT', phone: resident[2]
    });

    await db.execute(
      'INSERT INTO residents (user_id, unit_id, move_in_date, emergency_contact, is_active) VALUES (?, ?, ?, ?, 1)',
      [id, home.id, dayOf(monthsAgo(6 + index)), `98400${String(11000 + index)}`]
    );
    await db.execute('UPDATE units SET is_occupied = true, type = ? WHERE id = ?', [resident[3], home.id]);
    placed += 1;
  }

  say(`Residents: ${placed} moved in.`);
}

/** A month of dues, with real payments and real receipts behind what is paid. */
async function seedDues(adminId) {
  const period = dayOf(monthsAgo(1));
  const [existing] = await db.execute('SELECT id FROM billing_runs WHERE period_month = ?', [period]);

  if (existing.length > 0) {
    say(`Dues: a run for ${period.slice(0, 7)} already exists.`);
    return;
  }

  const [homes] = await db.query(
    `SELECT u.id, usr.id AS resident_id FROM units u
     LEFT JOIN residents r ON u.id = r.unit_id AND r.is_active = true
     LEFT JOIN users usr ON r.user_id = usr.id
     WHERE u.is_occupied = 1 ORDER BY u.id`
  );
  if (homes.length === 0) return;

  const maintenance = 2500;
  const corpus = 500;
  const electricity = rupees(180 * homes.length);
  const share = rupees(electricity / homes.length);
  const perHome = rupees(maintenance + corpus + share);
  const start = new Date(period);
  const dueDate = dayOf(new Date(start.getFullYear(), start.getMonth(), 10));

  const [run] = await db.execute(
    `INSERT INTO billing_runs
       (period_month, maintenance_rate, corpus_rate, rate_basis, common_electricity_total,
        common_water_total, split_basis, due_date, units_billed, total_billed, note, generated_by_id)
     VALUES (?, ?, ?, 'FLAT', ?, 0, 'EQUAL', ?, ?, ?, ?, ?)`,
    [period, maintenance, corpus, electricity, dueDate, homes.length,
      rupees(perHome * homes.length), 'Seeded demonstration run', adminId]
  );

  // Receipt numbers continue from whatever the year already holds, so seeding
  // on top of real data cannot collide with a receipt already issued.
  const year = start.getFullYear();
  const [[issued]] = await db.execute(
    'SELECT COUNT(*) AS n FROM payment_records WHERE receipt_number LIKE ?', [`RCP-${year}-%`]
  );
  let receiptNumber = Number(issued.n);
  let settled = 0;

  for (const [index, home] of homes.entries()) {
    const [invoice] = await db.execute(
      `INSERT INTO invoices
         (billing_run_id, unit_id, resident_user_id, period_month, maintenance_amount,
          electricity_amount, water_amount, corpus_amount, total_amount, due_date)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [run.insertId, home.id, home.resident_id, period, maintenance, share, corpus, perHome, dueDate]
    );

    // Two in three paid, one of those in part, the rest outstanding. Every
    // rupee shown as collected has a payment record and a receipt behind it,
    // because an amount with nothing behind it was never collected.
    const bucket = index % 3;
    if (bucket === 2) continue;

    const amount = bucket === 0 ? perHome : rupees(perHome / 2);
    const status = bucket === 0 ? 'PAID' : 'PARTIAL';
    receiptNumber += 1;

    await db.execute(
      `INSERT INTO payment_records
         (receipt_number, invoice_id, amount, mode, reference, paid_on, recorded_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`RCP-${year}-${String(receiptNumber).padStart(4, '0')}`, invoice.insertId, amount,
        index % 2 ? 'UPI' : 'BANK_TRANSFER', `REF${100000 + index}`,
        dayOf(new Date(new Date(dueDate).getTime() - 86400000 * (index % 5))), adminId]
    );

    await db.execute(
      `UPDATE invoices SET amount_paid = ?, status = ?, paid_at = IF(? = 'PAID', CURRENT_TIMESTAMP, NULL)
       WHERE id = ?`,
      [amount, status, status, invoice.insertId]
    );
    settled += 1;
  }

  say(`Dues: ${homes.length} invoices for ${period.slice(0, 7)}, ${settled} with payments recorded.`);
}

async function seedSpending(adminId) {
  const vendors = [
    ['Otis Elevator Service', 'Lifts', 'Mr Ramesh', '9845001122'],
    ['Sparkle Facility Care', 'Housekeeping', 'Ms Latha', '9845002233'],
    ['GreenLeaf Pest Control', 'Pest control', 'Mr Anand', '9845003344']
  ];

  for (const vendor of vendors) {
    await db.execute(
      `INSERT INTO vendors (name, service, contact_person, phone) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE service = VALUES(service)`,
      vendor
    );
  }

  const [[lift]] = await db.query("SELECT id FROM vendors WHERE name = 'Otis Elevator Service'");
  const [[contracts]] = await db.query('SELECT COUNT(*) AS c FROM vendor_contracts');

  if (Number(contracts.c) === 0 && lift) {
    // Ends inside its own reminder window, so the dashboard warning has
    // something true to show on the first run.
    await db.execute(
      `INSERT INTO vendor_contracts (vendor_id, title, start_date, end_date, amount, remind_days_before)
       VALUES (?, 'Annual lift maintenance', ?, ?, 48000, 30)`,
      [lift.id, dayOf(monthsAgo(11)), dayOf(new Date(Date.now() + 18 * 86400000))]
    );
  }

  const spend = [
    ['COMMON_ELECTRICITY', 18450, 1, 'Common area electricity'],
    ['COMMON_WATER', 3200, 1, 'Tanker water top-up'],
    ['LIFT_AMC', 12000, 2, 'Quarterly lift service'],
    ['HOUSEKEEPING', 22000, 1, 'Monthly housekeeping'],
    ['REPAIRS', 4300, 2, 'Terrace waterproofing patch']
  ];

  for (const [category, amount, ago, note] of spend) {
    const [[seen]] = await db.query('SELECT COUNT(*) AS c FROM expenses WHERE note = ?', [note]);
    if (Number(seen.c) > 0) continue;

    await db.execute(
      `INSERT INTO expenses (payee_name, category, amount, bill_date, paid_on, mode, note, recorded_by_id)
       VALUES (?, ?, ?, ?, ?, 'BANK_TRANSFER', ?, ?)`,
      ['Building account', category, amount, dayOf(monthsAgo(ago)), dayOf(monthsAgo(ago)), note, adminId]
    );
  }

  const now = new Date();
  const yearStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const financialYear = `${yearStart}-${yearStart + 1}`;

  const budgets = [['COMMON_ELECTRICITY', 240000], ['HOUSEKEEPING', 280000],
    ['LIFT_AMC', 48000], ['REPAIRS', 60000], ['COMMON_WATER', 40000]];

  for (const [category, amount] of budgets) {
    await db.execute(
      `INSERT INTO budgets (financial_year, category, amount) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
      [financialYear, category, amount]
    );
  }

  say(`Spending: vendors, a lift contract, ${spend.length} bills and a ${financialYear} budget.`);
}

async function seedCommunity(adminId, guardId) {
  const [homes] = await db.query('SELECT id, number FROM units WHERE is_occupied = 1 ORDER BY id LIMIT 6');
  if (homes.length === 0) return;

  // A helper with no home to work for is refused by the API, so the links are
  // part of creating one rather than an afterthought.
  const helpers = [
    ['Saroja', 'MAID', [0, 1, 2]],
    ['Muthu', 'COOK', [1, 3]],
    ['Ravi Kumar', 'DRIVER', [4]]
  ];

  for (const [name, kind, indexes] of helpers) {
    const [[seen]] = await db.query('SELECT id FROM helpers WHERE name = ?', [name]);
    let helperId = seen && seen.id;

    if (!helperId) {
      const [made] = await db.execute(
        'INSERT INTO helpers (name, helper_type, phone, created_by_id) VALUES (?, ?, ?, ?)',
        [name, kind, `9800${Math.floor(100000 + Math.random() * 899999)}`, adminId]
      );
      helperId = made.insertId;
    }

    for (const i of indexes) {
      if (!homes[i]) continue;
      await db.execute('INSERT IGNORE INTO helper_units (helper_id, unit_id) VALUES (?, ?)',
        [helperId, homes[i].id]);
    }
  }

  const notices = [
    ['Water tank cleaning on Sunday',
      'The overhead tanks are being cleaned this Sunday. Supply is off between 10am and 2pm.', 'MAINTENANCE'],
    ['Diwali decoration meeting',
      'A short meeting in the clubhouse on Saturday at 6pm to plan the lobby decorations.', 'EVENT']
  ];

  for (const [title, body, category] of notices) {
    const [[seen]] = await db.query('SELECT COUNT(*) AS c FROM notices WHERE title = ?', [title]);
    if (Number(seen.c) > 0) continue;
    await db.execute(
      `INSERT INTO notices (title, body, category, audience, starts_on, posted_by_id)
       VALUES (?, ?, ?, 'ALL', CURDATE(), ?)`,
      [title, body, category, adminId]
    );
  }

  const [allHomes] = await db.query('SELECT id FROM units ORDER BY id');
  for (const [index, home] of allHomes.entries()) {
    await db.execute(
      `INSERT INTO parking_bays (bay_number, level, unit_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE unit_id = VALUES(unit_id)`,
      [`P-${String(index + 1).padStart(2, '0')}`, index < 10 ? 'Basement' : 'Ground', home.id]
    );
  }

  const staff = [['Selvam', 'Cleaner', 14000], ['Anthony', 'Security guard', 18000],
    ['Prakash', 'Plumber on call', 12000]];

  for (const [name, title, salary] of staff) {
    const [[seen]] = await db.query('SELECT COUNT(*) AS c FROM staff WHERE name = ?', [name]);
    if (Number(seen.c) > 0) continue;
    await db.execute(
      'INSERT INTO staff (name, role_title, phone, monthly_salary, joined_on) VALUES (?, ?, ?, ?, ?)',
      [name, title, `9812${Math.floor(100000 + Math.random() * 899999)}`, salary, dayOf(monthsAgo(14))]
    );
  }

  for (const [name, hours, charge] of [['Clubhouse', 3, 500], ['Terrace', 4, 750]]) {
    await db.execute(
      `INSERT INTO amenities (name, description, opens_at, closes_at, slot_hours, charge)
       VALUES (?, ?, '08:00:00', '21:00:00', ?, ?)
       ON DUPLICATE KEY UPDATE charge = VALUES(charge)`,
      [name, `Bookable in ${hours}-hour slots`, hours, charge]
    );
  }

  const question = 'Should the terrace close at 10pm on weeknights?';
  const [[poll]] = await db.query('SELECT id FROM polls WHERE question = ?', [question]);

  if (!poll) {
    const [made] = await db.execute(
      `INSERT INTO polls (question, detail, opens_on, closes_on, created_by_id)
       VALUES (?, 'Raised at the last committee meeting after a noise complaint.', CURDATE(), ?, ?)`,
      [question, dayOf(new Date(Date.now() + 10 * 86400000)), adminId]
    );

    const options = [];
    for (const [position, label] of ['Yes, close at 10pm', 'No, leave it as it is', 'Abstain'].entries()) {
      const [opt] = await db.execute(
        'INSERT INTO poll_options (poll_id, label, position) VALUES (?, ?, ?)',
        [made.insertId, label, position]
      );
      options.push(opt.insertId);
    }

    const [voters] = await db.query(
      'SELECT unit_id, user_id FROM residents WHERE is_active = true ORDER BY unit_id LIMIT 9'
    );
    for (const [index, voter] of voters.entries()) {
      await db.execute(
        'INSERT IGNORE INTO poll_votes (poll_id, option_id, unit_id, voted_by_id) VALUES (?, ?, ?, ?)',
        [made.insertId, options[index % 3], voter.unit_id, voter.user_id]
      );
    }
  }

  const [[held]] = await db.query('SELECT COUNT(*) AS c FROM parcels');
  if (Number(held.c) === 0 && guardId) {
    await db.execute(
      'INSERT INTO parcels (unit_id, courier, description, received_by_id) VALUES (?, ?, ?, ?)',
      [homes[0].id, 'Bluedart', 'Small brown box', guardId]
    );
  }

  const emergency = [
    ['Building manager', '9840000001', 'First call for anything inside the building'],
    ['Nearest hospital', '044 2345 6789', 'Apollo, 1.2km, open all hours'],
    ['Fire service', '101', null],
    ['Police', '100', null]
  ];

  for (const [position, [label, phone, note]] of emergency.entries()) {
    const [[seen]] = await db.query('SELECT COUNT(*) AS c FROM emergency_contacts WHERE label = ?', [label]);
    if (Number(seen.c) > 0) continue;
    await db.execute(
      'INSERT INTO emergency_contacts (label, phone, note, position) VALUES (?, ?, ?, ?)',
      [label, phone, note, position]
    );
  }

  say('Community: helpers linked to homes, notices, bays, staff, amenities, a poll, a parcel and the emergency numbers.');
}

/* ------------------------------------------------------------------- run */

async function run() {
  await seedHomes();

  say('Accounts:');
  const admin = await seedUser({
    name: 'Building Admin', email: 'admin@apartadmin.com', role: 'ADMIN',
    phone: '9000000000', envKey: 'SEED_ADMIN_PASSWORD'
  });
  const guard = await seedUser({
    name: 'Night Shift Guard', email: 'guard@apartadmin.com', role: 'SECURITY',
    phone: '9999999999', envKey: 'SEED_GUARD_PASSWORD'
  });

  if (!DEMO) {
    say('\nSeed complete. Add --demo for a building with a year behind it.');
    return;
  }

  if (process.env.SEED_DEMO_PASSWORD) {
    say('\n  SEED_DEMO_PASSWORD is set, so demo residents share it and are not');
    say('  forced to change it. Never do this anywhere real.\n');
  }

  await seedResidents();
  await seedDues(admin.id);
  await seedSpending(admin.id);
  await seedCommunity(admin.id, guard.id);

  say('\nDemo seed complete. Safe to run again: nothing here duplicates.');
}

run()
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
