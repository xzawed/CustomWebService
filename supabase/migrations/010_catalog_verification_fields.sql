-- supabase/migrations/010_catalog_verification_fields.sql
-- Adds verification metadata to api_catalog table.
-- The 'endpoints' JSONB column already exists; new optional fields
-- (exampleCall, responseDataPath, requestHeaders) are stored inside
-- each endpoint object — no migration needed for those (JSONB is schema-free).

ALTER TABLE api_catalog
  ADD COLUMN IF NOT EXISTS verification_status TEXT
    CHECK (verification_status IN ('verified', 'unverified', 'broken'))
    DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_verification_note TEXT;

-- Back-fill existing rows
UPDATE api_catalog SET verification_status = 'unverified' WHERE verification_status IS NULL;
