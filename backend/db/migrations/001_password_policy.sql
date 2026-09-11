-- Phase 0: force onboarded residents off the shared default password.
-- Existing accounts are flagged so they must set their own password at next login.

ALTER TABLE `users`
  ADD COLUMN `must_change_password` TINYINT(1) NOT NULL DEFAULT 0 AFTER `phone`;

UPDATE `users` SET `must_change_password` = 1 WHERE `role` = 'RESIDENT';
