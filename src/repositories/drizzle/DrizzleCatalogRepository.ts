import { eq, and, or, ilike, isNull, inArray, sql, count as drizzleCount, asc, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import type { ApiCatalogItem, CatalogSearchParams, Category } from '@/types/api';
import type { ICatalogRepository } from '@/repositories/interfaces';
import type { QueryOptions } from '@/repositories/interfaces/IBaseRepository';

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

    const conditions = this.buildConditions(filter);

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
    const conditions = this.buildConditions(filter);

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
      endpoints: this.parseEndpoints(row.endpoints),
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

  private parseEndpoints(raw: unknown): ApiCatalogItem['endpoints'] {
    if (!Array.isArray(raw)) return [];
    return raw.map((ep: Record<string, unknown>) => {
      let params: ApiCatalogItem['endpoints'][0]['params'] = [];
      if (Array.isArray(ep.params)) {
        params = ep.params;
      } else if (
        ep.parameters &&
        typeof ep.parameters === 'object' &&
        !Array.isArray(ep.parameters)
      ) {
        params = Object.entries(ep.parameters as Record<string, string>).map(([name, type]) => ({
          name,
          type,
          required: false,
          description: '',
        }));
      }
      return {
        path: (ep.path as string) ?? '',
        method: (ep.method as 'GET' | 'POST' | 'PUT' | 'DELETE') ?? 'GET',
        description: (ep.description as string) ?? '',
        params,
        responseExample:
          (ep.response_example as Record<string, unknown>) ??
          (ep.responseExample as Record<string, unknown>) ??
          {},
      };
    });
  }

  private toDatabase(model: Partial<ApiCatalogItem>): Record<string, unknown> {
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

const CATEGORY_LABELS: Record<string, string> = {
  weather: '날씨/환경',
  news: '뉴스',
  finance: '금융/환율',
  maps: '지도/위치',
  location: '지도/위치',
  translation: '번역/언어',
  dictionary: '사전/번역',
  image: '이미지',
  data: '데이터/정보',
  utility: '유틸리티',
  entertainment: '엔터테인먼트',
  fun: '재미/이름분석',
  social: '소셜',
  transport: '교통',
  realestate: '부동산',
  tourism: '관광/여행',
  lifestyle: '생활/공공',
  science: '과학/우주',
};

const CATEGORY_ICONS: Record<string, string> = {
  weather: 'Cloud',
  news: 'Newspaper',
  finance: 'DollarSign',
  maps: 'MapPin',
  location: 'MapPin',
  translation: 'Languages',
  dictionary: 'BookOpen',
  image: 'Image',
  data: 'Database',
  utility: 'Wrench',
  entertainment: 'Film',
  fun: 'Smile',
  social: 'Users',
  transport: 'Bus',
  realestate: 'Building',
  tourism: 'Compass',
  lifestyle: 'Heart',
  science: 'Telescope',
};
