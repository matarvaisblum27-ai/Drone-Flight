-- ============================================================
-- 1. Pilot qualification override (manual traffic-light)
-- ============================================================
-- Pilots get an auto-computed status (green/orange/red) based on
-- which drone models they have flown. The admin / co-admin can
-- override that auto value via this column.
--   NULL  → use auto-computed value
--   'green' / 'orange' / 'red' → fixed manual override
-- ============================================================
ALTER TABLE pilots
  ADD COLUMN IF NOT EXISTS qualification_override TEXT NULL;

ALTER TABLE pilots
  DROP CONSTRAINT IF EXISTS pilots_qualification_override_check;

ALTER TABLE pilots
  ADD CONSTRAINT pilots_qualification_override_check
  CHECK (qualification_override IS NULL OR qualification_override IN ('green','orange','red'));

-- ============================================================
-- 2. Rename drone model: "מאביק 3 גלילית" → "מאביק 3 מאביק צהלי"
-- ============================================================
-- One-shot rename of all drone rows currently labelled "מאביק 3 גלילית".
-- Flights are unaffected (they reference tail_number, not model name).
-- ============================================================
UPDATE drones
SET model_name = 'מאביק 3 מאביק צהלי'
WHERE model_name = 'מאביק 3 גלילית';
