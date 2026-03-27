-- 003_helpers.sql
-- Optimized helper function and missing RLS policies

-- ============================================================
-- C5: Single-query daily generation count (replaces N+1 pattern)
-- Instead of: fetch project IDs → count generations (2 round-trips)
-- This function uses a JOIN to do both in one DB round-trip.
-- ============================================================
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

-- ============================================================
-- H7: Public read access for published projects and their code
-- Required for /site/:slug to work without authentication.
-- RLS policies are OR-combined, so this adds to existing user policies.
-- ============================================================
CREATE POLICY "Anyone can view published projects"
  ON projects FOR SELECT
  USING (status = 'published');

CREATE POLICY "Anyone can view code for published projects"
  ON generated_codes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = generated_codes.project_id
        AND projects.status = 'published'
    )
  );
