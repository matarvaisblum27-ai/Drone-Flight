-- ============================================================
-- Per-pilot per-month manual completion override
-- ============================================================
-- Admin can mark a given month as "fully completed" for a pilot
-- (self or any other). When set, the monthly matrix shows that
-- pilot as having met every required drone for that month,
-- regardless of actual flights.
--
-- Format: JSONB map of "YYYY-MM" → true
-- Example: { "2026-10": true, "2026-09": true }
-- ============================================================

ALTER TABLE pilots
  ADD COLUMN IF NOT EXISTS monthly_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
