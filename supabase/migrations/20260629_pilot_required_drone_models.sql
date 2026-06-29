-- ============================================================
-- Per-pilot required drone-models list (qualification spec)
-- ============================================================
-- Each pilot has a list of drone MODELS (not tail numbers) they
-- are required to be qualified on. The qualification traffic
-- light uses this list:
--   green  → pilot has flown every required model
--   orange → pilot has flown some, not all
--   red    → pilot has not flown any required model
-- If the list is empty, the system falls back to the default
-- (all matrix models) for backwards compatibility.
-- Stored as a JSON array of strings, e.g.
--   ["מאביק 3", "מאטריס 300", "G3"]
-- ============================================================

ALTER TABLE pilots
  ADD COLUMN IF NOT EXISTS required_drone_models JSONB NOT NULL DEFAULT '[]'::jsonb;
