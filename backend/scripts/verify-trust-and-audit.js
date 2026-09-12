/**
 * Live-API checks for Phase 4: throttled sign-in, revocable tokens, the audit
 * trail, soft-deleted gate records and admin-issued password recovery.
 *
 * The project has no test framework, so this exercises the running API on
 * API_URL (default http://localhost:5000) against the real database. Start the
 * server first, then: npm run verify:trust
 *
 * The seeded accounts' passwords are not recoverable, so the run creates its
 * own admin, guard and resident, tags everything it makes, and removes all of
 * it on the way out even when a check throws. The move-out check runs last
 * because it closes the resident account every earlier check signs in with.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const ROOT = process.env.API_URL || 'http://localhost:5000';
const API = `${ROOT}/api`;
const PASSWORD = 'Verify!123';
const tag = `p4-${Date.now()}`;

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

  return {
    status: response.status,
    headers: response.headers,
    body: await response.json().catch(() => ({}))
  };
};

const signIn = async (email, password = PASSWORD) =>
  call(null, '/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

const login = async (email, password = PASSWORD) => {
  const { body } = await signIn(email, password);
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
  let certificateNumber = null;
  let unit = null;
  let unitWasOccupied = null;

  const makeUser = async (role, suffix) => {
    const email = `${tag}-${role.toLowerCase()}${suffix}@verify.local`;
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role, phone, must_change_password) VALUES (?, ?, ?, ?, ?, 0)',
      [`Verify ${role} ${suffix} ${tag}`, email, hash, role, '0000000000']
    );

    created.push(result.insertId);
    return { id: result.insertId, email };
  };

  try {
    const admin = await makeUser('ADMIN', 'a');
    const guard = await makeUser('SECURITY', 'g');
    const resident = await makeUser('RESIDENT', 'r');
    const throwaway = await makeUser('ADMIN', 'lock');
    const rotating = await makeUser('ADMIN', 'rot');

    // A home nobody currently lives in, so the run never disturbs a real
    // tenancy. Falls back to the first home if the building is full.
    const [freeUnits] = await db.query(
      `SELECT u.id, u.number, u.is_occupied
       FROM units u
       LEFT JOIN residents r ON r.unit_id = u.id AND r.is_active = true
       WHERE r.id IS NULL
       ORDER BY u.id LIMIT 1`
    );
    const [anyUnits] = await db.query('SELECT id, number, is_occupied FROM units ORDER BY id LIMIT 1');
    unit = freeUnits[0] || anyUnits[0];
    unitWasOccupied = unit.is_occupied;

    await db.execute(
      'INSERT INTO residents (user_id, unit_id, move_in_date, is_active) VALUES (?, ?, CURDATE(), 1)',
      [resident.id, unit.id]
    );
    await db.execute('UPDATE units SET is_occupied = true WHERE id = ?', [unit.id]);

    const adminToken = await login(admin.email);
    const guardToken = await login(guard.email);
    let residentToken = await login(resident.email);

    // 1. The edges of the API.
    const root = await fetch(ROOT);
    check('responses carry content-type protection', root.headers.get('x-content-type-options') === 'nosniff');
    check('the server no longer advertises express', !root.headers.get('x-powered-by'));

    let res = await call(null, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(200 * 1024) })
    });
    check('an oversized body is refused', res.status === 413, String(res.status));

    res = await call(null, '/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@b.com' }) });
    check('sign-in without a password is a 400', res.status === 400 && res.body.code === 'INVALID_REQUEST');

    res = await call(adminToken, '/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: PASSWORD, new_password: 'short1' })
    });
    check('a password under ten characters is refused', res.status === 400, JSON.stringify(res.body));

    // 2. Throttling, on an account nothing else signs in as.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signIn(throwaway.email, 'WrongPassword!');
    }

    res = await signIn(throwaway.email, 'WrongPassword!');
    check('a sixth failed sign-in is throttled', res.status === 429 && res.body.code === 'TOO_MANY_ATTEMPTS', String(res.status));
    check('the throttle says how long to wait', Number(res.body.retry_after_seconds) > 0, String(res.body.retry_after_seconds));

    res = await signIn(throwaway.email);
    check('the lock holds even for the correct password', res.status === 429, String(res.status));

    const [[locked]] = await db.execute(
      'SELECT COUNT(*) AS failures FROM login_attempts WHERE email = ? AND succeeded = 0',
      [throwaway.email]
    );
    // Five real failures, and the throttled ones are not counted. If a blocked
    // attempt extended the lock, anyone could hold a neighbour's account shut
    // indefinitely just by knocking on it.
    check('every real failure was recorded', Number(locked.failures) === 5, String(locked.failures));

    await db.execute('DELETE FROM login_attempts WHERE email = ?', [throwaway.email]);
    res = await signIn(throwaway.email);
    check('the account opens again once the attempts clear', res.status === 200 && Boolean(res.body.token));

    // 3. A token that can be withdrawn.
    const rotatingToken = await login(rotating.email);
    res = await call(rotatingToken, '/dashboard/stats');
    check('a fresh token is accepted', res.status === 200);

    res = await call(rotatingToken, '/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: PASSWORD, new_password: 'Rotated!456' })
    });
    check('the password change succeeds', res.status === 200 && Boolean(res.body.token), JSON.stringify(res.body));

    const replacementToken = res.body.token;
    res = await call(rotatingToken, '/dashboard/stats');
    check('the old token is refused after the change', res.status === 401 && res.body.code === 'SESSION_REVOKED', JSON.stringify(res.body));

    res = await call(replacementToken, '/dashboard/stats');
    check('the token handed back still works', res.status === 200);

    // 4. A closed account is refused at the door.
    await db.execute('UPDATE users SET is_active = 0 WHERE id = ?', [guard.id]);
    res = await call(guardToken, '/security/visitors');
    check('a closed account cannot use a live token', res.status === 401 && res.body.code === 'ACCOUNT_DISABLED', JSON.stringify(res.body));

    res = await signIn(guard.email);
    check('a closed account cannot sign in again', res.status === 403 && res.body.code === 'ACCOUNT_DISABLED', String(res.status));

    await db.execute('UPDATE users SET is_active = 1 WHERE id = ?', [guard.id]);
    await db.execute('DELETE FROM login_attempts WHERE email = ?', [guard.email]);
    res = await call(guardToken, '/security/visitors');
    check('reopening the account restores the same token', res.status === 200);

    // 5. A role change takes effect on the next request, not on the next day.
    res = await call(residentToken, '/dashboard/stats');
    check('a resident cannot read the admin dashboard', res.status === 403);

    await db.execute("UPDATE users SET role = 'ADMIN' WHERE id = ?", [resident.id]);
    res = await call(residentToken, '/dashboard/stats');
    check('a promotion applies to the token already issued', res.status === 200, String(res.status));

    await db.execute("UPDATE users SET role = 'RESIDENT' WHERE id = ?", [resident.id]);
    res = await call(residentToken, '/dashboard/stats');
    check('a demotion applies just as fast', res.status === 403, String(res.status));

    // 6. A gate record is withdrawn, not destroyed.
    res = await call(guardToken, '/security/visitors', {
      method: 'POST',
      body: JSON.stringify({ visitor_name: `Courier ${tag}`, unit_id: unit.id, purpose: 'DELIVERY' })
    });
    check('the guard can log a visitor', res.status === 200 && res.body.success, JSON.stringify(res.body));

    res = await call(guardToken, '/security/visitors');
    const logged = (res.body.data || []).find((row) => row.visitor_name === `Courier ${tag}`);
    check('the visitor appears at the desk', Boolean(logged));

    res = await call(guardToken, `/security/visitors/${logged.id}`, { method: 'DELETE', body: JSON.stringify({}) });
    check('removing a gate record without a reason is refused', res.status === 400, String(res.status));

    res = await call(guardToken, `/security/visitors/${logged.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: `Logged against the wrong home ${tag}` })
    });
    check('removing it with a reason succeeds', res.status === 200, JSON.stringify(res.body));

    res = await call(guardToken, '/security/visitors');
    check('the record leaves the desk', !(res.body.data || []).some((row) => row.id === logged.id));

    const [[kept]] = await db.execute(
      'SELECT deleted_at, delete_reason, deleted_by_id FROM visitor_logs WHERE id = ?',
      [logged.id]
    );
    check('the row survives in the building record', Boolean(kept && kept.deleted_at));
    check('the stated reason is kept with it', Boolean(kept && kept.delete_reason.includes(tag)), kept && kept.delete_reason);
    check('the record says who withdrew it', Boolean(kept && kept.deleted_by_id === guard.id));

    // 7. The trail.
    const [gateAudits] = await db.execute(
      "SELECT * FROM audit_log WHERE action = 'DELETE_GATE_LOG' AND entity_id = ?",
      [String(logged.id)]
    );
    check('the removal wrote exactly one audit row', gateAudits.length === 1, String(gateAudits.length));
    check('the audit row names the guard', Boolean(gateAudits[0] && gateAudits[0].actor_id === guard.id));
    check('the audit row keeps what was removed', Boolean(gateAudits[0] && gateAudits[0].before_state));
    check('the audit row records the address it came from', Boolean(gateAudits[0] && gateAudits[0].ip));

    res = await call(adminToken, `/audit?search=${encodeURIComponent(tag)}`);
    check('an admin can read the trail', res.status === 200 && Array.isArray(res.body.data));
    check('the removal is findable by its reason', (res.body.data || []).some((row) => row.action === 'DELETE_GATE_LOG'));

    const entryId = (res.body.data || [])[0]?.id;
    res = await call(adminToken, `/audit/${entryId}`);
    check('one entry can be opened in full', res.status === 200 && Boolean(res.body.data));

    res = await call(guardToken, '/audit');
    check('a guard cannot read the trail', res.status === 403);

    res = await call(residentToken, '/audit');
    check('a resident cannot read the trail', res.status === 403);

    // 8. Password recovery, which did not exist before.
    res = await call(adminToken, `/units/${unit.id}/resident/password`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    check('re-issuing without a reason is refused', res.status === 400, String(res.status));

    res = await call(adminToken, `/units/${unit.id}/resident/password`, {
      method: 'POST',
      body: JSON.stringify({ reason: `Resident lost their password ${tag}` })
    });
    check('an admin can re-issue a one-time password', res.status === 200 && Boolean(res.body.data?.temp_password), JSON.stringify(res.body));

    const reissued = res.body.data.temp_password;

    res = await call(residentToken, '/resident/summary');
    check('the re-issue ends the session on that account', res.status === 401, String(res.status));

    res = await signIn(resident.email, reissued);
    check('the new password signs in', res.status === 200 && Boolean(res.body.token), JSON.stringify(res.body));
    residentToken = res.body.token;

    res = await call(residentToken, '/resident/summary');
    check('the account is sealed until the password is replaced', res.status === 403 && res.body.code === 'PASSWORD_CHANGE_REQUIRED', String(res.status));

    const [reissueAudits] = await db.execute(
      "SELECT * FROM audit_log WHERE action = 'REISSUE_PASSWORD' AND entity_id = ?",
      [String(resident.id)]
    );
    check('the re-issue is on the record', reissueAudits.length === 1, String(reissueAudits.length));
    check('the reason travelled into the trail', Boolean(reissueAudits[0] && reissueAudits[0].summary.includes(tag)));

    res = await call(residentToken, '/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: reissued, new_password: 'password123' })
    });
    check('an obvious replacement password is refused', res.status === 400, JSON.stringify(res.body));

    res = await call(residentToken, '/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: reissued, new_password: 'Settled!789' })
    });
    check('a sound replacement is accepted', res.status === 200 && Boolean(res.body.token), JSON.stringify(res.body));
    residentToken = res.body.token;

    res = await call(residentToken, '/resident/summary');
    check('the portal opens once the password is replaced', res.status === 200, String(res.status));

    // 9. Move-out, last, because it closes the account used above.
    res = await call(adminToken, '/units/vacate', {
      method: 'POST',
      body: JSON.stringify({ unit_id: unit.id, waive_dues: true, waiver_reason: `Verification run ${tag}` })
    });
    check('the home can be vacated', res.status === 200 && Boolean(res.body.data?.certificate_number), JSON.stringify(res.body));
    certificateNumber = res.body.data?.certificate_number || null;

    res = await call(residentToken, '/resident/summary');
    check('moving out ends the departing session', res.status === 401, String(res.status));

    res = await signIn(resident.email, 'Settled!789');
    check('a moved-out resident cannot sign back in', res.status === 403 && res.body.code === 'ACCOUNT_DISABLED', String(res.status));

    const [vacateAudits] = await db.execute(
      "SELECT * FROM audit_log WHERE action = 'VACATE_UNIT' AND entity_id = ?",
      [String(unit.id)]
    );
    check('the move-out is on the record', vacateAudits.length >= 1);
    check(
      'the waiver reason is on the record',
      vacateAudits.some((row) => row.summary.includes(tag)),
      vacateAudits[0] && vacateAudits[0].summary
    );
  } finally {
    // Everything this run created, and nothing else.
    await db.query('DELETE FROM visitor_logs WHERE visitor_name LIKE ?', [`%${tag}%`]);
    await db.query('DELETE FROM audit_log WHERE actor_name LIKE ? OR summary LIKE ?', [`%${tag}%`, `%${tag}%`]);
    await db.query('DELETE FROM login_attempts WHERE email LIKE ?', [`${tag}%`]);

    if (certificateNumber) {
      await db.query('DELETE FROM noc_certificates WHERE certificate_number = ?', [certificateNumber]);
    }

    if (unit && unitWasOccupied !== null) {
      await db.query('UPDATE units SET is_occupied = ? WHERE id = ?', [unitWasOccupied, unit.id]);
    }

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
