-- 021_deploy_rate_limit_decrement.sql
-- Compensating decrement for the deploy rate limit, mirroring
-- decrement_daily_generation (migration 007). Called when a deployment
-- FAILS after the deploy counter was already incremented (migration 017),
-- so failed deployments don't permanently consume a user's daily quota.

-- ============================================================
-- FUNCTION: decrement_daily_deploy
-- Best-effort compensation. Uses GREATEST(0, ...) to never go below zero.
-- ============================================================
CREATE OR REPLACE FUNCTION decrement_daily_deploy(
  p_user_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_daily_limits
  SET    deploy_count = GREATEST(0, deploy_count - 1)
  WHERE  user_id    = p_user_id
    AND  usage_date = CURRENT_DATE;
END;
$$;
