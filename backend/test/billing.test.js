/**
 * The billing arithmetic, tested without a server or a database.
 *
 * The live suites prove the rules hold end to end, but they need MySQL and a
 * running API, and they only ever try the handful of amounts their fixtures
 * use. This is where the edges get tried: odd paise, a zero total, the day a
 * grace period ends, the last day of March.
 *
 *   npm test
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  toPaise,
  toRupees,
  splitPaise,
  buildRunLines,
  displayStatus,
  daysOverdue,
  agingBucket,
  periodToDate,
  lateFeeFor,
  financialYear
} = require('../src/services/billing');

// A fixed "today", at midnight UTC, because the status helpers read the UTC date.
const TODAY = new Date('2026-09-13T00:00:00Z');

const unpaid = (overrides = {}) => ({
  status: 'UNPAID',
  due_date: '2026-09-03',
  total_amount: '2500.00',
  amount_paid: '0.00',
  ...overrides
});

const sum = (values) => values.reduce((total, value) => total + value, 0);

describe('toPaise and toRupees', () => {
  it('avoids the floating point drift of adding rupees directly', () => {
    assert.equal(toPaise(0.1 + 0.2), 30);
    assert.equal(toRupees(toPaise(0.1) + toPaise(0.2)), 0.3);
  });

  it('reads the strings MySQL returns for DECIMAL columns', () => {
    assert.equal(toPaise('1234.50'), 123450);
    assert.equal(toPaise(null), 0);
    assert.equal(toPaise(undefined), 0);
  });

  it('round trips', () => {
    for (const rupees of [0, 0.01, 1, 99.99, 2500, 123456.78]) {
      assert.equal(toRupees(toPaise(rupees)), rupees);
    }
  });
});

describe('splitPaise', () => {
  it('hands leftover paise to the earliest of equal weights', () => {
    assert.deepEqual(splitPaise(100001, [1, 1, 1]), [33334, 33334, 33333]);
  });

  it('hands leftover paise to the largest weight first', () => {
    assert.deepEqual(splitPaise(1001, [500, 1000, 500]), [250, 501, 250]);
  });

  it('always sums back to the amount that went in', () => {
    // A deterministic spread of awkward totals and uneven weights.
    for (let total = 1; total < 50000; total += 997) {
      for (const weights of [[1], [1, 1, 1], [650, 900, 1200, 650], [3, 7, 11, 13, 17, 19]]) {
        const shares = splitPaise(total, weights);
        assert.equal(sum(shares), total, `total ${total} over ${weights}`);
        assert.ok(shares.every((share) => Number.isInteger(share) && share >= 0));
      }
    }
  });

  it('returns zeros rather than dividing by nothing', () => {
    assert.deepEqual(splitPaise(0, [1, 2]), [0, 0]);
    assert.deepEqual(splitPaise(500, [0, 0]), [0, 0]);
    assert.deepEqual(splitPaise(500, []), []);
  });
});

describe('buildRunLines', () => {
  const homes = [
    { unit_id: 1, number: 'A', area: 1000, resident_user_id: 7 },
    { unit_id: 2, number: 'B', area: 500, resident_user_id: null },
    { unit_id: 3, number: 'C', area: 500 }
  ];

  it('prices a fixed rate with an equal split of the common bills', () => {
    const { lines, totals } = buildRunLines(homes, {
      maintenanceRate: 2500,
      commonElectricityTotal: 1000,
      commonWaterTotal: 300.01
    });

    assert.deepEqual(lines.map((line) => line.electricity_amount), [333.34, 333.33, 333.33]);
    assert.deepEqual(lines.map((line) => line.water_amount), [100.01, 100, 100]);
    assert.equal(totals.units_billed, 3);
    assert.equal(totals.electricity_total, 1000);
    assert.equal(totals.water_total, 300.01);
    assert.equal(totals.total_billed, 8800.01);
    assert.equal(lines[1].resident_user_id, null);
    assert.equal(lines[2].resident_user_id, null);
  });

  it('prices by square foot and splits by area', () => {
    const { lines } = buildRunLines(homes, {
      maintenanceRate: 3,
      rateBasis: 'PER_SQFT',
      commonElectricityTotal: 2000,
      splitBasis: 'PER_SQFT'
    });

    assert.deepEqual(lines.map((line) => line.maintenance_amount), [3000, 1500, 1500]);
    assert.deepEqual(lines.map((line) => line.electricity_amount), [1000, 500, 500]);
  });

  it('charges the same corpus to every home whatever its size', () => {
    const { lines, totals } = buildRunLines(homes, { corpusRate: 500, rateBasis: 'PER_SQFT', maintenanceRate: 1 });

    assert.deepEqual(lines.map((line) => line.corpus_amount), [500, 500, 500]);
    assert.equal(totals.corpus_total, 1500);
  });

  it('refuses to guess a missing area', () => {
    assert.throws(
      () => buildRunLines([...homes, { unit_id: 4, number: 'D', area: null }], { rateBasis: 'PER_SQFT' }),
      (error) => error.code === 'MISSING_AREA' && error.units.join() === 'D'
    );
  });

  it('does not need an area for a fixed rate and an equal split', () => {
    assert.doesNotThrow(() => buildRunLines([{ unit_id: 9, number: 'Z', area: null }], { maintenanceRate: 10 }));
  });
});

describe('displayStatus and daysOverdue', () => {
  it('derives OVERDUE from the due date', () => {
    assert.equal(displayStatus(unpaid(), TODAY), 'OVERDUE');
    assert.equal(daysOverdue(unpaid(), TODAY), 10);
  });

  it('is not overdue on the due date itself', () => {
    const dueToday = unpaid({ due_date: '2026-09-13' });
    assert.equal(displayStatus(dueToday, TODAY), 'UNPAID');
    assert.equal(daysOverdue(dueToday, TODAY), 0);
  });

  it('keeps the stored status before the due date', () => {
    const partial = unpaid({ status: 'PARTIAL', due_date: '2026-09-30' });
    assert.equal(displayStatus(partial, TODAY), 'PARTIAL');
    assert.equal(daysOverdue(partial, TODAY), 0);
  });

  it('never calls a paid invoice overdue', () => {
    const paid = unpaid({ status: 'PAID', due_date: '2026-01-01' });
    assert.equal(displayStatus(paid, TODAY), 'PAID');
    assert.equal(daysOverdue(paid, TODAY), 0);
  });
});

describe('agingBucket', () => {
  it('puts each boundary day in the bucket the defaulter list promises', () => {
    const expected = [
      [-3, 'CURRENT'], [0, 'CURRENT'], [1, 'DAYS_1_30'], [30, 'DAYS_1_30'],
      [31, 'DAYS_31_60'], [60, 'DAYS_31_60'], [61, 'DAYS_61_90'], [90, 'DAYS_61_90'],
      [91, 'DAYS_90_PLUS'], [400, 'DAYS_90_PLUS']
    ];

    for (const [days, bucket] of expected) assert.equal(agingBucket(days), bucket, `${days} days`);
  });
});

describe('periodToDate', () => {
  it('turns a billing month into the first of that month', () => {
    assert.equal(periodToDate('2026-09'), '2026-09-01');
    assert.equal(periodToDate('2026-12'), '2026-12-01');
  });

  it('refuses anything that is not a real YYYY-MM', () => {
    for (const bad of ['2026-00', '2026-13', '2026-9', '26-09', '2026-09-01', '', null, undefined, 202609]) {
      assert.equal(periodToDate(bad), null, String(bad));
    }
  });
});

describe('lateFeeFor', () => {
  const flat = { basis: 'FLAT', amount: 100, graceDays: 5 };

  it('charges nothing inside the grace period, including its last day', () => {
    assert.equal(lateFeeFor(unpaid({ due_date: '2026-09-08' }), flat, TODAY), 0);
    assert.equal(lateFeeFor(unpaid({ due_date: '2026-09-07' }), flat, TODAY), 100);
  });

  it('charges a percentage of what is still outstanding, not of the bill', () => {
    const fee = lateFeeFor(unpaid({ amount_paid: '500.00' }), { basis: 'PERCENT', amount: 2 }, TODAY);
    assert.equal(fee, 40);
  });

  it('rounds a percentage to the paisa', () => {
    const fee = lateFeeFor(unpaid({ total_amount: '33.33' }), { basis: 'PERCENT', amount: 1.5 }, TODAY);
    assert.equal(fee, 0.5);
  });

  it('respects the cap', () => {
    assert.equal(lateFeeFor(unpaid(), { basis: 'PERCENT', amount: 10, maxAmount: 30 }, TODAY), 30);
    assert.equal(lateFeeFor(unpaid(), { basis: 'FLAT', amount: 100, maxAmount: 0 }, TODAY), 100);
  });

  it('charges nothing once the balance is cleared, whatever the stored status', () => {
    assert.equal(lateFeeFor(unpaid({ amount_paid: '2500.00' }), flat, TODAY), 0);
    assert.equal(lateFeeFor(unpaid({ status: 'PAID' }), flat, TODAY), 0);
  });

  it('charges nothing with no rule', () => {
    assert.equal(lateFeeFor(unpaid(), undefined, TODAY), 0);
  });
});

describe('financialYear', () => {
  it('starts the year in April', () => {
    assert.equal(financialYear('2026-03-31'), '2025-2026');
    assert.equal(financialYear('2026-04-01'), '2026-2027');
    assert.equal(financialYear('2027-01-15'), '2026-2027');
  });

  it('accepts a Date', () => {
    assert.equal(financialYear(new Date(2026, 8, 13)), '2026-2027');
  });
});
