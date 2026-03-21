-- Row Level Security (RLS) for all tables
-- All data access goes through the server-side service_role key (which bypasses RLS).
-- These policies ensure that direct anon/authenticated client access is blocked.

-- pilots
ALTER TABLE pilots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_pilots" ON pilots;
CREATE POLICY "deny_anon_pilots" ON pilots FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_authenticated_pilots" ON pilots;
CREATE POLICY "deny_authenticated_pilots" ON pilots FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- flights
ALTER TABLE flights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_flights" ON flights;
CREATE POLICY "deny_anon_flights" ON flights FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_authenticated_flights" ON flights;
CREATE POLICY "deny_authenticated_flights" ON flights FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- batteries
ALTER TABLE batteries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_batteries" ON batteries;
CREATE POLICY "deny_anon_batteries" ON batteries FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_authenticated_batteries" ON batteries;
CREATE POLICY "deny_authenticated_batteries" ON batteries FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- drones
ALTER TABLE drones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_drones" ON drones;
CREATE POLICY "deny_anon_drones" ON drones FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_authenticated_drones" ON drones;
CREATE POLICY "deny_authenticated_drones" ON drones FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- gas_drops
ALTER TABLE gas_drops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_gas_drops" ON gas_drops;
CREATE POLICY "deny_anon_gas_drops" ON gas_drops FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_authenticated_gas_drops" ON gas_drops;
CREATE POLICY "deny_authenticated_gas_drops" ON gas_drops FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- login_logs
ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_anon_login_logs" ON login_logs;
CREATE POLICY "deny_anon_login_logs" ON login_logs FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_authenticated_login_logs" ON login_logs;
CREATE POLICY "deny_authenticated_login_logs" ON login_logs FOR ALL TO authenticated USING (false) WITH CHECK (false);
