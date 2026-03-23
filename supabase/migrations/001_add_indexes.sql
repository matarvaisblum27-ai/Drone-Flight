-- Performance indexes for drone-flights app
-- Run this once in Supabase SQL editor: https://supabase.com/dashboard → SQL Editor

CREATE INDEX IF NOT EXISTS idx_flights_date       ON flights(date);
CREATE INDEX IF NOT EXISTS idx_flights_pilot       ON flights(pilot_name);
CREATE INDEX IF NOT EXISTS idx_flights_drone       ON flights(tail_number);
CREATE INDEX IF NOT EXISTS idx_flights_mission     ON flights(mission_id);
CREATE INDEX IF NOT EXISTS idx_missions_date       ON missions(date);

-- Composite index for common query pattern (fetch flights sorted by date+time)
CREATE INDEX IF NOT EXISTS idx_flights_date_time   ON flights(date, start_time);
