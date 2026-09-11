const db = require('../config/db');

/**
 * Throttles password guessing. Nothing counted login attempts before this, so
 * twenty resident accounts sat behind an unlimited number of tries.
 *
 * Two ladders run together. An email locks after five consecutive failures and
 * the lock widens if whoever it is keeps going, which stops a single account
 * being ground down. An IP locks after enough failures across any accounts,
 * which stops one script sweeping the whole building.
 *
 * The count is failures since that email last signed in successfully, so a
 * resident who mistypes twice and then gets in starts clean.
 */

const EMAIL_LADDER = [
  { after: 10, lockSeconds: 60 * 60 },
  { after: 8, lockSeconds: 15 * 60 },
  { after: 5, lockSeconds: 5 * 60 }
];

const IP_WINDOW_MINUTES = 15;
const IP_FAILURE_LIMIT = 25;
const IP_LOCK_SECONDS = 15 * 60;

// Elapsed time is measured by MySQL, not by Node, so a clock difference between
// the two cannot shorten or extend a lock.
const EMAIL_FAILURES = `
  SELECT COUNT(*) AS failures,
         TIMESTAMPDIFF(SECOND, MAX(attempted_at), NOW()) AS since_last
  FROM login_attempts
  WHERE email = ? AND succeeded = 0
    AND attempted_at > COALESCE(
      (SELECT MAX(attempted_at) FROM login_attempts WHERE email = ? AND succeeded = 1),
      '1970-01-01 00:00:00'
    )
`;

const IP_FAILURES = `
  SELECT COUNT(*) AS failures,
         TIMESTAMPDIFF(SECOND, MAX(attempted_at), NOW()) AS since_last
  FROM login_attempts
  WHERE ip = ? AND succeeded = 0
    AND attempted_at > NOW() - INTERVAL ${IP_WINDOW_MINUTES} MINUTE
`;

const remaining = (lockSeconds, sinceLast) =>
  Math.max(0, lockSeconds - Number(sinceLast || 0));

/**
 * Returns { locked, retryAfterSeconds, reason } without revealing whether the
 * email belongs to a real account.
 */
async function checkLock(email, ip) {
  const [[byEmail]] = await db.execute(EMAIL_FAILURES, [email, email]);
  const failures = Number(byEmail.failures || 0);
  const rung = EMAIL_LADDER.find((step) => failures >= step.after);

  if (rung) {
    const retryAfterSeconds = remaining(rung.lockSeconds, byEmail.since_last);
    if (retryAfterSeconds > 0) {
      return { locked: true, retryAfterSeconds, reason: 'EMAIL', failures };
    }
  }

  const [[byIp]] = await db.execute(IP_FAILURES, [ip]);

  if (Number(byIp.failures || 0) >= IP_FAILURE_LIMIT) {
    const retryAfterSeconds = remaining(IP_LOCK_SECONDS, byIp.since_last);
    if (retryAfterSeconds > 0) {
      return { locked: true, retryAfterSeconds, reason: 'IP', failures };
    }
  }

  return { locked: false, retryAfterSeconds: 0, failures };
}

async function recordAttempt(email, ip, succeeded) {
  try {
    await db.execute(
      'INSERT INTO login_attempts (email, ip, succeeded) VALUES (?, ?, ?)',
      [String(email).slice(0, 255), String(ip || 'unknown').slice(0, 45), succeeded ? 1 : 0]
    );

    // A successful sign-in is the natural moment to sweep. Attempts older than
    // a month answer no question anyone asks.
    if (succeeded) {
      await db.execute('DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL 30 DAY');
    }
  } catch (error) {
    console.error('Could not record login attempt:', error);
  }
}

const describeWait = (seconds) => {
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? 'a minute' : `${minutes} minutes`;
};

module.exports = { checkLock, recordAttempt, describeWait };
