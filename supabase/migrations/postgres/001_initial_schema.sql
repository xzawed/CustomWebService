-- ============================================================
-- CustomWebService — On-Premise PostgreSQL Initialization
-- ============================================================
-- Generated from Supabase migrations (Supabase-specific syntax removed).
-- Apply this script to a vanilla PostgreSQL instance:
--   psql $DATABASE_URL -f supabase/migrations/postgres/001_initial_schema.sql
--
-- Supabase mode: Use the supabase/migrations/ directory instead.
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

-- 1. users
--    email_verified and image are required by the Auth.js adapter.
CREATE TABLE IF NOT EXISTS users (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(255) NOT NULL UNIQUE,
  name           VARCHAR(255),
  avatar_url     TEXT,
  image          TEXT,
  email_verified TIMESTAMPTZ,
  preferences    JSONB        DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. organizations
CREATE TABLE IF NOT EXISTS organizations (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  slug       VARCHAR(255) NOT NULL UNIQUE,
  plan       VARCHAR(50)  NOT NULL DEFAULT 'free',
  settings   JSONB        DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 3. memberships
CREATE TABLE IF NOT EXISTS memberships (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);

-- 4. api_catalog
CREATE TABLE IF NOT EXISTS api_catalog (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  category        VARCHAR(100),
  base_url        TEXT         NOT NULL,
  auth_type       VARCHAR(50)  NOT NULL DEFAULT 'none',
  auth_config     JSONB        DEFAULT '{}'::jsonb,
  rate_limit      VARCHAR(100),
  changelog       JSONB        DEFAULT '[]'::jsonb,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  icon_url        TEXT,
  docs_url        TEXT,
  endpoints       JSONB        DEFAULT '[]'::jsonb,
  tags            TEXT[],
  api_version     VARCHAR(50),
  deprecated_at   TIMESTAMPTZ,
  successor_id    UUID         REFERENCES api_catalog(id) ON DELETE SET NULL,
  cors_supported  BOOLEAN      NOT NULL DEFAULT true,
  requires_proxy  BOOLEAN      NOT NULL DEFAULT false,
  credit_required INT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 5. projects
--    slug and published_at added inline (from migration 002).
CREATE TABLE IF NOT EXISTS projects (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  UUID         REFERENCES organizations(id) ON DELETE SET NULL,
  name             VARCHAR(255) NOT NULL,
  context          TEXT,
  status           VARCHAR(50)  NOT NULL DEFAULT 'draft',
  slug             TEXT,
  published_at     TIMESTAMPTZ,
  deploy_url       TEXT,
  deploy_platform  VARCHAR(100),
  repo_url         TEXT,
  preview_url      TEXT,
  metadata         JSONB        DEFAULT '{}'::jsonb,
  current_version  INT          NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 6. project_apis
CREATE TABLE IF NOT EXISTS project_apis (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  api_id     UUID        NOT NULL REFERENCES api_catalog(id) ON DELETE CASCADE,
  config     JSONB       DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, api_id)
);

-- 7. generated_codes
CREATE TABLE IF NOT EXISTS generated_codes (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version            INT         NOT NULL,
  code_html          TEXT,
  code_css           TEXT,
  code_js            TEXT,
  framework          VARCHAR(50) NOT NULL DEFAULT 'vanilla',
  ai_provider        VARCHAR(100),
  ai_model           VARCHAR(100),
  ai_prompt_used     TEXT,
  generation_time_ms INT,
  token_usage        JSONB       DEFAULT '{}'::jsonb,
  dependencies       TEXT[],
  metadata           JSONB       DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, version)
);

-- 8. user_api_keys
--    is_verified and verified_at added inline (from migration 006).
CREATE TABLE IF NOT EXISTS user_api_keys (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_id      UUID        NOT NULL REFERENCES api_catalog(id) ON DELETE CASCADE,
  encrypted_key TEXT      NOT NULL,
  is_verified BOOLEAN     DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, api_id)
);

-- 9. event_log
CREATE TABLE IF NOT EXISTS event_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  payload    JSONB       DEFAULT '{}'::jsonb,
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID        REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. feature_flags
CREATE TABLE IF NOT EXISTS feature_flags (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name   VARCHAR(100) NOT NULL UNIQUE,
  enabled     BOOLEAN      NOT NULL DEFAULT false,
  description TEXT,
  rules       JSONB        DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 11. user_daily_limits  (from migration 007 — replaces auth.users FK with users FK)
CREATE TABLE IF NOT EXISTS user_daily_limits (
  user_id          UUID    NOT NULL,
  usage_date       DATE    NOT NULL DEFAULT CURRENT_DATE,
  generation_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date),
  CONSTRAINT user_daily_limits_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT generation_count_non_negative
    CHECK (generation_count >= 0)
);

-- 12. platform_events  (from migration 008 — replaces auth.users FK with users FK)
CREATE TABLE IF NOT EXISTS platform_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID        REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Auth.js adapter tables
-- ============================================================

CREATE TABLE IF NOT EXISTS "account" (
  "userId"            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "type"              text NOT NULL,
  "provider"          text NOT NULL,
  "providerAccountId" text NOT NULL,
  "refresh_token"     text,
  "access_token"      text,
  "expires_at"        integer,
  "token_type"        text,
  "scope"             text,
  "id_token"          text,
  "session_state"     text,
  PRIMARY KEY ("provider", "providerAccountId")
);

CREATE TABLE IF NOT EXISTS "session" (
  "sessionToken" text PRIMARY KEY,
  "userId"       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "expires"      timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "verificationToken" (
  "identifier" text NOT NULL,
  "token"      text NOT NULL,
  "expires"    timestamp NOT NULL,
  PRIMARY KEY ("identifier", "token")
);

-- ============================================================
-- INDEXES
-- ============================================================

-- users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- organizations
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- memberships
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_organization_id ON memberships(organization_id);

-- api_catalog
CREATE INDEX IF NOT EXISTS idx_api_catalog_category ON api_catalog(category);
CREATE INDEX IF NOT EXISTS idx_api_catalog_is_active ON api_catalog(is_active);
CREATE INDEX IF NOT EXISTS idx_api_catalog_tags ON api_catalog USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_api_catalog_auth_type ON api_catalog(auth_type);
CREATE INDEX IF NOT EXISTS idx_api_catalog_successor_id ON api_catalog(successor_id);

-- projects
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_slug_status ON projects(slug, status) WHERE slug IS NOT NULL;

-- project_apis
CREATE INDEX IF NOT EXISTS idx_project_apis_project_id ON project_apis(project_id);
CREATE INDEX IF NOT EXISTS idx_project_apis_api_id ON project_apis(api_id);

-- generated_codes
CREATE INDEX IF NOT EXISTS idx_generated_codes_project_id ON generated_codes(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_codes_version ON generated_codes(project_id, version);

-- user_api_keys
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_api_id ON user_api_keys(api_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_lookup ON user_api_keys(user_id, api_id);

-- event_log
CREATE INDEX IF NOT EXISTS idx_event_log_event_type ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_user_id ON event_log(user_id);
CREATE INDEX IF NOT EXISTS idx_event_log_project_id ON event_log(project_id);
CREATE INDEX IF NOT EXISTS idx_event_log_created_at ON event_log(created_at);
CREATE INDEX IF NOT EXISTS idx_event_log_payload ON event_log USING GIN(payload);

-- feature_flags
CREATE INDEX IF NOT EXISTS idx_feature_flags_flag_name ON feature_flags(flag_name);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(enabled);

-- user_daily_limits
CREATE INDEX IF NOT EXISTS idx_user_daily_limits_date ON user_daily_limits(usage_date);

-- platform_events
CREATE INDEX IF NOT EXISTS idx_platform_events_user_time
  ON platform_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_events_project_time
  ON platform_events(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_events_type_time
  ON platform_events(type, created_at DESC);

-- ============================================================
-- TRIGGER: auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_updated_at_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER set_updated_at_api_catalog
  BEFORE UPDATE ON api_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER set_updated_at_projects
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER set_updated_at_user_api_keys
  BEFORE UPDATE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER set_updated_at_feature_flags
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- HELPER FUNCTIONS  (from migrations 003, 004)
-- ============================================================

-- C5: Single-query daily generation count (avoids N+1 round-trips)
CREATE OR REPLACE FUNCTION count_today_generations(p_user_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(gc.id)
  FROM generated_codes gc
  INNER JOIN projects p ON p.id = gc.project_id
  WHERE p.user_id = p_user_id
    AND gc.created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC');
$$;

-- Returns all org IDs the given user belongs to (used to avoid recursive policy checks)
CREATE OR REPLACE FUNCTION public.get_user_org_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT organization_id FROM memberships WHERE user_id = uid;
$$;

-- Returns true if the given user is admin or owner of the org
CREATE OR REPLACE FUNCTION public.is_org_admin(uid UUID, org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = uid
      AND organization_id = org_id
      AND role IN ('admin', 'owner')
  );
$$;

-- ============================================================
-- RATE LIMIT FUNCTIONS  (from migration 007)
-- ============================================================

-- Atomically increments today's generation counter.
-- Returns TRUE on success, FALSE if the limit is already reached.
CREATE OR REPLACE FUNCTION try_increment_daily_generation(
  p_user_id UUID,
  p_limit   INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  -- Ensure the row exists before the UPDATE
  INSERT INTO user_daily_limits (user_id, usage_date, generation_count)
  VALUES (p_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  -- Atomic test-and-set: only increments if below the limit
  UPDATE user_daily_limits
  SET    generation_count = generation_count + 1
  WHERE  user_id    = p_user_id
    AND  usage_date = CURRENT_DATE
    AND  generation_count < p_limit
  RETURNING generation_count INTO v_new_count;

  -- v_new_count IS NULL means the UPDATE matched zero rows (limit reached)
  RETURN v_new_count IS NOT NULL;
END;
$$;

-- Compensating decrement: call when a generation request fails after the
-- counter was already incremented.
CREATE OR REPLACE FUNCTION decrement_daily_generation(
  p_user_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_daily_limits
  SET    generation_count = GREATEST(0, generation_count - 1)
  WHERE  user_id    = p_user_id
    AND  usage_date = CURRENT_DATE;
END;
$$;

-- Read-only accessor for UI display
CREATE OR REPLACE FUNCTION get_daily_generation_count(
  p_user_id UUID
) RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(generation_count, 0)
  FROM   user_daily_limits
  WHERE  user_id    = p_user_id
    AND  usage_date = CURRENT_DATE;
$$;

-- ============================================================
-- ANALYTICS FUNCTION  (from migration 008)
-- ============================================================

-- Returns event counts per type for a given user over N days.
CREATE OR REPLACE FUNCTION get_user_event_stats(
  p_user_id UUID,
  p_days    INTEGER DEFAULT 30
) RETURNS TABLE(event_type TEXT, event_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT type, COUNT(*) AS event_count
  FROM   platform_events
  WHERE  user_id    = p_user_id
    AND  created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP  BY type
  ORDER  BY event_count DESC;
$$;

-- ============================================================
-- SEED: backfill today's generation counts from existing data
-- (Safe to run on an already-populated database — ON CONFLICT DO UPDATE)
-- ============================================================
INSERT INTO user_daily_limits (user_id, usage_date, generation_count)
SELECT
  p.user_id,
  DATE(gc.created_at AT TIME ZONE 'UTC') AS usage_date,
  COUNT(*)::INTEGER                       AS generation_count
FROM   generated_codes gc
INNER  JOIN projects p ON p.id = gc.project_id
WHERE  DATE(gc.created_at AT TIME ZONE 'UTC') = CURRENT_DATE
GROUP  BY p.user_id, DATE(gc.created_at AT TIME ZONE 'UTC')
ON CONFLICT (user_id, usage_date)
  DO UPDATE SET generation_count = EXCLUDED.generation_count;
