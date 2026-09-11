-- Phase 3: daily community value.
--
-- Four modules the building runs on day to day: the people who come every
-- morning, the notices pinned by the door, the parking bays, and the staff
-- whose attendance decides their pay.

-- Maids, cooks, drivers and milkmen. These are recurring people, not visitors,
-- and mixing them into visitor_logs would drown the gate view: one maid across
-- three flats generates more gate events in a month than every delivery.
CREATE TABLE IF NOT EXISTS `helpers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `helper_type` ENUM('MAID','COOK','DRIVER','MILKMAN','NEWSPAPER','NANNY','GARDENER','OTHER') NOT NULL DEFAULT 'MAID',
  `id_proof_type` VARCHAR(50) DEFAULT NULL,
  `id_proof_number` VARCHAR(50) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_helper_active` (`is_active`),
  KEY `created_by_id` (`created_by_id`),
  CONSTRAINT `helpers_ibfk_1` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One helper commonly works for several flats, so the link is its own table.
CREATE TABLE IF NOT EXISTS `helper_units` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `helper_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_helper_unit` (`helper_id`, `unit_id`),
  KEY `unit_id` (`unit_id`),
  CONSTRAINT `helper_units_ibfk_1` FOREIGN KEY (`helper_id`) REFERENCES `helpers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `helper_units_ibfk_2` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One check-in per arrival, shared across every flat that helper serves.
CREATE TABLE IF NOT EXISTS `helper_attendance` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `helper_id` INT NOT NULL,
  `check_in` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `check_out` TIMESTAMP NULL DEFAULT NULL,
  `logged_by_id` INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `helper_id` (`helper_id`),
  KEY `idx_check_in` (`check_in`),
  CONSTRAINT `helper_attendance_ibfk_1` FOREIGN KEY (`helper_id`) REFERENCES `helpers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `helper_attendance_ibfk_2` FOREIGN KEY (`logged_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Notices replace the community banner that was hardcoded into the admin
-- dashboard. A notice has a life: it starts, optionally ends, and people can
-- confirm they have read it.
CREATE TABLE IF NOT EXISTS `notices` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `category` ENUM('GENERAL','MAINTENANCE','UTILITY','EVENT','URGENT') NOT NULL DEFAULT 'GENERAL',
  `audience` ENUM('ALL','RESIDENT','SECURITY') NOT NULL DEFAULT 'ALL',
  `starts_on` DATE NOT NULL,
  `ends_on` DATE DEFAULT NULL COMMENT 'Null means it stays up until withdrawn',
  `is_published` TINYINT(1) NOT NULL DEFAULT 1,
  `posted_by_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notice_window` (`is_published`, `starts_on`, `ends_on`),
  KEY `posted_by_id` (`posted_by_id`),
  CONSTRAINT `notices_ibfk_1` FOREIGN KEY (`posted_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `notice_acknowledgements` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `notice_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `acknowledged_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_notice_user` (`notice_id`, `user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notice_ack_ibfk_1` FOREIGN KEY (`notice_id`) REFERENCES `notices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notice_ack_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Parking bays belong to the building and are allotted to flats. A bay with no
-- unit is unallotted; a bay with a vehicle_number has a car on record.
CREATE TABLE IF NOT EXISTS `parking_bays` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `bay_number` VARCHAR(20) NOT NULL,
  `level` VARCHAR(20) NOT NULL DEFAULT 'Ground',
  `unit_id` INT DEFAULT NULL,
  `vehicle_number` VARCHAR(50) DEFAULT NULL,
  `notes` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_bay_number` (`bay_number`),
  KEY `unit_id` (`unit_id`),
  CONSTRAINT `parking_bays_ibfk_1` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `parking_violations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `bay_id` INT NOT NULL,
  `vehicle_number` VARCHAR(50) NOT NULL,
  `note` VARCHAR(255) DEFAULT NULL,
  `status` ENUM('OPEN','RESOLVED','WAIVED') NOT NULL DEFAULT 'OPEN',
  `reported_by_id` INT NOT NULL,
  `occurred_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `bay_id` (`bay_id`),
  KEY `idx_violation_vehicle` (`vehicle_number`),
  KEY `reported_by_id` (`reported_by_id`),
  CONSTRAINT `parking_violations_ibfk_1` FOREIGN KEY (`bay_id`) REFERENCES `parking_bays` (`id`) ON DELETE CASCADE,
  CONSTRAINT `parking_violations_ibfk_2` FOREIGN KEY (`reported_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Building staff. Kept separate from users because a cleaner or plumber needs
-- to be on the payroll without ever needing a login; user_id links the ones
-- who do sign in, such as the guards.
CREATE TABLE IF NOT EXISTS `staff` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `role_title` VARCHAR(100) NOT NULL COMMENT 'Security Guard, Cleaner, Plumber',
  `monthly_salary` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `joined_on` DATE DEFAULT NULL,
  `user_id` INT DEFAULT NULL COMMENT 'Linked login, where they have one',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_staff_active` (`is_active`),
  CONSTRAINT `staff_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per person per day. The unique key makes marking a day twice an
-- update rather than a duplicate.
CREATE TABLE IF NOT EXISTS `staff_attendance` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `staff_id` INT NOT NULL,
  `attendance_date` DATE NOT NULL,
  `status` ENUM('PRESENT','ABSENT','HALF_DAY','LEAVE') NOT NULL DEFAULT 'PRESENT',
  `note` VARCHAR(255) DEFAULT NULL,
  `marked_by_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_staff_day` (`staff_id`, `attendance_date`),
  KEY `idx_attendance_date` (`attendance_date`),
  KEY `marked_by_id` (`marked_by_id`),
  CONSTRAINT `staff_attendance_ibfk_1` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE,
  CONSTRAINT `staff_attendance_ibfk_2` FOREIGN KEY (`marked_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
