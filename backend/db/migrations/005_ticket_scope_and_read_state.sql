-- Two modelling defects carried since the first commit.
--
-- 1. Every ticket required a flat. A lift breakdown, a failed water pump or a
--    dead hallway light had to be blamed on somebody's unit, which contradicts
--    the "structural and common" scope the ticket system was built for.
--
-- 2. notifications.is_read was one global flag. The first person to open the
--    bell marked the notification read for everybody, so the unread badge was
--    wrong for every other reader.

ALTER TABLE `maintenance_tickets`
  MODIFY COLUMN `unit_id` INT NULL COMMENT 'Null for a common-area issue',
  ADD COLUMN `scope` ENUM('UNIT','COMMON') NOT NULL DEFAULT 'UNIT' AFTER `unit_id`,
  ADD COLUMN `location` VARCHAR(100) DEFAULT NULL COMMENT 'Where, for a common issue: Lift A, terrace, pump room' AFTER `scope`;

-- Everything raised so far was against a flat, which stays true.
UPDATE `maintenance_tickets` SET `scope` = 'UNIT' WHERE `unit_id` IS NOT NULL;

-- Read state belongs to a person, not to the notification.
CREATE TABLE IF NOT EXISTS `notification_reads` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `notification_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `read_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_notification_user` (`notification_id`, `user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notification_reads_ibfk_1` FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `notification_reads_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A single shared flag cannot be migrated into per-person state, because it
-- never recorded who did the reading. Nothing correct is lost by removing it.
ALTER TABLE `notifications` DROP COLUMN `is_read`;
