import { and, eq, gt, isNull } from 'drizzle-orm';
import type { SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import type { AuthTokenType, IAuthTokenRepository } from '@/repositories/interfaces';

/** SQLite 구현 — IAuthTokenRepository. 모든 쿼리는 better-sqlite3 동기 API. */
export class SqliteAuthTokenRepository implements IAuthTokenRepository {
  constructor(private readonly db: SqliteDb) {}

  async create(userId: string, tokenHash: string, type: AuthTokenType, expiresAt: string): Promise<void> {
    this.db
      .insert(schema.authTokens)
      .values({ user_id: userId, token_hash: tokenHash, type, expires_at: expiresAt })
      .run();
  }

  async consumeValid(
    tokenHash: string,
    type: AuthTokenType,
    now: string,
  ): Promise<string | null> {
    // 조건 검사와 갱신이 단일 UPDATE ... RETURNING으로 원자 실행된다.
    // 조회와 소비를 분리하면 그 사이에 다른 요청이 같은 토큰을 소비할 수 있다.
    const row = this.db
      .update(schema.authTokens)
      .set({ consumed_at: now })
      .where(
        and(
          eq(schema.authTokens.token_hash, tokenHash),
          eq(schema.authTokens.type, type),
          isNull(schema.authTokens.consumed_at),
          gt(schema.authTokens.expires_at, now),
        ),
      )
      .returning({ userId: schema.authTokens.user_id })
      .get();
    return row?.userId ?? null;
  }

  async invalidateByUserAndType(userId: string, type: AuthTokenType, now: string): Promise<void> {
    this.db
      .update(schema.authTokens)
      .set({ consumed_at: now })
      .where(
        and(
          eq(schema.authTokens.user_id, userId),
          eq(schema.authTokens.type, type),
          isNull(schema.authTokens.consumed_at),
        ),
      )
      .run();
  }
}
