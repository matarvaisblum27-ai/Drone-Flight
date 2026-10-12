-- ============================================================
-- Soft delete for drones & pilots
-- ============================================================
-- "Deleting" a drone or pilot from the admin UI should disable it
-- from current operations (not appear in flight-entry dropdowns, not
-- counted in active fleet matrices, hidden from the pilot pickers)
-- while PRESERVING history: past flights keep showing them, totals
-- still include their minutes, and they stay visible in the records
-- section tagged "לא פעיל".
--
-- is_active = TRUE  → normal (dropdowns, active matrices, pickers)
-- is_active = FALSE → retired (history only, flagged as inactive)
-- ============================================================

ALTER TABLE drones
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE pilots
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
