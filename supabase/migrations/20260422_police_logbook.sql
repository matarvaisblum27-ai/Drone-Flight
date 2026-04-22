-- ============================================================
-- Add police_logbook_entered flag to flights
-- ============================================================
-- Tracks whether the flight was recorded in the police logbook
-- (בוצע הזנה ללוג בוק משטרתי). Defaults to false for all
-- existing and new rows; flight-complete computation does NOT
-- require this field.
-- ============================================================

ALTER TABLE flights
  ADD COLUMN IF NOT EXISTS police_logbook_entered BOOLEAN NOT NULL DEFAULT false;
