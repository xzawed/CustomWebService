import { and, eq, sql } from 'drizzle-orm';
import type { SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import type { IRateLimitRepository } from '@/repositories/interfaces';

/**
 * SQLite 기반 레이트리밋 레포지토리 (임베디드 단일 인스턴스·단일 사용자 경로).
 *
 * Supabase/PG의 원자적 함수들(`try_increment_daily_generation`,
 * `decrement_daily_generation`, `get_daily_generation_count`,
 * `try_increment_daily_deploy`, `decrement_daily_deploy`)을 SQLite로 재현한다.
 *
 * 원자성: better-sqlite3는 동기 API이며 `db.transaction(fn)`은 `BEGIN`(IMMEDIATE에
 * 준하는 단일 writer)로 감싼다. SQLite는 한 시점에 writer가 1개뿐이므로
 * "INSERT OR IGNORE(오늘 행 보장) → UPDATE ... WHERE count < limit RETURNING"
 * 시퀀스가 단일 트랜잭션 안에서 원자적으로 test-and-set 된다. 한도 초과 시
 * UPDATE가 0행 → RETURNING 결과 없음 → false.
 *
 * usage_date는 PG의 CURRENT_DATE(서버 로컬 날짜)에 대응하는 로컬 YYYY-MM-DD 문자열.
 */
export class SqliteRateLimitRepository implements IRateLimitRepository {
  constructor(private db: SqliteDb) {}

  /** PG CURRENT_DATE 대응: 로컬 타임존 기준 오늘 날짜 YYYY-MM-DD. */
  private today(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async checkAndIncrementDailyLimit(userId: string, limit: number): Promise<boolean> {
    const usageDate = this.today();
    return this.db.transaction((tx) => {
      // 오늘 행 보장 (없으면 0으로 생성). 이미 있으면 무시.
      tx.insert(schema.userDailyLimits)
        .values({ user_id: userId, usage_date: usageDate, generation_count: 0 })
        .onConflictDoNothing()
        .run();

      // 원자적 test-and-set: 한도 미만일 때만 +1
      const rows = tx
        .update(schema.userDailyLimits)
        .set({ generation_count: sql`${schema.userDailyLimits.generation_count} + 1` })
        .where(
          and(
            eq(schema.userDailyLimits.user_id, userId),
            eq(schema.userDailyLimits.usage_date, usageDate),
            sql`${schema.userDailyLimits.generation_count} < ${limit}`,
          ),
        )
        .returning({ count: schema.userDailyLimits.generation_count })
        .all();

      // 0행이면 한도 도달 → false
      return rows.length > 0;
    });
  }

  async decrementDailyLimit(userId: string): Promise<void> {
    const usageDate = this.today();
    this.db
      .update(schema.userDailyLimits)
      .set({
        // GREATEST(0, count - 1)
        generation_count: sql`MAX(0, ${schema.userDailyLimits.generation_count} - 1)`,
      })
      .where(
        and(
          eq(schema.userDailyLimits.user_id, userId),
          eq(schema.userDailyLimits.usage_date, usageDate),
        ),
      )
      .run();
  }

  async getCurrentUsage(userId: string): Promise<number> {
    const usageDate = this.today();
    const row = this.db
      .select({ count: schema.userDailyLimits.generation_count })
      .from(schema.userDailyLimits)
      .where(
        and(
          eq(schema.userDailyLimits.user_id, userId),
          eq(schema.userDailyLimits.usage_date, usageDate),
        ),
      )
      .get();
    return row?.count ?? 0;
  }

  async checkAndIncrementDailyDeployLimit(userId: string, limit: number): Promise<boolean> {
    const usageDate = this.today();
    return this.db.transaction((tx) => {
      tx.insert(schema.userDailyLimits)
        .values({ user_id: userId, usage_date: usageDate, deploy_count: 0 })
        .onConflictDoNothing()
        .run();

      const rows = tx
        .update(schema.userDailyLimits)
        .set({ deploy_count: sql`${schema.userDailyLimits.deploy_count} + 1` })
        .where(
          and(
            eq(schema.userDailyLimits.user_id, userId),
            eq(schema.userDailyLimits.usage_date, usageDate),
            sql`${schema.userDailyLimits.deploy_count} < ${limit}`,
          ),
        )
        .returning({ count: schema.userDailyLimits.deploy_count })
        .all();

      return rows.length > 0;
    });
  }

  async decrementDailyDeployLimit(userId: string): Promise<void> {
    const usageDate = this.today();
    this.db
      .update(schema.userDailyLimits)
      .set({
        deploy_count: sql`MAX(0, ${schema.userDailyLimits.deploy_count} - 1)`,
      })
      .where(
        and(
          eq(schema.userDailyLimits.user_id, userId),
          eq(schema.userDailyLimits.usage_date, usageDate),
        ),
      )
      .run();
  }
}
