-- Phase 6, second half. A ticket that talks back, a society that decides
-- things, and the parcel sitting at the gate.

-- A resident reported an issue and then heard nothing until it closed.
CREATE TABLE IF NOT EXISTS `ticket_comments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ticket_id` INT NOT NULL,
  `author_id` INT NOT NULL,
  `body` VARCHAR(1000) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ticket_id` (`ticket_id`),
  CONSTRAINT `ticket_comments_ibfk_1` FOREIGN KEY (`ticket_id`) REFERENCES `maintenance_tickets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ticket_comments_ibfk_2` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Resolution quality was assumed. A rating makes it measurable, and a reopen
-- window means "resolved" has to survive contact with the person who reported it.
ALTER TABLE `maintenance_tickets`
  ADD COLUMN `rating` TINYINT DEFAULT NULL COMMENT '1 to 5, given by the resident who raised it' AFTER `resolved_at`,
  ADD COLUMN `rating_note` VARCHAR(255) DEFAULT NULL AFTER `rating`,
  ADD COLUMN `reopened_at` TIMESTAMP NULL DEFAULT NULL AFTER `rating_note`,
  ADD COLUMN `reopen_count` INT NOT NULL DEFAULT 0 AFTER `reopened_at`;

-- One vote per flat, not per person, because that is how a society decides
-- things. The unique key is on the unit for exactly that reason.
CREATE TABLE IF NOT EXISTS `polls` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `question` VARCHAR(255) NOT NULL,
  `detail` TEXT DEFAULT NULL,
  `opens_on` DATE NOT NULL,
  `closes_on` DATE NOT NULL,
  `created_by_id` INT NOT NULL,
  `is_published` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_closes` (`closes_on`),
  CONSTRAINT `polls_ibfk_1` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `poll_options` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `poll_id` INT NOT NULL,
  `label` VARCHAR(120) NOT NULL,
  `position` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `poll_id` (`poll_id`),
  CONSTRAINT `poll_options_ibfk_1` FOREIGN KEY (`poll_id`) REFERENCES `polls` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `poll_votes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `poll_id` INT NOT NULL,
  `option_id` INT NOT NULL,
  `unit_id` INT NOT NULL,
  `voted_by_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_poll_unit` (`poll_id`, `unit_id`),
  KEY `option_id` (`option_id`),
  CONSTRAINT `poll_votes_ibfk_1` FOREIGN KEY (`poll_id`) REFERENCES `polls` (`id`) ON DELETE CASCADE,
  CONSTRAINT `poll_votes_ibfk_2` FOREIGN KEY (`option_id`) REFERENCES `poll_options` (`id`) ON DELETE CASCADE,
  CONSTRAINT `poll_votes_ibfk_3` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A delivery arriving at an empty flat is held at the desk. Used every day and
-- cheap to build, which is the best kind of feature.
CREATE TABLE IF NOT EXISTS `parcels` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `unit_id` INT NOT NULL,
  `courier` VARCHAR(60) DEFAULT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `received_by_id` INT NOT NULL,
  `received_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `collected_at` TIMESTAMP NULL DEFAULT NULL,
  `collected_by_name` VARCHAR(120) DEFAULT NULL,
  `released_by_id` INT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `unit_id` (`unit_id`),
  KEY `idx_waiting` (`collected_at`),
  CONSTRAINT `parcels_ibfk_1` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE,
  CONSTRAINT `parcels_ibfk_2` FOREIGN KEY (`received_by_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- The numbers somebody needs at two in the morning, in one place.
CREATE TABLE IF NOT EXISTS `emergency_contacts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `label` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `note` VARCHAR(255) DEFAULT NULL,
  `position` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
