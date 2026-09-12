/**
 * Billing arithmetic, kept apart from HTTP so the numbers can be reasoned about
 * on their own.
 *
 * All internal maths runs in paise as integers. Splitting a common bill across
 * homes in floating point loses fractions of a rupee, and over a year of runs
 * the building's books stop reconciling. Every split here sums back exactly to
 * the amount that went in.
 */

const toPaise = (rupees) => Math.round(Number(rupees || 0) * 100);
const toRupees = (paise) => Number((paise / 100).toFixed(2));

/**
 * Divides totalPaise across the given weights, handing out the leftover paise
 * one at a time so the parts always add up to the whole.
 *
 * Weights are home counts for an equal split, or square footage for a
 * proportional one.
 */
function splitPaise(totalPaise, weights) {
  if (weights.length === 0 || totalPaise <= 0) {
    return weights.map(() => 0);
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  if (totalWeight <= 0) {
    return weights.map(() => 0);
  }

  const shares = weights.map((w) => Math.floor((totalPaise * w) / totalWeight));
  let remainder = totalPaise - shares.reduce((sum, s) => sum + s, 0);

  // Largest weights absorb the odd paise, so the biggest home rounds up first.
  const order = weights
    .map((weight, index) => ({ weight, index }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  let cursor = 0;
  while (remainder > 0) {
    shares[order[cursor % order.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }

  return shares;
}

/**
 * Builds the invoice lines for one billing run.
 *
 * units:  [{ unit_id, number, area, resident_user_id }]
 * config: { maintenanceRate, rateBasis, corpusRate, commonElectricityTotal,
 *           commonWaterTotal, splitBasis }
 *
 * Returns { lines, totals } or throws when a per-square-foot basis is asked for
 * and some home has no recorded area, since guessing an area would silently
 * misbill somebody.
 */
function buildRunLines(units, config) {
  const {
    maintenanceRate = 0,
    rateBasis = 'FLAT',
    // A corpus contribution is the same figure from every home whatever its
    // size, because it buys a share of the building rather than a service.
    corpusRate = 0,
    commonElectricityTotal = 0,
    commonWaterTotal = 0,
    splitBasis = 'EQUAL'
  } = config;

  const needsArea = rateBasis === 'PER_SQFT' || splitBasis === 'PER_SQFT';

  if (needsArea) {
    const missing = units.filter((u) => !u.area || Number(u.area) <= 0);

    if (missing.length > 0) {
      const error = new Error(
        `Set a carpet area for ${missing.map((u) => u.number).join(', ')} before billing by square foot.`
      );
      error.code = 'MISSING_AREA';
      error.units = missing.map((u) => u.number);
      throw error;
    }
  }

  const weights = splitBasis === 'PER_SQFT' ? units.map((u) => Number(u.area)) : units.map(() => 1);

  const electricityShares = splitPaise(toPaise(commonElectricityTotal), weights);
  const waterShares = splitPaise(toPaise(commonWaterTotal), weights);

  const lines = units.map((unit, index) => {
    const maintenancePaise =
      rateBasis === 'PER_SQFT'
        ? Math.round(toPaise(maintenanceRate) * Number(unit.area))
        : toPaise(maintenanceRate);

    const corpusPaise = toPaise(corpusRate);
    const totalPaise = maintenancePaise + electricityShares[index] + waterShares[index] + corpusPaise;

    return {
      unit_id: unit.unit_id,
      unit_number: unit.number,
      resident_user_id: unit.resident_user_id || null,
      maintenance_amount: toRupees(maintenancePaise),
      electricity_amount: toRupees(electricityShares[index]),
      water_amount: toRupees(waterShares[index]),
      corpus_amount: toRupees(corpusPaise),
      total_amount: toRupees(totalPaise)
    };
  });

  const totals = {
    units_billed: lines.length,
    maintenance_total: toRupees(lines.reduce((sum, l) => sum + toPaise(l.maintenance_amount), 0)),
    electricity_total: toRupees(electricityShares.reduce((sum, s) => sum + s, 0)),
    water_total: toRupees(waterShares.reduce((sum, s) => sum + s, 0)),
    corpus_total: toRupees(lines.reduce((sum, l) => sum + toPaise(l.corpus_amount), 0)),
    total_billed: toRupees(lines.reduce((sum, l) => sum + toPaise(l.total_amount), 0))
  };

  return { lines, totals };
}

/**
 * What an invoice looks like to a reader today. OVERDUE is never stored, since
 * a stored value would need a nightly job to stay true.
 */
function displayStatus(invoice, today = new Date()) {
  if (invoice.status === 'PAID') return 'PAID';

  const due = new Date(invoice.due_date);
  const isPastDue = due < new Date(today.toISOString().slice(0, 10));

  if (isPastDue) return 'OVERDUE';

  return invoice.status;
}

/** Whole days an unpaid invoice is past its due date, else 0. */
function daysOverdue(invoice, today = new Date()) {
  if (invoice.status === 'PAID') return 0;

  const due = new Date(invoice.due_date);
  const now = new Date(today.toISOString().slice(0, 10));
  const diff = Math.floor((now - due) / (1000 * 60 * 60 * 24));

  return diff > 0 ? diff : 0;
}

/** Aging bucket used by the defaulter list. */
function agingBucket(days) {
  if (days <= 0) return 'CURRENT';
  if (days <= 30) return 'DAYS_1_30';
  if (days <= 60) return 'DAYS_31_60';
  if (days <= 90) return 'DAYS_61_90';
  return 'DAYS_90_PLUS';
}

/** First day of the month for a 'YYYY-MM' input, as a MySQL DATE string. */
function periodToDate(period) {
  if (!/^\d{4}-\d{2}$/.test(String(period || ''))) return null;

  const [year, month] = period.split('-').map(Number);
  if (month < 1 || month > 12) return null;

  return `${period}-01`;
}

/**
 * What a late fee comes to on one overdue invoice.
 *
 * The fee is computed here and then raised as a real adjustment row, never
 * derived on read. A charge a resident can see on Monday and not on Tuesday is
 * not a charge, it is a rumour.
 *
 * rule: { basis: 'FLAT' | 'PERCENT', amount, graceDays, maxAmount }
 */
function lateFeeFor(invoice, rule, today = new Date()) {
  const { basis = 'FLAT', amount = 0, graceDays = 0, maxAmount = 0 } = rule || {};
  const overdue = daysOverdue(invoice, today);

  if (overdue <= Number(graceDays)) return 0;

  const outstandingPaise = toPaise(invoice.total_amount) - toPaise(invoice.amount_paid);

  if (outstandingPaise <= 0) return 0;

  const feePaise =
    basis === 'PERCENT'
      ? Math.round((outstandingPaise * Number(amount)) / 100)
      : toPaise(amount);

  const cappedPaise = Number(maxAmount) > 0 ? Math.min(feePaise, toPaise(maxAmount)) : feePaise;

  return toRupees(Math.max(0, cappedPaise));
}

/**
 * The Indian financial year a date falls in, as '2026-2027'. April starts it,
 * so a bill dated March belongs to the year that began the previous April.
 */
function financialYear(date = new Date()) {
  const when = typeof date === 'string' ? new Date(`${date}T00:00:00`) : date;
  const year = when.getFullYear();
  const startYear = when.getMonth() >= 3 ? year : year - 1;

  return `${startYear}-${startYear + 1}`;
}

module.exports = {
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
};
