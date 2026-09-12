# LogApart review — 12 September 2026

A review of the naming, the data in the development database, and the state of
the build. Figures come from the live database and from counts over the source
tree, not from the documentation.

---

## 1. Three words for one thing

The project uses **unit**, **flat** and **apartment** for the same object, and
now a fourth is on the table.

| Word | Where it lives | Count |
| :--- | :--- | ---: |
| `unit` | the database table, every API field (`unit_id`, `unit_number`), every route | throughout |
| flat | user-facing text in the interface | 156 in 34 files |
| flat | user-facing text in API messages and audit summaries | 142 in 26 files |
| apartment | product name, database name default, dashboard heading, README opening | 5 |

`unit` is fine and should stay: it is the technical name of the record, and
nobody reads it. The problem is the word shown to a resident, which is "flat" in
the interface and "apartment" in the branding.

### The rename is not only a rename

The data model says apartment block, not house. `units.floor` holds 1 to 4,
`units.block_name` holds "Main", the seed numbers homes A to E on each floor, and
a clearance certificate prints **"Flat A-1 (Floor 2)"**. A house does not sit on
the second floor of anything. So there are two coherent readings and they cost
very different amounts:

**A. It is an apartment block, and "house" is just the word you prefer for a
home.** Keep `floor` and `block_name`, change the user-facing noun everywhere,
touch no tables. Cosmetic, about a day.

**B. These are independent houses in a gated community.** Then `floor` and
`block_name` are wrong, the four-floor heatmap on the Residents screen is wrong,
the A/A-1/A-2 numbering is wrong, and the seed is wrong. That is a data-model
change with a migration behind it.

Everything in the repository points at A: the name LogApart, the floor column,
five homes per floor across four floors, twenty in total.

### Recommendation

Pick **"home"** as the single user-facing noun, and keep `unit` in the code.

- It is true whether the dwelling is a flat or a house, so it survives a move to
  reading B without another rename.
- It reads naturally in Indian and international English alike.
- It avoids a collision that will otherwise bite.

### The collision

`'FLAT'` is also a billing enum value meaning *a flat amount*, in nine places:
the maintenance `rate_basis` (`FLAT` against `PER_SQFT`) and the late fee `basis`
(`FLAT` against `PERCENT`). A find-and-replace of "flat" across the tree would
change those and break the billing engine. The rename has to be done by hand on
the user-facing strings.

---

## 2. What the data actually says

### Every home exists four times

`units` carries 80 rows for 20 real homes. Each number appears four times.

The cause is `backend/master_seed.js`, which inserts homes with
`ON DUPLICATE KEY UPDATE`. That clause needs a unique key to fire against, and
`units` has only a primary key on `id`. Nothing ever collides, so every run of
the script adds twenty more rows. It has been run four times.

`backend/db/seed.js` does not have this problem: it counts first and skips.

This is the root of most of what follows, and it is the first thing to fix.

### The dues run billed every home four times

| | Homes | Amount |
| :--- | ---: | ---: |
| What billing run 11 recorded about itself | 20 | ₹50,000 |
| The invoices actually attached to it | 80 rows, 20 distinct homes | ₹200,000 |

The run's own summary and its invoices no longer agree, and every collection
figure, aging bucket and defaulter list downstream reads the inflated side.

### ₹25,000 is marked paid with nothing behind it

Invoices show ₹25,000 settled. `payment_records` is empty. The monthly statement
reads collections from the payment ledger, so **Books will report ₹0 collected
while My Dues reports the bills paid**. No receipt exists for any of it, so no
resident can be shown proof.

This is exactly the contradiction the audit trail was built to make impossible,
and it got in through a seed script that wrote balances directly.

### Seeded but unusable

Three helpers exist with zero links to a home. The API refuses a helper with no
link, and the gate check-in has nothing to show, so the feature reads as broken
rather than as empty.

### Phases 4 to 6 have no demo data at all

Empty: `audit_log`, `polls`, `poll_votes`, `parcels`, `emergency_contacts`,
`amenity_bookings`, `vendor_contracts`, `budgets`, `payment_declarations`,
`dues_reminders`, `noc_certificates`, `invoice_adjustments`, `ticket_comments`,
`helper_units`, `helper_attendance`, `staff_attendance`, `parking_violations`,
`notice_acknowledgements`, `household_vehicles`, `notification_reads`.

Roughly half the application shows an empty state on a walkthrough, including
every screen built in the last three phases.

### Two seed scripts that disagree

| | `backend/db/seed.js` | `backend/master_seed.js` |
| :--- | :--- | :--- |
| In git | yes | no, untracked |
| Re-runnable | yes, counts and skips | no, duplicates homes |
| Deletes existing rows | never | `DELETE FROM` on several tables |
| Passwords | random, one-time, forced change | shared `admin123`, `resident123`, no forced change |
| Covers phases 4 to 6 | no | no |

`master_seed.js` undoes the one-time-password design that Phase 0 put in, and it
is the script that produced the duplicate homes. It also tries to insert invoices
without a `billing_run_id`, which cannot succeed, and swallows the error into a
console note.

### Dead schema

- The original `payments` table is referenced by no code and is absent from this
  database. Phase 1 replaced it with `invoices` and `payment_records`.
- `users.role` still offers `MAINTENANCE_STAFF` and `ACCOUNTANT`. Nothing grants
  them and no route checks them, so an account holding one can sign in and reach
  nothing.

---

## 3. Where the build stands

**Phases 0 to 5 are shipped and verified.** 52 checks on trust and
accountability, 70 on the finances, both passing.

**Phase 6 backend is complete and verified**, 72 checks passing: amenity
bookings, household and directory, document vault, ticket conversations, polls,
parcels, emergency alert.

**Phase 6 frontend is about four-fifths done.** Landed: five resident screens,
the parcel shelf on the gate desk, the ticket conversation on both the board and
the portal. Missing: the admin surface for the new modules.

- `AmenitiesTab.jsx` is written but not wired into the Community screen and not
  committed.
- A polls tab and an emergency-contacts tab were never written.
- `Community.jsx` still lists its original four tabs.
- Uncommitted in the tree: the booking review endpoint in `amenityController.js`,
  its route, and an icon import in `Residents.jsx`.

**Phase 7 has not started.**

---

## 4. What to fix, in order

1. **Put a unique key on `units.number` and clear the duplicate homes.** A
   migration plus a one-off data fix. Everything else is downstream of this.
2. **Decide the noun.** Reading A or reading B above. Then rename the
   user-facing strings by hand, leaving the billing `'FLAT'` enum alone.
3. **Reduce to one seed script**, idempotent, honouring one-time passwords, and
   covering phases 4 to 6 so a walkthrough has something to show.
4. **Reconcile the ₹25,000.** Either write the payment records that justify it,
   with receipts, or reset the invoice balances to zero.
5. **Finish the Phase 6 admin surface** and commit what is in the tree.
6. **Drop the dead `payments` table and the two unused roles.**

Items 1 and 4 are data integrity and should not wait. Item 2 is a decision only
you can make, and the answer changes whether item 1's migration also touches
`floor` and `block_name`.
