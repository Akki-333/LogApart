# LogApart

LogApart is a comprehensive, role-based management system for a residential society, built to modernize how a building handles resident tracking, structural maintenance, and gate security.

Designed with a focus on usability, it abandons the "one-size-fits-all" dashboard approach in favor of a **Dual Portal Architecture**. The application provides deep, data-rich oversight for Super Admins while delivering a highly focused, high-contrast, distraction-free interface for Security Guards operating at the gate.

---

## 🏗 Architecture & Tech Stack

- **Frontend:** React + Vite, Tailwind CSS, Context API (State Management)
- **Backend:** Node.js, Express.js
- **Database:** MySQL
- **Authentication:** JWT (JSON Web Tokens) with role-based routing

---

## 🚀 Key Features (Phases 1-5)

### 1. Dual Portal Routing Engine
The core routing engine securely parses JWT tokens and automatically routes users to their purpose-built portal based on their database role (`ADMIN`, `SECURITY`, `RESIDENT`).

### 2. Super Admin Portal (Command Center)
Designed for the building President / Secretary to oversee operations.
- **Visual Unit Heatmap:** A visual grid mapping out 4 floors (20 units total, A-E) displaying real-time occupancy status, with a Dues mode for money owed.
- **Structural Maintenance Kanban:** A ticketing system for building maintenance. A ticket belongs either to a home or to the common area, so a stuck lift or a failed pump is filed against the building and its location rather than against somebody's home. Tickets feature automated SLA countdown timers.
- **Gate Oversight (Read-Only):** Admins have full visibility into the real-time security gate logs, but are restricted to a "Read-Only" mode to prevent interference with active guard tracking.

### 3. Security Guard Portal (Gatekeeper)
Designed for iPad/Tablet usage at the main gate.
- **High-Contrast UI:** Stripped of complex menus, prioritizing massive, touch-friendly buttons for rapid entry processing.
- **Live Gate Log:** A real-time table displaying currently active visitors, pinning them to the top with a pulsing "INSIDE" indicator.
- **Instant Checkout:** 1-click checkout flow automatically records exit timestamps and dynamically updates the "Currently Inside" active counters.

---

## 🛠 Local Setup & Installation

### Prerequisites
- Node.js (v18+)
- MySQL (v8.x) running locally

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Fill in your MySQL credentials in `.env`, then generate a signing secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste it as `JWT_SECRET`. The server refuses to start without one, so a missing
secret fails loudly instead of silently falling back to a guessable default.

Create the database, apply the schema, and seed it:

```bash
npm run db:setup
```

`db:setup` runs `db/schema.sql` and every file in `db/migrations` in order,
tracking what it applied in the `schema_migrations` table, then seeds 20 units,
an admin, and a guard. Both scripts are safe to re-run. The seed prints a
one-time password for each account it creates, or you can set
`SEED_ADMIN_PASSWORD` and `SEED_GUARD_PASSWORD` beforehand.

Start the API:

```bash
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The app runs at `http://localhost:5173`. `VITE_API_URL` in `.env` points it at
the API, and `CORS_ORIGIN` in the backend `.env` must match the origin the app
is served from.

---

## 🐳 Running in containers

`docker-compose.yml` at the repository root runs MySQL, the API and the app.
Put a `.env` beside it with `DB_ROOT_PASSWORD`, `DB_PASSWORD`, `JWT_SECRET`,
`CORS_ORIGIN` (the public address the app is served from) and `VITE_API_URL`
(the public address of the API). Compose refuses to start if any is missing.

```bash
docker compose up -d --build
docker compose run --rm api node db/migrate.js
docker compose run --rm api node db/seed.js
```

The app is served on port 8080 and the API on 5000. The API answers
`/api/health` while the process is up and `/api/health/ready` once it can reach
the database, and writes one JSON log line per request with its request id.

## 🧹 Retention and exports

Gate records name visitors, their phones and their vehicles, so LogApart does
not keep them forever. `npm run db:retention` in `backend/` shows what the
policy would remove; `npm run db:retention -- --apply` removes it:

- **Gate records:** past 365 days. A visitor still inside is never removed.
- **Addresses on activity entries:** cleared after 180 days. The entry itself
  stays.
- **Sign-in attempts:** past 30 days.

Set `GATE_LOG_RETENTION_DAYS`, `AUDIT_IP_RETENTION_DAYS` and
`LOGIN_ATTEMPT_RETENTION_DAYS` to change the periods. Each has a floor, so a
typo cannot erase a year. Run it from a scheduler once a month.

Admins can download the defaulter list, gate traffic and helper attendance as
CSV. Every export is recorded in the activity log, and text that a spreadsheet
would run as a formula is written as plain text.

## 🔐 Roles & Access

Authorisation is enforced by the API, not by the interface. Every route below
`/api` other than `/api/auth` runs behind `protect` and `requirePasswordSet`,
and each route declares the roles it accepts.

| Endpoint group | Admin | Security | Resident |
| :--- | :---: | :---: | :---: |
| `GET /api/dashboard/stats` | ✅ | ❌ | ❌ |
| `GET /api/units` | ✅ | ✅ | ❌ |
| `POST /api/units/assign`, `/vacate`, resident edits | ✅ | ❌ | ❌ |
| `GET /api/tickets` and ticket writes | ✅ | ❌ | ❌ |
| `/api/billing/*` runs, invoices, payments | ✅ | ❌ | ❌ |
| `/api/resident/*` own dues, issues, gate, passes | ❌ | ❌ | ✅ |
| Gate pass lookup and admit | ❌ | ✅ | ❌ |
| `GET /api/helpers`, check in and out | 👁️ | ✅ | 👁️ own home |
| Helper registry writes | ✅ | ❌ | ❌ |
| `GET /api/notices`, acknowledge | ✅ | ✅ | ✅ |
| Posting and withdrawing notices | ✅ | ❌ | ❌ |
| Parking bays and violations | ✅ | 👁️ + log | ❌ |
| `/api/staff/*` roster, attendance, pay | ✅ | ❌ | ❌ |
| `GET /api/security/visitors` | ✅ | ✅ | ❌ |
| Gate writes: log, edit, checkout, delete | ❌ | ✅ | ❌ |
| `GET /api/notifications` | ✅ | ✅ | ✅ |
| `GET /api/audit` activity trail | ✅ | ❌ | ❌ |
| `/api/finance/*` expenses, vendors, statement, budget | ✅ | ❌ | ❌ |
| Late fees, adjustments, reminders, declaration review | ✅ | ❌ | ❌ |
| `/api/resident/declarations` declare a payment made | ❌ | ❌ | ✅ |
| Re-issue a resident one-time password | ✅ | ❌ | ❌ |
| `/api/auth/me`, `/api/auth/change-password` | ✅ | ✅ | ✅ |

Admin gate access is read-only on purpose, so the portal cannot interfere with
live tracking at the desk. The guard reads units only to fill the "visiting
home" dropdown.

### One-time passwords

Onboarding a resident creates their account with a randomly generated password,
returned once to the admin as `temp_password` so it can be passed on. The account
is flagged `must_change_password`, and until it is replaced the API answers every
request outside `/api/auth` with `403 PASSWORD_CHANGE_REQUIRED`. The app routes
those users to the change-password screen and nowhere else.

---

## 🔒 Trust and accountability

Three things were true of the system until Phase 4, and all three are now closed.

**Nobody counted sign-in attempts.** Twenty resident accounts sat behind an
unlimited number of guesses. Failures since an account last signed in
successfully now lock it on a widening ladder, five minutes at first and an hour
once someone is clearly grinding, and enough failures from one address lock that
address across every account. A throttled attempt is deliberately not counted,
because a lock that any passer-by could extend forever is a way to shut a
neighbour out rather than a defence.

**A token outlived the permission it carried.** The role rode inside a JWT valid
for a day, and nothing re-read the account, so demoting an admin or moving a
resident out changed nothing until it expired. Every account carries a token
version that the token repeats back, and a mismatch ends the session on the next
request. Changing a password bumps it, which signs out everyone else holding the
old one. Moving out bumps it and closes the account when the person has no other
home. Role and password state are read from the row, so a change lands
immediately rather than tomorrow.

**Nothing was audited.** A guard could delete the record that someone was in the
building. An admin could withdraw a month of dues, waive a balance on a clearance
certificate, and record a payment that never arrived. Each of those now writes an
`audit_log` row holding the actor, the action, what it looked like before and
after, and the address it came from, inside the same transaction as the act
itself. The Activity screen reads it back, paged by id so nothing shifts under a
reader, and the API offers no way to write to it.

A gate record is no longer destroyed. Removing one needs a stated reason, takes
it off the desk, and leaves it in the building record with who withdrew it and
why.

### Password recovery

Onboarding used to be the only thing that ever issued a password, so a resident
who forgot theirs was locked out for good. An admin can now re-issue a one-time
password from the home panel. It needs a reason, ends every session on the
account, forces a change at the next sign-in, and lands in the activity log.

---

## 💰 Billing Engine

Dues are raised a month at a time. An admin sets the maintenance charge and
enters what the building was billed for shared electricity and water, and
LogApart raises one invoice per occupied home.

- **Charges are itemised.** Maintenance, the common electricity share and the
  common water share are stored separately, so a resident sees what they are
  paying for rather than one opaque figure.
- **Splits reconcile exactly.** All arithmetic runs in integer paise, and the
  leftover paise from a division are handed out one at a time to the largest
  homes. A shared bill always sums back to the amount that went in.
- **Two bases.** Maintenance can be a fixed rate per home or a rate per square
  foot, and a common bill can be split equally or in proportion to carpet area.
  A per-square-foot basis is refused when any home has no recorded area, rather
  than guessing and quietly misbilling someone.
- **Nothing is written until it is seen.** The generate form prices every line
  on the server and shows the full table before it will commit.
- **A ledger, not a gateway.** Dues are settled over UPI, cash, transfer or
  cheque and then recorded here, with mode, reference and date. Part payments
  are supported, and a payment that would exceed the balance is refused.
- **Overdue is derived, never stored.** It is computed from the due date on
  read, so no nightly job is needed to keep it true.
- **Clearance is gated on the ledger.** A move-out certificate used to assert
  zero dues as fixed text. It now reads the real balance and refuses to issue
  while one is open, unless an admin records an explicit waiver and reason.
  Certificates are stored with a number, the amount outstanding at issue, and
  any waiver.

The heatmap on the Residents screen has a Dues mode: green for clear, amber for
owing but still in time, red once past the due date.

---

## 📒 The Books

The ledger used to record money coming in and nothing going out, so it could not
answer the question a committee is actually asked at the annual meeting.

- **An expense ledger.** Every bill the building pays, under a category and a
  fund head, naming a vendor from the registry or just a payee. A bill can point
  at the maintenance ticket it settles, which is how a repair finally gets its
  real cost. A bill approved but not yet paid is reported as owed rather than
  spent.
- **Vendors and contracts.** A lift AMC lapsing unnoticed is found out by the
  lift. Each contract carries its end date and its own reminder window, and
  anything inside that window leads the admin dashboard. Days remaining are
  counted by the database, so a machine in another timezone cannot make a
  contract look a day longer than it is.
- **A monthly statement on a cash basis.** Opening balance, what came in, what
  went out by category, closing balance, exportable as a spreadsheet. Approved
  but unpaid bills are held apart so the closing figure still matches the bank.
- **Budget against actual on an accrual basis.** The opposite basis on purpose: a
  committee that underspends in March by paying in April has saved nobody
  anything, so the bill date is what counts. Every category is listed, and one
  with no budget reads as unplanned rather than as perfectly on target.
- **A corpus kept apart.** A contribution towards the building is collected as
  its own invoice line, the same figure from every home whatever its size. A part
  payment settles the service charges before it touches the corpus, which is the
  only honest way to say how much of it has actually been contributed.

### Late fees, receipts and reminders

- **A late fee is raised, never implied.** It is priced on the same code path
  that charges it, so the table the admin approves is what happens. It moves what
  the home owes and leaves an adjustment row behind as the explanation. One fee
  per invoice per calendar month, so clicking twice cannot double a bill.
- **A waiver reduces the bill whichever sign was typed**, and cannot take it
  below what has already been paid.
- **Every payment issues a receipt**, numbered per year under a row lock, visible
  to the resident on the bill it settled.
- **A reminder reaches one resident.** Telling every resident who is late is a
  notice board, not a reminder, so a notification can now be addressed to a
  person rather than a role. Who was chased, and when, is kept.

### Payments a resident declares

Paying by UPI took ten seconds and then a week of reminding somebody to write it
down. A resident can now tell the building what they paid, with the amount, mode,
reference and date. It never moves the balance on its own: it waits in a queue
until an admin confirms it against the account, and confirming it settles the
invoice exactly as recording one by hand does, receipt included. A refusal has to
carry a reason, and the resident is told either way.

---

## 🏠 Resident Portal

Residents get four screens, each scoped to their own home by the server. Every
handler resolves the caller's active unit before touching anything, so one
resident can never read or change another's records.

- **Home.** What they owe, open issues, and guests expected at the gate.
- **My Dues.** Every bill raised for the home, itemised into maintenance and
  their share of the common electricity and water, with the payments recorded
  against each one.
- **Report an Issue.** Structural and shared problems only. Priority is set by
  the admin rather than the reporter, so the SLA clock cannot be set from the
  portal; everything arrives as MEDIUM for triage.
- **My Gate.** Visitors logged against the home, and pre-approved guest passes.

### Pre-approved visitors

A resident expecting someone creates a pass and gets a six-character code. The
`visitor_logs` status enum already carried `PENDING`, `APPROVED` and `DENIED`
from the original design but nothing wrote them; a pass is now an approved row
raised before the visitor arrives.

The guard types the code at the gate, sees who it belongs to and which home
approved it, and admits the guest without ringing the home. A pass works once,
cannot be reused or admitted twice, and the resident can cancel it any time
before the visitor arrives. Codes leave out `O`, `0`, `I` and `1`, since they are
read aloud and typed at a gate.

---

## 🧹 Community & Operations

Four day-to-day modules share one admin screen, since an admin moves between
them in a single sitting.

### Daily helpers

Maids, cooks, drivers and milkmen are recurring people, not visitors. One maid
across three homes generates more gate events in a month than every delivery
combined, so they live in their own registry rather than the visitor log.

A helper is registered once and linked to every home they work for. At the gate
the guard taps their name to check them in, and each of those homes is told
their help has arrived. Attendance is kept per arrival, not per home.

### Notices

The community banner on the admin dashboard used to be a hardcoded paragraph
about water tank cleaning. Notices are now real records with a life: they go up
on a start date, optionally come down on an end date, can be addressed to
everyone or just residents or just security, and readers can confirm they have
seen them. The admin sees how many of the intended audience have.

### Parking

Bays are recorded against the building and allotted to homes, with the
registered vehicle on each. A guard who finds an unfamiliar car logs it against
the bay, and the response says how many times that plate has been reported
before. The car registered to a bay can never be a violation in its own bay.

### Staff and attendance

Guards, cleaners and the maintenance crew sit in their own table rather than in
`users`, because a cleaner belongs on the payroll without ever needing a login.
Attendance is one row per person per day, and marking the same day again
corrects it instead of adding a second row. Monthly pay is computed from
attendance rather than stored: a half day counts half, leave counts full, an
absence counts none. The figure is indicative and the admin still signs it off.

---

## 🧾 Two defects carried since the first commit

Both were fixed after the roadmap closed, in migration `005`.

**Every ticket required a home.** `maintenance_tickets.unit_id` was `NOT NULL`
and every query inner-joined `units`, so a lift breakdown, a failed water pump
or a dead hallway light had to be blamed on somebody's unit. That contradicted
the structural-and-common scope the ticket system was built for, and the inner
join meant a common fault with no home would have been invisible on the admin
dashboard. A ticket now carries a scope and, when it is common, a location such
as Lift A or the basement pump room. Residents see their own home's tickets plus
every common one, so they can tell the lift is already reported rather than
filing it again.

**Notification read state was shared.** `notifications.is_read` was a single
flag on the notification, so the first admin to open the bell cleared the badge
for every other admin. Reads now live in `notification_reads`, one row per person
per notification, and the unread count is computed per reader over everything
addressed to them rather than only the twenty most recent.

---

## 🗺 Roadmap

- **Phase 0 — Foundation (done).** Role enforcement in the API, schema and seed
  committed to the repository, environment-driven configuration, one-time
  passwords, and a resident portal shell so residents stop landing on the admin
  dashboard.
- **Phase 1 — Billing engine (done).** Monthly dues runs, pro-rata splitting of
  the common electricity and water bill, a payment ledger, a collection dashboard
  with aging buckets, a dues mode for the building heatmap, and clearance
  certificates gated on real outstanding dues.
- **Phase 2 — Resident portal (done).** Own dues and payment history, raising
  and tracking structural issues, gate activity for your own home, and
  pre-approved visitor passes redeemed at the guard desk.
- **Phase 4 — Trust and accountability (done).** Throttled sign-in, revocable
  tokens, an audit trail behind money and access, gate records withdrawn rather
  than destroyed, admin-issued password recovery, security headers, a body cap
  and one request validator. Verified by `npm run verify:trust`.
- **Phase 5 — Building finances (done).** An expense ledger by category and fund,
  a vendor registry with contracts that warn before they lapse, a cash-basis
  monthly statement with a CSV export, budget against actual for the financial
  year, a corpus kept apart from maintenance, late fees raised as real
  adjustments, numbered receipts, per-resident dues reminders, and payments a
  resident declares for an admin to confirm. Verified by `npm run verify:finances`.
- **Phase 3 — Daily community value (done).** A daily helper registry with
  one-tap gate check-in, notices as a real module replacing the hardcoded banner,
  parking bays with repeat-offender tracking, and staff attendance driving
  indicative monthly pay.
