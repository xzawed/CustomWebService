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

  async findValidByHash(
    tokenHash: string,
    type: AuthTokenType,
    now: string,
  ): Promise<{ id: string; userId: string } | null> {
    const row = this.db
      .select({ id: schema.authTokens.id, userId: schema.authTokens.user_id })
      .from(schema.authTokens)
      .where(
        and(
          eq(schema.authTokens.token_hash, tokenHash),
          eq(schema.authTokens.type, type),
          isNull(schema.authTokens.consumed_at),
          gt(schema.authTokens.expires_at, now),
        ),
      )
      .limit(1)
      .get();
    return row ?? null;
  }

  async consume(id: string, now: string): Promise<void> {
    this.db
      .update(schema.authTokens)
      .set({ consumed_at: now })
      .where(eq(schema.authTokens.id, id))
      .run();
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
