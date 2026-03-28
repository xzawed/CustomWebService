import type { SupabaseClient } from '@supabase/supabase-js';
import { getLimits } from '@/lib/config/features';
import { RateLimitError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

/**
 * Atomic rate limiting service.
 *
 * Previous approach (non-atomic):
 *   countTodayGenerations() → check count → write code
 *   Race window: two concurrent requests both read count=9 (<10 limit)
 *   and both proceed, resulting in count=11.
 *
 * New approach (atomic test-and-set via DB function):
 *   try_increment_daily_generation() executes a single UPDATE WHERE count < limit.
 *   PostgreSQL row-level locking ensures only one concurrent UPDATE succeeds
 *   when the counter is at limit-1.
 *
 * Failure compensation:
 *   If a generation request fails after the counter was incremented,
 *   decrementDailyLimit() is called to restore the slot.
 */
export class RateLimitService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Atomically checks the daily limit AND increments the counter.
   * Throws RateLimitError if the limit is already reached.
   * On DB error, fails open (allows the request) to avoid blocking
   * legitimate users due to infrastructure issues.
   *
   * IMPORTANT: Call decrementDailyLimit() in the failure path if this
   * method returned successfully but the generation subsequently failed.
   */
  async checkAndIncrementDailyLimit(userId: string): Promise<void> {
    const limits = getLimits();

    const { data, error } = await this.supabase.rpc('try_increment_daily_generation', {
      p_user_id: userId,
      p_limit: limits.maxDailyGenerations,
    });

    if (error) {
      // Fail open: log the DB error but allow the request through.
      // This prevents a DB hiccup from blocking all users.
      logger.error('Rate limit check failed — failing open', {
        userId,
        error: error.message,
        code: error.code,
      });
      return;
    }

    if (data === false) {
      throw new RateLimitError(
        `일일 생성 한도(${limits.maxDailyGenerations}회)를 초과했습니다. 내일 다시 시도해주세요.`
      );
    }
  }

  /**
   * Compensating decrement: call when a generation fails after the
   * counter was already incremented by checkAndIncrementDailyLimit().
   * Uses GREATEST(0, count - 1) to prevent going below zero.
   * Errors are swallowed — this is best-effort compensation.
   */
  async decrementDailyLimit(userId: string): Promise<void> {
    const { error } = await this.supabase.rpc('decrement_daily_generation', {
      p_user_id: userId,
    });
    if (error) {
      logger.warn('Failed to decrement daily generation count (compensation)', {
        userId,
        error: error.message,
      });
    }
  }

  /**
   * Read-only usage check for UI display (does NOT increment).
   * Returns 0 on error to avoid breaking the UI.
   */
  async getCurrentUsage(userId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('get_daily_generation_count', {
      p_user_id: userId,
    });
    if (error) {
      logger.warn('Failed to read daily generation count', { userId, error: error.message });
      return 0;
    }
    return (data as number) ?? 0;
  }
}
