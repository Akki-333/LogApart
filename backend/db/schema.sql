-- LogApart baseline schema.
-- Creates every table the application expects. Safe to re-run.
-- Incremental changes live in db/migrations and are applied by db/migrate.js.

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('SUPER_ADMIN','ADMIN','SECURITY','RESIDENT','MAINTENANCE_STAFF','ACCOUNTANT') DEFAULT 'RESIDENT',
  `phone` VARCHAR(20) DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `units` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `number` VARCHAR(50) NOT NULL,
  `floor` INT NOT NULL,
  `block_name` VARCHAR(50) NOT NULL,
  `type` ENUM('OWNER','TENANT') DEFAULT 'TENANT',
  `area` DECIMAL(10,2) DEFAULT NULL,
  `is_occupied` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `residents` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `move_in_date` DATE DEFAULT NULL,
  `move_out_date` DATE DEFAULT NULL,
  `emergency_contact` VARCHAR(20) DEFAULT NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `unit_id` (`unit_id`),
  CONSTRAINT `residents_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `residents_ibfk_2` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `maintenance_tickets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `unit_id` INT NOT NULL,
  `created_by_id` INT NOT NULL,
  `assigned_to_id` INT DEFAULT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `priority` ENUM('LOW','MEDIUM','HIGH','URGENT') DEFAULT 'MEDIUM',
  `status` ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED') DEFAULT 'OPEN',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `unit_id` (`unit_id`),
  KEY `created_by_id` (`created_by_id`),
  KEY `assigned_to_id` (`assigned_to_id`),
  CONSTRAINT `maintenance_tickets_ibfk_1` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`),
  CONSTRAINT `maintenance_tickets_ibfk_2` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`),
  CONSTRAINT `maintenance_tickets_ibfk_3` FOREIGN KEY (`assigned_to_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `visitor_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `visitor_name` VARCHAR(255) NOT NULL,
  `visitor_phone` VARCHAR(20) DEFAULT NULL,
  `vehicle_number` VARCHAR(50) DEFAULT NULL,
  `vehicle_type` VARCHAR(20) DEFAULT 'NONE',
  `unit_id` INT NOT NULL,
  `purpose` ENUM('GUEST','DELIVERY','SERVICE','MAID','OTHER') DEFAULT 'GUEST',
  `company` VARCHAR(50) DEFAULT NULL,
  `status` ENUM('PENDING','APPROVED','DENIED','ENTERED','EXITED') DEFAULT 'ENTERED',
  `logged_by_id` INT NOT NULL,
  `entry_time` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `exit_time` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `unit_id` (`unit_id`),
  KEY `logged_by_id` (`logged_by_id`),
  CONSTRAINT `visitor_logs_ibfk_1` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE,
  CONSTRAINT `visitor_logs_ibfk_2` FOREIGN KEY (`logged_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `target_role` ENUM('ALL','ADMIN','SECURITY','RESIDENT') DEFAULT 'ALL',
  `type` VARCHAR(50) DEFAULT 'INFO',
  `is_read` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `unit_id` INT NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `type` VARCHAR(100) NOT NULL,
  `status` ENUM('PENDING','PAID','OVERDUE','PARTIAL') DEFAULT 'PENDING',
  `due_date` DATE NOT NULL,
  `paid_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `unit_id` (`unit_id`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
