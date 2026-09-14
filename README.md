# LogApart

Management system for a residential society — 20 homes across 4 floors, three
portals over one API: an admin command center, a gate desk for security, and a
resident portal.

Built for an Indian housing society: money is in rupees, dues are monthly
maintenance plus a share of the common electricity and water bill, and a move-out
needs an NOC.

## Stack

- **Backend** — Node 22, Express 5, MySQL via `mysql2`, JWT auth
- **Frontend** — React 18, Vite 7, Tailwind, react-router 7, Context API
- **Tests** — `node:test` for the billing arithmetic, Vitest for components, and
  Node probe scripts against a running API

## Features

### Admin — Command Center

- Building heatmap with occupancy, plus a dues mode showing who owes
- Onboard, edit and move out residents; clearance certificate gated on real dues
- Maintenance tickets with SLA timers and escalation. A ticket belongs to a home
  or to the common area, so a stuck lift is filed against the building
- Billing: monthly dues runs, itemised invoices, payment ledger, numbered
  receipts, late fees, defaulter worklist
- Books: expense ledger, vendors and contracts, cash-basis monthly statement,
  budget vs actual, corpus tracked separately
- Helpers, notices, parking bays, staff roster and attendance
- Amenity bookings, polls, emergency numbers, asset register
- Activity log of every destructive and financial action
- CSV exports: collections, defaulters, gate traffic, helper attendance, staff
  pay, SLA breaches

### Security — Gate Desk

- High-contrast, touch-first layout for a tablet at the gate
- Live visitor log, one-tap checkout, `N` and `/` shortcuts
- Pre-approved passes redeemed by six-character code
- One-tap helper check-in, parcel shelf, parking violation logging
- Shift start and end, with a handover note the next guard must acknowledge

### Resident

- Own dues, itemised, with payment history and printable receipts
- Report structural and common-area issues, and follow the thread
- Own gate activity and guest passes
- Declare a payment already made, for an admin to confirm
- Amenity bookings, polls, household profile, documents

## Setup

Requires Node 22.12+ and MySQL 8.

### Backend

```bash
cd backend
npm install
cp .env.example .env
```

Fill in your MySQL credentials, then generate a signing secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste it as `JWT_SECRET` — the server refuses to start without one.

```bash
npm run db:setup   # schema + migrations + seed, all safe to re-run
npm run dev        # API on :5000
```

`db:setup` applies `db/schema.sql` and everything in `db/migrations` in order,
tracking what it ran in `schema_migrations`, then seeds 20 homes, an admin and a
guard. It prints a one-time password for each account, or set
`SEED_ADMIN_PASSWORD` and `SEED_GUARD_PASSWORD` first. `npm run db:seed:demo`
fills the building with a year of history.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev        # app on :5173
```

`VITE_API_URL` points at the API, and `CORS_ORIGIN` in the backend `.env` must
match the origin the app is served from.

### Docker

`docker-compose.yml` runs MySQL, the API and the app. Put a `.env` beside it
with `DB_ROOT_PASSWORD`, `DB_PASSWORD`, `JWT_SECRET`, `CORS_ORIGIN` and
`VITE_API_URL`. Compose refuses to start if any is missing.

```bash
docker compose up -d --build
docker compose run --rm api node db/migrate.js
docker compose run --rm api node db/seed.js
```

App on 8080, API on 5000. `/api/health` answers while the process is up,
`/api/health/ready` once it can reach the database.

## Commands

| Command | What it does |
| :--- | :--- |
| `npm run dev` | API on :5000 / app on :5173 |
| `npm run db:setup` | Migrate and seed |
| `npm run db:seed:demo` | Seed a building with a year behind it |
| `npm test` | Billing and CSV unit tests (backend), component tests (frontend) |
| `npm run verify:tickets` | Live-API probe: ticket scope, notification reads |
| `npm run verify:trust` | Live-API probe: throttling, revocation, audit trail |
| `npm run verify:finances` | Live-API probe: expenses, receipts, late fees |
| `npm run verify:life` | Live-API probe: amenities, polls, household |
| `npm run lint` | ESLint, both packages |
| `npm run db:retention` | Dry-run the retention policy; `-- --apply` to run it |
| `npm run docs:api` | Regenerate `docs/API.md` from the routes |

## Roles

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
| `/api/finance/*` expenses, vendors, statement, budget | ✅ | ❌ | ❌ |
| Late fees, adjustments, reminders, declaration review | ✅ | ❌ | ❌ |
| `/api/resident/*` own dues, issues, gate, passes | ❌ | ❌ | ✅ |
| `/api/resident/declarations` declare a payment made | ❌ | ❌ | ✅ |
| Gate pass lookup and admit | ❌ | ✅ | ❌ |
| `GET /api/security/visitors` | ✅ | ✅ | ❌ |
| Gate writes: log, edit, checkout, withdraw | ❌ | ✅ | ❌ |
| `GET /api/helpers`, check in and out | 👁️ | ✅ | 👁️ own home |
| Helper registry writes | ✅ | ❌ | ❌ |
| `GET /api/notices`, acknowledge | ✅ | ✅ | ✅ |
| Posting and withdrawing notices | ✅ | ❌ | ❌ |
| Parking bays and violations | ✅ | 👁️ + log | ❌ |
| `/api/staff/*` roster, attendance, pay | ✅ | ❌ | ❌ |
| `GET /api/notifications` | ✅ | ✅ | ✅ |
| `GET /api/audit` activity trail | ✅ | ❌ | ❌ |
| Re-issue a resident one-time password | ✅ | ❌ | ❌ |
| `/api/auth/me`, `/api/auth/change-password` | ✅ | ✅ | ✅ |

Admin gate access is read-only, so the portal cannot interfere with live tracking
at the desk. The guard reads homes only to fill the "visiting home" dropdown.

Onboarding a resident creates the account with a random password, returned once
as `temp_password`. The account is flagged `must_change_password`, and until it
is replaced the API answers everything outside `/api/auth` with
`403 PASSWORD_CHANGE_REQUIRED`. An admin can re-issue a one-time password from
the home panel; it needs a reason, ends every session on the account, and lands
in the activity log.

## Data retention

Gate records name visitors, their phones and their vehicles, so they are not kept
forever. `npm run db:retention` shows what the policy would remove;
`-- --apply` removes it.

- Gate records past 365 days — a visitor still inside is never removed
- Addresses on activity entries cleared after 180 days; the entry stays
- Sign-in attempts past 30 days

Set `GATE_LOG_RETENTION_DAYS`, `AUDIT_IP_RETENTION_DAYS` and
`LOGIN_ATTEMPT_RETENTION_DAYS` to change the periods. Each has a floor, so a typo
cannot erase a year. Run it monthly from a scheduler.

Every CSV export is recorded in the activity log, and text a spreadsheet would
run as a formula is written as plain text.

## Notes

A few things worth knowing before changing anything:

- **Money is integer paise**, in `services/billing.js` and nowhere else. A split
  always reconciles back to the amount that went in; leftover paise go to the
  largest homes.
- **Anything time-dependent is derived, not stored.** Overdue status is computed
  from the due date on read, so there is no nightly job to drift.
- **Nothing financial is written until it has been previewed.** The dues run
  prices every line on the server and shows the table before it commits.
- **Resident reads are scoped server-side.** Every `/api/resident/*` handler
  resolves the caller's own active home first; a home id from the client is never
  trusted.
- **DATE columns come back as strings**, so a due date keeps its day across
  timezones. Don't undo that.
- **A dwelling is a "home"** everywhere a person can read it. The table and API
  fields stay `unit`. The billing enum `'FLAT'` means a fixed amount, not a
  dwelling.
- **Growing lists page by cursor, never OFFSET.**
- Migrations are ordered and tracked. Never edit an applied one; add a new one.

The API reference is `docs/API.md`, generated from the routes with
`npm run docs:api` and checked in CI.

## Licence

MIT.
