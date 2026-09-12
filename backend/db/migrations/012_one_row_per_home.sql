-- Every home existed four times.
--
-- units carries no unique key on number, so the ON DUPLICATE KEY UPDATE that
-- master_seed.js used to stay idempotent had nothing to collide against. Each
-- run inserted twenty more rows. The September dues run then billed all eighty,
-- which is why its own summary said 20 homes and 50,000 while the invoices
-- attached to it came to 200,000.
--
-- This collapses each number back to its earliest row, moves everything that
-- pointed at a duplicate onto the survivor, and adds the key that should have
-- been there from the first migration so it cannot happen again.

-- The surviving row for each number. A real table rather than a temporary one,
-- because MySQL will not reopen a temporary table twice in one statement and
-- several statements below join against this.
CREATE TABLE IF NOT EXISTS `units_dedupe_map` (
  `number` VARCHAR(50) NOT NULL,
  `keep_id` INT NOT NULL,
  PRIMARY KEY (`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `units_dedupe_map` (`number`, `keep_id`)
  SELECT `number`, MIN(`id`) FROM `units` GROUP BY `number`
  ON DUPLICATE KEY UPDATE `keep_id` = VALUES(`keep_id`);

-- Rows that cannot simply be repointed, because a unique key would collide:
-- four invoices for one run and one home is exactly what uniq_run_unit forbids.
-- The survivor already carries its own copy, so the duplicates go.
DELETE child FROM `invoices` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  WHERE child.`unit_id` <> m.`keep_id`;

DELETE child FROM `amenity_bookings` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  WHERE child.`unit_id` <> m.`keep_id`;

DELETE child FROM `poll_votes` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  WHERE child.`unit_id` <> m.`keep_id`;

DELETE child FROM `helper_units` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  WHERE child.`unit_id` <> m.`keep_id`;

-- Everything else moves onto the surviving home and keeps its history.
UPDATE `residents` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  SET child.`unit_id` = m.`keep_id` WHERE child.`unit_id` <> m.`keep_id`;

UPDATE `maintenance_tickets` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  SET child.`unit_id` = m.`keep_id` WHERE child.`unit_id` <> m.`keep_id`;

UPDATE `visitor_logs` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  SET child.`unit_id` = m.`keep_id` WHERE child.`unit_id` <> m.`keep_id`;

UPDATE `noc_certificates` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  SET child.`unit_id` = m.`keep_id` WHERE child.`unit_id` <> m.`keep_id`;

UPDATE `parking_bays` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  SET child.`unit_id` = m.`keep_id` WHERE child.`unit_id` <> m.`keep_id`;

UPDATE `household_members` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  SET child.`unit_id` = m.`keep_id` WHERE child.`unit_id` <> m.`keep_id`;

UPDATE `household_vehicles` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  SET child.`unit_id` = m.`keep_id` WHERE child.`unit_id` <> m.`keep_id`;

UPDATE `parcels` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  SET child.`unit_id` = m.`keep_id` WHERE child.`unit_id` <> m.`keep_id`;

UPDATE `payment_declarations` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  SET child.`unit_id` = m.`keep_id` WHERE child.`unit_id` <> m.`keep_id`;

-- dues_reminders carries a unit_id with no constraint behind it, so nothing
-- would have stopped it pointing at a home that no longer exists.
UPDATE `dues_reminders` child
  JOIN `units` u ON child.`unit_id` = u.`id`
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  SET child.`unit_id` = m.`keep_id` WHERE child.`unit_id` <> m.`keep_id`;

DELETE u FROM `units` u
  JOIN `units_dedupe_map` m ON m.`number` = u.`number`
  WHERE u.`id` <> m.`keep_id`;

DROP TABLE `units_dedupe_map`;

-- The key that should have existed from the start.
ALTER TABLE `units`
  ADD UNIQUE KEY `uniq_unit_number` (`number`);

-- A run's stored summary has to agree with the invoices it raised.
UPDATE `billing_runs` r
  JOIN (
    SELECT `billing_run_id`, COUNT(*) AS n, SUM(`total_amount`) AS t
    FROM `invoices` GROUP BY `billing_run_id`
  ) x ON x.`billing_run_id` = r.`id`
  SET r.`units_billed` = x.n, r.`total_billed` = x.t;

-- Money was shown as collected with nothing in the payment ledger behind it, so
-- the monthly statement read zero while the dues screens read settled. What an
-- invoice says it has received is now exactly the sum of its payment records.
-- Nothing is invented here: an amount with no receipt behind it was never
-- collected, and the honest direction to correct in is downwards.
UPDATE `invoices` i
  LEFT JOIN (
    SELECT `invoice_id`, SUM(`amount`) AS paid FROM `payment_records` GROUP BY `invoice_id`
  ) p ON p.`invoice_id` = i.`id`
  SET i.`amount_paid` = COALESCE(p.paid, 0),
      i.`status` = IF(COALESCE(p.paid, 0) >= i.`total_amount`, 'PAID',
                   IF(COALESCE(p.paid, 0) > 0, 'PARTIAL', 'PENDING')),
      i.`paid_at` = IF(COALESCE(p.paid, 0) >= i.`total_amount`, i.`paid_at`, NULL);

-- Occupancy follows from who actually lives there, not from a flag somebody set.
UPDATE `units` u
  SET u.`is_occupied` = EXISTS (
    SELECT 1 FROM `residents` r WHERE r.`unit_id` = u.`id` AND r.`is_active` = true
  );
