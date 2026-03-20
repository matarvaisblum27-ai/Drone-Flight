-- Run this in the Supabase SQL Editor to add observer and gas drop fields
ALTER TABLE flights ADD COLUMN IF NOT EXISTS observer TEXT DEFAULT '';
ALTER TABLE flights ADD COLUMN IF NOT EXISTS gas_dropped BOOLEAN DEFAULT FALSE;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS gas_drop_time TEXT DEFAULT NULL;
