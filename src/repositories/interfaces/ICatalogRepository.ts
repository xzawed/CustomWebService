import type { IBaseRepository } from './IBaseRepository';
import type { ApiCatalogItem, CatalogSearchParams, Category } from '@/types/api';

export type ProjectStatus = 'draft' | 'generated' | 'published' | 'failed';

export interface ICatalogRepository extends IBaseRepository<ApiCatalogItem> {
  search(params: CatalogSearchParams): Promise<{ items: ApiCatalogItem[]; total: number }>;
  getCategories(): Promise<Category[]>;
  findByIds(ids: string[]): Promise<ApiCatalogItem[]>;
  /** 게시/생성된 프로젝트의 api_id + context 목록 (인기도 집계용) */
  getApiUsageFromProjects(statuses: ProjectStatus[]): Promise<Array<{ apiId: string; context: string }>>;
  /** 이름→id 맵 (curated service 매핑용). 활성 카탈로그만 */
  getActiveNameToIdMap(): Promise<Map<string, string>>;
  /** DB 연결 헬스체크 */
  ping(): Promise<boolean>;
  /** 오늘 생성 수 / 전체 프로젝트 수 / 전체 사용자 수 */
  getUsageCounts(sinceDate: Date): Promise<{ todayGenerations: number; totalProjects: number; totalUsers: number }>;
}
