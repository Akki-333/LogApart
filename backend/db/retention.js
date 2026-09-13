/**
 * Removes what LogApart no longer has a reason to keep.
 *
 *   npm run db:retention              shows what would go and changes nothing
 *   npm run db:retention -- --apply   does it
 *
 * Three periods, in days, each set from the environment:
 *
 *   GATE_LOG_RETENTION_DAYS       default 365, at least 90
 *   AUDIT_IP_RETENTION_DAYS       default 180, at least 30
 *   LOGIN_ATTEMPT_RETENTION_DAYS  default  30, at least 7
 *
 * A gate record names a visitor, their phone and their vehicle. Kept forever,
 * the gate log becomes a record of everyone who ever visited every home, which
 * nobody asked for and no committee needs. The address on an activity entry is
 * the same: useful while an incident is fresh, personal data after that.
 *
 * What it never touches: the activity entries themselves and anything
 * financial. Those are the building's accounts. A visitor still marked inside
 * is kept whatever its age, because the desk has to close it first, and a pass
 * is kept until its day has passed.
 */
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const APPLY = process.argv.includes('--apply');

// A floor on each period, so a typo of 3 for 365 cannot erase a year.
function days(name, fallback, floor) {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);

  if (!Number.isInteger(value) || value < floor) {
    console.error(`${name} must be a whole number of days, at least ${floor}. It is ${raw}.`);
    process.exit(1);
  }

  return value;
}

const GATE = `status <> 'ENTERED'
  AND COALESCE(exit_time, entry_time, TIMESTAMP(expected_on)) < NOW() - INTERVAL ? DAY`;

const POLICY = [
  {
    label: 'gate records',
    verb: 'removed',
    days: days('GATE_LOG_RETENTION_DAYS', 365, 90),
    count: `SELECT COUNT(*) AS n FROM visitor_logs WHERE ${GATE}`,
    apply: `DELETE FROM visitor_logs WHERE ${GATE}`
  },
  {
    label: 'activity entry addresses',
    verb: 'cleared',
    days: days('AUDIT_IP_RETENTION_DAYS', 180, 30),
    count: 'SELECT COUNT(*) AS n FROM audit_log WHERE ip IS NOT NULL AND created_at < NOW() - INTERVAL ? DAY',
    apply: 'UPDATE audit_log SET ip = NULL WHERE ip IS NOT NULL AND created_at < NOW() - INTERVAL ? DAY'
  },
  {
    label: 'sign-in attempts',
    verb: 'removed',
    days: days('LOGIN_ATTEMPT_RETENTION_DAYS', 30, 7),
    count: 'SELECT COUNT(*) AS n FROM login_attempts WHERE attempted_at < NOW() - INTERVAL ? DAY',
    apply: 'DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL ? DAY'
  }
];

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'apartment_admin'
  });

  try {
    await connection.beginTransaction();
    const outcome = [];

    for (const rule of POLICY) {
      const [[{ n }]] = await connection.execute(rule.count, [rule.days]);
      let changed = 0;

      if (APPLY && Number(n) > 0) {
        const [result] = await connection.execute(rule.apply, [rule.days]);
        changed = result.affectedRows;
      }

      outcome.push({ label: rule.label, verb: rule.verb, days: rule.days, due: Number(n), changed });
      console.log(
        `  ${rule.label.padEnd(26)} older than ${String(rule.days).padStart(3)} days: ` +
        `${n} ${APPLY ? rule.verb : `would be ${rule.verb}`}`
      );
    }

    if (APPLY) {
      const summary = outcome.map((o) => `${o.changed} ${o.label} ${o.verb}`).join(', ');

      // The purge goes on the record like any other destructive act, inside the
      // same transaction, so a removal nobody can account for never happens.
      await connection.execute(
        `INSERT INTO audit_log (actor_id, actor_name, actor_role, action, entity, summary, after_state)
         VALUES (NULL, 'Retention job', 'SYSTEM', 'APPLY_RETENTION', 'retention', ?, ?)`,
        [`Retention: ${summary}`.slice(0, 255), JSON.stringify(outcome)]
      );

      await connection.commit();
      console.log('\nDone, and recorded in the activity log.');
    } else {
      await connection.rollback();
      console.log('\nNothing was changed. Run with --apply to do it.');
    }
  } catch (error) {
    await connection.rollback();
    console.error('Retention failed and changed nothing:', error.message);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

run();
