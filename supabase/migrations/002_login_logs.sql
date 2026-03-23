-- Login audit log table
-- Run once in Supabase SQL editor: https://supabase.com/dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS login_logs (
  id          BIGSERIAL    PRIMARY KEY,
  pilot_name  TEXT         NOT NULL,
  success     BOOLEAN      NOT NULL,
  ip_address  TEXT         NOT NULL DEFAULT 'unknown',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes: newest-first reads and IP-based rate-limit checks
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_ip_fail    ON login_logs(ip_address, success, created_at)
  WHERE success = false;

-- Row-Level Security: no direct client access — all reads/writes go through
-- the service-role key used by the Next.js API routes.
ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;

-- Allow the service role full access (Supabase service key bypasses RLS by default)
-- No additional policies needed for anon/authenticated roles → deny by default.
