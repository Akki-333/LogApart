-- Phase 6. The things a resident actually does in a week.
--
-- The portal answered what they owe and what they reported. It did not carry
-- booking the terrace, saying who lives in the flat, voting on a society
-- decision, or collecting a parcel the guard is holding.

CREATE TABLE IF NOT EXISTS `amenities` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `opens_at` TIME NOT NULL DEFAULT '06:00:00',
  `closes_at` TIME NOT NULL DEFAULT '22:00:00',
  `slot_hours` INT NOT NULL DEFAULT 2 COMMENT 'Length of one booking',
  `charge` DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Posted to the next dues run when set',
  `needs_approval` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_amenity_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One booking per slot, enforced by a unique key rather than by a check in the
-- controller. Two residents tapping the same slot at the same moment is exactly
-- the case a read-then-write check misses.
CREATE TABLE IF NOT EXISTS `amenity_bookings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `amenity_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `booked_by_id` INT NOT NULL,
  `booking_date` DATE NOT NULL,
  `starts_at` TIME NOT NULL,
  `ends_at` TIME NOT NULL,
  `status` ENUM('PENDING','CONFIRMED','REJECTED','CANCELLED') NOT NULL DEFAULT 'CONFIRMED',
  `charge` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `note` VARCHAR(255) DEFAULT NULL,
  `reviewed_by_id` INT DEFAULT NULL,
  `review_note` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_slot` (`amenity_id`, `booking_date`, `starts_at`),
  KEY `unit_id` (`unit_id`),
  CONSTRAINT `amenity_bookings_ibfk_1` FOREIGN KEY (`amenity_id`) REFERENCES `amenities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `amenity_bookings_ibfk_2` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE,
  CONSTRAINT `amenity_bookings_ibfk_3` FOREIGN KEY (`booked_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Who lives in the flat, beyond the one person who holds the login.
CREATE TABLE IF NOT EXISTS `household_members` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `unit_id` INT NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `relation` VARCHAR(40) DEFAULT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `is_minor` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `unit_id` (`unit_id`),
  CONSTRAINT `household_members_ibfk_1` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A registered vehicle turns "an unknown car in bay 12" into "3B's car in 2A's
-- bay", which is a conversation between neighbours rather than a mystery.
CREATE TABLE IF NOT EXISTS `household_vehicles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `unit_id` INT NOT NULL,
  `vehicle_type` ENUM('CAR','BIKE','SCOOTER','CYCLE','OTHER') NOT NULL DEFAULT 'CAR',
  `number_plate` VARCHAR(20) NOT NULL,
  `model` VARCHAR(60) DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_plate` (`number_plate`),
  KEY `unit_id` (`unit_id`),
  CONSTRAINT `household_vehicles_ibfk_1` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Listed only for residents who switched it on themselves. Default off.
ALTER TABLE `residents`
  ADD COLUMN `show_in_directory` TINYINT(1) NOT NULL DEFAULT 0 AFTER `emergency_contact`;
