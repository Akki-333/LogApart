-- A cancelled booking still held its slot.
--
-- uniq_slot covered (amenity_id, booking_date, starts_at) whatever the status,
-- so once somebody cancelled the terrace for Sunday evening nobody else could
-- ever take it. Cancelling has to free the slot while leaving the record that
-- somebody held it and let it go.
--
-- A generated column that is NULL for a cancelled or rejected booking does
-- exactly that, because a unique index does not treat NULLs as duplicates. Live
-- bookings still collide with each other, which is the whole point of the key.

-- The foreign key on amenity_id was leaning on uniq_slot for its index, so it
-- needs its own before that key can go.
ALTER TABLE `amenity_bookings`
  ADD KEY `idx_amenity` (`amenity_id`);

ALTER TABLE `amenity_bookings`
  DROP INDEX `uniq_slot`;

ALTER TABLE `amenity_bookings`
  ADD COLUMN `holds_slot` TINYINT
    GENERATED ALWAYS AS (IF(`status` IN ('PENDING','CONFIRMED'), 1, NULL)) STORED
    COMMENT 'Null once the booking no longer holds the slot',
  ADD UNIQUE KEY `uniq_live_slot` (`amenity_id`, `booking_date`, `starts_at`, `holds_slot`);
