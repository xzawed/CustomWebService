import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from './base/BaseRepository';
import type { ApiCatalogItem, CatalogSearchParams, Category } from '@/types/api';

export class CatalogRepository extends BaseRepository<ApiCatalogItem> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'api_catalog');
  }

  async search(params: CatalogSearchParams): Promise<{ items: ApiCatalogItem[]; total: number }> {
    const { category, search, page = 1, limit = 20 } = params;

    // Bounds checking
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const offset = (safePage - 1) * safeLimit;

    let query = this.supabase
      .from(this.tableName)
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .is('deprecated_at', null);

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    if (search) {
      // Sanitize search input - remove special characters that could interfere
      const sanitized = search
        .replace(/[%_\\]/g, '')
        .trim()
        .slice(0, 100);
      if (sanitized) {
        query = query.or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
      } else {
        // All characters were stripped — return empty rather than unfiltered results
        return { items: [], total: 0 };
      }
    }

    query = query.order('name', { ascending: true });
    query = query.range(offset, offset + safeLimit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      items: (data ?? []).map((row) => this.toDomain(row)),
      total: count ?? 0,
    };
  }

  async getCategories(): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('category')
      .eq('is_active', true)
      .is('deprecated_at', null);

    if (error) throw error;

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
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

    const { data, error } = await this.supabase.from(this.tableName).select('*').in('id', ids);

    if (error) throw error;
    return (data ?? []).map((row) => this.toDomain(row));
  }

  protected toDomain(row: Record<string, unknown>): ApiCatalogItem {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      category: row.category as string,
      baseUrl: row.base_url as string,
      authType: row.auth_type as ApiCatalogItem['authType'],
      authConfig: (row.auth_config as Record<string, unknown>) ?? {},
      rateLimit: (row.rate_limit as string) ?? null,
      isActive: row.is_active as boolean,
      iconUrl: (row.icon_url as string) ?? null,
      docsUrl: (row.docs_url as string) ?? null,
      endpoints: this.parseEndpoints(row.endpoints),
      tags: (row.tags as string[]) ?? [],
      apiVersion: (row.api_version as string) ?? null,
      deprecatedAt: (row.deprecated_at as string) ?? null,
      successorId: (row.successor_id as string) ?? null,
      corsSupported: (row.cors_supported as boolean) ?? true,
      requiresProxy: (row.requires_proxy as boolean) ?? false,
      creditRequired: row.credit_required != null ? Number(row.credit_required) : null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private parseEndpoints(raw: unknown): ApiCatalogItem['endpoints'] {
    if (!Array.isArray(raw)) return [];
    return raw.map((ep: Record<string, unknown>) => {
      // DB의 parameters(객체) → params(배열) 변환
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
