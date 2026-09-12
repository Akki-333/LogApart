/**
 * Live-API checks for Phase 5: the expense ledger, vendors and contracts, the
 * monthly statement, budget against actual, receipts, late fees, reminders and
 * payments a resident declares.
 *
 * Start the server, then: npm run verify:finances
 *
 * Everything the run creates is tagged and removed on the way out. Two rules
 * matter. The billing run uses a period no real month will collide with, and
 * every late fee and reminder call is scoped to that period, so the suite can
 * never charge or chase a real home.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const ROOT = process.env.API_URL || 'http://localhost:5000';
const API = `${ROOT}/api`;
const PASSWORD = 'Verify!123';
const tag = `p5-${Date.now()}`;

// Long past, so every invoice it raises is overdue and late fees have something
// to bite on. No real building was running LogApart in 2019.
const PERIOD = '2019-01';
const DUE_DATE = '2019-01-10';

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

const money = (value) => Number(Number(value).toFixed(2));
async function run() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const hash = await bcrypt.hash(PASSWORD, 10);
  const created = [];
  let runId = null;
  let vendorId = null;
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
    const resident = await makeUser('RESIDENT', 'r');
    const neighbour = await makeUser('RESIDENT', 'n');

    const [freeUnits] = await db.query(
      `SELECT u.id, u.number, u.is_occupied FROM units u
       LEFT JOIN residents r ON r.unit_id = u.id AND r.is_active = true
       WHERE r.id IS NULL ORDER BY u.id LIMIT 1`
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
    const residentToken = await login(resident.email);
    const neighbourToken = await login(neighbour.email);

    // 1. Vendors and the contracts that lapse.
    let res = await call(adminToken, '/finance/vendors', {
      method: 'POST',
      body: JSON.stringify({ name: `Otis Lifts ${tag}`, service: 'Lifts', phone: '9000000000' })
    });
    check('a vendor can be added to the registry', res.status === 200 && Boolean(res.body.data?.id), JSON.stringify(res.body));
    vendorId = res.body.data?.id;

    res = await call(adminToken, '/finance/vendors', {
      method: 'POST',
      body: JSON.stringify({ name: `Otis Lifts ${tag}`, service: 'Lifts' })
    });
    check('the same vendor cannot be added twice', res.status === 409, String(res.status));

    // Ends inside its own reminder window, so it should be flagged for renewal.
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    res = await call(adminToken, '/finance/contracts', {
      method: 'POST',
      body: JSON.stringify({
        vendor_id: vendorId, title: `Lift AMC ${tag}`,
        start_date: '2026-01-01', end_date: soon, amount: 48000, remind_days_before: 30
      })
    });
    check('a contract can be recorded', res.status === 200, JSON.stringify(res.body));

    res = await call(adminToken, '/finance/contracts', {
      method: 'POST',
      body: JSON.stringify({
        vendor_id: vendorId, title: `Backwards ${tag}`,
        start_date: '2026-06-01', end_date: '2026-01-01', amount: 100
      })
    });
    check('a contract cannot end before it starts', res.status === 400, String(res.status));

    res = await call(adminToken, '/finance/contracts/expiring');
    const expiring = (res.body.data || []).find((row) => row.title === `Lift AMC ${tag}`);
    check('a contract inside its reminder window is flagged', Boolean(expiring), JSON.stringify(res.body.data?.length));
    check('the flagged contract says how long is left', expiring && expiring.days_remaining > 0 && expiring.needs_renewal);

    res = await call(residentToken, '/finance/vendors');
    check('a resident cannot read the vendor registry', res.status === 403);
    // 2. The expense ledger.
    res = await call(adminToken, '/finance/expenses', {
      method: 'POST',
      body: JSON.stringify({
        vendor_id: vendorId, category: 'LIFT_AMC', amount: 18000,
        bill_date: '2019-01-05', paid_on: '2019-01-06', mode: 'BANK_TRANSFER',
        reference: `INV-${tag}`, note: `Quarterly service ${tag}`
      })
    });
    check('an expense can be recorded against a vendor', res.status === 200, JSON.stringify(res.body));
    const paidExpenseId = res.body.data?.id;

    res = await call(adminToken, '/finance/expenses', {
      method: 'POST',
      body: JSON.stringify({
        payee_name: `Sharma Plumbing ${tag}`, category: 'REPAIRS', amount: 2500,
        bill_date: '2019-01-20'
      })
    });
    check('an expense can name a payee with no vendor record', res.status === 200, JSON.stringify(res.body));

    res = await call(adminToken, '/finance/expenses', {
      method: 'POST',
      body: JSON.stringify({ category: 'NONSENSE', amount: 100, bill_date: '2019-01-20', payee_name: 'x' })
    });
    check('an unknown spending category is refused', res.status === 400, String(res.status));

    res = await call(adminToken, `/finance/expenses?from=2019-01-01&to=2019-01-31`);
    const ledger = res.body.data || [];
    check('the ledger lists what was spent', ledger.length >= 2, String(ledger.length));
    check('an unpaid bill is reported apart from a settled one', Number(res.body.totals.unpaid) >= 2500, JSON.stringify(res.body.totals));
    check('the vendor name travels with the expense', ledger.some((row) => row.vendor_name === `Otis Lifts ${tag}`));
    check('every category comes back for the form', (res.body.categories || []).length === 10, String((res.body.categories || []).length));

    res = await call(adminToken, '/finance/expenses?category=REPAIRS&from=2019-01-01&to=2019-01-31');
    check('the ledger filters by category', (res.body.data || []).every((row) => row.category === 'REPAIRS'));

    // An expense pointed at a ticket is how a repair gets its real cost.
    const [ticket] = await db.execute(
      `INSERT INTO maintenance_tickets (unit_id, scope, title, description, category, created_by_id)
       VALUES (?, 'UNIT', ?, 'Tap leaking', 'PLUMBING', ?)`,
      [unit.id, `Leak ${tag}`, admin.id]
    );

    res = await call(adminToken, '/finance/expenses', {
      method: 'POST',
      body: JSON.stringify({
        payee_name: `Sharma Plumbing ${tag}`, category: 'REPAIRS', amount: 1400,
        bill_date: '2019-01-22', paid_on: '2019-01-22', ticket_id: ticket.insertId
      })
    });
    check('an expense can settle a maintenance ticket', res.status === 200, JSON.stringify(res.body));

    res = await call(adminToken, `/finance/expenses/ticket/${ticket.insertId}`);
    check('the ticket reports what it cost', money(res.body.total) === 1400, JSON.stringify(res.body.total));

    res = await call(adminToken, `/finance/expenses/${paidExpenseId}`, {
      method: 'DELETE', body: JSON.stringify({})
    });
    check('removing an expense without a reason is refused', res.status === 400, String(res.status));

    // 3. A dues run that also collects a corpus contribution.
    res = await call(adminToken, '/billing/runs/preview', {
      method: 'POST',
      body: JSON.stringify({ period: PERIOD, due_date: DUE_DATE, maintenance_rate: 2000, corpus_rate: 500 })
    });
    check('the preview prices a corpus line', res.status === 200 && money(res.body.data.totals.corpus_total) > 0, JSON.stringify(res.body.data?.totals));

    res = await call(adminToken, '/billing/runs', {
      method: 'POST',
      body: JSON.stringify({
        period: PERIOD, due_date: DUE_DATE, maintenance_rate: 2000, corpus_rate: 500,
        common_electricity_total: 3333.33, note: `Verification ${tag}`
      })
    });
    check('the run commits', res.status === 200 && Boolean(res.body.data?.run_id), JSON.stringify(res.body));
    runId = res.body.data?.run_id;

    const [ourInvoices] = await db.execute(
      'SELECT * FROM invoices WHERE billing_run_id = ? AND unit_id = ?',
      [runId, unit.id]
    );
    const invoice = ourInvoices[0];
    check('the home was billed', Boolean(invoice));
    check('the corpus is its own line on the invoice', money(invoice.corpus_amount) === 500, String(invoice.corpus_amount));

    const [[billedTotals]] = await db.execute(
      `SELECT SUM(maintenance_amount + electricity_amount + water_amount + corpus_amount) AS parts,
              SUM(total_amount) AS total
       FROM invoices WHERE billing_run_id = ?`,
      [runId]
    );
    check('every invoice line adds up to its total', money(billedTotals.parts) === money(billedTotals.total), JSON.stringify(billedTotals));

    // 4. Receipts.
    res = await call(adminToken, `/billing/invoices/${invoice.id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount: 1000, mode: 'UPI', reference: `UPI-${tag}`, paid_on: '2019-01-15' })
    });
    check('a part payment is recorded', res.status === 200, JSON.stringify(res.body));
    check('the payment is given a receipt number', /^RCP-\d{4}-\d{4}$/.test(res.body.data?.receipt_number || ''), res.body.data?.receipt_number);
    const firstReceipt = res.body.data.receipt_number;

    res = await call(adminToken, `/billing/invoices/${invoice.id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount: 500, mode: 'CASH', paid_on: '2019-01-16' })
    });
    check('a second payment gets a different receipt', res.body.data?.receipt_number !== firstReceipt, res.body.data?.receipt_number);

    res = await call(adminToken, `/billing/invoices/${invoice.id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount: 999999 })
    });
    check('a payment beyond the balance is refused', res.status === 400, String(res.status));

    // 5. Late fees, priced before they are charged.
    res = await call(adminToken, '/billing/late-fees/preview', {
      method: 'POST',
      body: JSON.stringify({ period: PERIOD, basis: 'PERCENT', amount: 2, grace_days: 5 })
    });
    check('late fees can be priced first', res.status === 200 && (res.body.data.lines || []).length > 0, JSON.stringify(res.body.data?.chargeable));
    const previewed = res.body.data.lines.find((line) => line.invoice_id === invoice.id);
    check('the preview shows the fee for our home', Boolean(previewed && previewed.fee > 0), JSON.stringify(previewed));

    const beforeTotal = money(invoice.total_amount);
    res = await call(adminToken, '/billing/late-fees', {
      method: 'POST',
      body: JSON.stringify({ period: PERIOD, basis: 'PERCENT', amount: 2, grace_days: 5 })
    });
    check('the fees are charged', res.status === 200 && res.body.data.charged > 0, JSON.stringify(res.body));

    const [[afterFee]] = await db.execute('SELECT total_amount FROM invoices WHERE id = ?', [invoice.id]);
    check('the bill moved by the fee', money(afterFee.total_amount) === money(beforeTotal + previewed.fee), `${afterFee.total_amount} vs ${beforeTotal + previewed.fee}`);

    res = await call(adminToken, `/billing/invoices/${invoice.id}/adjustments`);
    check('the fee left an explanation behind', (res.body.data || []).some((row) => row.kind === 'LATE_FEE'), JSON.stringify(res.body.data));

    res = await call(adminToken, '/billing/late-fees', {
      method: 'POST',
      body: JSON.stringify({ period: PERIOD, basis: 'PERCENT', amount: 2, grace_days: 5 })
    });
    check('a second run the same month charges nobody twice', res.body.data.charged === 0, JSON.stringify(res.body.data));

    // 6. A waiver reduces the bill whichever sign was typed.
    res = await call(adminToken, `/billing/invoices/${invoice.id}/adjustments`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'WAIVER', amount: 200, reason: `Goodwill ${tag}` })
    });
    check('a waiver is accepted', res.status === 200, JSON.stringify(res.body));

    const [[afterWaiver]] = await db.execute('SELECT total_amount FROM invoices WHERE id = ?', [invoice.id]);
    check('the waiver took money off the bill', money(afterWaiver.total_amount) === money(Number(afterFee.total_amount) - 200), String(afterWaiver.total_amount));

    res = await call(adminToken, `/billing/invoices/${invoice.id}/adjustments`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'WAIVER', amount: 999999, reason: `Too much ${tag}` })
    });
    check('a waiver cannot fall below what is already paid', res.status === 400, String(res.status));

    res = await call(adminToken, `/billing/invoices/${invoice.id}/adjustments`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'WAIVER', amount: 100 })
    });
    check('an adjustment without a reason is refused', res.status === 400, String(res.status));

    // 7. The statement, which has to match the bank.
    res = await call(adminToken, `/finance/statement?period=${PERIOD}`);
    const statement = res.body.data;
    check('the statement reads back', res.status === 200 && Boolean(statement), JSON.stringify(res.body));
    check(
      'closing equals opening plus what came in less what went out',
      money(statement.closing_balance) === money(statement.opening_balance + statement.collected - statement.spent),
      JSON.stringify(statement)
    );
    check('an approved but unpaid bill is not counted as spent', Number(statement.bills_outstanding) > 0, String(statement.bills_outstanding));
    check('every category is listed, including the empty ones', statement.by_category.length === 10, String(statement.by_category.length));
    check(
      'the category shares add up to the whole',
      Math.abs(statement.by_category.reduce((sum, row) => sum + row.share, 0) - 100) < 0.5,
      String(statement.by_category.reduce((sum, row) => sum + row.share, 0))
    );
    check('the fund split separates corpus from maintenance', statement.by_fund.length === 2);

    res = await call(adminToken, `/finance/statement/export?period=${PERIOD}`);
    check('the statement exports as a spreadsheet', (res.headers.get('content-type') || '').includes('text/csv'), res.headers.get('content-type'));
    check('the export carries both halves of the ledger', String(res.body.raw).includes('Money in') && String(res.body.raw).includes('Money out'));

    // 8. Budget against actual.
    res = await call(adminToken, '/finance/budget', {
      method: 'POST',
      body: JSON.stringify({ financial_year: '2018-2019', category: 'REPAIRS', amount: 3000, note: `Plan ${tag}` })
    });
    check('a budget line can be set', res.status === 200, JSON.stringify(res.body));

    res = await call(adminToken, '/finance/budget', {
      method: 'POST',
      body: JSON.stringify({ financial_year: '2018-2019', category: 'REPAIRS', amount: 3500 })
    });
    check('setting the same line again replaces it', res.status === 200);

    res = await call(adminToken, '/finance/budget?financial_year=2018-2019');
    const repairs = (res.body.data.lines || []).find((line) => line.category === 'REPAIRS');
    check('the budget reads back the replacement figure', money(repairs.budget) === 3500, String(repairs.budget));
    check('actual spend is measured against it', money(repairs.spent) === 3900, String(repairs.spent));
    check('an over-spent line says so', repairs.over_budget === true, JSON.stringify(repairs));
    const unbudgeted = res.body.data.lines.find((line) => line.category === 'GARDENING');
    check('an unbudgeted category reads as unplanned, not on target', unbudgeted.used_percent === null);

    res = await call(adminToken, '/finance/budget?financial_year=nonsense');
    check('a malformed financial year is refused', res.status === 400, String(res.status));

    // 9. The corpus, which is not the building's to spend on a normal month.
    res = await call(adminToken, '/finance/corpus');
    check('the corpus reads back', res.status === 200 && Number(res.body.data.billed) > 0, JSON.stringify(res.body.data));
    check(
      'the corpus balance is what was collected less what was spent from it',
      money(res.body.data.balance) === money(res.body.data.collected - res.body.data.spent),
      JSON.stringify(res.body.data)
    );

    // 10. Chasing the homes that are behind, one resident at a time.
    res = await call(adminToken, '/billing/reminders', {
      method: 'POST',
      body: JSON.stringify({ period: PERIOD })
    });
    check('reminders go out', res.status === 200 && res.body.data.reminded > 0, JSON.stringify(res.body));

    const [reminderRows] = await db.execute(
      'SELECT * FROM dues_reminders WHERE invoice_id = ?',
      [invoice.id]
    );
    check('the reminder is on the record', reminderRows.length === 1, String(reminderRows.length));
    check('the record says how far behind the home was', Number(reminderRows[0].days_overdue) > 0);

    res = await call(residentToken, '/notifications');
    const theirs = (res.body.data || []).find((row) => row.title.includes(`home ${unit.number}`));
    check('the resident is told', Boolean(theirs), JSON.stringify((res.body.data || []).map((r) => r.title)));

    res = await call(neighbourToken, '/notifications');
    check(
      'no other resident learns who is behind',
      !(res.body.data || []).some((row) => row.title.includes(`home ${unit.number}`)),
      JSON.stringify((res.body.data || []).map((r) => r.title))
    );

    // 11. A payment the resident declares, which moves nothing on its own.
    const [[beforeDeclaring]] = await db.execute('SELECT amount_paid, total_amount FROM invoices WHERE id = ?', [invoice.id]);

    res = await call(residentToken, '/resident/declarations', {
      method: 'POST',
      body: JSON.stringify({ invoice_id: invoice.id, amount: 300, mode: 'UPI', reference: `UPI2-${tag}`, paid_on: '2019-01-18' })
    });
    check('a resident can declare a payment', res.status === 200, JSON.stringify(res.body));
    const declarationId = res.body.data?.id;

    const [[afterDeclaring]] = await db.execute('SELECT amount_paid FROM invoices WHERE id = ?', [invoice.id]);
    check('declaring does not move the balance', money(afterDeclaring.amount_paid) === money(beforeDeclaring.amount_paid), String(afterDeclaring.amount_paid));

    res = await call(residentToken, '/resident/declarations', {
      method: 'POST',
      body: JSON.stringify({ invoice_id: invoice.id, amount: 100, mode: 'UPI', paid_on: '2019-01-18' })
    });
    check('a second open declaration on the same bill is refused', res.status === 409, String(res.status));

    res = await call(neighbourToken, '/resident/declarations', {
      method: 'POST',
      body: JSON.stringify({ invoice_id: invoice.id, amount: 100, mode: 'UPI', paid_on: '2019-01-18' })
    });
    check('a resident cannot declare against another home', res.status === 404, String(res.status));

    res = await call(adminToken, '/billing/declarations?status=PENDING');
    check('the admin sees it waiting', (res.body.data || []).some((row) => row.id === declarationId));

    res = await call(adminToken, `/billing/declarations/${declarationId}/review`, {
      method: 'POST',
      body: JSON.stringify({ approve: true })
    });
    check('verifying it records the money', res.status === 200 && Boolean(res.body.data?.receipt_number), JSON.stringify(res.body));

    const [[afterVerifying]] = await db.execute('SELECT amount_paid FROM invoices WHERE id = ?', [invoice.id]);
    check(
      'the balance moves only once an admin agrees',
      money(afterVerifying.amount_paid) === money(Number(beforeDeclaring.amount_paid) + 300),
      String(afterVerifying.amount_paid)
    );

    res = await call(adminToken, `/billing/declarations/${declarationId}/review`, {
      method: 'POST',
      body: JSON.stringify({ approve: true })
    });
    check('the same declaration cannot be verified twice', res.status === 409, String(res.status));

    res = await call(residentToken, '/resident/invoices');
    const theirInvoice = (res.body.data.invoices || []).find((row) => row.id === invoice.id);
    check('the resident can see their receipts', (theirInvoice.payments || []).every((p) => Boolean(p.receipt_number)), JSON.stringify(theirInvoice.payments));
    check('the resident can see why the bill changed', (theirInvoice.adjustments || []).some((a) => a.kind === 'LATE_FEE'), JSON.stringify(theirInvoice.adjustments));

    res = await call(residentToken, '/resident/declarations');
    check('the resident can see what came of their declaration', (res.body.data || []).some((row) => row.status === 'VERIFIED'));

  } finally {
    // Everything this run created, and nothing else. Removing the billing run
    // cascades its invoices and with them the payments, adjustments,
    // declarations and reminders raised against them.
    if (runId) {
      await db.query('DELETE FROM billing_runs WHERE id = ?', [runId]);
    }

    await db.query('DELETE FROM expenses WHERE payee_name LIKE ? OR note LIKE ? OR reference LIKE ?', [`%${tag}%`, `%${tag}%`, `%${tag}%`]);
    await db.query('DELETE FROM vendors WHERE name LIKE ?', [`%${tag}%`]);
    await db.query("DELETE FROM budgets WHERE financial_year = '2018-2019'");
    await db.query('DELETE FROM maintenance_tickets WHERE title LIKE ?', [`%${tag}%`]);
    await db.query('DELETE FROM notifications WHERE title LIKE ? OR message LIKE ?', [`%${tag}%`, `%${tag}%`]);
    await db.query('DELETE FROM audit_log WHERE actor_name LIKE ? OR summary LIKE ?', [`%${tag}%`, `%${tag}%`]);
    await db.query('DELETE FROM login_attempts WHERE email LIKE ?', [`${tag}%`]);

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
    console.log(`
${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  })
  .catch((error) => {
    console.error('Verification could not run:', error.message);
    process.exit(1);
  });
