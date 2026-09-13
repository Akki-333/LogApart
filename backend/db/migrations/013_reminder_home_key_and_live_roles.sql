-- Two loose ends from the audit.
--
-- A reminder names its home as well as its invoice, but only the invoice was a
-- real foreign key. A reminder could point at a home that no longer exists and
-- the defaulter history would quietly lose it. Checked before writing this: no
-- existing reminder points at a missing home or disagrees with its invoice.
ALTER TABLE `dues_reminders`
  ADD KEY `idx_unit` (`unit_id`),
  ADD CONSTRAINT `dues_reminders_unit_fk` FOREIGN KEY (`unit_id`) REFERENCES `units` (`id`) ON DELETE CASCADE;

-- MAINTENANCE_STAFF and ACCOUNTANT were in the enum from the first schema and
-- nothing ever granted or checked them. An account holding one could sign in to
-- no portal at all. Nobody holds either. If somebody ever does, this statement
-- fails rather than guessing what they should become, and the migration stops.
ALTER TABLE `users`
  MODIFY `role` ENUM('SUPER_ADMIN','ADMIN','SECURITY','RESIDENT') DEFAULT 'RESIDENT';
