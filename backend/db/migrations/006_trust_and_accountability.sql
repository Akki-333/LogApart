-- Phase 4. Three holes the application had since the first commit.
--
-- 1. A token could not be revoked. The role rides inside a JWT that lives a
--    day, and protect never re-read the user, so vacating a flat or demoting an
--    admin changed nothing until the token expired. token_version is carried in
--    the token and compared on every request, and is_active closes an account
--    outright.
--
-- 2. Login was unthrottled. Nothing recorded or limited a guessing script.
--
-- 3. Nothing was audited. A guard could delete a gate log and an admin could
--    waive dues or record a payment that never arrived, leaving no trace.

ALTER TABLE `users`
  ADD COLUMN `token_version` INT NOT NULL DEFAULT 0 COMMENT 'Bumped to invalidate every token already issued' AFTER `must_change_password`;

ALTER TABLE `users`
  ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'A closed account is refused at the door, not just hidden' AFTER `token_version`;

CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `ip` VARCHAR(45) NOT NULL,
  `succeeded` TINYINT(1) NOT NULL DEFAULT 0,
  `attempted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_email_time` (`email`, `attempted_at`),
  KEY `idx_ip_time` (`ip`, `attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- The actor is denormalised on purpose. A trail that loses the name when the
-- account is deleted is not a trail, so actor_id may go null while the row
-- still says who did it.
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `actor_id` INT DEFAULT NULL,
  `actor_name` VARCHAR(255) NOT NULL,
  `actor_role` VARCHAR(32) NOT NULL,
  `action` VARCHAR(64) NOT NULL COMMENT 'DELETE_GATE_LOG, RECORD_PAYMENT, WAIVE_DUES',
  `entity` VARCHAR(64) NOT NULL COMMENT 'Table or concept the action touched',
  `entity_id` VARCHAR(64) DEFAULT NULL,
  `summary` VARCHAR(255) NOT NULL COMMENT 'One line a committee member can read',
  `before_state` JSON DEFAULT NULL,
  `after_state` JSON DEFAULT NULL,
  `ip` VARCHAR(45) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_created` (`created_at`),
  KEY `idx_entity` (`entity`, `entity_id`),
  KEY `idx_actor` (`actor_id`),
  CONSTRAINT `audit_log_ibfk_1` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A gate record is evidence. It leaves the desk but stays in the building.
ALTER TABLE `visitor_logs`
  ADD COLUMN `deleted_at` TIMESTAMP NULL DEFAULT NULL AFTER `exit_time`;

ALTER TABLE `visitor_logs`
  ADD COLUMN `deleted_by_id` INT DEFAULT NULL AFTER `deleted_at`;

ALTER TABLE `visitor_logs`
  ADD COLUMN `delete_reason` VARCHAR(255) DEFAULT NULL AFTER `deleted_by_id`;
