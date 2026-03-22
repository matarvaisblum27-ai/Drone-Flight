-- Merge duplicate missions on 2026-03-22:
--   "שועפט" (mission 2) → merged into "מפ' שועפט" (mission 1)
--
-- Run in: Supabase Dashboard > SQL Editor > New Query
-- Safe to run multiple times (idempotent).

-- ── Case A: old-style missions (no missions table, just mission_name in flights) ──
-- Rename all flights on 2026-03-22 that say only "שועפט" to "מפ' שועפט"
UPDATE flights
SET mission_name = $$מפ' שועפט$$
WHERE date        = '2026-03-22'
  AND mission_name = 'שועפט';

-- ── Case B: new-style missions (missions table entries + mission_id in flights) ──
DO $$
DECLARE
  keep_id   TEXT;
  keep_name TEXT := $$מפ' שועפט$$;
  drop_id   TEXT;
BEGIN
  SELECT id INTO keep_id
  FROM   missions
  WHERE  date = '2026-03-22'
    AND  name = $$מפ' שועפט$$
  LIMIT 1;

  SELECT id INTO drop_id
  FROM   missions
  WHERE  date = '2026-03-22'
    AND  name = 'שועפט'
  LIMIT 1;

  IF keep_id IS NOT NULL AND drop_id IS NOT NULL THEN
    -- Move flights from the dropped mission to the kept mission
    UPDATE flights
    SET    mission_id   = keep_id,
           mission_name = keep_name
    WHERE  mission_id   = drop_id;

    DELETE FROM missions WHERE id = drop_id;
    RAISE NOTICE 'Merged mission "שועפט" (%) into "מפ שועפט" (%)', drop_id, keep_id;
  ELSE
    RAISE NOTICE 'No missions-table entries found to merge — old-style rename above is sufficient.';
  END IF;
END $$;
