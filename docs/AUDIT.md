# LogApart full-stack audit — 13 September 2026

> **Phases 1 to 3 of the remediation were completed on the same day.** All five
> HIGH findings and A-06 to A-09, A-11, A-13, A-15 and A-27 carry RESOLVED
> notes and were re-verified. Phase 4, polish, remains open.

Evidence-based. Every claim below was measured, executed or read from the
repository on the date above. Where something could not be tested in this
environment it is marked **NOT VERIFIED** rather than assumed.

**Method.** 21,491 lines of tracked source read; 124 API routes enumerated from
the route files; the API run on port 5055 and probed with a purpose-built script;
all four verification suites executed (219 checks, all passing); `npm audit` run
on both packages; the development database queried directly for row counts,
indexes and foreign keys.

---

## Executive summary

LogApart is a genuinely thoughtful piece of domain modelling wrapped in an
unfinished product shell.

The parts that handle money and permission are better than the project's size
would suggest. Splits run in integer paise and reconcile exactly. Overdue status
is derived on read rather than stored, so no nightly job can drift. Every
destructive or financial write lands in an audit row inside the same transaction
as the act. Authorisation is declared at the route and enforced again in the
controller, and a probe confirmed that residents cannot read each other's
notifications, cancel each other's guest passes, set their own ticket priority,
or mint an admin account through the onboarding route. Two concurrency races
that would corrupt a ledger — simultaneous payments on one invoice, simultaneous
bookings of one slot — were tested live and both hold.

What is missing is everything around that core. There is no Dockerfile, no CI,
no linter, no formatter, no license and no deployment configuration. The
application has never run anywhere but localhost. Accessibility is close to
absent: 83 of 100 form labels are bound to no control, and not one of the 17
modal overlays declares itself a dialog, traps focus, or closes on Escape. User
feedback for the whole product runs through 54 browser `alert()` calls and 8
`window.prompt()` dialogs.

Three defects matter more than the rest. **An admin can bypass the entire
move-out control** by onboarding a new resident over a sitting one: the dues gate
refuses at ₹7,500 outstanding, and the onboarding route then succeeds anyway with
no clearance certificate, no session revocation and the debt orphaned. **Signing
out revokes nothing**: the token-versioning machinery built for exactly this is
never called on logout, so a token copied from a shared machine stays valid for
up to a day. **Unvalidated input reaches the database**, where a 5,000-character
ticket title returns a 500 and a JSON array is stored as the string `a,b`.

**Verdict: NEEDS SIGNIFICANT WORK.** The business logic is close to production
quality. The delivery, accessibility and operations around it are not.

---

## Project architecture overview

A single-society management system. Twenty homes on four floors, three portals
off one API, no multi-tenancy.

```
Resident / Admin / Guard (browser)
        |
React 18 + Vite SPA, one 561 kB bundle, token in localStorage
        |
axios single instance, bearer header attached per request
        |
Express 5  ->  protect (verify JWT, re-read the account)
           ->  requirePasswordSet
           ->  requireRole(...) declared per route
           ->  validate(schema) on 21 of 124 routes
        |
Controllers hold the SQL. services/billing.js holds the arithmetic.
services/audit.js writes the trail. services/loginGuard.js throttles sign-in.
        |
MySQL 9.4, mysql2 promise pool, 10 connections, DATE columns as strings
```

Three user journeys carry the product: an admin raising monthly dues and
recording what arrives; a guard logging who is at the gate; a resident seeing
what they owe and what they reported.

### Layering assessment

| Aspect | Finding |
| :--- | :--- |
| Route layer | Clean. Every route declares its roles next to its path. Easy to audit. |
| Controller layer | Carries both HTTP handling and SQL. No repository layer. |
| Service layer | Exists only for billing arithmetic, audit and login throttling. |
| Domain model | Implicit. No entities; rows flow from SQL to JSON largely untransformed. |

The layering is honest rather than elaborate, and for 20 homes that is a
defensible trade. It does not survive growth: `billingController.js` is 1,177
lines carrying seventeen exported handlers plus the receipt numbering and invoice
settlement helpers, and the same `activeUnitFor` helper is copy-pasted into five
controllers with slightly different SQL each time.

---

## Technology stack assessment

| Layer | Choice | Assessment |
| :--- | :--- | :--- |
| Frontend | React 18, Vite 5, Tailwind 3, react-router 6, axios | Sound and current. No state library, and none is needed at this size. |
| Backend | Node 22, Express 5, mysql2 | Express 5 is a good call: async handler rejections reach the error handler without a wrapper. |
| Database | MySQL 9.4, InnoDB throughout | Right choice for a ledger. Generated columns and `FOR UPDATE` are both used well. |
| Auth | JWT, bcrypt cost 10, one-day expiry | Appropriate. Cost 10 is the low end of acceptable in 2026. |
| Types | None | The single largest maintainability gap. |
| Tests | 4 live-API suites, no framework | Real coverage of business rules, wrong shape for CI. |

---

## Critical findings

Nothing in this audit is CRITICAL by the strict definition — no remote code
execution, no data-loss path, no unauthenticated access to resident data, no
credential exposure. The highest severity reached is HIGH, and there are five.

---

## Functional testing findings

All four suites were executed against a live server and a real database.

| Suite | Checks | Result |
| :--- | ---: | :--- |
| `verify:tickets` | 25 | pass |
| `verify:trust` | 52 | pass |
| `verify:finances` | 70 | pass |
| `verify:life` | 72 | pass |

These are not shallow. They assert business invariants: that a split reconciles
to the paise, that a late fee charges once per month, that a waiver cannot fall
below what has already been paid, that one household gets one vote, that a
reminder reaches the home it is about and no other.

### What the suites do not cover, tested separately

| Probe | Result |
| :--- | :--- |
| Resident sets their own ticket priority | Blocked, stored as MEDIUM |
| Resident targets another home's ticket | Blocked, stored against own home |
| Resident pre-resolves a ticket on creation | Blocked, stored as OPEN |
| Onboarding payload carrying `role: ADMIN` | Ignored, created as RESIDENT |
| Reading another person's addressed notification | 404 |
| Cancelling another home's guest pass | 404 |
| Forged JWT payload | 401 |
| `alg: none` token | 401 |
| Two residents booking one slot simultaneously | 1 of 2 succeeded |
| Two full payments on one invoice simultaneously | 1 of 2 accepted, no overpayment |
| 5,000-character ticket title | **500 Server error** |
| JSON array as a ticket title | **200, stored as `a,b`** |
| JSON object as a ticket title | **200, stored as `[object Object]`** |
| Onboarding over a resident who owes ₹7,500 | **200, dues gate bypassed** |

---

## Backend and API findings

124 routes across 16 route files. 110 declare a role; 14 are open to any
signed-in user, and each of those was checked — notices, notifications,
emergency contacts and the amenity list are intentionally shared, and the two
that return per-home data (`/api/parcels`, `/api/amenities/bookings/all`) scope
inside the controller.

**Only 21 of 124 routes declare a body schema.** The `validate()` middleware
exists and works, and it was applied to sign-in, password change, visitor
logging, gate-record removal, dues runs, payments, late fees, adjustments,
expenses, vendors, contracts, budgets, bookings, household members and vehicles,
parcels and emergency contacts. It was never applied to the rest, including
`POST /api/resident/tickets`, `POST /api/tickets`, `POST /api/notices`,
`POST /api/staff`, `POST /api/parking/bays` and `POST /api/polls/:id/vote`. Every
confirmed input-handling defect in this audit sits on an unvalidated route.

**No pagination anywhere.** `GET /api/security/visitors` returns the entire gate
log in one response with no limit or cursor. Others carry a hard-coded `LIMIT`
between 50 and 500 with no way for a caller to reach page two. A building with
three years of gate history will send megabytes per request.

**No API versioning and no machine-readable contract.** No OpenAPI document, so
the frontend is the only description of the API.

**Response envelope is consistent** — `{ success, message, data }` — and status
codes are used correctly: 400 for shape, 401 for identity, 403 for permission,
404 for absent or not-yours, 409 for a conflicting state, 413 for oversized, 429
for throttled. That is better than most projects this size manage.

---

## Database findings

| Check | Result |
| :--- | :--- |
| Storage engine | InnoDB on every table |
| Foreign keys | Present on every cross-table reference except `dues_reminders.unit_id` |
| Indexes on FK columns | Every one has a leading index |
| Money columns | `DECIMAL`, never float |
| Arithmetic | Integer paise in `services/billing.js`, reconciles exactly |
| Transactions | Used wherever money or a multi-row act is involved |
| Row locking | `SELECT ... FOR UPDATE` on invoice settlement and receipt numbering |

The schema is the strongest layer in the project. Two design choices deserve
naming: the generated `holds_slot` column that lets a cancelled booking free its
slot while the unique key still blocks live double-bookings, and keeping the
actor's name denormalised on `audit_log` so the trail survives account deletion.

### Weaknesses

- **`payments` is dead.** The original schema table was superseded by `invoices`
  and `payment_records` in Phase 1. No code references it.
- **`users.role` offers `MAINTENANCE_STAFF` and `ACCOUNTANT`.** Nothing grants
  them and no route checks them. An account holding one can sign in and reach
  nothing, with no message explaining why.
- **`dues_reminders.unit_id` has no foreign key**, so it can point at a home that
  no longer exists.
- **No soft delete on most entities.** Gate records got one in Phase 4;
  expenses, notices, parking bays and vendors are hard-deleted.
- **Migration 012 was needed at all.** `units.number` had no unique key for
  twelve migrations, which let the demo seed duplicate every home four times.
  Fixed yesterday; the lesson is that uniqueness was being enforced by
  convention rather than by the database.

---

## Authentication and authorization findings

Authentication is strong for the project's size, and authorization is the best
part of the codebase.

**Working well.** Per-resident one-time passwords with a forced change before the
API answers anything. A sign-in throttle that counts failures since the last
success, widens from five minutes to an hour, and deliberately does not count
blocked attempts so a third party cannot hold a neighbour's account shut.
Token versioning compared against the account on every request, so a password
change, a demotion or a move-out lands on the next request rather than the next
day. Role and password state read from the row, not from the token.

**Gaps.**

- **Signing out revokes nothing.** `logout` in `AuthContext.jsx:91` clears
  `localStorage` and nothing else. There is no `/api/auth/logout` route. The
  `token_version` column built for precisely this is never incremented. A token
  read from a shared machine stays valid until it expires.
- **The token lives in `localStorage`**, so any successful XSS takes the session.
- **`jwt.verify` does not pin `algorithms`** (`middleware/auth.js:37`).
  jsonwebtoken v9 rejects `alg: none` by default and the probe confirmed a 401,
  so this is defence in depth rather than a live hole.
- **One primary-key lookup per request** in `protect`. Correct, and the right
  trade at this size, but it is an un-cached dependency on the database for every
  authenticated call.
- **No password reset by email, no MFA path, no session listing.**

---

## Security findings

### Tested and clean

**No SQL injection.** Every one of the 21 template-literal interpolations that
lands inside SQL was inspected: each is a fixed fragment, a constant, a boolean
choosing between two literal strings, or `filters.join(' AND ')` where the
filters are hard-coded strings carrying `?` placeholders. The one numeric
interpolation, the audit log's `LIMIT`, is clamped with
`Math.min(200, Math.max(1, Number(...)))`. Every user value travels as a bound
parameter.

**No mass assignment.** Four escalation payloads were rejected in practice.

**No secrets in git.** No `.env`, `.pem` or key file appears anywhere in history.

*Correction to this audit:* it originally reported `.env.example` as present.
That was read from the working copy, not the repository. The root ignore rule was
`.env*`, which caught the template along with the real file, so **neither
template had ever been committed** and a fresh clone followed the README's
`cp .env.example .env` instruction to a file it did not have. Both templates are
now tracked, and the real `.env` files stay ignored.

**Security headers present.** Verified on a real API response, not just the root:
`x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, a
content-security-policy and strict-transport-security, all from helmet.

**No injection surface beyond SQL.** No file uploads, no command execution, no
template rendering, no outbound URL fetching, so command injection, path
traversal and SSRF have no entry point in this codebase.

### Findings

- **Rate limiting covers only sign-in.** Sixty parallel authenticated reads of
  `/api/dashboard/stats` returned sixty 200s. Any signed-in account can hammer
  every endpoint, including the CSV export and the dues-run preview, which are
  the two most expensive.
- **CORS is a single origin with `credentials: true`**, defaulting to
  `http://localhost:5173` when the variable is absent. A production deploy that
  forgets `CORS_ORIGIN` gets a silently wrong policy rather than a boot failure.
- **The database falls back to `root` with an empty password** when `DB_USER` and
  `DB_PASSWORD` are unset (`config/db.js:7-10`), while `config/env.js` only
  requires `JWT_SECRET` and `DB_NAME`.
- **`master_seed.js` creates accounts with shared passwords** (`admin123`,
  `guard123`, `resident123`) and no forced change, undoing the one-time-password
  design whenever it runs.

### Dependencies

| Package set | Vulnerabilities |
| :--- | :--- |
| Backend production | 2 moderate, both in `qs` via Express, patch available |
| Frontend | 8 total: 4 high, 4 moderate |

The frontend high-severity findings are `browserslist`, `nanoid`, `postcss` and
`vite`, all build-time rather than shipped to a browser. `react-router` and
`react-router-dom` are moderate and do reach the client. `vite` and `esbuild`
need a major upgrade to clear; the rest are patch-level.

---

## Frontend findings

- **One 561 kB JavaScript bundle**, 136 kB gzipped, with no code splitting: no
  `React.lazy`, no dynamic import anywhere. A guard opening the gate desk on a
  tablet downloads the entire finance module, the audit screen and every resident
  page before the first render.
- **Request waterfalls.** `DashboardHome.jsx` makes three sequential API calls;
  `Residents.jsx` and `Security.jsx` make six each. Only `Billing.jsx` uses
  `Promise.all`. These are trivially parallelisable.
- **No request cancellation.** No `AbortController` anywhere, so navigating away
  mid-request leaves a pending `setState` on an unmounted component.
- **Notification polling is unconditional.** `NotificationDropdown.jsx:15` polls
  every 20 seconds for the life of the session, including while the tab is
  hidden and after the user stops interacting.
- **Filtering and sorting happen on the client**, over whatever the server
  returned, which works at 20 homes and stops working at 2,000 invoices.

---

## UI/UX findings

The visual language is consistent and deliberate: one slate-and-teal palette,
consistent radii, a repeated card pattern, and empty states that explain rather
than shrug. The domain vocabulary is now consistent after yesterday's rename.

The interaction layer is prototype-grade.

- **54 `alert()` calls, 9 `window.confirm()`, 8 `window.prompt()`.** Every
  error, every confirmation and several primary inputs run through blocking
  browser dialogs. `window.prompt` collects the reason for removing a gate
  record, the reason for re-issuing a password, the reason for refusing a
  declared payment and the note on a ticket rating. These cannot be styled,
  validated inline, cancelled gracefully or read properly by assistive
  technology, and on iOS Safari a prompt can be suppressed entirely.
- **No toast or notification system.** Success is a green banner on some screens
  and an `alert()` on others.
- **Partial double-submit protection.** 30 forms, 25 `disabled` bindings.
- **Destructive actions vary in ceremony.** Removing a gate record demands a
  typed reason; deleting a parking bay asks nothing.

---

## Accessibility findings

This is the weakest area in the project by a wide margin.

| Measure | Count |
| :--- | ---: |
| `<label>` elements | 100 |
| Labels that wrap their control or use `htmlFor` | 17 |
| **Labels bound to no control** | **83** |
| `aria-*` attributes in the entire app | 2 |
| `role=` attributes | 0 |
| Modal overlays | 17 |
| Modals with `role="dialog"` | 0 |
| Modals with `aria-modal` | 0 |
| Modals that close on Escape | 0 |
| Modals that manage focus | 0 |

A screen-reader user reaching the dues-generation form hears an unlabelled edit
box four times. A keyboard user who opens any modal can tab straight out of it
into the page behind, which is still scrollable and still focusable, and cannot
close it without finding the X button by sight.

The worst offenders are `GenerateDuesModal.jsx` (9 unbound labels),
`OnboardResidentModal.jsx` (8) and `LogVisitorModal.jsx` (7).

Fourteen icon-only buttons carry a `title` attribute, which gives a tooltip but
not a reliable accessible name.

**NOT VERIFIED:** actual screen-reader behaviour, colour contrast ratios, and
keyboard traps were assessed from markup only. No assistive technology or
contrast tool was run.

---

## Responsive design findings

Tailwind responsive prefixes are used throughout and the layouts are built on
flex and grid with sensible wrapping. Five of seven tables sit inside an
`overflow-x` wrapper; two do not.

The guard desk is described as tablet-first and its touch targets are large. The
admin screens assume a wide viewport: the budget tab lays out a label, an input,
a save button and two figures in one row, which will crush below about 700px.

**NOT VERIFIED:** no viewport was rendered. This assessment is from class names
and layout structure, not from pixels.

---

## Performance findings

| Finding | Evidence |
| :--- | :--- |
| Single 561 kB bundle | Vite build output, over its own 500 kB warning |
| N+1 on the polls screen | `pollController.js:75-95` issues three queries per poll inside a loop, so 100 polls is 302 sequential round trips |
| N+1 on late fees | `billingController.js:777-790`, two queries per chargeable invoice |
| N+1 on reminders | `billingController.js:958-962`, two per overdue invoice |
| Row-at-a-time invoice insert | `billingController.js:219-220`, one INSERT per home per run |
| Dashboard waterfall | Three sequential calls where one `Promise.all` would do |
| No caching anywhere | No HTTP cache headers, no client cache, no memoised queries |

Nothing here hurts at 20 homes. The polls N+1 is the one that degrades first,
because the route is capped at 100 polls and every one costs three round trips
before a byte reaches the browser.

**NOT VERIFIED:** no latency measurement, profiling or sustained load test was
performed. The only load applied was a 60-request burst, which the server served
without error or throttling.

---

## Scalability findings

The system is built for one building and says so. That is a legitimate product
decision, not a defect. Within it:

- The connection pool is 10. With one DB round trip per authenticated request
  for `protect`, plus the query the endpoint actually needs, sustained
  concurrency above roughly 40 requests per second will queue.
- Unbounded reads and client-side filtering set a ceiling somewhere in the low
  thousands of rows per table.
- There is no multi-tenancy. A second building requires a second deployment and
  a second database.

---

## Reliability and error handling

**Good.** One error handler catches everything Express 5 forwards, returns a
short reference the user can quote, logs the reference with the stack, and leaks
no internals — confirmed by probing a bad route and finding no stack frame, no
`node_modules` path and no SQL text in the response. Money moves inside
transactions. The two concurrency races that would corrupt a ledger were tested
and both hold.

**Weak.** Unvalidated input reaches MySQL and surfaces as a generic 500 with a
reference, which is correct behaviour for an unexpected error and the wrong
outcome for a predictable one. A resident typing a long title gets "Server
error" and no guidance.

`services/audit.js` deliberately swallows a failed audit write when it is not
inside a transaction, logging loudly instead. That is the right call and it is
documented, but it means an audit row can be lost without the request failing.

---

## State management

Context API with three values and per-screen `useState`. Appropriate at this
size, no Redux needed.

- Token in `localStorage`, read on mount, refreshed by a `/auth/me` call.
- A custom window event carries the forced-password-change signal from the axios
  interceptor into React state, which is a clean decoupling.
- **Multi-tab is not handled.** Signing out in one tab leaves the other
  authenticated until its next 401. No `storage` event listener.
- **No stale-data strategy.** Screens load once and stay stale until manually
  refreshed, except the notification bell.

---

## Forms and validation

30 forms. Validation is inconsistent by construction: the shared `validate()`
middleware covers 21 routes, leaving most forms protected only by HTML `required`
and whatever the controller happens to check.

The three confirmed input defects all sit on `POST /api/resident/tickets`, which
has no schema:

- A 5,000-character title returns 500.
- `["a","b"]` is stored as `a,b` and reported as success.
- `{a:1}` is stored as `[object Object]` and reported as success.

---

## Search, filter and pagination

Search is client-side substring matching on already-loaded arrays. The audit log
is the only endpoint with real pagination, and it is done correctly: a cursor on
`id` rather than an `OFFSET`, precisely because the log grows at the head and an
offset would shift under a reader between pages. That pattern should have been
copied to the gate log and the invoice list.

---

## File and media handling

None. No uploads, no downloads except one CSV export, no media storage. The CSV
export escapes correctly for a payee named `Sharma & Sons, Electricals` and is
fetched as a blob so the bearer token still applies. Nothing to audit beyond
that, which removes a large class of risk.

---

## Third-party integrations

None. No payment gateway, no SMS, no email, no object storage, no analytics, no
external API of any kind. Every dependency is a library, not a service.

This is a real strength: the system has no runtime dependency that can be down,
rate-limit it, change its contract or bill it. It is also why there is no
password reset by email and no real notification delivery — the notification
bridge is an in-database table polled by the browser every 20 seconds.

---

## AI / LLM / RAG review

**Not applicable.** The project contains no AI, LLM, embedding, vector store or
retrieval functionality.

---

## Privacy review

Personal data held: name, email, phone, home number, move-in and move-out dates,
emergency contact, vehicle registration, household member names and phones,
payment history, gate movements, helper attendance and parcel collections.

- **Nothing leaves the building.** No third-party processor receives any of it.
- **The directory is opt-in and defaults to off**, and opting out does not remove
  the ability to read it. That is the correct shape.
- **Gate logs are retained forever.** There is no retention policy, no purge and
  no expiry on visitor records, which accumulate a movement history of every
  resident's guests indefinitely.
- **The audit log records IP addresses** with no stated retention.
- **`login_attempts` is swept at 30 days**, which is the only retention rule in
  the system.
- **Passwords are never logged.** `console.error` calls carry error objects, not
  request bodies.

---

## DevOps and deployment

| Artefact | Status |
| :--- | :--- |
| Dockerfile | absent |
| docker-compose | absent |
| CI pipeline | absent |
| ESLint | absent |
| Prettier | absent |
| TypeScript | absent |
| `.nvmrc` | absent |
| LICENSE | absent |
| CONTRIBUTING | absent |
| Deployment config | absent |
| Migration runner | present and good |

The migration runner is the one operational strength: ordered files tracked in
`schema_migrations`, safe to re-run, and it records a migration as applied when
it fails only on a duplicate-column or duplicate-key error.

There is no rollback story. Migration 012 deletes rows; if it half-fails there is
no down migration and no automated backup. The dump taken before running it was
a manual act.

---

## Logging, monitoring and observability

Console only. No structured logging, no log levels, no correlation id on normal
requests (the error handler mints one only on failure), no metrics, no health
endpoint beyond `GET /` returning a fixed string, no readiness or liveness
probe, no alerting.

The `audit_log` table is genuine observability for business actions and is better
than most projects have. It covers who changed money and access. It does not
cover whether the system is up, slow, or erroring.

Diagnosing a production incident would mean reading raw stdout on the server.

---

## Automated test assessment

219 checks across four suites, all passing, all executed this session.

**Strengths.** They assert business invariants rather than implementation
details, they run against a real database so foreign keys and unique constraints
are exercised, and they clean up after themselves including on failure. Several
encode hard-won knowledge in the assertion name, such as the check that a
throttled sign-in attempt is *not* counted so a lock cannot be held open by a
third party.

**Weaknesses.**

- They need a running server and a live database, so they cannot run in CI as
  written.
- No unit tests on `services/billing.js`, which holds the only real arithmetic in
  the project and is the thing most worth testing in isolation.
- No frontend tests of any kind: no component, no interaction, no end-to-end.
- No accessibility or performance assertions.
- Ordering is load-bearing and documented rather than enforced.

---

## Documentation assessment

The best-documented part of the project, and unusually good for its size.
`README.md` covers setup, the role matrix, the billing rules and the design
decisions behind them. `CLAUDE.md` records conventions that are genuinely
load-bearing. `docs/ROADMAP.md` and `docs/REVIEW.md` record what was planned and
what was found.

Code comments explain why rather than what, consistently.

Missing: API reference, architecture diagram, deployment guide, troubleshooting,
and any statement of what the software is licensed under.

---

## Technical debt

1. `billingController.js` at 1,177 lines with 17 handlers.
2. `activeUnitFor` duplicated across five controllers with drifting SQL.
3. No linter, so style is maintained by discipline alone.
4. No types, so the shape of every API response is known only by reading both
   sides.
5. Two seed scripts that disagree with each other.
6. Dead `payments` table and two unused role enum values.
7. `flatList` renamed to `homeList` in the API response, which is a breaking
   change to any consumer other than this frontend. There is no versioning to
   absorb it.

---

## Creative product improvements

Ranked by value to the people who actually use this, not by novelty.

1. **A real toast system** to replace 54 `alert()` calls. One component, and the
   whole product stops feeling like a prototype.
2. **Inline reason dialogs** to replace the eight `window.prompt()` calls, with
   the reason validated before the request leaves.
3. **A defaulter worklist** on the dues screen: who owes, how long, when they
   were last chased, and a one-tap reminder, in one view.
4. **Receipt as a printable page.** The receipt number exists; a resident cannot
   print anything.
5. **A month-end close checklist**: dues raised, expenses recorded, statement
   reconciled, reminders sent. The four actions a committee performs monthly are
   currently on four screens.
6. **Skeleton loaders** instead of a centred spinner, so the layout does not jump.
7. **Optimistic updates** on the gate desk. A guard logging a visitor should see
   the row immediately.
8. **Keyboard-first gate entry.** The desk is the one screen used under time
   pressure, and it needs a mouse today.
9. **An amenity calendar view** rather than a one-day slot list.
10. **Export beyond the statement**: defaulters, gate traffic and helper
    attendance as CSV, which is what a committee actually circulates.

---

## Quick wins

Each is under an hour and each removes a real problem.

| Fix | Effect |
| :--- | :--- |
| Add `validate()` to `POST /api/resident/tickets` | Removes all three confirmed input defects |
| `Promise.all` in `DashboardHome`, `Residents`, `Security` | Cuts three round trips to one on each |
| Add `/api/auth/logout` that bumps `token_version` | Makes signing out mean something |
| Pin `algorithms: ['HS256']` in `jwt.verify` | Defence in depth, one line |
| `npm audit fix` on both packages | Clears 2 backend and 6 frontend advisories |
| Wrap the two unwrapped tables in `overflow-x-auto` | Stops horizontal page scroll on mobile |
| Add `role="dialog"` and `aria-modal="true"` to the modal shell | Cheapest meaningful accessibility gain |
| Require `DB_PASSWORD` in `config/env.js` | Stops a production boot as root with no password |
| Delete the `payments` table and the two unused roles | Removes a misleading schema |
| Add `LICENSE` and `.nvmrc` | Makes the repository legible to anyone else |

---

## Detailed issue register

### A-01 · HIGH · Business logic

```
Module:      Residents / move-out
File:        backend/src/controllers/unitController.js
Function:    assignResident
Problem:     Onboarding a resident into an occupied home silently deactivates
             the sitting resident with no dues check, no clearance certificate,
             no session revocation and no account closure.
Why:         It bypasses every control the move-out flow exists to enforce.
             vacateUnit refuses while a balance is open, issues a numbered NOC,
             bumps token_version and closes the account. assignResident does
             none of that, and both are available to the same admin.
Reproduce:   1. Raise an invoice against an occupied home.
             2. POST /api/units/vacate  -> 409 OUTSTANDING_DUES, 7500 owed.
             3. POST /api/units/assign for the same home with a new resident.
Expected:    Refusal, or a forced move-out with the same dues gate.
Actual:      200. No certificate. Debt orphaned. Departing account left active
             with an unchanged token_version and a working token.
Root cause:  Two write paths change occupancy, only one carries the rules.
Fix:         Have assignResident refuse when the home has an active resident,
             requiring an explicit vacate first; or call the same clearance
             routine before it reassigns.
Priority:    1     Complexity: Medium
```

**RESOLVED.** Onboarding now refuses with `409 HOME_OCCUPIED` and names the
resident in the way, so the only route out of a home is the one carrying the
dues gate. Re-tested: vacate returns 409 as before, the assignment that used to
succeed now returns 409, and no replacement account is created.

### A-02 · HIGH · Authentication

```
Module:      Auth
File:        frontend/src/context/AuthContext.jsx:91
Problem:     Signing out clears localStorage and nothing else. No server-side
             logout route exists, and token_version is never bumped.
Why:         A token copied from a shared or public machine stays valid for up
             to a day after the user believes they have signed out. The
             machinery to prevent this was built in Phase 4 and is unused here.
Reproduce:   Sign in, copy the token from localStorage, sign out, replay the
             token against any endpoint.
Expected:    401 SESSION_REVOKED.
Actual:      200.
Fix:         POST /api/auth/logout that increments token_version, called by
             logout() before the client clears its own state.
Priority:    2     Complexity: Low
```

**RESOLVED.** `POST /api/auth/logout` bumps the version and is called before the
client clears its own state. Re-tested: the token reads `/notices` at 200, the
sign-out returns 200, and the same token then returns `401 SESSION_REVOKED`. The
sign-out is in the audit trail.

### A-03 · HIGH · Input validation

```
Module:      Resident issues
File:        backend/src/routes/residentRoutes.js (no validate on POST /tickets)
             backend/src/controllers/residentController.js  createTicket
Problem:     No schema on the route and only truthiness checks in the handler.
Why:         Three confirmed defects on one route. A long title is a 500 rather
             than a 400. A JSON array is accepted and stored as "a,b". A JSON
             object is stored as "[object Object]". All three report success to
             the user, so junk enters the maintenance queue looking legitimate.
Reproduce:   POST /api/resident/tickets with title: "x".repeat(5000)  -> 500
             POST with title: ["a","b"]                                -> 200
Expected:    400 with a message naming the field.
Fix:         validate({ title: {required, type:'string', maxLength:255},
             description: {required, type:'string', maxLength:2000},
             category: {required, oneOf:[...]} }) and the same treatment for
             the other unvalidated routes, starting with the writes.
Priority:    3     Complexity: Low per route
```

**RESOLVED.** Thirty-six write routes gained a schema; the fifteen without take
no body. The validator also refuses any object or array where a field expects a
single value, so type confusion cannot pass on a validated route. Re-tested: the
array, the object, the nulls and the 5,000-character title all return 400 naming
the field.

### A-04 · HIGH · Accessibility

```
Module:      Whole frontend
Evidence:    83 of 100 labels bound to no control. 17 modals, none with
             role="dialog", aria-modal, focus management or Escape handling.
             2 aria attributes and 0 role attributes in the entire application.
Why:         The product is unusable with a screen reader and hostile to
             keyboard-only users. For a building system that residents are
             required to use, this is an exclusion problem, and in several
             jurisdictions a compliance one.
Fix:         One accessible Modal shell component (role, aria-modal, focus
             trap, Escape, restore focus on close) adopted by all 17. Then bind
             every label with htmlFor and an id.
Priority:    4     Complexity: Medium
```

**RESOLVED.** `useDialog` gives any overlay `role="dialog"`, `aria-modal`, a
labelled title, a focus trap, Escape, focus restored on close and a held
page; `Modal` is a shell over it and all 17 overlays adopted it. Every label
is bound: 81 by `htmlFor`, 16 by wrapping, 0 orphaned. Labels that named a
group of buttons became `role="group"` with `aria-labelledby`. Not verified
with a real screen reader.

### A-05 · HIGH · Operations

```
Module:      Build and deploy
Problem:     No Dockerfile, CI, linter, formatter, license or deployment config.
Why:         The application has never run outside localhost. There is no
             reproducible build, no automated check on a commit, and nothing
             that would stop a regression reaching master.
Fix:         In order: npm scripts for lint and test, ESLint with the React
             plugin, a CI workflow running both plus the four suites against a
             MySQL service container, then a Dockerfile.
Priority:    5     Complexity: Medium
```

**RESOLVED.** ESLint runs in both packages (`npm run
lint`, zero errors and zero warnings; the hooks rules caught one stale
closure and one undefined variable along the way). `.github/workflows/ci.yml`
lints and builds the frontend, and on the backend lints, migrates a MySQL
service container, seeds the demo building, starts the API and runs all four
suites. Phase 3 added a production image for each package, a compose file
that refuses to start without its secrets, and a CI job that builds both
images and starts the API one. The images were built in CI only: Docker was
not running on the audit machine, and the compose file has not been run.

### A-06 · MEDIUM · Security

```
Module:      API edge
Problem:     Rate limiting applies only to POST /api/auth/login.
Evidence:    60 parallel authenticated GETs of /api/dashboard/stats, 0 throttled.
Why:         Any signed-in account can exhaust the 10-connection pool, and the
             expensive endpoints (CSV export, dues preview) are unprotected.
Fix:         express-rate-limit globally with a higher per-route allowance, or
             a token-bucket keyed on user id.
Priority:    6     Complexity: Low
```

**RESOLVED.** `middleware/rateLimit.js` mounts a standard allowance of 300 a
minute on every guarded route and on `/api/auth`, keyed per account after
`protect` so one busy address cannot starve a household. The statement export
and both previews carry a stricter 20 a minute. Measured: of 400 reads, 300
pass and 100 return `429 TOO_MANY_REQUESTS`; of 50 exports, 20 pass.

### A-07 · MEDIUM · Performance

```
Module:      Polls
File:        backend/src/controllers/pollController.js:75-95
Problem:     Three queries per poll inside a loop: options, own vote, tally.
Why:         The route is capped at 100 polls, so a worst case is 302 sequential
             round trips for one screen.
Fix:         Three set-based queries with IN clauses, grouped in memory. The
             same pattern residentController already uses for payments.
Priority:    7     Complexity: Low
```

**RESOLVED.** Polls read a page in three queries grouped in memory, whatever
the page size. Late fees and reminders each write their whole batch in two
statements inside the same transaction; reminder notifications now commit
with the reminder rows instead of outside the transaction. `verify:life` and
`verify:finances` pass unchanged.

### A-08 · MEDIUM · UX

```
Module:      Whole frontend
Problem:     54 alert(), 9 confirm(), 8 prompt() carry the product's feedback.
Why:         Blocking, unstyleable, unvalidatable, poorly announced by assistive
             technology, and suppressible by the browser. Four primary flows
             collect their required reason through window.prompt.
Fix:         A toast component and a small confirm/reason dialog built on the
             accessible modal shell from A-04.
Priority:    8     Complexity: Medium
```

**RESOLVED.** `Feedback.jsx` provides `toast`, `confirm` and `askReason`
through one provider. Toasts sit in a polite live region, errors as `alert`.
`confirm` and `askReason` return promises, so callers still read top to
bottom; `askReason` validates a minimum length inline instead of accepting
an empty prompt. 0 `alert`, `confirm` or `prompt` calls remain.

### A-09 · MEDIUM · API design

```
Module:      Reads
Problem:     No pagination. GET /api/security/visitors returns the whole gate
             log; other lists carry a fixed LIMIT with no cursor.
Why:         Response size grows without bound and page two is unreachable.
Fix:         Copy the cursor pattern already implemented correctly in
             auditController: order by id desc, accept before_id, return
             next_before_id.
Priority:    9     Complexity: Low
```

**RESOLVED.** The gate log sends the live list (inside now, passes still to
use) whole, and pages history on `(time, id)` behind `next_before_id`, 50 at a
time; the day's counts come from the server. Invoices page on their display
order behind `next_after_id`, 100 at a time, with the status filter moved into
SQL so a filtered page is full. Both screens load more on demand. A probe
walked 120 gate records, 60 of them on three shared timestamps, seven at a
time: none skipped, none repeated, order held. Walking invoices three at a
time, filtered and unfiltered, matched a single read exactly.

### A-10 · MEDIUM · Configuration

```
Module:      Config
File:        backend/src/config/db.js:7-10, backend/src/config/env.js
Problem:     DB_USER defaults to root and DB_PASSWORD to empty. env.js requires
             only JWT_SECRET and DB_NAME. CORS_ORIGIN defaults to localhost.
Why:         A production deploy missing these gets a silently wrong
             configuration rather than a refused boot, which is the pattern
             env.js was written to prevent for JWT_SECRET.
Fix:         Require DB_USER, DB_PASSWORD and CORS_ORIGIN when NODE_ENV is
             production. Remove the fallbacks from db.js.
Priority:    10    Complexity: Low
```

**RESOLVED.** With `NODE_ENV=production` the host, user, password and origin are
all mandatory, and an origin pointing at localhost is refused outright.

### Remaining register

| ID | Sev | Area | Issue |
| :--- | :--- | :--- | :--- |
| A-11 | ~~MEDIUM~~ | Frontend | **RESOLVED.** Every portal and page loads on demand; the first download fell from 572 kB to 254 kB (146 to 86 kB gzipped) |
| A-12 | ~~MEDIUM~~ | Data | **RESOLVED.** One seed, idempotent across three runs, one-time passwords throughout |
| A-13 | ~~MEDIUM~~ | Testing | **RESOLVED.** 27 `node:test` cases, run by `npm test` and CI; a deliberately broken copy fails two |
| A-14 | MEDIUM | Testing | No frontend tests of any kind |
| A-15 | ~~MEDIUM~~ | Observability | **RESOLVED.** JSON request log with an id on every request, returned as `X-Request-Id` and as the 500 reference; `/api/health` and `/api/health/ready` |
| A-16 | LOW | Security | `jwt.verify` does not pin `algorithms` |
| A-17 | LOW | Frontend | Three screens make sequential calls where one `Promise.all` would do |
| A-18 | LOW | Frontend | No `AbortController`, so unmount mid-request leaves a pending setState |
| A-19 | LOW | Frontend | Notification polling runs every 20s regardless of tab visibility |
| A-20 | LOW | Database | `payments` table is dead; `MAINTENANCE_STAFF` and `ACCOUNTANT` roles are unreachable |
| A-21 | LOW | Database | `dues_reminders.unit_id` has no foreign key |
| A-22 | LOW | Privacy | No retention policy on gate logs or audit IP addresses |
| A-23 | LOW | State | Signing out in one tab leaves other tabs authenticated |
| A-24 | LOW | Responsive | Two of seven tables lack an overflow wrapper |
| A-25 | LOW | Code | `activeUnitFor` duplicated across five controllers |
| A-26 | LOW | Code | `billingController.js` at 1,177 lines |
| A-27 | ~~LOW~~ | Deps | **RESOLVED.** `npm audit` reports 0 in both packages; Vite 7 and react-router 7 |
| A-28 | LOW | Docs | No LICENSE, API reference or deployment guide |
| A-29 | LOW | API | Renaming `flatList` to `homeList` is an unversioned breaking change |
| A-30 | LOW | UX | Destructive actions vary in ceremony; a parking bay deletes without confirmation |

---

## Test case matrix

The four existing suites already cover the functional and business-rule columns
well. What follows is the matrix of what is **not** covered, which is where new
test effort belongs.

| ID | Module | Scenario | Type | Expected | Severity if broken |
| :--- | :--- | :--- | :--- | :--- | :--- |
| T-01 | Units | Onboard over a resident who owes money | Business | Refused or forced through the dues gate | HIGH |
| T-02 | Auth | Replay a token after signing out | Security | 401 SESSION_REVOKED | HIGH |
| T-03 | Tickets | Title of 5,000 characters | Boundary | 400, field named | HIGH |
| T-04 | Tickets | Array and object as a title | Negative | 400, not stored | HIGH |
| T-05 | All writes | Every unvalidated route with a wrong-typed body | Negative | 400, never 500 | HIGH |
| T-06 | Billing | `splitPaise` across 1, 2, 20, 1000 weights | Unit | Always sums to the input | HIGH |
| T-07 | Billing | Late fee at grace boundary, day before and day after | Boundary | 0 then the fee | MEDIUM |
| T-08 | Billing | `financialYear` on 31 Mar and 1 Apr | Boundary | Previous year then next | MEDIUM |
| T-09 | API | Any endpoint under sustained request volume | Performance | Throttled, not pool-exhausted | MEDIUM |
| T-10 | Frontend | Every modal: Escape closes, focus trapped, focus restored | Accessibility | All three hold | HIGH |
| T-11 | Frontend | Every form field reachable and named by keyboard alone | Accessibility | All named | HIGH |
| T-12 | Frontend | Each screen at 375px, 768px, 1280px | Responsive | No horizontal page scroll | MEDIUM |
| T-13 | State | Sign out in tab A, act in tab B | Integration | Tab B ends its session | LOW |
| T-14 | Migrations | Apply every migration to an empty database | Integration | Schema matches a live one | MEDIUM |
| T-15 | Seed | Run the seed twice | Integration | No duplicate rows | HIGH |

---

## Priority remediation roadmap

### Phase 1 — before anyone relies on this

1. Close the move-out bypass (A-01).
2. Make signing out revoke the token (A-02).
3. Validate every write route, starting with resident tickets (A-03).
4. Require the production configuration to be present (A-10).
5. One idempotent seed that honours one-time passwords (A-12).

### Phase 2 — before real users

6. An accessible modal shell and bound labels (A-04).
7. A toast and dialog system replacing alert and prompt (A-08).
8. Rate limiting across the API (A-06).
9. ESLint, a CI workflow, and the four suites running in it (A-05).
10. `npm audit fix` on both packages (A-27).

### Phase 3 — before it grows

11. Cursor pagination on the gate log and invoices (A-09).
12. Kill the N+1 on polls, late fees and reminders (A-07).
13. Code splitting by route (A-11).
14. Unit tests on the billing arithmetic (A-13).
15. Structured logging and a health endpoint (A-15).

### Phase 4 — polish

16. Everything in the creative improvements list.
17. Split `billingController`, extract the duplicated `activeUnitFor` (A-25, A-26).
18. Retention policy on gate logs and audit IPs (A-22).

---

## Top 10 most important problems

| Rank | Issue | Severity | Impact |
| ---: | :--- | :--- | :--- |
| 1 | Onboarding bypasses the move-out dues gate and NOC | HIGH | Debt orphaned, no certificate, departing session left live |
| 2 | Signing out revokes nothing | HIGH | A copied token outlives sign-out by up to a day |
| 3 | 103 of 124 routes accept an unvalidated body | HIGH | Confirmed 500s and junk data through one of them |
| 4 | Accessibility is effectively absent | HIGH | Unusable with a screen reader, hostile to keyboard |
| 5 | No CI, linter, Docker or deployment path | HIGH | Nothing prevents a regression; never run off localhost |
| 6 | Rate limiting covers only sign-in | MEDIUM | Any account can exhaust the connection pool |
| 7 | Browser dialogs carry the product's feedback | MEDIUM | Reads as a prototype; four primary flows depend on `prompt` |
| 8 | No pagination on growing lists | MEDIUM | Unbounded responses, page two unreachable |
| 9 | Two disagreeing seed scripts | MEDIUM | Produced the duplicate-home corruption fixed yesterday |
| 10 | No observability beyond console | MEDIUM | A production incident would be diagnosed by reading stdout |

---

## Top 10 improvement opportunities

1. An accessible modal shell, adopted by all seventeen overlays.
2. A toast and inline-reason system replacing 71 browser dialogs.
3. CI running lint plus the four suites against a MySQL service container.
4. `validate()` on every write route, generated from one schema map.
5. Unit tests on `services/billing.js`, the highest-value untested code.
6. Cursor pagination copied from the audit log to every growing list.
7. Route-level code splitting, so the gate desk stops downloading the finance module.
8. A month-end close checklist joining the four monthly committee actions.
9. Structured logging with a request id on every request, not only failures.
10. A Dockerfile and a documented deploy, so the project can leave localhost.

---

## Production readiness scorecard

| Category | Score | Why |
| :--- | ---: | :--- |
| Architecture | 6 | Clean route-role-controller layering, honest simplicity. No repository or domain layer, a 1,177-line controller, a helper duplicated five times. |
| Code Quality | 7 | Consistent, well-named, comments explain why. No linter, no types, some very large files. |
| Functional Correctness | 7 | 219 checks pass and assert real invariants. One confirmed business-logic bypass and three input defects. |
| Testing | 5 | Unusually good business coverage, wrong shape: needs a live server, no unit tests on the arithmetic, nothing on the frontend, cannot run in CI. |
| API Quality | 6 | Consistent envelope, correct status codes, roles declared per route. No validation on most routes, no pagination, no versioning, no contract. |
| Database Design | 7 | InnoDB throughout, every FK indexed, integer paise, row locks, a clever generated column. A dead table, unreachable enum values, one missing FK. |
| Security | 6 | No injection, no mass assignment, no secrets in history, headers present, login throttled, audit trail. Token in localStorage, no logout revocation, rate limiting only on sign-in. |
| Authentication | 7 | One-time passwords, forced change, widening throttle, token versioning. No logout revocation, no reset path, no MFA. |
| Authorization | 8 | The strongest layer. Declared at the route, enforced again in the controller, object-level checks confirmed by probe. |
| UI/UX | 5 | Coherent visual language and honest empty states, undermined by 71 browser dialogs and inconsistent confirmation. |
| Accessibility | 2 | 83 unbound labels, 17 modals with no dialog semantics, focus trap, or Escape. Two aria attributes in the whole application. |
| Responsive Design | 6 | Tailwind breakpoints used throughout, most tables wrapped. Two are not, some admin rows will crush. Not visually verified. |
| Performance | 5 | 561 kB single chunk, three N+1 loops, request waterfalls, no caching. Fine at this size, none of it scales. |
| Scalability | 4 | Built for one building and says so. Unbounded reads, client-side filtering, a DB lookup per request, a pool of 10. |
| Reliability | 6 | Transactions where money moves, two concurrency races verified safe. Predictable bad input still surfaces as 500. |
| Error Handling | 6 | One handler, a quotable reference, no internals leaked. Validation gaps push avoidable errors into it. |
| Observability | 3 | A real business audit trail, and nothing else. No metrics, no health probe, no structured logs. |
| DevOps | 1 | No Docker, CI, linter, formatter, license or deploy. Only the migration runner. |
| Documentation | 8 | README, working guide, roadmap and review all current and genuinely useful. No API reference, deploy guide or licence. |
| Maintainability | 6 | Strong conventions and documentation, weakened by no linter, no types and duplicated helpers. |
| Product Quality | 6 | The domain thinking is excellent. The interaction layer is unfinished, and roughly half the screens have no data behind them. |
| **Overall Production Readiness** | **4** | Sound core, absent operations, near-zero accessibility, one confirmed control bypass. |

---

## Final verdict

**NEEDS SIGNIFICANT WORK.**

Not because the engineering is poor. The reasoning inside this codebase is
better than most projects twice its size: money is handled in integer paise and
reconciles exactly, time-dependent state is derived rather than stored, a
household gets one vote because that is how a society actually decides things,
and a late fee is raised as a real adjustment because a charge that appears on
Monday and vanishes on Tuesday is a rumour rather than a charge. Those are the
decisions of someone thinking about the problem rather than the demo.

It is not production-ready for five specific reasons.

**There is a confirmed bypass of a control the system enforces elsewhere.** The
dues gate on move-out refuses correctly and is then walked around by the
onboarding route. Any system where the same admin has two paths and only one
carries the rules has not finished modelling the workflow.

**Signing out does not sign you out.** The revocation machinery exists and is
correct; it is simply never called. On a building's shared office computer that
matters.

**Most write routes accept anything.** The validator exists and is applied to a
fifth of the API. Every input defect found in this audit sits on a route it was
not applied to.

**The product excludes people.** Eighty-three unbound labels and seventeen modals
with no dialog semantics means a resident using a screen reader cannot pay their
dues. For software residents are expected to use, that is not a polish item.

**It has never left localhost.** No container, no pipeline, no linter, no
licence, no deployment. There is nothing to stop a regression and no defined way
to ship.

None of the five is hard. The first two are a day's work between them. The third
is mechanical. The fourth is a modal component and a pass over the forms. The
fifth is a Dockerfile and a CI workflow. The distance between this project and
production is measured in days of unglamorous work, not in rearchitecture, which
is a far better place to be than the reverse.
