-- 007_atomic_rate_limit.sql
-- Replaces the non-atomic SELECT COUNT pattern with a test-and-set
-- approach that eliminates the race condition window for concurrent
-- requests from the same user.

-- ============================================================
-- TABLE: user_daily_limits
-- Stores per-user, per-day generation counters.
-- The PRIMARY KEY ensures exactly one row per (user, date).
-- ============================================================
CREATE TABLE IF NOT EXISTS user_daily_limits (
  user_id          UUID    NOT NULL,
  usage_date       DATE    NOT NULL DEFAULT CURRENT_DATE,
  generation_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date),
  CONSTRAINT user_daily_limits_user_fk
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT generation_count_non_negative
    CHECK (generation_count >= 0)
);

-- Index for periodic cleanup of old rows (keep 30 days)
CREATE INDEX IF NOT EXISTS idx_user_daily_limits_date
  ON user_daily_limits(usage_date);

-- RLS: users can only see their own limits (for future quota display)
ALTER TABLE user_daily_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own daily limits"
  ON user_daily_limits FOR SELECT
  USING (user_id = auth.uid());

-- Service role has full access
CREATE POLICY "Service role has full access to daily limits"
  ON user_daily_limits FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- FUNCTION: try_increment_daily_generation
-- Atomically increments the counter for today and returns TRUE.
-- Returns FALSE (without incrementing) if already at p_limit.
--
-- Concurrency guarantee:
--   The INSERT ... ON CONFLICT DO NOTHING ensures the row exists.
--   The UPDATE ... WHERE count < p_limit is a single atomic statement;
--   PostgreSQL row-level locking prevents two concurrent updates from
--   both reading the same "count < limit" state.
-- ============================================================
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

-- ============================================================
-- FUNCTION: decrement_daily_generation
-- Compensating action: called when a generation request fails
-- after the counter was already incremented.
-- Uses GREATEST(0, ...) to prevent going below zero.
-- ============================================================
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

-- ============================================================
-- FUNCTION: get_daily_generation_count  (read-only, for UI display)
-- ============================================================
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
-- BACKFILL: Seed today's counts from existing generated_codes
-- This ensures users who already generated today don't get a
-- fresh slate just because the table is new.
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
