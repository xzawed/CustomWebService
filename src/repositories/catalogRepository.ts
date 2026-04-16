import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository } from './base/BaseRepository';
import type { ApiCatalogItem, ApiVerificationStatus, CatalogSearchParams, Category } from '@/types/api';
import type { ICatalogRepository, ProjectStatus } from '@/repositories/interfaces';
import { parseEndpoints, CATEGORY_LABELS, CATEGORY_ICONS } from '@/repositories/utils';

export class CatalogRepository extends BaseRepository<ApiCatalogItem> implements ICatalogRepository {
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
      // Escape LIKE special characters to preserve search intent, then trim
      const sanitized = search
        .trim()
        .slice(0, 100)
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');

      // Only skip search if the trimmed input is truly empty
      if (sanitized) {
        query = query.or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
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

  async getApiUsageFromProjects(statuses: ProjectStatus[]): Promise<Array<{ apiId: string; context: string }>> {
    const { data, error } = await this.supabase
      .from('project_apis')
      .select('api_id, projects!inner(context, status)')
      .in('projects.status', statuses);

    if (error || !data) return [];

    return data.map((row) => ({
      apiId: row.api_id as string,
      context: ((row.projects as unknown as { context: string }).context) ?? '',
    }));
  }

  async getActiveNameToIdMap(): Promise<Map<string, string>> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('id, name')
      .eq('is_active', true);

    if (error || !data) return new Map();

    const map = new Map<string, string>();
    for (const row of data) {
      map.set((row.name as string).toLowerCase(), row.id as string);
    }
    return map;
  }

  async ping(): Promise<boolean> {
    const { error } = await this.supabase
      .from(this.tableName)
      .select('id', { count: 'exact', head: true });
    return !error;
  }

  async getUsageCounts(sinceDate: Date): Promise<{ todayGenerations: number; totalProjects: number; totalUsers: number }> {
    const [genResult, projectResult, userResult] = await Promise.all([
      this.supabase
        .from('generated_codes')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sinceDate.toISOString()),
      this.supabase.from('projects').select('id', { count: 'exact', head: true }),
      this.supabase.from('users').select('id', { count: 'exact', head: true }),
    ]);

    return {
      todayGenerations: genResult.count ?? 0,
      totalProjects: projectResult.count ?? 0,
      totalUsers: userResult.count ?? 0,
    };
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
      endpoints: parseEndpoints(row.endpoints),
      tags: (row.tags as string[]) ?? [],
      apiVersion: (row.api_version as string) ?? null,
      deprecatedAt: (row.deprecated_at as string) ?? null,
      successorId: (row.successor_id as string) ?? null,
      corsSupported: (row.cors_supported as boolean) ?? true,
      requiresProxy: (row.requires_proxy as boolean) ?? false,
      creditRequired: row.credit_required != null ? Number(row.credit_required) : null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      verificationStatus: (row.verification_status ?? 'unverified') as ApiVerificationStatus,
      verifiedAt: row.verified_at != null ? (row.verified_at as string) : null,
      lastVerificationNote: (row.last_verification_note as string) ?? null,
    };
  }

}
