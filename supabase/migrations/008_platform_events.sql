-- 008_platform_events.sql
-- Persistent audit log for domain events.
-- The in-memory eventBus continues to work for local handlers;
-- this table adds durability so events survive server restarts.

-- ============================================================
-- TABLE: platform_events
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id UUID        REFERENCES projects(id)  ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_platform_events_user_time
  ON platform_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_events_project_time
  ON platform_events(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_events_type_time
  ON platform_events(type, created_at DESC);

-- ============================================================
-- RLS policies
-- Events are written only by the service role (server-side).
-- Users can query their own events (future audit log feature).
-- ============================================================
ALTER TABLE platform_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages all events"
  ON platform_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view their own events"
  ON platform_events FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- FUNCTION: get_user_event_stats  (admin / analytics use)
-- Returns event counts per type for a given user over N days.
-- ============================================================
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
