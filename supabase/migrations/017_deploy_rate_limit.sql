-- 017_deploy_rate_limit.sql
-- Adds deploy_count to user_daily_limits for DB-backed deploy rate limiting.
-- Replaces the in-memory Map in deploy/route.ts so server restarts don't reset counts.

-- ============================================================
-- ALTER: user_daily_limits — add deploy_count column
-- ============================================================
ALTER TABLE user_daily_limits
  ADD COLUMN IF NOT EXISTS deploy_count INTEGER NOT NULL DEFAULT 0
    CONSTRAINT deploy_count_non_negative CHECK (deploy_count >= 0);

-- ============================================================
-- FUNCTION: try_increment_daily_deploy
-- Same atomic test-and-set pattern as try_increment_daily_generation.
-- ============================================================
CREATE OR REPLACE FUNCTION try_increment_daily_deploy(
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
  INSERT INTO user_daily_limits (user_id, usage_date, deploy_count)
  VALUES (p_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  -- Atomic test-and-set: only increments if below the limit
  UPDATE user_daily_limits
  SET    deploy_count = deploy_count + 1
  WHERE  user_id    = p_user_id
    AND  usage_date = CURRENT_DATE
    AND  deploy_count < p_limit
  RETURNING deploy_count INTO v_new_count;

  -- v_new_count IS NULL means the UPDATE matched zero rows (limit reached)
  RETURN v_new_count IS NOT NULL;
END;
$$;
