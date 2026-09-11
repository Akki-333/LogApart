const db = require('../config/db');
const { recordAudit } = require('../services/audit');
const { toPaise, toRupees, periodToDate, financialYear } = require('../services/billing');
const { CATEGORIES, CATEGORY_LABELS } = require('./expenseController');

/**
 * The building's books, read two ways.
 *
 * The monthly statement is kept on a cash basis: money in is what was actually
 * received, money out is what actually left the account. A bill approved but
 * unpaid is a liability, not a movement, so it is reported separately rather
 * than folded into the closing balance.
 *
 * The budget comparison is the opposite. It runs on what was incurred, because
 * a committee that under-spends in March by paying in April has not saved
 * anything.
 */

// A part payment settles the service charges before it touches the corpus.
// Without a rule like this there is no honest way to say how much of a partial
// payment was a contribution to the building rather than a payment for a month
// of lifts and lighting.
const CORPUS_COLLECTED = `
  COALESCE(SUM(GREATEST(0, i.amount_paid - (i.total_amount - i.corpus_amount))), 0)
`;

const monthBounds = (period) => {
  const start = periodToDate(period);
  if (!start) return null;

  const [year, month] = period.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  return { start, end };
};

const yearBounds = (fy) => {
  if (!/^\d{4}-\d{4}$/.test(String(fy || ''))) return null;

  const startYear = Number(fy.slice(0, 4));
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
};

/** 1. Opening balance, what came in, what went out, closing balance. */
exports.getStatement = async (req, res) => {
  const period = req.query.period || new Date().toISOString().slice(0, 7);
  const bounds = monthBounds(period);

  if (!bounds) {
    return res.status(400).json({ success: false, message: 'Provide the month as YYYY-MM.' });
  }

  try {
    const [[before]] = await db.execute(
      `SELECT
         (SELECT COALESCE(SUM(amount), 0) FROM payment_records WHERE paid_on < ?) AS received,
         (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE paid_on IS NOT NULL AND paid_on < ?) AS spent`,
      [bounds.start, bounds.start]
    );

    const [[collected]] = await db.execute(
      'SELECT COALESCE(SUM(amount), 0) AS received, COUNT(*) AS payments FROM payment_records WHERE paid_on BETWEEN ? AND ?',
      [bounds.start, bounds.end]
    );

    const [spendRows] = await db.execute(
      `SELECT category, fund, COALESCE(SUM(amount), 0) AS spent, COUNT(*) AS bills
       FROM expenses
       WHERE paid_on BETWEEN ? AND ?
       GROUP BY category, fund`,
      [bounds.start, bounds.end]
    );

    const [[pending]] = await db.execute(
      'SELECT COALESCE(SUM(amount), 0) AS owed, COUNT(*) AS bills FROM expenses WHERE paid_on IS NULL AND bill_date <= ?',
      [bounds.end]
    );

    const [[billed]] = await db.execute(
      'SELECT COALESCE(SUM(total_amount), 0) AS billed FROM invoices WHERE period_month = ?',
      [bounds.start]
    );

    const openingPaise = toPaise(before.received) - toPaise(before.spent);
    const inPaise = toPaise(collected.received);
    const outPaise = spendRows.reduce((sum, row) => sum + toPaise(row.spent), 0);

    // Categories always come back in full, including the ones with nothing
    // against them. A line that vanishes when it reaches zero reads as an
    // oversight rather than as a month where nobody called the plumber.
    const byCategory = CATEGORIES.map((code) => {
      const rows = spendRows.filter((row) => row.category === code);
      const spentPaise = rows.reduce((sum, row) => sum + toPaise(row.spent), 0);

      return {
        category: code,
        label: CATEGORY_LABELS[code],
        spent: toRupees(spentPaise),
        bills: rows.reduce((sum, row) => sum + Number(row.bills), 0),
        share: outPaise > 0 ? Math.round((spentPaise / outPaise) * 1000) / 10 : 0
      };
    }).sort((a, b) => b.spent - a.spent);

    res.json({
      success: true,
      data: {
        period,
        from: bounds.start,
        to: bounds.end,
        opening_balance: toRupees(openingPaise),
        billed_this_month: Number(billed.billed),
        collected: toRupees(inPaise),
        payments_recorded: Number(collected.payments),
        spent: toRupees(outPaise),
        closing_balance: toRupees(openingPaise + inPaise - outPaise),
        // Approved and unpaid. Owed by the building, not yet out of the account.
        bills_outstanding: Number(pending.owed),
        bills_outstanding_count: Number(pending.bills),
        by_category: byCategory,
        by_fund: ['MAINTENANCE', 'CORPUS'].map((fund) => ({
          fund,
          spent: toRupees(
            spendRows.filter((row) => row.fund === fund).reduce((sum, row) => sum + toPaise(row.spent), 0)
          )
        }))
      }
    });
  } catch (error) {
    console.error('Error building the statement:', error);
    res.status(500).json({ success: false, message: 'Server error building the statement' });
  }
};

/** 2. The corpus, which is not the building's to spend on a normal month. */
exports.getCorpus = async (req, res) => {
  try {
    const [[billed]] = await db.query(
      `SELECT COALESCE(SUM(i.corpus_amount), 0) AS billed, ${CORPUS_COLLECTED} AS collected
       FROM invoices i WHERE i.corpus_amount > 0`
    );

    const [[spent]] = await db.query(
      "SELECT COALESCE(SUM(amount), 0) AS spent FROM expenses WHERE fund = 'CORPUS' AND paid_on IS NOT NULL"
    );

    const collectedPaise = toPaise(billed.collected);
    const spentPaise = toPaise(spent.spent);

    res.json({
      success: true,
      data: {
        billed: Number(billed.billed),
        collected: toRupees(collectedPaise),
        outstanding: toRupees(toPaise(billed.billed) - collectedPaise),
        spent: toRupees(spentPaise),
        balance: toRupees(collectedPaise - spentPaise)
      }
    });
  } catch (error) {
    console.error('Error reading the corpus:', error);
    res.status(500).json({ success: false, message: 'Server error reading the corpus' });
  }
};

/** 3. Budget against actual for a financial year, every category listed. */
exports.getBudget = async (req, res) => {
  const year = req.query.financial_year || financialYear();
  const bounds = yearBounds(year);

  if (!bounds) {
    return res.status(400).json({ success: false, message: 'Provide the financial year as 2026-2027.' });
  }

  try {
    const [budgets] = await db.execute('SELECT * FROM budgets WHERE financial_year = ?', [year]);

    // Accrual, not cash: the budget asks what the year cost, whoever paid when.
    const [actuals] = await db.execute(
      `SELECT category, COALESCE(SUM(amount), 0) AS spent
       FROM expenses WHERE bill_date BETWEEN ? AND ? GROUP BY category`,
      [bounds.start, bounds.end]
    );

    const lines = CATEGORIES.map((code) => {
      const budget = budgets.find((row) => row.category === code);
      const actual = actuals.find((row) => row.category === code);
      const budgetPaise = toPaise(budget ? budget.amount : 0);
      const spentPaise = toPaise(actual ? actual.spent : 0);

      return {
        category: code,
        label: CATEGORY_LABELS[code],
        budget: toRupees(budgetPaise),
        spent: toRupees(spentPaise),
        remaining: toRupees(budgetPaise - spentPaise),
        // Null rather than zero when nothing was budgeted, so an unbudgeted
        // category reads as unplanned rather than as perfectly on target.
        used_percent: budgetPaise > 0 ? Math.round((spentPaise / budgetPaise) * 1000) / 10 : null,
        over_budget: budgetPaise > 0 && spentPaise > budgetPaise,
        note: budget ? budget.note : null
      };
    });

    const budgetTotal = lines.reduce((sum, line) => sum + toPaise(line.budget), 0);
    const spentTotal = lines.reduce((sum, line) => sum + toPaise(line.spent), 0);

    res.json({
      success: true,
      data: {
        financial_year: year,
        from: bounds.start,
        to: bounds.end,
        lines,
        totals: {
          budget: toRupees(budgetTotal),
          spent: toRupees(spentTotal),
          remaining: toRupees(budgetTotal - spentTotal)
        }
      }
    });
  } catch (error) {
    console.error('Error reading the budget:', error);
    res.status(500).json({ success: false, message: 'Server error reading the budget' });
  }
};

/** 4. Set or replace one budget line. */
exports.setBudget = async (req, res) => {
  const { financial_year: year, category, amount, note } = req.body;

  if (!yearBounds(year)) {
    return res.status(400).json({ success: false, message: 'Provide the financial year as 2026-2027.' });
  }

  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ success: false, message: 'Choose a spending category.' });
  }

  try {
    await db.execute(
      `INSERT INTO budgets (financial_year, category, amount, note)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount), note = VALUES(note)`,
      [year, category, Number(amount), note || null]
    );

    await recordAudit(req, {
      action: 'SET_BUDGET',
      entity: 'budgets',
      entity_id: `${year}/${category}`,
      summary: `Budgeted ${amount} for ${CATEGORY_LABELS[category]} in ${year}`,
      after: { financial_year: year, category, amount: Number(amount) }
    });

    res.json({ success: true, message: 'Budget line saved.' });
  } catch (error) {
    console.error('Error saving the budget:', error);
    res.status(500).json({ success: false, message: 'Server error saving that budget line' });
  }
};

// A committee member opens this in a spreadsheet, so the escaping has to hold
// for a payee called "Sharma & Sons, Electricals".
const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** 5. The month as a spreadsheet, which is how it reaches the notice board. */
exports.exportStatement = async (req, res) => {
  const period = req.query.period || new Date().toISOString().slice(0, 7);
  const bounds = monthBounds(period);

  if (!bounds) {
    return res.status(400).json({ success: false, message: 'Provide the month as YYYY-MM.' });
  }

  try {
    const [payments] = await db.execute(
      `SELECT p.paid_on, p.receipt_number, u.number AS unit_number, p.mode, p.reference, p.amount
       FROM payment_records p
       JOIN invoices i ON p.invoice_id = i.id
       JOIN units u ON i.unit_id = u.id
       WHERE p.paid_on BETWEEN ? AND ?
       ORDER BY p.paid_on ASC, p.id ASC`,
      [bounds.start, bounds.end]
    );

    const [spends] = await db.execute(
      `SELECT paid_on, payee_name, category, fund, mode, reference, amount
       FROM expenses
       WHERE paid_on BETWEEN ? AND ?
       ORDER BY paid_on ASC, id ASC`,
      [bounds.start, bounds.end]
    );

    const rows = [
      ['LogApart statement', period],
      [],
      ['Money in'],
      ['Date', 'Receipt', 'Flat', 'Mode', 'Reference', 'Amount'],
      ...payments.map((row) => [
        row.paid_on, row.receipt_number || '', row.unit_number, row.mode, row.reference || '', Number(row.amount)
      ]),
      [],
      ['Money out'],
      ['Date', 'Payee', 'Category', 'Fund', 'Mode', 'Reference', 'Amount'],
      ...spends.map((row) => [
        row.paid_on, row.payee_name, CATEGORY_LABELS[row.category] || row.category,
        row.fund, row.mode, row.reference || '', Number(row.amount)
      ])
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="logapart-${period}.csv"`);
    res.send(rows.map((row) => row.map(csvCell).join(',')).join('\n'));
  } catch (error) {
    console.error('Error exporting the statement:', error);
    res.status(500).json({ success: false, message: 'Server error exporting the statement' });
  }
};
