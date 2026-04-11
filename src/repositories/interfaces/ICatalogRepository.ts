import type { IBaseRepository } from './IBaseRepository';
import type { ApiCatalogItem, CatalogSearchParams, Category } from '@/types/api';

export interface ICatalogRepository extends IBaseRepository<ApiCatalogItem> {
  search(params: CatalogSearchParams): Promise<{ items: ApiCatalogItem[]; total: number }>;
  getCategories(): Promise<Category[]>;
  findByIds(ids: string[]): Promise<ApiCatalogItem[]>;
}
