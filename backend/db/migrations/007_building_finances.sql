-- Phase 5. The other half of the ledger.
--
-- Until now LogApart recorded money coming in and nothing going out, so it
-- could not answer the one question a committee is actually asked at the annual
-- meeting: where did the maintenance go?
--
-- Money stays in DECIMAL rupees to match invoices and payment_records. The
-- arithmetic still runs in integer paise inside services/billing.js.

CREATE TABLE IF NOT EXISTS `vendors` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `service` VARCHAR(100) NOT NULL COMMENT 'Lifts, housekeeping, pest control',
  `contact_person` VARCHAR(120) DEFAULT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `note` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_vendor_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A lift AMC lapsing unnoticed is a real failure mode, so a contract carries
-- the day it ends and how much warning the building wants before that.
CREATE TABLE IF NOT EXISTS `vendor_contracts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `vendor_id` INT NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'Contract value for the term',
  `remind_days_before` INT NOT NULL DEFAULT 30,
  `note` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_contract_end` (`end_date`),
  KEY `vendor_id` (`vendor_id`),
  CONSTRAINT `vendor_contracts_ibfk_1` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- An expense may name a vendor from the registry or just a payee, because the
-- plumber called out once on a Sunday is not worth a vendor record.
CREATE TABLE IF NOT EXISTS `expenses` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `vendor_id` INT DEFAULT NULL,
  `payee_name` VARCHAR(150) NOT NULL,
  `category` ENUM(
    'COMMON_ELECTRICITY','COMMON_WATER','LIFT_AMC','HOUSEKEEPING','SECURITY_AGENCY',
    'REPAIRS','GARDENING','PEST_CONTROL','ADMINISTRATION','OTHER'
  ) NOT NULL DEFAULT 'OTHER',
  `fund` ENUM('MAINTENANCE','CORPUS') NOT NULL DEFAULT 'MAINTENANCE'
    COMMENT 'A corpus contribution is not maintenance income and cannot be spent as one',
  `amount` DECIMAL(12,2) NOT NULL,
  `bill_date` DATE NOT NULL,
  `paid_on` DATE DEFAULT NULL COMMENT 'Null while the bill is approved but unpaid',
  `mode` ENUM('UPI','CASH','BANK_TRANSFER','CHEQUE','OTHER') NOT NULL DEFAULT 'BANK_TRANSFER',
  `reference` VARCHAR(100) DEFAULT NULL,
  `note` VARCHAR(255) DEFAULT NULL,
  `ticket_id` INT DEFAULT NULL COMMENT 'The repair this settles, when it settles one',
  `recorded_by_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bill_date` (`bill_date`),
  KEY `idx_category` (`category`),
  KEY `ticket_id` (`ticket_id`),
  KEY `vendor_id` (`vendor_id`),
  CONSTRAINT `expenses_ibfk_1` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`) ON DELETE SET NULL,
  CONSTRAINT `expenses_ibfk_2` FOREIGN KEY (`ticket_id`) REFERENCES `maintenance_tickets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `expenses_ibfk_3` FOREIGN KEY (`recorded_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- The Indian financial year runs April to March, so it is stored as '2026-2027'
-- rather than inferred from a calendar year.
CREATE TABLE IF NOT EXISTS `budgets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `financial_year` VARCHAR(9) NOT NULL,
  `category` ENUM(
    'COMMON_ELECTRICITY','COMMON_WATER','LIFT_AMC','HOUSEKEEPING','SECURITY_AGENCY',
    'REPAIRS','GARDENING','PEST_CONTROL','ADMINISTRATION','OTHER'
  ) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `note` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_year_category` (`financial_year`, `category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A late fee changes what a flat owes, so it moves invoices.total_amount and
-- leaves this row behind as the explanation. The amount originally billed is
-- therefore total_amount minus the adjustments recorded here, which keeps every
-- existing balance query correct without a second notion of what is payable.
CREATE TABLE IF NOT EXISTS `invoice_adjustments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `invoice_id` INT NOT NULL,
  `kind` ENUM('LATE_FEE','WAIVER','CREDIT','CORRECTION') NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL COMMENT 'Positive adds to the bill, negative reduces it',
  `reason` VARCHAR(255) NOT NULL,
  `created_by_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`),
  CONSTRAINT `invoice_adjustments_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `invoice_adjustments_ibfk_2` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A resident who pays by UPI had to chase an admin to record it. A declaration
-- is their side of that conversation and never moves a balance on its own.
CREATE TABLE IF NOT EXISTS `payment_declarations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `invoice_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `declared_by_id` INT NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `mode` ENUM('UPI','CASH','BANK_TRANSFER','CHEQUE','OTHER') NOT NULL DEFAULT 'UPI',
  `reference` VARCHAR(100) DEFAULT NULL,
  `paid_on` DATE NOT NULL,
  `note` VARCHAR(255) DEFAULT NULL,
  `status` ENUM('PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by_id` INT DEFAULT NULL,
  `reviewed_at` TIMESTAMP NULL DEFAULT NULL,
  `review_note` VARCHAR(255) DEFAULT NULL,
  `payment_record_id` INT DEFAULT NULL COMMENT 'The real payment this became, once verified',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_declaration_status` (`status`),
  KEY `invoice_id` (`invoice_id`),
  KEY `unit_id` (`unit_id`),
  CONSTRAINT `payment_declarations_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payment_declarations_ibfk_2` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payment_declarations_ibfk_3` FOREIGN KEY (`declared_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Who has been chased and who has not, so a committee is not guessing.
CREATE TABLE IF NOT EXISTS `dues_reminders` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `invoice_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `sent_by_id` INT NOT NULL,
  `days_overdue` INT NOT NULL DEFAULT 0,
  `sent_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`),
  CONSTRAINT `dues_reminders_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A payment was recorded and the resident got nothing back.
ALTER TABLE `payment_records`
  ADD COLUMN `receipt_number` VARCHAR(32) DEFAULT NULL COMMENT 'RCP-2026-0001, issued on recording' AFTER `id`,
  ADD UNIQUE KEY `uniq_receipt_number` (`receipt_number`);

-- A corpus contribution collected alongside maintenance, kept as its own line
-- so the statement can never show the two as one pot of money.
ALTER TABLE `billing_runs`
  ADD COLUMN `corpus_rate` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Flat amount per home, not per square foot' AFTER `maintenance_rate`;

ALTER TABLE `invoices`
  ADD COLUMN `corpus_amount` DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `water_amount`;
