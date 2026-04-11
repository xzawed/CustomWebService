import { eq, and, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import type { IUserApiKeyRepository, UserApiKey } from '@/repositories/interfaces';

type DrizzleDb = NodePgDatabase<typeof schema>;

export class DrizzleUserApiKeyRepository implements IUserApiKeyRepository {
  constructor(private readonly db: DrizzleDb) {}

  async upsert(userId: string, apiId: string, encryptedKey: string): Promise<UserApiKey> {
    const [row] = await this.db
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
          updated_at: new Date(),
        },
      })
      .returning();

    return this.toDomain(row);
  }

  async delete(userId: string, apiId: string): Promise<void> {
    await this.db
      .delete(schema.userApiKeys)
      .where(
        and(
          eq(schema.userApiKeys.user_id, userId),
          eq(schema.userApiKeys.api_id, apiId)
        )
      );
  }

  async findByUserAndApi(userId: string, apiId: string): Promise<UserApiKey | null> {
    const rows = await this.db
      .select()
      .from(schema.userApiKeys)
      .where(
        and(
          eq(schema.userApiKeys.user_id, userId),
          eq(schema.userApiKeys.api_id, apiId)
        )
      )
      .limit(1);

    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  async findAllByUser(userId: string): Promise<UserApiKey[]> {
    const rows = await this.db
      .select()
      .from(schema.userApiKeys)
      .where(eq(schema.userApiKeys.user_id, userId));

    return rows.map((row) => this.toDomain(row));
  }

  async updateVerificationStatus(
    userId: string,
    apiId: string,
    isVerified: boolean
  ): Promise<void> {
    await this.db
      .update(schema.userApiKeys)
      .set({
        is_verified: isVerified,
        verified_at: isVerified ? new Date() : null,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(schema.userApiKeys.user_id, userId),
          eq(schema.userApiKeys.api_id, apiId)
        )
      );
  }

  private toDomain(row: typeof schema.userApiKeys.$inferSelect): UserApiKey {
    return {
      id: row.id,
      userId: row.user_id,
      apiId: row.api_id,
      encryptedKey: row.encrypted_key,
      isVerified: row.is_verified ?? false,
      verifiedAt: row.verified_at ? String(row.verified_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}
