import { eq, sql, desc, count as drizzleCount } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import type { User, UserPreferences } from '@/types/user';
import type { IUserRepository } from '@/repositories/interfaces';
import type { QueryOptions } from '@/repositories/interfaces/IBaseRepository';
import { toDatabaseRow, normalizePagination, buildConditions } from '@/repositories/utils';

type DrizzleDb = NodePgDatabase<typeof schema>;

export class DrizzleUserRepository implements IUserRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);

    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  async findMany(
    filter?: Record<string, unknown>,
    options: QueryOptions = {}
  ): Promise<{ items: User[]; total: number }> {
    const { orderDirection = 'desc' } = options;
    const { offset, limit } = normalizePagination(options);

    const conditions = buildConditions(filter);

    const [countResult] = await this.db
      .select({ total: drizzleCount() })
      .from(schema.users)
      .where(conditions);

    const rows = await this.db
      .select()
      .from(schema.users)
      .where(conditions)
      .orderBy(orderDirection === 'asc' ? schema.users.created_at : desc(schema.users.created_at))
      .offset(offset)
      .limit(limit);

    return {
      items: rows.map((row) => this.toDomain(row)),
      total: countResult?.total ?? 0,
    };
  }

  async create(input: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const dbData = toDatabaseRow(input);

    const [row] = await this.db
      .insert(schema.users)
      .values(dbData as typeof schema.users.$inferInsert)
      .returning();

    return this.toDomain(row);
  }

  async update(id: string, input: Partial<User>): Promise<User> {
    const dbData = toDatabaseRow(input);

    const [row] = await this.db
      .update(schema.users)
      .set({ ...dbData, updated_at: new Date() } as Partial<typeof schema.users.$inferInsert>)
      .where(eq(schema.users.id, id))
      .returning();

    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(schema.users).where(eq(schema.users.id, id));
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    const conditions = buildConditions(filter);

    const [result] = await this.db
      .select({ total: drizzleCount() })
      .from(schema.users)
      .where(conditions);

    return result?.total ?? 0;
  }

  async createWithAuthId(
    authId: string,
    input: Omit<User, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<User> {
    const dbData = toDatabaseRow(input);

    const [row] = await this.db
      .insert(schema.users)
      .values({ ...dbData, id: authId } as typeof schema.users.$inferInsert)
      .returning();

    return this.toDomain(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  private toDomain(row: typeof schema.users.$inferSelect): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name ?? null,
      avatarUrl: row.avatar_url ?? null,
      preferences: (row.preferences as UserPreferences) ?? {},
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

}
