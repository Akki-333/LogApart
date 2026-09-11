-- Phase 1: the billing engine.
--
-- Replaces the `payments` table, which was created early, never referenced by
-- any code and still held zero rows. It could not express a bill made of
-- several charges, nor a part payment, so it is superseded by three tables:
-- a run per month, an invoice per unit per run, and a ledger of settlements.

DROP TABLE IF EXISTS `payments`;

-- One row each time an admin generates a month of dues.
CREATE TABLE IF NOT EXISTS `billing_runs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `period_month` DATE NOT NULL COMMENT 'First day of the billed month',
  `maintenance_rate` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `rate_basis` ENUM('FLAT','PER_SQFT') NOT NULL DEFAULT 'FLAT',
  `common_electricity_total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `common_water_total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `split_basis` ENUM('EQUAL','PER_SQFT') NOT NULL DEFAULT 'EQUAL',
  `due_date` DATE NOT NULL,
  `units_billed` INT NOT NULL DEFAULT 0,
  `total_billed` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `note` VARCHAR(255) DEFAULT NULL,
  `generated_by_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_period` (`period_month`),
  KEY `generated_by_id` (`generated_by_id`),
  CONSTRAINT `billing_runs_ibfk_1` FOREIGN KEY (`generated_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One bill per occupied unit per run. Charges are kept apart so a resident can
-- see what they are paying for rather than a single opaque figure.
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `billing_run_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `resident_user_id` INT DEFAULT NULL COMMENT 'Resident active when the bill was raised',
  `period_month` DATE NOT NULL,
  `maintenance_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `electricity_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `water_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `amount_paid` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('PENDING','PARTIAL','PAID') NOT NULL DEFAULT 'PENDING',
  `due_date` DATE NOT NULL,
  `paid_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_run_unit` (`billing_run_id`, `unit_id`),
  KEY `unit_id` (`unit_id`),
  KEY `resident_user_id` (`resident_user_id`),
  KEY `idx_period` (`period_month`),
  KEY `idx_status` (`status`),
  CONSTRAINT `invoices_ibfk_1` FOREIGN KEY (`billing_run_id`) REFERENCES `billing_runs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `invoices_ibfk_2` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`),
  CONSTRAINT `invoices_ibfk_3` FOREIGN KEY (`resident_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Every settlement against an invoice. Buildings collect over UPI, cash and
-- transfers, so this records what arrived rather than moving money itself.
CREATE TABLE IF NOT EXISTS `payment_records` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `invoice_id` INT NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `mode` ENUM('UPI','CASH','BANK_TRANSFER','CHEQUE','OTHER') NOT NULL DEFAULT 'UPI',
  `reference` VARCHAR(100) DEFAULT NULL COMMENT 'UPI ref, cheque number, transaction id',
  `paid_on` DATE NOT NULL,
  `note` VARCHAR(255) DEFAULT NULL,
  `recorded_by_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`),
  KEY `recorded_by_id` (`recorded_by_id`),
  CONSTRAINT `payment_records_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payment_records_ibfk_2` FOREIGN KEY (`recorded_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- The move-out certificate becomes a stored record rather than a printed claim,
-- capturing what was actually outstanding when it was issued.
CREATE TABLE IF NOT EXISTS `noc_certificates` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `certificate_number` VARCHAR(40) NOT NULL,
  `unit_id` INT NOT NULL,
  `unit_number` VARCHAR(50) NOT NULL,
  `resident_user_id` INT DEFAULT NULL,
  `resident_name` VARCHAR(255) NOT NULL,
  `move_out_date` DATE NOT NULL,
  `outstanding_at_issue` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `dues_waived` TINYINT(1) NOT NULL DEFAULT 0,
  `waiver_reason` VARCHAR(255) DEFAULT NULL,
  `issued_by_id` INT NOT NULL,
  `issued_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_certificate_number` (`certificate_number`),
  KEY `unit_id` (`unit_id`),
  KEY `issued_by_id` (`issued_by_id`),
  CONSTRAINT `noc_certificates_ibfk_1` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`),
  CONSTRAINT `noc_certificates_ibfk_2` FOREIGN KEY (`resident_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `noc_certificates_ibfk_3` FOREIGN KEY (`issued_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
