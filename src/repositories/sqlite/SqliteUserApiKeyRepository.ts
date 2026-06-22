import { eq, and, sql } from 'drizzle-orm';
import type { SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import type { IUserApiKeyRepository, UserApiKey } from '@/repositories/interfaces';

/**
 * SQLite 구현 (임베디드 단일 인스턴스·단일 사용자 경로).
 *
 * 매핑 기준은 Supabase 레포(`supabaseUserApiKeyRepository.ts`)와 동일하다:
 * - 타임스탬프(created_at/updated_at/verified_at)는 SQLite에 ISO 문자열로 저장되며,
 *   도메인은 `string`(verified_at은 `string | null`)을 기대하므로 그대로 반환한다.
 * - is_verified는 drizzle(mode:boolean)가 true/false로 역직렬화해 돌려주므로 그대로 사용한다.
 * - encrypted_key는 상위 계층에서 암호화된 값을 그대로 저장/반환한다.
 */
export class SqliteUserApiKeyRepository implements IUserApiKeyRepository {
  constructor(private db: SqliteDb) {}

  async upsert(userId: string, apiId: string, encryptedKey: string): Promise<UserApiKey> {
    const [row] = this.db
      .insert(schema.userApiKeys)
      .values({
        user_id: userId,
        api_id: apiId,
        encrypted_key: encryptedKey,
      })
      .onConflictDoUpdate({
        target: [schema.userApiKeys.user_id, schema.userApiKeys.api_id],
        set: {
          encrypted_key: sql`excluded.encrypted_key`,
          updated_at: new Date().toISOString(),
        },
      })
      .returning()
      .all();

    return this.toDomain(row);
  }

  async delete(userId: string, apiId: string): Promise<void> {
    this.db
      .delete(schema.userApiKeys)
      .where(and(eq(schema.userApiKeys.user_id, userId), eq(schema.userApiKeys.api_id, apiId)))
      .run();
  }

  async findByUserAndApi(userId: string, apiId: string): Promise<UserApiKey | null> {
    const row = this.db
      .select()
      .from(schema.userApiKeys)
      .where(and(eq(schema.userApiKeys.user_id, userId), eq(schema.userApiKeys.api_id, apiId)))
      .limit(1)
      .get();

    return row ? this.toDomain(row) : null;
  }

  async findAllByUser(userId: string): Promise<UserApiKey[]> {
    const rows = this.db
      .select()
      .from(schema.userApiKeys)
      .where(eq(schema.userApiKeys.user_id, userId))
      .all();

    return rows.map((row) => this.toDomain(row));
  }

  async updateVerificationStatus(
    userId: string,
    apiId: string,
    isVerified: boolean,
  ): Promise<void> {
    this.db
      .update(schema.userApiKeys)
      .set({
        is_verified: isVerified,
        verified_at: isVerified ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .where(and(eq(schema.userApiKeys.user_id, userId), eq(schema.userApiKeys.api_id, apiId)))
      .run();
  }

  private toDomain(row: typeof schema.userApiKeys.$inferSelect): UserApiKey {
    return {
      id: row.id,
      userId: row.user_id,
      apiId: row.api_id,
      encryptedKey: row.encrypted_key,
      isVerified: row.is_verified ?? false,
      verifiedAt: row.verified_at ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
