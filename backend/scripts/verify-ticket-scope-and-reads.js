/**
 * Live-API checks for the two defects fixed in migration 005.
 *
 *   1. A ticket can belong to the common area instead of a home.
 *   2. Notification read state belongs to a person, not to the notification.
 *
 * The project has no test framework, so this exercises the running API on
 * API_URL (default http://localhost:5000) against the real database. Start the
 * server first, then: npm run verify:tickets
 *
 * The seeded accounts' passwords are not recoverable, so the run creates its own
 * two admins and one resident, tags everything it makes, and deletes all of it
 * again on the way out, including when a check throws.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const API = `${process.env.API_URL || 'http://localhost:5000'}/api`;
const PASSWORD = 'Verify!123';
const tag = `v005-${Date.now()}`;

let passed = 0;
let failed = 0;

const check = (name, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

const call = async (token, path, options = {}) => {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  return { status: response.status, body: await response.json().catch(() => ({})) };
};

const login = async (email) => {
  const { body } = await call(null, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD })
  });

  if (!body.token) throw new Error(`Could not sign in as ${email}: ${JSON.stringify(body)}`);

  return body.token;
};

async function run() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const hash = await bcrypt.hash(PASSWORD, 10);
  const created = [];

  const makeUser = async (role, suffix) => {
    const email = `${tag}-${role.toLowerCase()}${suffix}@verify.local`;
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role, phone, must_change_password) VALUES (?, ?, ?, ?, ?, 0)',
      [`Verify ${role} ${suffix}`, email, hash, role, '0000000000']
    );

    created.push(result.insertId);

    return { id: result.insertId, email };
  };

  try {
    const adminA = await makeUser('ADMIN', 'a');
    const adminB = await makeUser('ADMIN', 'b');
    const resident = await makeUser('RESIDENT', '1');
    const [[unit]] = await db.query('SELECT id, number FROM units ORDER BY id LIMIT 1');
    await db.execute('INSERT INTO residents (user_id, unit_id, is_active) VALUES (?, ?, 1)', [resident.id, unit.id]);

    const tokenA = await login(adminA.email);
    const tokenB = await login(adminB.email);
    const tokenResident = await login(resident.email);

    // 1. A ticket can belong to the common area.
    const location = `Lift A ${tag}`;
    let res = await call(tokenA, '/tickets', {
      method: 'POST',
      body: JSON.stringify({
        scope: 'COMMON',
        location,
        title: `Lift stuck ${tag}`,
        description: 'Lift halts between floors',
        category: 'ELECTRICAL',
        priority: 'HIGH'
      })
    });
    check('admin can raise a common-area ticket with no home', res.status === 200 && res.body.success, JSON.stringify(res.body));

    res = await call(tokenA, '/tickets', {
      method: 'POST',
      body: JSON.stringify({ scope: 'COMMON', title: `No location ${tag}`, description: 'x' })
    });
    check('common ticket without a location is rejected', res.status === 400);

    res = await call(tokenA, '/tickets', {
      method: 'POST',
      body: JSON.stringify({ scope: 'UNIT', title: `No home ${tag}`, description: 'x' })
    });
    check('unit ticket without a home is rejected', res.status === 400);

    res = await call(tokenA, '/tickets', {
      method: 'POST',
      body: JSON.stringify({ unit_id: unit.id, title: `Home leak ${tag}`, description: 'Tap leaking' })
    });
    check('admin can still raise a home ticket', res.status === 200 && res.body.success, JSON.stringify(res.body));

    res = await call(tokenA, '/tickets');
    const tickets = res.body.data || [];
    const common = tickets.find((ticket) => ticket.location === location);
    check('common ticket appears in the admin list', Boolean(common));
    check('common ticket is labelled by its location', common && common.place === location, common && common.place);
    check('common ticket carries no home', common && common.unit_id === null);

    const homeTicket = tickets.find((ticket) => ticket.title === `Home leak ${tag}`);
    check(
      'home ticket is labelled by its home number',
      homeTicket && homeTicket.place === `Home ${unit.number}`,
      homeTicket && homeTicket.place
    );

    res = await call(tokenA, '/tickets?scope=COMMON');
    const commonOnly = res.body.data || [];
    check('scope filter returns only common tickets', commonOnly.length > 0 && commonOnly.every((ticket) => ticket.scope === 'COMMON'));

    // The dashboard used to inner-join units, which hid exactly these.
    res = await call(tokenA, '/dashboard/stats');
    const recent = res.body.data?.tickets?.recent_list || [];
    check('dashboard stats respond', res.status === 200, JSON.stringify(res.body).slice(0, 120));
    check('dashboard shows the common fault', recent.some((ticket) => ticket.location === location));

    res = await call(tokenResident, '/resident/tickets');
    const residentTickets = res.body.data || [];
    check('resident sees the common fault', residentTickets.some((t) => t.location === location && t.is_mine === false));
    check("resident sees their own home's ticket", residentTickets.some((t) => t.title === `Home leak ${tag}` && t.is_mine === true));

    res = await call(tokenResident, '/resident/tickets', {
      method: 'POST',
      body: JSON.stringify({
        scope: 'COMMON',
        location: `Pump room ${tag}`,
        title: `Pump noise ${tag}`,
        description: 'Loud at night'
      })
    });
    check('resident can report a common fault', res.status === 200 && res.body.success, JSON.stringify(res.body));

    // 2. Read state belongs to a person.
    let a = await call(tokenA, '/notifications');
    let b = await call(tokenB, '/notifications');
    check('both admins start with the same unread backlog', a.body.unreadCount === b.body.unreadCount, `${a.body.unreadCount} vs ${b.body.unreadCount}`);

    const before = a.body.unreadCount;
    const first = a.body.data && a.body.data[0];
    check('there is a notification to read', Boolean(first));

    if (first) {
      await call(tokenA, `/notifications/${first.id}/read`, { method: 'PUT' });
      a = await call(tokenA, '/notifications');
      b = await call(tokenB, '/notifications');
      check('reader A unread count drops by one', a.body.unreadCount === before - 1, String(a.body.unreadCount));
      check('reader B is untouched by A reading', b.body.unreadCount === before, String(b.body.unreadCount));
      check('the row is read for A', a.body.data.find((n) => n.id === first.id)?.is_read === true);
      check('the row is unread for B', b.body.data.find((n) => n.id === first.id)?.is_read === false);

      res = await call(tokenA, `/notifications/${first.id}/read`, { method: 'PUT' });
      a = await call(tokenA, '/notifications');
      check('marking twice is idempotent', res.status === 200 && a.body.unreadCount === before - 1);
    }

    await call(tokenA, '/notifications/read-all', { method: 'PUT' });
    a = await call(tokenA, '/notifications');
    b = await call(tokenB, '/notifications');
    check('read-all clears A', a.body.unreadCount === 0, String(a.body.unreadCount));
    check('read-all leaves B alone', b.body.unreadCount === before, String(b.body.unreadCount));

    res = await call(tokenA, '/notifications/999999/read', { method: 'PUT' });
    check('unknown notification is a 404', res.status === 404);

    const residentBell = await call(tokenResident, '/notifications');
    check('resident bell is scoped to their role', residentBell.body.data.every((n) => ['ALL', 'RESIDENT'].includes(n.target_role)));
  } finally {
    // Everything this run created, and nothing else.
    await db.query('DELETE FROM maintenance_tickets WHERE title LIKE ? OR location LIKE ?', [`%${tag}`, `%${tag}`]);
    await db.query('DELETE FROM notifications WHERE title LIKE ? OR message LIKE ?', [`%${tag}%`, `%${tag}%`]);
    if (created.length) {
      await db.query(`DELETE FROM users WHERE id IN (${created.map(() => '?').join(',')})`, created);
    }
    await db.end();
  }
}

run()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  })
  .catch((error) => {
    console.error('Verification could not run:', error.message);
    process.exit(1);
  });
