-- A notification could only be addressed to a role, which is fine for "dues
-- raised for September" and wrong for "flat 3B is two months behind". Telling
-- every resident who is late is not a reminder, it is a notice board.
--
-- A row addressed to one person is read by that person and nobody else,
-- whatever their role.

ALTER TABLE `notifications`
  ADD COLUMN `target_user_id` INT DEFAULT NULL COMMENT 'One person, overriding target_role' AFTER `target_role`;

ALTER TABLE `notifications`
  ADD KEY `idx_target_user` (`target_user_id`),
  ADD CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
