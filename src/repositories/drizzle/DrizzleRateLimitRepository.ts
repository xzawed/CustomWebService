import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '@/lib/db/schema';
import type { IRateLimitRepository } from '@/repositories/interfaces';

type DrizzleDb = NodePgDatabase<typeof schema>;

/**
 * Drizzle-based rate limit repository.
 *
 * Calls the same PostgreSQL functions (try_increment_daily_generation,
 * decrement_daily_generation, get_daily_generation_count) that the
 * Supabase RateLimitService uses via .rpc().
 */
export class DrizzleRateLimitRepository implements IRateLimitRepository {
  constructor(private readonly db: DrizzleDb) {}

  async checkAndIncrementDailyLimit(userId: string, limit: number): Promise<boolean> {
    const result = await this.db.execute(
      sql`SELECT try_increment_daily_generation(${userId}::uuid, ${limit}) AS result`
    );
    const row = result.rows[0] as { result: boolean } | undefined;
    return row?.result ?? false;
  }

  async decrementDailyLimit(userId: string): Promise<void> {
    await this.db.execute(
      sql`SELECT decrement_daily_generation(${userId}::uuid)`
    );
  }

  async getCurrentUsage(userId: string): Promise<number> {
    const result = await this.db.execute(
      sql`SELECT get_daily_generation_count(${userId}::uuid) AS count`
    );
    const row = result.rows[0] as { count: number } | undefined;
    return row?.count ?? 0;
  }
}
