# LogApart roadmap — Phases 4 to 7

Phases 0 to 3 are complete and recorded in `CLAUDE.md`. What follows is the next
build order. The ordering is deliberate: Phase 4 hardens the ground before Phase
5 doubles the amount of money moving through the system, and Phase 6 depends on
residents trusting the portal enough to live in it.

Each item names the tables it needs, the surface it changes, and how it is
verified. Nothing here adds a runtime dependency except where stated.

---

## Phase 4 — Trust, safety and accountability (done, 2026-09-12)

The system already decides who owes what and who may enter the building. It does
so today with no record of who changed anything, no defence against a
password-guessing script, and no way to cut an account off before its token
expires. That is fixed before more money flows through it.

### 4.1 Login is unthrottled

`POST /api/auth/login` accepts unlimited attempts. Add a `login_attempts` table
keyed on email and IP, a soft lockout with a widening delay after five failures,
and a message that does not reveal whether the email exists. Record lockouts so
an admin can see that an attack happened.

### 4.2 A token cannot be revoked

A JWT lives for a day and carries the role inside it, and `protect` never
re-checks the database. Deactivating a resident, demoting an admin or vacating a
flat has no effect until that token expires. Add `users.token_version`, put it in
the token, and refuse a token whose version is stale. That buys real
sign-out-everywhere, immediate demotion, and immediate lockout on vacate.

### 4.3 Nothing is audited

A guard can delete a gate log. An admin can delete a billing run, waive dues on an
NOC, and record a payment that never happened. None of it leaves a trace. Add an
`audit_log` table holding actor, role, action, entity, entity id, before, after,
IP and timestamp, plus a `recordAudit()` helper called from every destructive or
financial write. Surface it as a read-only Activity screen, filterable by actor
and by entity.

### 4.4 Gate logs are hard-deleted

`DELETE /api/security/visitors/:id` removes the row outright. A gate record is
evidence. Move to a soft delete with a reason: gone from the desk, still in the
audit view.

### 4.5 There is no password recovery

Only onboarding ever issues a password, so a resident who forgets theirs is
locked out for good. Add an admin action that re-issues a one-time password,
returns it once, sets `must_change_password`, bumps `token_version` and writes an
audit row with the reason. No mail server needed.

### 4.6 Hardening the edges

Add `helmet`, a body size limit on `express.json`, one shared request validator
so controllers stop hand-rolling checks, and a single error handler that logs
against a request id instead of scattered `console.error` calls. Raise the
minimum password length and reject the obvious choices.

**Verified.** `npm run verify:trust`, 52 checks, all passing. Lockout triggers
and releases, and a throttled attempt is not counted so the lock cannot be held
open by a third party. A token issued before a `token_version` bump is refused.
Every audited action writes exactly one row with the right before and after. A
removed gate log leaves the desk but survives in the building record. A re-issued
password forces a change and ends every session on the account.

---

## Phase 5 — The other half of the ledger

LogApart tracks money coming in and nothing going out, so it cannot answer the
question a committee is actually asked: where did the maintenance go?

### 5.1 Expense ledger

`expenses`: payee, category (common electricity, water, lift AMC, housekeeping,
security agency, repairs, other), amount in paise, bill date, paid date, mode,
reference, and an optional link to the ticket or asset it settles. An expense
recorded against a ticket is how a repair finally gets its real cost.

### 5.2 Vendors and contracts

`vendors` with contact details, and `vendor_contracts` with a start, an end and a
renewal reminder. A lift AMC lapsing unnoticed is a real failure mode. Expiring
contracts surface on the dashboard and raise a notification 30 days out.

### 5.3 Monthly statement and budget

A period view: opening balance, collections, expenses by category, closing
balance, exportable as CSV. Then `budgets`, one figure per category per financial
year, shown as budget against actual. This is what gets read out at the AGM.

### 5.4 Late fees, raised not implied

An overdue invoice costs nothing today. Add a configurable rule per dues run, and
raise the penalty as an explicit `invoice_adjustments` row rather than a derived
phantom amount, so the ledger still reconciles and a waiver is a real audited act.

### 5.5 Receipts

A payment is recorded and the resident gets nothing back. Issue a numbered
receipt per payment, visible and printable from the resident portal.

### 5.6 Resident-declared payments

The biggest daily friction is a resident paying by UPI and then chasing an admin
to record it. Let the resident declare a payment with amount, mode, reference and
date. It lands in a pending queue, and an admin verifies it into a real payment
record or rejects it with a reason. A declaration never moves the balance on its
own.

### 5.7 Reminders with a memory

One action that notifies the residents of every overdue flat, recording when each
was last reminded, so the committee can see who has been chased and who has not.

### 5.8 Corpus kept separate

A sinking-fund contribution is not maintenance income. Give it its own head so
the two can never be spent as the same money.

**Verification.** Extends the billing suite. An expense linked to a ticket shows
in that ticket's cost. The statement's closing balance equals opening plus
collections minus expenses, to the paise. A late fee appears as an adjustment and
a waiver reverses it. A declared payment leaves the balance untouched until
verified. A receipt number is unique and never reused.

---

## Phase 6 — A resident portal worth opening daily

Four screens exist. They answer what a resident owes and what they reported. They
do not yet carry what a resident actually does in a week.

### 6.1 Amenity booking

`amenities` and `amenity_bookings`: clubhouse, terrace, party hall. Slot-based,
one booking per slot enforced by a unique key in the database rather than by a
check in the controller, optional admin approval, and an optional charge posted to
the next dues run.

### 6.2 Household profile

Family members, vehicles, pets and an emergency contact per flat. The vehicle list
links to `parking_bays`, which lets a violation read "3B's car in 2A's bay"
instead of naming an unknown plate.

### 6.3 Document vault

Invoices, receipts, NOC certificates and notices addressed to the flat, gathered
in one place per unit. Read-only, assembled from records that already exist.

### 6.4 A ticket that talks back

A resident reports an issue and then hears nothing until it closes. Add threaded
comments, a reopen window of a few days after resolution, and a rating once
closed. Resolution quality becomes measurable instead of assumed.

### 6.5 Community polls

`polls`, `poll_options` and `poll_votes`, with one vote per flat rather than per
person, because that is how a society decides things. The admin sets a closing
date and results appear after it. This is what turns a notice board into
governance.

### 6.6 Opt-in directory

Name, flat and phone, visible to residents only, and only for residents who
switched it on themselves. Default off.

### 6.7 Parcel holding at the gate

A delivery arriving at an empty flat is held at the desk. The guard records it
against the flat, the resident is notified, and collection is marked at pickup.
Cheap to build and used every single day.

### 6.8 Emergency

A screen of building emergency numbers, and an SOS action that raises an urgent
notification to the guard desk and every admin with the flat attached.

**Verification.** Double-booking a slot is refused. A poll takes one vote per flat
and rejects a second from another member of the same flat. A resident cannot read
another flat's vault, bookings or parcels. An SOS reaches the guard.

---

## Phase 7 — Operations and reporting

### 7.1 SLA escalation that does something

The countdown is decorative today. A breach should notify the admins, mark the
ticket visibly, and appear in a breach report.

### 7.2 Asset register

Lifts, pumps, the DG set, water tanks and the STP, each carrying a service history
assembled from the tickets and expenses already recorded against it.

### 7.3 Gate shift handover

Guards work shifts. Record the shift, and let an outgoing guard leave a handover
note that the incoming guard has to acknowledge.

### 7.4 Move-in and move-out as a workflow

Vacating is a single action today. Make it a checklist: notice given, dues
cleared, helper links closed, parking bay released, gate passes cancelled, NOC
issued.

### 7.5 Reports

Collections, defaulters, gate traffic, helper attendance, staff pay and SLA
breaches, each exportable as CSV for the committee.

---

## Engineering track, alongside the phases

- **Pagination.** List endpoints use fixed `LIMIT` values. They need cursors
  before a few years of gate logs pile up.
- **A real test runner.** The live-API scripts have carried the project this far,
  but Phase 5 arithmetic wants `node:test` run directly over
  `src/services/billing.js`.
- **Backups.** A society ledger with no dump schedule is one disk away from gone.
- **Deployment.** The app has never run anywhere but localhost.
