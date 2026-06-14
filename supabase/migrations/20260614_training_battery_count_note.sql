-- ============================================================
-- Training flights, battery count, and free-text note
-- ============================================================
-- 1. missions.is_training — distinguishes training sessions
--    (so admin can review them separately and the drone-hours
--    summary can split operational vs training hours).
-- 2. flights.battery_count — how many batteries were swapped in
--    during a continuous flight (default 1).
-- 3. flights.note — free-text per-flight note, up to 50 chars
--    (length enforced in app code; column is plain TEXT).
-- ============================================================

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS is_training BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE flights
  ADD COLUMN IF NOT EXISTS battery_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE flights
  ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
