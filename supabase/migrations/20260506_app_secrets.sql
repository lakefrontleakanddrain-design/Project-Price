-- App secrets table for storing sensitive values that are too large for Lambda env vars.
-- Only accessible via service role key (RLS blocks anon/authenticated access).
CREATE TABLE IF NOT EXISTS app_secrets (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lock down: no public or authenticated access
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

-- No policies created — service role bypasses RLS and is the only allowed accessor.
-- Deny all for everyone else.
CREATE POLICY "deny_all" ON app_secrets
  FOR ALL
  TO PUBLIC
  USING (false);
