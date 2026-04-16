import { eq, and, or, ilike, isNull, inArray, sql, count as drizzleCount, asc, desc, gte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import type { ApiCatalogItem, CatalogSearchParams, Category } from '@/types/api';
import type { ICatalogRepository, ProjectStatus } from '@/repositories/interfaces';
import type { QueryOptions } from '@/repositories/interfaces/IBaseRepository';
import { toSnake, buildConditions, parseEndpoints, CATEGORY_LABELS, CATEGORY_ICONS } from '@/repositories/utils';

type DrizzleDb = NodePgDatabase<typeof schema>;

export class DrizzleCatalogRepository implements ICatalogRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<ApiCatalogItem | null> {
    const rows = await this.db
      .select()
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.id, id))
      .limit(1);

    return rows.length > 0 ? this.toDomain(rows[0]) : null;
  }

  async findMany(
    filter?: Record<string, unknown>,
    options: QueryOptions = {}
  ): Promise<{ items: ApiCatalogItem[]; total: number }> {
    const { page = 1, limit = 20, orderDirection = 'desc' } = options;
    const offset = (page - 1) * limit;

    const conditions = buildConditions(filter);

    const [countResult] = await this.db
      .select({ total: drizzleCount() })
      .from(schema.apiCatalog)
      .where(conditions);

    const rows = await this.db
      .select()
      .from(schema.apiCatalog)
      .where(conditions)
      .orderBy(orderDirection === 'asc' ? asc(schema.apiCatalog.created_at) : desc(schema.apiCatalog.created_at))
      .offset(offset)
      .limit(limit);

    return {
      items: rows.map((row) => this.toDomain(row)),
      total: countResult?.total ?? 0,
    };
  }

  async create(input: Omit<ApiCatalogItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiCatalogItem> {
    const dbData = this.toDatabase(input);

    const [row] = await this.db
      .insert(schema.apiCatalog)
      .values(dbData as typeof schema.apiCatalog.$inferInsert)
      .returning();

    return this.toDomain(row);
  }

  async update(id: string, input: Partial<ApiCatalogItem>): Promise<ApiCatalogItem> {
    const dbData = this.toDatabase(input);

    const [row] = await this.db
      .update(schema.apiCatalog)
      .set({ ...dbData, updated_at: new Date() } as Partial<typeof schema.apiCatalog.$inferInsert>)
      .where(eq(schema.apiCatalog.id, id))
      .returning();

    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(schema.apiCatalog).where(eq(schema.apiCatalog.id, id));
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    const conditions = buildConditions(filter);

    const [result] = await this.db
      .select({ total: drizzleCount() })
      .from(schema.apiCatalog)
      .where(conditions);

    return result?.total ?? 0;
  }

  async search(params: CatalogSearchParams): Promise<{ items: ApiCatalogItem[]; total: number }> {
    const { category, search, page = 1, limit = 20 } = params;

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const offset = (safePage - 1) * safeLimit;

    // Base conditions: active and not deprecated
    const baseConditions = and(
      eq(schema.apiCatalog.is_active, true),
      isNull(schema.apiCatalog.deprecated_at)
    );

    // Category filter
    const categoryCondition =
      category && category !== 'all'
        ? eq(schema.apiCatalog.category, category)
        : undefined;

    // Search filter
    let searchCondition;
    if (search) {
      const sanitized = search
        .trim()
        .slice(0, 100)
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');

      if (sanitized) {
        searchCondition = or(
          ilike(schema.apiCatalog.name, `%${sanitized}%`),
          ilike(schema.apiCatalog.description, `%${sanitized}%`)
        );
      }
    }

    // Combine all conditions
    const allConditions = and(
      baseConditions,
      ...[categoryCondition, searchCondition].filter(Boolean)
    );

    const [countResult] = await this.db
      .select({ total: drizzleCount() })
      .from(schema.apiCatalog)
      .where(allConditions);

    const rows = await this.db
      .select()
      .from(schema.apiCatalog)
      .where(allConditions)
      .orderBy(asc(schema.apiCatalog.name))
      .offset(offset)
      .limit(safeLimit);

    return {
      items: rows.map((row) => this.toDomain(row)),
      total: countResult?.total ?? 0,
    };
  }

  async getCategories(): Promise<Category[]> {
    const rows = await this.db
      .select({ category: schema.apiCatalog.category })
      .from(schema.apiCatalog)
      .where(
        and(
          eq(schema.apiCatalog.is_active, true),
          isNull(schema.apiCatalog.deprecated_at)
        )
      );

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

    const rows = await this.db
      .select()
      .from(schema.apiCatalog)
      .where(inArray(schema.apiCatalog.id, ids));

    return rows.map((row) => this.toDomain(row));
  }

  async getApiUsageFromProjects(statuses: ProjectStatus[]): Promise<Array<{ apiId: string; context: string }>> {
    const rows = await this.db
      .select({
        api_id: schema.projectApis.api_id,
        context: schema.projects.context,
      })
      .from(schema.projectApis)
      .innerJoin(schema.projects, eq(schema.projectApis.project_id, schema.projects.id))
      .where(inArray(schema.projects.status, statuses));

    return rows.map((row) => ({
      apiId: row.api_id,
      context: row.context ?? '',
    }));
  }

  async getActiveNameToIdMap(): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ id: schema.apiCatalog.id, name: schema.apiCatalog.name })
      .from(schema.apiCatalog)
      .where(eq(schema.apiCatalog.is_active, true));

    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.name.toLowerCase(), row.id);
    }
    return map;
  }

  async ping(): Promise<boolean> {
    try {
      await this.db
        .select({ n: drizzleCount() })
        .from(schema.apiCatalog)
        .limit(1);
      return true;
    } catch {
      return false;
    }
  }

  async getUsageCounts(sinceDate: Date): Promise<{ todayGenerations: number; totalProjects: number; totalUsers: number }> {
    const [genResult, projectResult, userResult] = await Promise.all([
      this.db.select({ n: drizzleCount() }).from(schema.generatedCodes).where(gte(schema.generatedCodes.created_at, sinceDate)),
      this.db.select({ n: drizzleCount() }).from(schema.projects),
      this.db.select({ n: drizzleCount() }).from(schema.users),
    ]);

    return {
      todayGenerations: Number(genResult[0]?.n ?? 0),
      totalProjects: Number(projectResult[0]?.n ?? 0),
      totalUsers: Number(userResult[0]?.n ?? 0),
    };
  }

  private toDomain(row: typeof schema.apiCatalog.$inferSelect): ApiCatalogItem {
    return {
      id: row.id,
      name: row.name,
      description: row.description as string,
      category: row.category as string,
      baseUrl: row.base_url as string,
      authType: row.auth_type as ApiCatalogItem['authType'],
      authConfig: (row.auth_config as Record<string, unknown>) ?? {},
      rateLimit: row.rate_limit ?? null,
      isActive: row.is_active ?? true,
      iconUrl: row.icon_url ?? null,
      docsUrl: row.docs_url ?? null,
      endpoints: parseEndpoints(row.endpoints),
      tags: row.tags ?? [],
      apiVersion: row.api_version ?? null,
      deprecatedAt: row.deprecated_at ? String(row.deprecated_at) : null,
      successorId: row.successor_id ?? null,
      corsSupported: row.cors_supported ?? true,
      requiresProxy: row.requires_proxy ?? false,
      creditRequired: row.credit_required != null ? Number(row.credit_required) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private toDatabase(model: Partial<ApiCatalogItem>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(model)) {
      if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
      result[toSnake(key)] = value;
    }
    return result;
  }
}
