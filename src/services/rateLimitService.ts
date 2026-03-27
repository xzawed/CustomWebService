import type { SupabaseClient } from '@supabase/supabase-js';
import { ProjectRepository } from '@/repositories/projectRepository';
import { getLimits } from '@/lib/config/features';
import { RateLimitError } from '@/lib/utils/errors';

/**
 * Centralized rate limiting service.
 * Both generate and regenerate routes use this to avoid duplicating limit logic.
 * The underlying count query uses a single DB round-trip via the
 * count_today_generations() SQL function (see migration 003_helpers.sql).
 *
 * Note: the check-then-write pattern has an inherent race window for
 * highly concurrent requests from the same user. The route handlers
 * perform a second check inside the SSE stream (right before the DB write)
 * to significantly reduce this window. A proper distributed lock (e.g.
 * pg_advisory_lock or Redis) would eliminate it entirely if needed.
 */
export class RateLimitService {
  private projectRepo: ProjectRepository;

  constructor(supabase: SupabaseClient) {
    this.projectRepo = new ProjectRepository(supabase);
  }

  async checkDailyGenerationLimit(userId: string): Promise<void> {
    const limits = getLimits();
    const todayCount = await this.projectRepo.countTodayGenerations(userId);
    if (todayCount >= limits.maxDailyGenerations) {
      throw new RateLimitError(
        `일일 생성 한도(${limits.maxDailyGenerations}회)를 초과했습니다.`
      );
    }
  }
}
