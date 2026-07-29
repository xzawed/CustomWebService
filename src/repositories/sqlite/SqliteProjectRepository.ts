import { eq, and, desc, asc, sql } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import type { Project, ProjectMetadata } from '@/types/project';
import type { IProjectRepository } from '@/repositories/interfaces';
import type { QueryOptions } from '@/repositories/interfaces/IBaseRepository';
import { toDatabaseRow, normalizePagination, toSnake } from '@/repositories/utils';
import { NotFoundError } from '@/lib/utils/errors';

type ProjectRow = typeof schema.projects.$inferSelect;

/**
 * SQLite 구현 — IProjectRepository.
 *
 * 매핑 기준은 Supabase 레포(projectRepository.ts)의 toDomain이다:
 *  - organization_id는 항상 null 보존(테이블에 컬럼은 있으나 Organizations 기능 제거)
 *  - metadata는 객체(없으면 {}), suggested_slugs는 배열(없으면 undefined)
 *  - 타임스탬프(created_at/updated_at/published_at)는 ISO 문자열 그대로 (도메인이 string ISO 기대)
 *  - apis는 항상 빈 배열(별도 join으로 채움)
 *
 * SQLite quirk:
 *  - JSON 컬럼(mode:json)은 drizzle가 이미 객체/배열로 역직렬화해 돌려준다(JSON.parse 불필요)
 *  - created_at은 ISO8601 UTC 문자열로 저장되므로 사전식 문자열 비교로 날짜 필터가 가능하다
 */
export class SqliteProjectRepository implements IProjectRepository {
  constructor(private db: SqliteDb) {}

  async findById(id: string): Promise<Project | null> {
    const rows = this.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .limit(1)
      .all();

    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  async findMany(
    filter?: Record<string, unknown>,
    options: QueryOptions = {}
  ): Promise<{ items: Project[]; total: number }> {
    const { orderBy = 'created_at', orderDirection = 'desc' } = options;
    const { offset, limit } = normalizePagination(options);

    const conditions = this.buildConditions(filter);

    const countRow = this.db
      .select({ total: sql<number>`count(*)` })
      .from(schema.projects)
      .where(conditions)
      .get();

    const columns = schema.projects as unknown as Record<string, SQLiteColumn | undefined>;
    const orderColumn: SQLiteColumn = columns[orderBy] ?? schema.projects.created_at;
    const orderExpr = orderDirection === 'asc' ? asc(orderColumn) : desc(orderColumn);

    const rows = this.db
      .select()
      .from(schema.projects)
      .where(conditions)
      .orderBy(orderExpr)
      .limit(limit)
      .offset(offset)
      .all();

    return {
      items: rows.map((row) => this.toDomain(row)),
      total: countRow?.total ?? 0,
    };
  }

  async create(input: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const { apis: _apis, ...rest } = input;
    const dbData = toDatabaseRow(rest);

    const [row] = this.db
      .insert(schema.projects)
      .values(dbData as typeof schema.projects.$inferInsert)
      .returning()
      .all();

    return this.toDomain(row);
  }

  async update(id: string, input: Partial<Project>): Promise<Project> {
    const { apis: _apis, ...rest } = input;
    const dbData = toDatabaseRow(rest);

    const [row] = this.db
      .update(schema.projects)
      .set({ ...dbData, updated_at: new Date().toISOString() } as Partial<
        typeof schema.projects.$inferInsert
      >)
      .where(eq(schema.projects.id, id))
      .returning()
      .all();

    if (!row) throw new NotFoundError('프로젝트', id);
    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    // FK ON DELETE NO ACTION — 자식 정리를 앱 레벨 단일 트랜잭션으로 처리한다.
    this.db.transaction((tx) => {
      // 감사 로그는 프로젝트보다 오래 살아야 하므로 행을 지우지 않고 project_id만 분리한다.
      tx.update(schema.platformEvents)
        .set({ project_id: null })
        .where(eq(schema.platformEvents.project_id, id))
        .run();

      tx.delete(schema.generatedCodes)
        .where(eq(schema.generatedCodes.project_id, id))
        .run();

      tx.delete(schema.projectApis)
        .where(eq(schema.projectApis.project_id, id))
        .run();

      // FK 없음(의도적)이지만 프로젝트별 휘발 상태 — 고아 락을 남기지 않는다.
      tx.delete(schema.generationLocks)
        .where(eq(schema.generationLocks.project_id, id))
        .run();

      tx.delete(schema.projects).where(eq(schema.projects.id, id)).run();
    });
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    const conditions = this.buildConditions(filter);

    const row = this.db
      .select({ total: sql<number>`count(*)` })
      .from(schema.projects)
      .where(conditions)
      .get();

    return row?.total ?? 0;
  }

  async findByUserId(userId: string): Promise<Project[]> {
    const rows = this.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.user_id, userId))
      .orderBy(desc(schema.projects.created_at))
      .all();

    return rows.map((row) => this.toDomain(row));
  }

  async countTodayGenerations(userId: string): Promise<number> {
    // Supabase RPC(count_today_generations)와 동일 의미:
    //   gc.created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')
    // created_at은 ISO8601 UTC 문자열이므로 UTC 자정 ISO 문자열과의 사전식 >= 비교로 재현한다.
    const now = new Date();
    const utcMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).toISOString();

    const row = this.db
      .select({ cnt: sql<number>`count(*)` })
      .from(schema.generatedCodes)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.generatedCodes.project_id))
      .where(
        and(
          eq(schema.projects.user_id, userId),
          sql`${schema.generatedCodes.created_at} >= ${utcMidnight}`
        )
      )
      .get();

    return row?.cnt ?? 0;
  }

  async insertProjectApis(projectId: string, apiIds: string[]): Promise<void> {
    if (apiIds.length === 0) return;

    const mappings = apiIds.map((apiId) => ({
      project_id: projectId,
      api_id: apiId,
    }));

    this.db.insert(schema.projectApis).values(mappings).run();
  }

  async getProjectApiIds(projectId: string): Promise<string[]> {
    const rows = this.db
      .select({ api_id: schema.projectApis.api_id })
      .from(schema.projectApis)
      .where(eq(schema.projectApis.project_id, projectId))
      .all();

    return rows.map((row) => row.api_id);
  }

  async findBySlug(slug: string): Promise<Project | null> {
    const rows = this.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.slug, slug))
      .limit(1)
      .all();

    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  async updateSuggestedSlugs(id: string, slugs: string[]): Promise<void> {
    this.db
      .update(schema.projects)
      .set({ suggested_slugs: slugs })
      .where(eq(schema.projects.id, id))
      .run();
  }

  async updateSlug(id: string, slug: string, publishedAt: Date): Promise<Project> {
    const [row] = this.db
      .update(schema.projects)
      .set({
        slug,
        published_at: publishedAt.toISOString(),
        status: 'published',
        updated_at: new Date().toISOString(),
      })
      .where(eq(schema.projects.id, id))
      .returning()
      .all();

    if (!row) throw new NotFoundError('프로젝트', id);
    return this.toDomain(row);
  }

  /**
   * 평면 객체 필터를 drizzle WHERE 조건으로 변환한다(camelCase → snake_case 컬럼).
   * Supabase 레포의 findMany/count 필터 처리와 동일 의미.
   */
  private buildConditions(filter?: Record<string, unknown>) {
    if (!filter) return undefined;

    const conditions = Object.entries(filter)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        const col = toSnake(key);
        return sql`${sql.identifier(col)} = ${value}`;
      });

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return and(...conditions);
  }

  private toDomain(row: ProjectRow): Project {
    return {
      id: row.id,
      userId: row.user_id,
      organizationId: row.organization_id ?? null,
      name: row.name,
      context: row.context ?? '',
      status: row.status as Project['status'],
      deployUrl: row.deploy_url ?? null,
      deployPlatform: row.deploy_platform ?? null,
      repoUrl: row.repo_url ?? null,
      previewUrl: row.preview_url ?? null,
      metadata: (row.metadata as ProjectMetadata) ?? {},
      currentVersion: row.current_version ?? 0,
      apis: [],
      slug: row.slug ?? null,
      suggestedSlugs: row.suggested_slugs ?? undefined,
      publishedAt: row.published_at ?? null,
      createdAt: row.created_at ?? '',
      updatedAt: row.updated_at ?? '',
    };
  }
}
