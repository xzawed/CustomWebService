import { eq, desc, sql } from 'drizzle-orm';
import type { SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import type { User, UserPreferences } from '@/types/user';
import type { IUserRepository } from '@/repositories/interfaces';
import type { QueryOptions } from '@/repositories/interfaces/IBaseRepository';
import { toDatabaseRow, normalizePagination, buildConditions } from '@/repositories/utils';

/**
 * SQLite 구현 (임베디드 단일 인스턴스·단일 사용자 경로).
 *
 * 매핑 기준은 Supabase 레포(`userRepository.ts`)와 동일하다:
 * - created_at/updated_at는 SQLite에 ISO8601 문자열로 저장되며, 도메인 `User`가
 *   `string`(ISO)을 기대하므로 그대로 반환한다 (Drizzle pg 레포는 `String(...)`로 강제하지만
 *   SQLite는 이미 string이라 의미상 동일).
 * - preferences는 drizzle(mode:json)가 객체로 역직렬화해 돌려주므로 그대로 사용한다
 *   (JSON.parse 불필요). null이면 `{}`로 폴백한다 (Supabase 레포 동작 보존).
 * - name/avatar_url은 nullable이며 `?? null`로 정규화한다.
 *
 * 단일 사용자/셀프호스트라 RLS 대신 인자로 받은 id/email로 직접 필터한다.
 * 모든 쿼리는 better-sqlite3 동기 API(.all()/.get()/.run()/.returning())를 사용한다.
 */
export class SqliteUserRepository implements IUserRepository {
  constructor(private readonly db: SqliteDb) {}

  async findById(id: string): Promise<User | null> {
    const row = this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1)
      .get();

    return row ? this.toDomain(row) : null;
  }

  async findMany(
    filter?: Record<string, unknown>,
    options: QueryOptions = {},
  ): Promise<{ items: User[]; total: number }> {
    const { orderDirection = 'desc' } = options;
    const { offset, limit } = normalizePagination(options);

    const conditions = buildConditions(filter);

    const countRow = this.db
      .select({ total: sql<number>`count(*)` })
      .from(schema.users)
      .where(conditions)
      .get();

    const rows = this.db
      .select()
      .from(schema.users)
      .where(conditions)
      .orderBy(orderDirection === 'asc' ? schema.users.created_at : desc(schema.users.created_at))
      .limit(limit)
      .offset(offset)
      .all();

    return {
      items: rows.map((row) => this.toDomain(row)),
      total: countRow?.total ?? 0,
    };
  }

  async create(input: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const dbData = toDatabaseRow(input);

    const [row] = this.db
      .insert(schema.users)
      .values(dbData as typeof schema.users.$inferInsert)
      .returning()
      .all();

    return this.toDomain(row);
  }

  async update(id: string, input: Partial<User>): Promise<User> {
    const dbData = toDatabaseRow(input);

    const [row] = this.db
      .update(schema.users)
      .set({ ...dbData, updated_at: new Date().toISOString() } as Partial<
        typeof schema.users.$inferInsert
      >)
      .where(eq(schema.users.id, id))
      .returning()
      .all();

    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    this.db.delete(schema.users).where(eq(schema.users.id, id)).run();
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    const conditions = buildConditions(filter);

    const countRow = this.db
      .select({ total: sql<number>`count(*)` })
      .from(schema.users)
      .where(conditions)
      .get();

    return countRow?.total ?? 0;
  }

  async createWithAuthId(
    authId: string,
    input: Omit<User, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<User> {
    const dbData = toDatabaseRow(input);

    const [row] = this.db
      .insert(schema.users)
      .values({ ...dbData, id: authId } as typeof schema.users.$inferInsert)
      .returning()
      .all();

    return this.toDomain(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1)
      .get();

    return row ? this.toDomain(row) : null;
  }

  private toDomain(row: typeof schema.users.$inferSelect): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name ?? null,
      avatarUrl: row.avatar_url ?? null,
      preferences: (row.preferences as UserPreferences) ?? {},
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
