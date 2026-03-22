-- Mission system migration
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- Creates a missions table and links flights to missions

-- ── 1. Missions table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS missions (
  id             TEXT PRIMARY KEY,
  date           TEXT NOT NULL,
  name           TEXT NOT NULL,
  battalion      TEXT NOT NULL DEFAULT '',
  observer       TEXT NOT NULL DEFAULT '',
  mission_number INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── 2. Link flights to missions ────────────────────────────────────────────────
ALTER TABLE flights ADD COLUMN IF NOT EXISTS mission_id TEXT REFERENCES missions(id);

-- ── 3. RLS for missions (deny all direct client access) ───────────────────────
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_missions" ON missions;
CREATE POLICY "deny_anon_missions" ON missions FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny_authenticated_missions" ON missions;
CREATE POLICY "deny_authenticated_missions" ON missions FOR ALL TO authenticated USING (false) WITH CHECK (false);
