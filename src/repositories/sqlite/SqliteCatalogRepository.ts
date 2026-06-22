import { eq, and, or, isNull, inArray, asc, desc, gte, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import type { ApiCatalogItem, ApiVerificationStatus, CatalogSearchParams, Category } from '@/types/api';
import type { ICatalogRepository, ProjectStatus } from '@/repositories/interfaces';
import type { QueryOptions } from '@/repositories/interfaces/IBaseRepository';
import {
  toDatabaseRow,
  normalizePagination,
  parseEndpoints,
  toSnake,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
} from '@/repositories/utils';

/**
 * SQLite(better-sqlite3 + drizzle) 구현 (임베디드 단일 인스턴스·단일 사용자 경로).
 *
 * 매핑 기준은 Supabase 레포(`catalogRepository.ts`)와 동일하다 — 가장 정확한 toDomain.
 * Drizzle pg 레포(`DrizzleCatalogRepository.ts`)는 쿼리 구조 참고용이며, 그 레포가 누락한
 * verification_status / verified_at / last_verification_note 매핑을 여기서는 반드시 포함한다.
 *
 * SQLite 방언 주의:
 * - 타임스탬프(created_at/updated_at/deprecated_at/verified_at)는 ISO8601 문자열로 저장되며
 *   도메인이 `string`을 기대하므로 그대로 반환한다.
 * - JSON 컬럼(auth_config/endpoints/tags, mode:'json')은 drizzle가 객체/배열로 역직렬화해 돌려준다
 *   (JSON.parse 불필요). endpoints는 snake_case/camelCase 이중성을 `parseEndpoints`가 흡수한다.
 * - boolean 컬럼(is_active/cors_supported/requires_proxy, mode:'boolean')은 drizzle가 true/false로 돌려준다.
 * - 검색은 SQLite `LIKE`(ASCII 대소문자 무시)로 Supabase `ilike` 동작을 미러링한다.
 *   기본 필터: is_active=true AND deprecated_at IS NULL.
 */
export class SqliteCatalogRepository implements ICatalogRepository {
  constructor(private db: SqliteDb) {}

  async findById(id: string): Promise<ApiCatalogItem | null> {
    const row = this.db
      .select()
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.id, id))
      .limit(1)
      .get();

    return row ? this.toDomain(row) : null;
  }

  async findMany(
    filter?: Record<string, unknown>,
    options: QueryOptions = {},
  ): Promise<{ items: ApiCatalogItem[]; total: number }> {
    const { orderDirection = 'desc' } = options;
    const { offset, limit } = normalizePagination(options);

    const conditions = this.buildEqConditions(filter);

    const countRow = this.db
      .select({ total: sql<number>`count(*)` })
      .from(schema.apiCatalog)
      .where(conditions)
      .get();

    const rows = this.db
      .select()
      .from(schema.apiCatalog)
      .where(conditions)
      .orderBy(orderDirection === 'asc' ? asc(schema.apiCatalog.created_at) : desc(schema.apiCatalog.created_at))
      .offset(offset)
      .limit(limit)
      .all();

    return {
      items: rows.map((row) => this.toDomain(row)),
      total: Number(countRow?.total ?? 0),
    };
  }

  async create(input: Omit<ApiCatalogItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiCatalogItem> {
    const dbData = toDatabaseRow(input as Partial<Record<string, unknown>>);

    const [row] = this.db
      .insert(schema.apiCatalog)
      .values(dbData as typeof schema.apiCatalog.$inferInsert)
      .returning()
      .all();

    return this.toDomain(row);
  }

  async update(id: string, input: Partial<ApiCatalogItem>): Promise<ApiCatalogItem> {
    const dbData = toDatabaseRow(input as Partial<Record<string, unknown>>);

    const [row] = this.db
      .update(schema.apiCatalog)
      .set({ ...dbData, updated_at: new Date().toISOString() } as Partial<typeof schema.apiCatalog.$inferInsert>)
      .where(eq(schema.apiCatalog.id, id))
      .returning()
      .all();

    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    this.db.delete(schema.apiCatalog).where(eq(schema.apiCatalog.id, id)).run();
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    const conditions = this.buildEqConditions(filter);

    const row = this.db
      .select({ total: sql<number>`count(*)` })
      .from(schema.apiCatalog)
      .where(conditions)
      .get();

    return Number(row?.total ?? 0);
  }

  async search(params: CatalogSearchParams): Promise<{ items: ApiCatalogItem[]; total: number }> {
    const { category, search, page = 1, limit = 20 } = params;

    // Bounds checking (Supabase 레포와 동일)
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const offset = (safePage - 1) * safeLimit;

    // Base conditions: active and not deprecated
    const baseConditions = and(
      eq(schema.apiCatalog.is_active, true),
      isNull(schema.apiCatalog.deprecated_at),
    );

    // Category filter
    const categoryCondition =
      category && category !== 'all' ? eq(schema.apiCatalog.category, category) : undefined;

    // Search filter — escape LIKE special chars, then mirror ilike via SQLite LIKE
    let searchCondition;
    if (search) {
      const sanitized = search
        .trim()
        .slice(0, 100)
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');

      if (sanitized) {
        // SQLite LIKE는 ASCII 대소문자를 무시(ilike 미러링)하지만, 기본적으로 escape 문자를
        // 지원하지 않는다. 위 sanitizer가 \%, \_, \\ 로 이스케이프하므로 ESCAPE '\' 절을
        // 명시해 와일드카드를 리터럴로 매칭한다. (drizzle `like`는 ESCAPE를 붙이지 않음)
        const pattern = `%${sanitized}%`;
        searchCondition = or(
          sql`${schema.apiCatalog.name} LIKE ${pattern} ESCAPE '\\'`,
          sql`${schema.apiCatalog.description} LIKE ${pattern} ESCAPE '\\'`,
        );
      }
    }

    const allConditions = and(baseConditions, ...[categoryCondition, searchCondition].filter(Boolean));

    const countRow = this.db
      .select({ total: sql<number>`count(*)` })
      .from(schema.apiCatalog)
      .where(allConditions)
      .get();

    const rows = this.db
      .select()
      .from(schema.apiCatalog)
      .where(allConditions)
      .orderBy(asc(schema.apiCatalog.name))
      .offset(offset)
      .limit(safeLimit)
      .all();

    return {
      items: rows.map((row) => this.toDomain(row)),
      total: Number(countRow?.total ?? 0),
    };
  }

  async getCategories(): Promise<Category[]> {
    const rows = this.db
      .select({ category: schema.apiCatalog.category })
      .from(schema.apiCatalog)
      .where(and(eq(schema.apiCatalog.is_active, true), isNull(schema.apiCatalog.deprecated_at)))
      .all();

    const counts = new Map<string, number>();
    for (const row of rows) {
      const cat = row.category ?? 'unknown';
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }

    return Array.from(counts.entries()).map(([key, count]) => ({
      key,
      label: CATEGORY_LABELS[key] ?? key,
      icon: CATEGORY_ICONS[key] ?? 'Box',
      count,
    }));
  }

  async findByIds(ids: string[]): Promise<ApiCatalogItem[]> {
    if (ids.length === 0) return [];

    const rows = this.db
      .select()
      .from(schema.apiCatalog)
      .where(inArray(schema.apiCatalog.id, ids))
      .all();

    return rows.map((row) => this.toDomain(row));
  }

  async getApiUsageFromProjects(statuses: ProjectStatus[]): Promise<Array<{ apiId: string; context: string }>> {
    if (statuses.length === 0) return [];

    const rows = this.db
      .select({
        api_id: schema.projectApis.api_id,
        context: schema.projects.context,
      })
      .from(schema.projectApis)
      .innerJoin(schema.projects, eq(schema.projectApis.project_id, schema.projects.id))
      .where(inArray(schema.projects.status, statuses))
      .all();

    return rows.map((row) => ({
      apiId: row.api_id,
      context: row.context ?? '',
    }));
  }

  async getActiveNameToIdMap(): Promise<Map<string, string>> {
    const rows = this.db
      .select({ id: schema.apiCatalog.id, name: schema.apiCatalog.name })
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.is_active, true))
      .all();

    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.name.toLowerCase(), row.id);
    }
    return map;
  }

  async ping(): Promise<boolean> {
    try {
      this.db
        .select({ n: sql<number>`count(*)` })
        .from(schema.apiCatalog)
        .limit(1)
        .get();
      return true;
    } catch {
      return false;
    }
  }

  async getUsageCounts(
    sinceDate: Date,
  ): Promise<{ todayGenerations: number; totalProjects: number; totalUsers: number }> {
    const since = sinceDate.toISOString();

    const genRow = this.db
      .select({ n: sql<number>`count(*)` })
      .from(schema.generatedCodes)
      .where(gte(schema.generatedCodes.created_at, since))
      .get();

    const projectRow = this.db
      .select({ n: sql<number>`count(*)` })
      .from(schema.projects)
      .get();

    const userRow = this.db
      .select({ n: sql<number>`count(*)` })
      .from(schema.users)
      .get();

    return {
      todayGenerations: Number(genRow?.n ?? 0),
      totalProjects: Number(projectRow?.n ?? 0),
      totalUsers: Number(userRow?.n ?? 0),
    };
  }

  /**
   * filter(camelCase 또는 snake_case 키)를 snake_case 컬럼 eq 조건으로 변환한다.
   * Supabase BaseRepository.findMany/count와 동일하게 undefined/null 값은 무시한다.
   */
  private buildEqConditions(filter?: Record<string, unknown>) {
    if (!filter) return undefined;

    const columns = schema.apiCatalog as unknown as Record<string, SQLiteColumn | undefined>;
    const conditions: SQL[] = [];
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined || value === null) continue;
      const column = columns[toSnake(key)];
      if (column) {
        conditions.push(eq(column, value as string | number | boolean));
      }
    }

    if (conditions.length === 0) return undefined;
    return conditions.length === 1 ? conditions[0] : and(...conditions);
  }

  private toDomain(row: typeof schema.apiCatalog.$inferSelect): ApiCatalogItem {
    return {
      id: row.id,
      name: row.name,
      description: (row.description as string) ?? '',
      category: (row.category as string) ?? '',
      baseUrl: (row.base_url as string) ?? '',
      authType: (row.auth_type as ApiCatalogItem['authType']) ?? 'none',
      authConfig: (row.auth_config as Record<string, unknown>) ?? {},
      rateLimit: row.rate_limit ?? null,
      isActive: row.is_active ?? true,
      iconUrl: row.icon_url ?? null,
      docsUrl: row.docs_url ?? null,
      endpoints: parseEndpoints(row.endpoints),
      tags: row.tags ?? [],
      apiVersion: row.api_version ?? null,
      deprecatedAt: row.deprecated_at ?? null,
      successorId: row.successor_id ?? null,
      corsSupported: row.cors_supported ?? true,
      requiresProxy: row.requires_proxy ?? false,
      creditRequired: row.credit_required != null ? Number(row.credit_required) : null,
      cacheTtlSeconds: row.cache_ttl_seconds != null ? Number(row.cache_ttl_seconds) : null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      verificationStatus: (row.verification_status ?? 'unverified') as ApiVerificationStatus,
      verifiedAt: row.verified_at != null ? (row.verified_at as string) : null,
      lastVerificationNote: (row.last_verification_note as string) ?? null,
    };
  }
}
