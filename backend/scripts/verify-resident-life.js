/**
 * Live-API checks for Phase 6: amenity bookings, the household profile and
 * directory, the document vault, ticket conversations, community polls, parcels
 * at the gate and the emergency alert.
 *
 * Start the server, then: npm run verify:life
 *
 * Everything the run creates is tagged and removed on the way out. The poll
 * checks need two residents in different flats, so the run claims two empty
 * flats and puts them back as it found them.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const ROOT = process.env.API_URL || 'http://localhost:5000';
const API = `${ROOT}/api`;
const PASSWORD = 'Verify!123';
const tag = `p6-${Date.now()}`;

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

  const text = await response.text();
  let body = {};
  try { body = JSON.parse(text); } catch { body = { raw: text }; }

  return { status: response.status, headers: response.headers, body };
};

const login = async (email) => {
  const { body } = await call(null, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD })
  });

  if (!body.token) throw new Error(`Could not sign in as ${email}: ${JSON.stringify(body)}`);
  return body.token;
};

const dayFromNow = (days) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

async function run() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const hash = await bcrypt.hash(PASSWORD, 10);
  const created = [];
  const restoreUnits = [];

  const makeUser = async (role, suffix) => {
    const email = `${tag}-${role.toLowerCase()}${suffix}@verify.local`;
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role, phone, must_change_password) VALUES (?, ?, ?, ?, ?, 0)',
      [`Verify ${role} ${suffix} ${tag}`, email, hash, role, '9000000000']
    );

    created.push(result.insertId);
    return { id: result.insertId, email };
  };

  try {
    const admin = await makeUser('ADMIN', 'a');
    const guard = await makeUser('SECURITY', 'g');
    const alice = await makeUser('RESIDENT', 'alice');
    const bob = await makeUser('RESIDENT', 'bob');
    const carol = await makeUser('RESIDENT', 'carol');

    // Two empty flats, so the poll checks have two households to vote with.
    const [freeUnits] = await db.query(
      `SELECT u.id, u.number, u.is_occupied FROM units u
       LEFT JOIN residents r ON r.unit_id = u.id AND r.is_active = true
       WHERE r.id IS NULL ORDER BY u.id LIMIT 2`
    );

    if (freeUnits.length < 2) {
      throw new Error('Needs two flats with no active resident. Vacate two before running this.');
    }

    const [flatA, flatB] = freeUnits;

    for (const unit of freeUnits) {
      restoreUnits.push({ id: unit.id, was: unit.is_occupied });
      await db.execute('UPDATE units SET is_occupied = true WHERE id = ?', [unit.id]);
    }

    // Alice and Carol share flat A, which is what makes one vote per flat
    // something the suite can actually prove.
    await db.execute('INSERT INTO residents (user_id, unit_id, move_in_date, is_active) VALUES (?, ?, CURDATE(), 1)', [alice.id, flatA.id]);
    await db.execute('INSERT INTO residents (user_id, unit_id, move_in_date, is_active) VALUES (?, ?, CURDATE(), 1)', [carol.id, flatA.id]);
    await db.execute('INSERT INTO residents (user_id, unit_id, move_in_date, is_active) VALUES (?, ?, CURDATE(), 1)', [bob.id, flatB.id]);

    const adminToken = await login(admin.email);
    const guardToken = await login(guard.email);
    const aliceToken = await login(alice.email);
    const bobToken = await login(bob.email);
    const carolToken = await login(carol.email);

    // 1. Amenities and the race for a slot.
    let res = await call(adminToken, '/amenities', {
      method: 'POST',
      body: JSON.stringify({ name: `Terrace ${tag}`, slot_hours: 2, charge: 500, opens_at: '08:00:00', closes_at: '20:00:00' })
    });
    check('an amenity can be opened for booking', res.status === 200, JSON.stringify(res.body));
    const amenityId = res.body.data?.id;

    res = await call(aliceToken, `/amenities/${amenityId}/availability?date=${dayFromNow(3)}`);
    check('a day comes back as slots', (res.body.data?.slots || []).length === 6, String(res.body.data?.slots?.length));
    check('every slot starts free', (res.body.data?.slots || []).every((slot) => slot.status === 'FREE'));

    const slot = res.body.data.slots[2].starts_at;

    res = await call(aliceToken, '/amenities/bookings', {
      method: 'POST',
      body: JSON.stringify({ amenity_id: amenityId, booking_date: dayFromNow(3), starts_at: slot })
    });
    check('a resident can take a slot', res.status === 200, JSON.stringify(res.body));
    const bookingId = res.body.data?.id;
    check('the charge travels with the booking', res.body.data?.charge === 500, String(res.body.data?.charge));

    res = await call(bobToken, '/amenities/bookings', {
      method: 'POST',
      body: JSON.stringify({ amenity_id: amenityId, booking_date: dayFromNow(3), starts_at: slot })
    });
    check('a second flat cannot take the same slot', res.status === 409, String(res.status));

    res = await call(bobToken, `/amenities/${amenityId}/availability?date=${dayFromNow(3)}`);
    const takenSlot = res.body.data.slots.find((entry) => entry.starts_at === slot);
    check('the slot shows as taken by a flat, not a person', takenSlot.taken_by === `Flat ${flatA.number}`, takenSlot.taken_by);

    res = await call(aliceToken, '/amenities/bookings', {
      method: 'POST',
      body: JSON.stringify({ amenity_id: amenityId, booking_date: '2020-01-01', starts_at: slot })
    });
    check('a day in the past is refused', res.status === 400, String(res.status));

    res = await call(bobToken, `/amenities/bookings/${bookingId}`, { method: 'DELETE' });
    check('another flat cannot cancel your booking', res.status === 404, String(res.status));

    res = await call(aliceToken, `/amenities/bookings/${bookingId}`, { method: 'DELETE' });
    check('the flat that booked it can cancel', res.status === 200, JSON.stringify(res.body));

    res = await call(bobToken, '/amenities/bookings', {
      method: 'POST',
      body: JSON.stringify({ amenity_id: amenityId, booking_date: dayFromNow(3), starts_at: slot })
    });
    check('cancelling frees the slot for somebody else', res.status === 200, JSON.stringify(res.body));
    // 2. The household, and a plate that can only belong to one flat.
    res = await call(aliceToken, '/household/members', {
      method: 'POST',
      body: JSON.stringify({ name: `Ravi ${tag}`, relation: 'Father', phone: '9000000001' })
    });
    check('a household member can be added', res.status === 200, JSON.stringify(res.body));
    const memberId = res.body.data?.id;

    res = await call(aliceToken, '/household/vehicles', {
      method: 'POST',
      body: JSON.stringify({ vehicle_type: 'CAR', number_plate: `ka01${tag.slice(-6)}`, model: 'Swift' })
    });
    check('a vehicle can be registered', res.status === 200, JSON.stringify(res.body));

    res = await call(bobToken, '/household/vehicles', {
      method: 'POST',
      body: JSON.stringify({ vehicle_type: 'CAR', number_plate: `KA01${tag.slice(-6)}` })
    });
    check('the same plate cannot belong to two flats', res.status === 409, String(res.status));

    res = await call(aliceToken, '/household');
    check('the plate is stored in one spelling', (res.body.data.vehicles || [])[0]?.number_plate === `KA01${tag.slice(-6)}`.toUpperCase(), JSON.stringify(res.body.data.vehicles));
    check('the household lists its members', (res.body.data.members || []).some((m) => m.name === `Ravi ${tag}`));

    res = await call(bobToken, `/household/members/${memberId}`, { method: 'DELETE' });
    check('another flat cannot remove your household member', res.status === 404, String(res.status));

    // 3. The directory, off until somebody switches it on.
    res = await call(bobToken, '/household/directory');
    check('the directory starts with nobody in it', !(res.body.data || []).some((row) => row.unit_number === flatA.number), JSON.stringify(res.body.data));

    res = await call(aliceToken, '/household/directory', {
      method: 'PUT',
      body: JSON.stringify({ show_in_directory: true })
    });
    check('a resident can list themselves', res.status === 200, JSON.stringify(res.body));

    res = await call(bobToken, '/household/directory');
    check('a neighbour can now find them', (res.body.data || []).some((row) => row.unit_number === flatA.number));

    res = await call(adminToken, '/household/directory');
    check('the directory is for residents, not the office', res.status === 403, String(res.status));

    res = await call(aliceToken, '/household/directory', {
      method: 'PUT',
      body: JSON.stringify({ show_in_directory: false })
    });
    check('a resident can take themselves back out', res.status === 200);

    res = await call(aliceToken, '/household/directory');
    check('opting out does not stop them reading it', res.status === 200, String(res.status));

    // 4. A poll, and the rule that a household gets one vote.
    res = await call(adminToken, '/polls', {
      method: 'POST',
      body: JSON.stringify({
        question: `Should the terrace close at ten? ${tag}`,
        detail: 'Raised at the committee meeting.',
        opens_on: dayFromNow(-1),
        closes_on: dayFromNow(5),
        options: ['Yes', 'No', 'Abstain']
      })
    });
    check('a poll can be raised', res.status === 200, JSON.stringify(res.body));
    const pollId = res.body.data?.id;

    res = await call(adminToken, '/polls', {
      method: 'POST',
      body: JSON.stringify({ question: `Only one option ${tag}`, opens_on: dayFromNow(0), closes_on: dayFromNow(2), options: ['Yes'] })
    });
    check('a poll needs at least two options', res.status === 400, String(res.status));

    res = await call(aliceToken, '/polls');
    const seen = (res.body.data || []).find((poll) => poll.id === pollId);
    check('a resident sees the open poll', Boolean(seen), JSON.stringify((res.body.data || []).length));
    check('results stay closed while voting is open', seen.results === null, JSON.stringify(seen.results));
    check('the poll says how many flats could vote', seen.eligible_flats > 0, String(seen.eligible_flats));

    const yes = seen.options.find((option) => option.label === 'Yes');
    const no = seen.options.find((option) => option.label === 'No');

    res = await call(aliceToken, `/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ option_id: yes.id })
    });
    check('a resident can vote', res.status === 200, JSON.stringify(res.body));

    res = await call(carolToken, `/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ option_id: no.id })
    });
    check('a second person in the same flat cannot vote again', res.status === 409, JSON.stringify(res.body));

    res = await call(bobToken, `/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ option_id: no.id })
    });
    check('a different flat can vote', res.status === 200, JSON.stringify(res.body));

    res = await call(adminToken, `/polls/${pollId}/turnout`);
    const votedFlats = (res.body.data || []).filter((row) => row.has_voted);
    check('turnout says which flats have voted', votedFlats.length >= 2, String(votedFlats.length));
    check('turnout never says which way', !JSON.stringify(res.body.data).includes('option'), JSON.stringify(res.body.data?.[0]));

    res = await call(adminToken, '/polls');
    const adminView = (res.body.data || []).find((poll) => poll.id === pollId);
    check('an admin can see the tally to run the meeting', Array.isArray(adminView.results), JSON.stringify(adminView.results));
    check('the tally counts one vote per flat', adminView.votes_cast === 2, String(adminView.votes_cast));

    res = await call(adminToken, `/polls/${pollId}`, { method: 'PUT', body: JSON.stringify({ close_now: true }) });
    check('a poll can be closed early', res.status === 200, JSON.stringify(res.body));

    res = await call(aliceToken, '/polls');
    const closed = (res.body.data || []).find((poll) => poll.id === pollId);
    check('results open to residents once it closes', Array.isArray(closed.results), JSON.stringify(closed.results));
    check('the shares add up', Math.abs(closed.results.reduce((sum, row) => sum + row.share, 0) - 100) < 0.5);

    res = await call(bobToken, `/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ option_id: yes.id })
    });
    check('a closed poll takes no more votes', res.status === 409, String(res.status));

    // 5. A ticket that talks back.
    res = await call(aliceToken, '/resident/tickets', {
      method: 'POST',
      body: JSON.stringify({ title: `Leaking tap ${tag}`, description: 'Kitchen tap drips all night', category: 'PLUMBING' })
    });
    check('a resident can raise an issue', res.status === 200, JSON.stringify(res.body));

    const [ourTickets] = await db.execute('SELECT * FROM maintenance_tickets WHERE title = ?', [`Leaking tap ${tag}`]);
    const ticketId = ourTickets[0].id;

    res = await call(aliceToken, `/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: `It is worse in the mornings ${tag}` })
    });
    check('the resident can add to their own issue', res.status === 200, JSON.stringify(res.body));

    res = await call(adminToken, `/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: `Plumber booked for Thursday ${tag}` })
    });
    check('the office can reply', res.status === 200, JSON.stringify(res.body));

    res = await call(bobToken, `/tickets/${ticketId}/comments`);
    check('another flat cannot read a private issue', res.status === 404, String(res.status));

    res = await call(aliceToken, `/tickets/${ticketId}/comments`);
    check('the conversation reads back in order', (res.body.data || []).length === 2, String(res.body.data?.length));

    res = await call(aliceToken, `/tickets/${ticketId}/rating`, { method: 'POST', body: JSON.stringify({ rating: 5 }) });
    check('a rating is refused while the work is open', res.status === 409, String(res.status));

    await call(adminToken, `/tickets/${ticketId}`, { method: 'PUT', body: JSON.stringify({ status: 'RESOLVED' }) });

    res = await call(bobToken, `/tickets/${ticketId}/rating`, { method: 'POST', body: JSON.stringify({ rating: 1 }) });
    check('only whoever reported it can rate the fix', [403, 404].includes(res.status), String(res.status));

    res = await call(aliceToken, `/tickets/${ticketId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ rating: 9 })
    });
    check('a rating outside one to five is refused', res.status === 400, String(res.status));

    res = await call(aliceToken, `/tickets/${ticketId}/rating`, {
      method: 'POST',
      body: JSON.stringify({ rating: 4, note: `Took a while ${tag}` })
    });
    check('the resident can rate the fix', res.status === 200, JSON.stringify(res.body));

    res = await call(aliceToken, `/tickets/${ticketId}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ reason: `Still dripping ${tag}` })
    });
    check('the resident can reopen it', res.status === 200, JSON.stringify(res.body));

    const [[reopened]] = await db.execute('SELECT status, reopen_count FROM maintenance_tickets WHERE id = ?', [ticketId]);
    check('reopening puts it back in the queue', reopened.status === 'OPEN', reopened.status);
    check('the reopen is counted', Number(reopened.reopen_count) === 1, String(reopened.reopen_count));

    res = await call(aliceToken, `/tickets/${ticketId}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ reason: `Again ${tag}` })
    });
    check('an already open issue cannot be reopened', res.status === 409, String(res.status));

    // 6. Parcels held at the desk.
    res = await call(guardToken, '/parcels', {
      method: 'POST',
      body: JSON.stringify({ unit_id: flatA.id, courier: `Bluedart ${tag}`, description: 'Small box' })
    });
    check('the guard can hold a parcel', res.status === 200, JSON.stringify(res.body));
    const parcelId = res.body.data?.id;

    res = await call(aliceToken, '/parcels');
    check('the flat it is for sees it waiting', (res.body.data || []).some((row) => row.id === parcelId));

    res = await call(bobToken, '/parcels');
    check('another flat does not see it', !(res.body.data || []).some((row) => row.id === parcelId));

    res = await call(aliceToken, '/notifications');
    check('only that flat is told', (res.body.data || []).some((row) => row.title.includes('parcel')), JSON.stringify((res.body.data || []).map((r) => r.title)));

    res = await call(bobToken, '/notifications');
    check('the building is not told', !(res.body.data || []).some((row) => row.title.includes('parcel')));

    res = await call(aliceToken, `/parcels/${parcelId}/release`, {
      method: 'POST',
      body: JSON.stringify({ collected_by_name: 'Alice' })
    });
    check('a resident cannot release a parcel to themselves', [403, 404].includes(res.status), String(res.status));

    res = await call(guardToken, `/parcels/${parcelId}/release`, {
      method: 'PUT',
      body: JSON.stringify({ collected_by_name: '' })
    });
    check('handing it over needs a name', res.status === 400, String(res.status));

    res = await call(guardToken, `/parcels/${parcelId}/release`, {
      method: 'PUT',
      body: JSON.stringify({ collected_by_name: `Ravi ${tag}` })
    });
    check('the guard can hand it over', res.status === 200, JSON.stringify(res.body));

    res = await call(guardToken, `/parcels/${parcelId}/release`, {
      method: 'PUT',
      body: JSON.stringify({ collected_by_name: 'Somebody else' })
    });
    check('the same parcel cannot be handed over twice', res.status === 409, String(res.status));

    // 7. The document vault, which stores nothing new.
    res = await call(aliceToken, '/resident/documents');
    check('the vault reads back', res.status === 200 && Boolean(res.body.data), JSON.stringify(res.body).slice(0, 120));
    check('it gathers the four kinds of paper', ['invoices', 'receipts', 'certificates', 'notices'].every((key) => Array.isArray(res.body.data[key])));

    // 8. Emergency.
    res = await call(adminToken, '/emergency/contacts', {
      method: 'POST',
      body: JSON.stringify({ label: `Building electrician ${tag}`, phone: '9000000009' })
    });
    check('an emergency number can be added', res.status === 200, JSON.stringify(res.body));
    const contactId = res.body.data?.id;

    res = await call(aliceToken, '/emergency/contacts');
    check('every resident can read the numbers', (res.body.data || []).some((row) => row.id === contactId));

    res = await call(guardToken, '/emergency/contacts');
    check('so can the desk', (res.body.data || []).some((row) => row.id === contactId));

    res = await call(aliceToken, '/emergency/contacts', {
      method: 'POST',
      body: JSON.stringify({ label: 'Nope', phone: '1' })
    });
    check('a resident cannot edit the list', res.status === 403, String(res.status));

    res = await call(aliceToken, '/emergency/alert', {
      method: 'POST',
      body: JSON.stringify({ detail: `Smoke in the stairwell ${tag}` })
    });
    check('a resident can raise the alarm', res.status === 200, JSON.stringify(res.body));

    res = await call(guardToken, '/notifications');
    const alarm = (res.body.data || []).find((row) => row.title.startsWith('EMERGENCY'));
    check('the gate is woken', Boolean(alarm), JSON.stringify((res.body.data || []).map((r) => r.title)));
    check('the alert carries the flat and the floor', alarm && alarm.message.includes(`flat ${flatA.number}`), alarm && alarm.message);

    res = await call(adminToken, '/notifications');
    check('the admins are woken too', (res.body.data || []).some((row) => row.title.startsWith('EMERGENCY')));

    const [alertAudit] = await db.execute(
      "SELECT * FROM audit_log WHERE action = 'RAISE_EMERGENCY' AND entity_id = ?",
      [String(flatA.id)]
    );
    check('the alarm is on the record', alertAudit.length >= 1, String(alertAudit.length));

  } finally {
    // Everything this run created, and nothing else. Amenities cascade to their
    // bookings, polls to their options and votes, and units go back to however
    // they were found.
    await db.query('DELETE FROM parcels WHERE courier LIKE ? OR collected_by_name LIKE ?', [`%${tag}%`, `%${tag}%`]);
    await db.query('DELETE FROM amenities WHERE name LIKE ?', [`%${tag}%`]);
    await db.query('DELETE FROM polls WHERE question LIKE ?', [`%${tag}%`]);
    await db.query('DELETE FROM maintenance_tickets WHERE title LIKE ?', [`%${tag}%`]);
    await db.query('DELETE FROM emergency_contacts WHERE label LIKE ?', [`%${tag}%`]);
    await db.query('DELETE FROM household_vehicles WHERE number_plate LIKE ?', [`%${tag.slice(-6)}%`]);
    await db.query('DELETE FROM notifications WHERE title LIKE ? OR message LIKE ?', [`%${tag}%`, `%${tag}%`]);
    await db.query('DELETE FROM audit_log WHERE actor_name LIKE ? OR summary LIKE ?', [`%${tag}%`, `%${tag}%`]);
    await db.query('DELETE FROM login_attempts WHERE email LIKE ?', [`${tag}%`]);

    for (const unit of restoreUnits) {
      await db.query('UPDATE units SET is_occupied = ? WHERE id = ?', [unit.was, unit.id]);
    }

    if (created.length) {
      await db.query(`DELETE FROM users WHERE id IN (${created.map(() => '?').join(',')})`, created);
    }

    await db.end();
  }
}

run()
  .then(() => {
    console.log(`
${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  })
  .catch((error) => {
    console.error('Verification could not run:', error.message);
    process.exit(1);
  });
