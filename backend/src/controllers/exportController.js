const db = require('../config/db');
const log = require('../services/log');
const { recordAudit } = require('../services/audit');
const { sendCsv } = require('../services/csv');
const { periodToDate } = require('../services/billing');
const { openBalancesByHome } = require('./billing/invoices');

/**
 * The lists a committee actually circulates, as spreadsheets: who owes, who
 * came through the gate, and which helpers turned up.
 *
 * Every one of them names people, so every export goes on the activity log,
 * like any other act that takes personal data out of the building's hands.
 */

const AGING_LABELS = {
  CURRENT: 'Not yet due',
  DAYS_1_30: '1 to 30 days',
  DAYS_31_60: '31 to 60 days',
  DAYS_61_90: '61 to 90 days',
  DAYS_90_PLUS: 'Over 90 days'
};

const MAX_GATE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);

// A real calendar day, so 2026-02-31 is refused rather than read as 3 March.
const isRealDay = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const failed = (req, res, name, error) => {
  log.error('export failed', { request_id: req.id, export: name, error });
  res.status(500).json({ success: false, message: 'Server error building that export' });
};

/** 1. Every home with a balance, longest outstanding first. */
exports.defaulters = async (req, res) => {
  try {
    const { homes } = await openBalancesByHome();
    const stamp = today();

    await recordAudit(req, {
      action: 'EXPORT_DEFAULTERS',
      entity: 'invoices',
      summary: `Exported the defaulter list, ${homes.length} homes`
    });

    sendCsv(res, `logapart-defaulters-${stamp}.csv`, [
      ['LogApart defaulters', stamp],
      [],
      ['Home', 'Floor', 'Resident', 'Phone', 'Open invoices', 'Balance', 'Days overdue', 'How long', 'Last reminded', 'Times reminded'],
      ...homes.map((home) => [
        home.unit_number,
        home.unit_floor,
        home.resident_name || '',
        home.resident_phone || '',
        home.open_invoices,
        home.balance,
        home.days_overdue,
        AGING_LABELS[home.aging_bucket] || home.aging_bucket,
        home.last_reminded_at || 'Never',
        home.times_reminded
      ])
    ]);
  } catch (error) {
    failed(req, res, 'defaulters', error);
  }
};

/** 2. Gate traffic between two days, at most a year at a time. */
exports.gateTraffic = async (req, res) => {
  const from = String(req.query.from || daysAgo(30));
  const to = String(req.query.to || today());

  if (!isRealDay(from) || !isRealDay(to) || from > to) {
    return res.status(400).json({ success: false, message: 'Give from and to as YYYY-MM-DD, with from on or before to.' });
  }

  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS >= MAX_GATE_DAYS) {
    return res.status(400).json({ success: false, message: `Export at most ${MAX_GATE_DAYS} days at a time.` });
  }

  try {
    const [rows] = await db.execute(
      `SELECT DATE_FORMAT(COALESCE(v.entry_time, v.expected_on), '%Y-%m-%d') AS day,
              DATE_FORMAT(v.entry_time, '%H:%i') AS in_at,
              DATE_FORMAT(v.exit_time, '%H:%i') AS out_at,
              u.number AS unit_number, v.visitor_name, v.visitor_phone, v.purpose, v.company,
              v.vehicle_type, v.vehicle_number, v.status, usr.name AS logged_by
       FROM visitor_logs v
       JOIN units u ON v.unit_id = u.id
       LEFT JOIN users usr ON v.logged_by_id = usr.id
       WHERE v.deleted_at IS NULL AND v.status <> 'DENIED'
         AND COALESCE(DATE(v.entry_time), v.expected_on) BETWEEN ? AND ?
       ORDER BY COALESCE(v.entry_time, v.expected_on) ASC, v.id ASC`,
      [from, to]
    );

    await recordAudit(req, {
      action: 'EXPORT_GATE_LOG',
      entity: 'visitor_logs',
      summary: `Exported ${rows.length} gate records, ${from} to ${to}`
    });

    sendCsv(res, `logapart-gate-${from}-to-${to}.csv`, [
      ['LogApart gate traffic', `${from} to ${to}`],
      [],
      ['Day', 'In', 'Out', 'Home', 'Visitor', 'Phone', 'Purpose', 'Company', 'Vehicle', 'Plate', 'Status', 'Logged by'],
      ...rows.map((row) => [
        row.day, row.in_at || '', row.out_at || '', row.unit_number, row.visitor_name, row.visitor_phone || '',
        row.purpose, row.company || '', row.vehicle_type || '', row.vehicle_number || '', row.status, row.logged_by || ''
      ])
    ]);
  } catch (error) {
    failed(req, res, 'gate', error);
  }
};

/** 3. A month of helper attendance: days present per helper, then every visit. */
exports.helperAttendance = async (req, res) => {
  const month = String(req.query.month || today().slice(0, 7));
  const start = periodToDate(month);

  if (!start) {
    return res.status(400).json({ success: false, message: 'Give the month as YYYY-MM.' });
  }

  const inMonth = 'a.check_in >= ? AND a.check_in < DATE_ADD(?, INTERVAL 1 MONTH)';

  try {
    const [present] = await db.execute(
      `SELECT h.name, h.helper_type, COUNT(DISTINCT DATE(a.check_in)) AS days_present,
              GROUP_CONCAT(DISTINCT u.number ORDER BY u.number SEPARATOR ' ') AS homes
       FROM helper_attendance a
       JOIN helpers h ON a.helper_id = h.id
       LEFT JOIN helper_units hu ON hu.helper_id = h.id
       LEFT JOIN units u ON hu.unit_id = u.id
       WHERE ${inMonth}
       GROUP BY h.id, h.name, h.helper_type
       ORDER BY h.name ASC`,
      [start, start]
    );

    const [visits] = await db.execute(
      `SELECT h.name, h.helper_type, DATE_FORMAT(a.check_in, '%Y-%m-%d') AS day,
              DATE_FORMAT(a.check_in, '%H:%i') AS in_at, DATE_FORMAT(a.check_out, '%H:%i') AS out_at,
              TIMESTAMPDIFF(MINUTE, a.check_in, a.check_out) AS minutes, usr.name AS logged_by
       FROM helper_attendance a
       JOIN helpers h ON a.helper_id = h.id
       LEFT JOIN users usr ON a.logged_by_id = usr.id
       WHERE ${inMonth}
       ORDER BY h.name ASC, a.check_in ASC`,
      [start, start]
    );

    await recordAudit(req, {
      action: 'EXPORT_HELPER_ATTENDANCE',
      entity: 'helper_attendance',
      entity_id: month,
      summary: `Exported helper attendance for ${month}, ${visits.length} visits`
    });

    sendCsv(res, `logapart-helpers-${month}.csv`, [
      ['LogApart helper attendance', month],
      [],
      ['Days present'],
      ['Helper', 'Type', 'Homes', 'Days present'],
      ...present.map((row) => [row.name, row.helper_type, row.homes || '', Number(row.days_present)]),
      [],
      ['Every visit'],
      ['Helper', 'Type', 'Day', 'In', 'Out', 'Minutes', 'Logged by'],
      ...visits.map((row) => [
        row.name, row.helper_type, row.day, row.in_at, row.out_at || '',
        row.minutes === null ? '' : Number(row.minutes), row.logged_by || ''
      ])
    ]);
  } catch (error) {
    failed(req, res, 'helper-attendance', error);
  }
};
