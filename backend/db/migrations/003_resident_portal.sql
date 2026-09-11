-- Phase 2: the resident portal.
--
-- Adds pre-approved visitor passes. The visitor_logs status enum already
-- carried PENDING, APPROVED and DENIED from the original design but nothing
-- wrote them. A pass is a visitor_logs row raised by a resident before the
-- visitor arrives, carrying a short code the guard looks up at the gate.

ALTER TABLE `visitor_logs`
  ADD COLUMN `pass_code` VARCHAR(12) DEFAULT NULL COMMENT 'Short code a resident gives their guest' AFTER `company`,
  ADD COLUMN `expected_on` DATE DEFAULT NULL COMMENT 'Day the visitor is expected' AFTER `pass_code`,
  ADD COLUMN `created_by_id` INT DEFAULT NULL COMMENT 'Resident who raised the pass' AFTER `logged_by_id`;

-- A pass exists before anyone walks through the gate, so neither the entry
-- time nor the guard who logged it is known yet.
ALTER TABLE `visitor_logs`
  MODIFY COLUMN `entry_time` TIMESTAMP NULL DEFAULT NULL,
  MODIFY COLUMN `logged_by_id` INT NULL;

ALTER TABLE `visitor_logs`
  ADD UNIQUE KEY `uniq_pass_code` (`pass_code`),
  ADD KEY `idx_created_by` (`created_by_id`),
  ADD CONSTRAINT `visitor_logs_ibfk_3` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- Tickets raised from the resident portal need to be told apart from those an
-- admin logs, so the portal can show a resident only their own.
ALTER TABLE `maintenance_tickets`
  ADD COLUMN `raised_by_resident` TINYINT(1) NOT NULL DEFAULT 0 AFTER `created_by_id`;
