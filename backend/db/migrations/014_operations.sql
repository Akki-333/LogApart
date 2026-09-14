-- Phase 7, operations.
--
-- An asset register that tickets and expenses can point at, so a lift carries
-- its own service history. A breach timestamp on tickets, set once when the SLA
-- is first missed, so the admins are told exactly once. Guard shifts with a
-- handover note the next guard must acknowledge. And move-out as a record with a
-- checklist, rather than a single button.

CREATE TABLE IF NOT EXISTS `assets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `category` ENUM('LIFT','PUMP','DG_SET','WATER_TANK','STP','FIRE_SAFETY','ELECTRICAL','OTHER') NOT NULL DEFAULT 'OTHER',
  `location` VARCHAR(120) DEFAULT NULL,
  `installed_on` DATE DEFAULT NULL,
  `vendor_id` INT DEFAULT NULL,
  `note` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_asset_name` (`name`),
  KEY `idx_asset_vendor` (`vendor_id`),
  CONSTRAINT `assets_vendor_fk` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `maintenance_tickets`
  ADD COLUMN `asset_id` INT DEFAULT NULL AFTER `location`,
  ADD COLUMN `sla_breached_at` TIMESTAMP NULL DEFAULT NULL COMMENT 'Set once, when the breach is first noticed and the admins are told',
  ADD KEY `idx_ticket_asset` (`asset_id`),
  ADD CONSTRAINT `tickets_asset_fk` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE SET NULL;

ALTER TABLE `expenses`
  ADD COLUMN `asset_id` INT DEFAULT NULL AFTER `ticket_id`,
  ADD KEY `idx_expense_asset` (`asset_id`),
  ADD CONSTRAINT `expenses_asset_fk` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`) ON DELETE SET NULL;

-- The generated column holds the guard only while the shift is open, so the
-- unique key allows one open shift per guard and any number of closed ones.
CREATE TABLE IF NOT EXISTS `guard_shifts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `guard_id` INT NOT NULL,
  `started_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at` TIMESTAMP NULL DEFAULT NULL,
  `handover_note` VARCHAR(1000) DEFAULT NULL,
  `acknowledged_by_id` INT DEFAULT NULL,
  `acknowledged_at` TIMESTAMP NULL DEFAULT NULL,
  `open_guard_id` INT GENERATED ALWAYS AS (IF(`ended_at` IS NULL, `guard_id`, NULL)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_open_shift` (`open_guard_id`),
  KEY `idx_shift_guard` (`guard_id`, `started_at`),
  KEY `idx_shift_ended` (`ended_at`),
  CONSTRAINT `shifts_guard_fk` FOREIGN KEY (`guard_id`) REFERENCES `users` (`id`),
  CONSTRAINT `shifts_ack_fk` FOREIGN KEY (`acknowledged_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One open move-out per home, by the same generated-column trick. The steps are
-- not stored: each is read from the records it depends on.
CREATE TABLE IF NOT EXISTS `move_outs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `unit_id` INT NOT NULL,
  `resident_user_id` INT NOT NULL,
  `notice_given_on` DATE NOT NULL,
  `planned_move_out` DATE NOT NULL,
  `status` ENUM('OPEN','COMPLETED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  `note` VARCHAR(255) DEFAULT NULL,
  `created_by_id` INT NOT NULL,
  `completed_at` TIMESTAMP NULL DEFAULT NULL,
  `certificate_number` VARCHAR(32) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `open_unit_id` INT GENERATED ALWAYS AS (IF(`status` = 'OPEN', `unit_id`, NULL)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_open_move_out` (`open_unit_id`),
  KEY `idx_move_out_unit` (`unit_id`),
  CONSTRAINT `move_outs_unit_fk` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`),
  CONSTRAINT `move_outs_resident_fk` FOREIGN KEY (`resident_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `move_outs_creator_fk` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
