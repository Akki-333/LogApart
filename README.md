# LogApart

LogApart is a comprehensive, role-based apartment management system built to modernize how residential complexes handle tenant tracking, structural maintenance, and gate security.

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
- **Visual Unit Heatmap:** A visual grid mapping out 4 floors (20 units total, A-E) displaying real-time occupancy status.
- **Structural Maintenance Kanban:** A ticketing system for building maintenance. Tickets feature automated SLA (Service Level Agreement) countdown timers, changing colors as they approach their deadlines.
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
| `GET /api/security/visitors` | ✅ | ✅ | ❌ |
| Gate writes: log, edit, checkout, delete | ❌ | ✅ | ❌ |
| `GET /api/notifications` | ✅ | ✅ | ✅ |
| `/api/auth/me`, `/api/auth/change-password` | ✅ | ✅ | ✅ |

Admin gate access is read-only on purpose, so the portal cannot interfere with
live tracking at the desk. The guard reads units only to fill the "visiting
flat" dropdown.

### One-time passwords

Onboarding a resident creates their account with a randomly generated password,
returned once to the admin as `temp_password` so it can be passed on. The account
is flagged `must_change_password`, and until it is replaced the API answers every
request outside `/api/auth` with `403 PASSWORD_CHANGE_REQUIRED`. The app routes
those users to the change-password screen and nowhere else.

---

## 💰 Billing Engine

Dues are raised a month at a time. An admin sets the maintenance charge and
enters what the building was billed for shared electricity and water, and
LogApart raises one invoice per occupied flat.

- **Charges are itemised.** Maintenance, the common electricity share and the
  common water share are stored separately, so a resident sees what they are
  paying for rather than one opaque figure.
- **Splits reconcile exactly.** All arithmetic runs in integer paise, and the
  leftover paise from a division are handed out one at a time to the largest
  flats. A shared bill always sums back to the amount that went in.
- **Two bases.** Maintenance can be a flat rate per home or a rate per square
  foot, and a common bill can be split equally or in proportion to carpet area.
  A per-square-foot basis is refused when any flat has no recorded area, rather
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

## 🗺 Roadmap

- **Phase 0 — Foundation (done).** Role enforcement in the API, schema and seed
  committed to the repository, environment-driven configuration, one-time
  passwords, and a resident portal shell so residents stop landing on the admin
  dashboard.
- **Phase 1 — Billing engine (done).** Monthly dues runs, pro-rata splitting of
  the common electricity and water bill, a payment ledger, a collection dashboard
  with aging buckets, a dues mode for the building heatmap, and clearance
  certificates gated on real outstanding dues.
- **Phase 2 — Resident portal.** My dues and receipts, raising and tracking
  structural issues, gate activity for your own flat, and pre-approved visitor
  passes.
- **Phase 3 — Daily community value.** A daily helper registry for maids, cooks
  and drivers, notices as a real module, parking bays and violations, and staff
  attendance.
