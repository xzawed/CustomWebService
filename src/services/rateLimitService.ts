import type { IRateLimitRepository } from '@/repositories/interfaces';
import { getLimits } from '@/lib/config/features';
import { RateLimitError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { eventBus } from '@/lib/events/eventBus';
import { t } from '@/lib/i18n';

/**
 * Atomic rate limiting service.
 *
 * Previous approach (non-atomic):
 *   countTodayGenerations() → check count → write code
 *   Race window: two concurrent requests both read count=9 (<10 limit)
 *   and both proceed, resulting in count=11.
 *
 * New approach (atomic test-and-set via DB function):
 *   IRateLimitRepository.checkAndIncrementDailyLimit() executes a single UPDATE WHERE count < limit.
 *   PostgreSQL row-level locking ensures only one concurrent UPDATE succeeds
 *   when the counter is at limit-1.
 *
 * Failure compensation:
 *   If a generation request fails after the counter was incremented,
 *   decrementDailyLimit() is called to restore the slot.
 */
export class RateLimitService {
  constructor(private readonly rateLimitRepo: IRateLimitRepository) {}

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
    try {
      const allowed = await this.rateLimitRepo.checkAndIncrementDailyLimit(
        userId,
        limits.maxDailyGenerations
      );
      if (!allowed) {
        throw new RateLimitError(t('rateLimit.exceeded', { limit: limits.maxDailyGenerations }));
      }
      // 80% 도달 시 경고 이벤트 발행 (fire-and-forget)
      void this.rateLimitRepo.getCurrentUsage(userId).then((usage) => {
        if (usage / limits.maxDailyGenerations >= 0.8) {
          eventBus.emit({
            type: 'API_QUOTA_WARNING',
            payload: { service: 'daily_generations', usage, limit: limits.maxDailyGenerations },
          });
        }
      }).catch(() => { /* 경고 실패는 무시 */ });
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      // Fail open: DB error — allow the request to proceed
      logger.error('Rate limit check failed — failing open', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Compensating decrement: call when a generation fails after the
   * counter was already incremented by checkAndIncrementDailyLimit().
   * Uses GREATEST(0, count - 1) to prevent going below zero.
   * Errors are swallowed — this is best-effort compensation.
   */
  async decrementDailyLimit(userId: string): Promise<void> {
    try {
      await this.rateLimitRepo.decrementDailyLimit(userId);
    } catch (err) {
      // Best-effort compensation: a failed decrement is preferable to blocking
      // the user's generation. Swallowing the error is intentional.
      logger.warn('Failed to decrement daily generation count (compensation)', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Read-only usage check for UI display (does NOT increment).
   * Returns 0 on error to avoid breaking the UI.
   */
  async getCurrentUsage(userId: string): Promise<number> {
    try {
      return await this.rateLimitRepo.getCurrentUsage(userId);
    } catch (err) {
      logger.warn('Failed to read daily generation count', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
  }
}
