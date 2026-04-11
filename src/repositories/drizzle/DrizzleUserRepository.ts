import { eq, sql, desc, count as drizzleCount } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import type { User, UserPreferences } from '@/types/organization';
import type { IUserRepository } from '@/repositories/interfaces';
import type { QueryOptions } from '@/repositories/interfaces/IBaseRepository';

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
    const { page = 1, limit = 20, orderDirection = 'desc' } = options;
    const offset = (page - 1) * limit;

    const conditions = this.buildConditions(filter);

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
    const dbData = this.toDatabase(input);

    const [row] = await this.db
      .insert(schema.users)
      .values(dbData as typeof schema.users.$inferInsert)
      .returning();

    return this.toDomain(row);
  }

  async update(id: string, input: Partial<User>): Promise<User> {
    const dbData = this.toDatabase(input);

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
    const conditions = this.buildConditions(filter);

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
    const dbData = this.toDatabase(input);

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

  private toDatabase(model: Partial<User>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(model)) {
      if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
      result[this.toSnake(key)] = value;
    }
    return result;
  }

  private toSnake(str: string): string {
    return str
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase();
  }

  private buildConditions(filter?: Record<string, unknown>) {
    if (!filter) return undefined;

    const conditions = Object.entries(filter)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        const col = this.toSnake(key);
        return sql`${sql.identifier(col)} = ${value}`;
      });

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];

    return sql.join(conditions, sql` AND `);
  }
}
