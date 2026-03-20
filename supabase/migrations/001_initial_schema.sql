-- 001_initial_schema.sql
-- CustomWebService v2 Database Schema
-- Generated: 2026-03-20

-- ============================================================
-- TABLES
-- ============================================================

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. organizations
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. memberships
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);

-- 4. api_catalog
CREATE TABLE IF NOT EXISTS api_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  base_url TEXT NOT NULL,
  auth_type VARCHAR(50) NOT NULL DEFAULT 'none',
  auth_config JSONB DEFAULT '{}'::jsonb,
  rate_limit VARCHAR(100),
  changelog JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  icon_url TEXT,
  docs_url TEXT,
  endpoints JSONB DEFAULT '[]'::jsonb,
  tags TEXT[],
  api_version VARCHAR(50),
  deprecated_at TIMESTAMPTZ,
  successor_id UUID REFERENCES api_catalog(id) ON DELETE SET NULL,
  cors_supported BOOLEAN NOT NULL DEFAULT true,
  requires_proxy BOOLEAN NOT NULL DEFAULT false,
  credit_required INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  context TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  deploy_url TEXT,
  deploy_platform VARCHAR(100),
  repo_url TEXT,
  preview_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  current_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. project_apis
CREATE TABLE IF NOT EXISTS project_apis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  api_id UUID NOT NULL REFERENCES api_catalog(id) ON DELETE CASCADE,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, api_id)
);

-- 7. generated_codes
CREATE TABLE IF NOT EXISTS generated_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INT NOT NULL,
  code_html TEXT,
  code_css TEXT,
  code_js TEXT,
  framework VARCHAR(50) NOT NULL DEFAULT 'vanilla',
  ai_provider VARCHAR(100),
  ai_model VARCHAR(100),
  ai_prompt_used TEXT,
  generation_time_ms INT,
  token_usage JSONB DEFAULT '{}'::jsonb,
  dependencies TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, version)
);

-- 8. user_api_keys
CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_id UUID NOT NULL REFERENCES api_catalog(id) ON DELETE CASCADE,
  encrypted_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, api_id)
);

-- 9. event_log
CREATE TABLE IF NOT EXISTS event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. feature_flags
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name VARCHAR(100) NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  rules JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- users
CREATE INDEX idx_users_email ON users(email);

-- organizations
CREATE INDEX idx_organizations_slug ON organizations(slug);

-- memberships
CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_organization_id ON memberships(organization_id);

-- api_catalog
CREATE INDEX idx_api_catalog_category ON api_catalog(category);
CREATE INDEX idx_api_catalog_is_active ON api_catalog(is_active);
CREATE INDEX idx_api_catalog_tags ON api_catalog USING GIN(tags);
CREATE INDEX idx_api_catalog_auth_type ON api_catalog(auth_type);
CREATE INDEX idx_api_catalog_successor_id ON api_catalog(successor_id);

-- projects
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_organization_id ON projects(organization_id);
CREATE INDEX idx_projects_status ON projects(status);

-- project_apis
CREATE INDEX idx_project_apis_project_id ON project_apis(project_id);
CREATE INDEX idx_project_apis_api_id ON project_apis(api_id);

-- generated_codes
CREATE INDEX idx_generated_codes_project_id ON generated_codes(project_id);
CREATE INDEX idx_generated_codes_version ON generated_codes(project_id, version);

-- user_api_keys
CREATE INDEX idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX idx_user_api_keys_api_id ON user_api_keys(api_id);

-- event_log
CREATE INDEX idx_event_log_event_type ON event_log(event_type);
CREATE INDEX idx_event_log_user_id ON event_log(user_id);
CREATE INDEX idx_event_log_project_id ON event_log(project_id);
CREATE INDEX idx_event_log_created_at ON event_log(created_at);
CREATE INDEX idx_event_log_payload ON event_log USING GIN(payload);

-- feature_flags
CREATE INDEX idx_feature_flags_flag_name ON feature_flags(flag_name);
CREATE INDEX idx_feature_flags_enabled ON feature_flags(enabled);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_apis ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- ---- users ----
CREATE POLICY "Users can view their own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ---- organizations ----
CREATE POLICY "Org members can view their organization"
  ON organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.organization_id = organizations.id
        AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can update their organization"
  ON organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.organization_id = organizations.id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.organization_id = organizations.id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Authenticated users can create organizations"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---- memberships ----
CREATE POLICY "Users can view their own memberships"
  ON memberships FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Org members can view co-memberships"
  ON memberships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships AS m
      WHERE m.organization_id = memberships.organization_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can manage memberships"
  ON memberships FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM memberships AS m
      WHERE m.organization_id = memberships.organization_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
    )
  );

-- ---- api_catalog ----
CREATE POLICY "Anyone can view active APIs"
  ON api_catalog FOR SELECT
  USING (is_active = true);

CREATE POLICY "Service role can manage API catalog"
  ON api_catalog FOR ALL
  USING (auth.role() = 'service_role');

-- ---- projects ----
CREATE POLICY "Users can view their own projects"
  ON projects FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can view org projects"
  ON projects FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.organization_id = projects.organization_id
        AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own projects"
  ON projects FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own projects"
  ON projects FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own projects"
  ON projects FOR DELETE
  USING (user_id = auth.uid());

-- ---- project_apis ----
CREATE POLICY "Users can view project_apis for their projects"
  ON project_apis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_apis.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage project_apis for their projects"
  ON project_apis FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_apis.project_id
        AND projects.user_id = auth.uid()
    )
  );

-- ---- generated_codes ----
CREATE POLICY "Users can view generated_codes for their projects"
  ON generated_codes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = generated_codes.project_id
        AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert generated_codes for their projects"
  ON generated_codes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = generated_codes.project_id
        AND projects.user_id = auth.uid()
    )
  );

-- ---- user_api_keys ----
CREATE POLICY "Users can view their own API keys"
  ON user_api_keys FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own API keys"
  ON user_api_keys FOR ALL
  USING (user_id = auth.uid());

-- ---- event_log ----
CREATE POLICY "Users can view their own events"
  ON event_log FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own events"
  ON event_log FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Service role can manage all events"
  ON event_log FOR ALL
  USING (auth.role() = 'service_role');

-- ---- feature_flags ----
CREATE POLICY "Anyone can read feature flags"
  ON feature_flags FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage feature flags"
  ON feature_flags FOR ALL
  USING (auth.role() = 'service_role');

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

CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_api_catalog
  BEFORE UPDATE ON api_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_projects
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_user_api_keys
  BEFORE UPDATE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_feature_flags
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
