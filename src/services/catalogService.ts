import type { ICatalogRepository } from '@/repositories/interfaces';
import type { ApiCatalogItem, Category, CatalogSearchParams, PaginatedResponse } from '@/types/api';

export class CatalogService {
  constructor(private repo: ICatalogRepository) {}

  async search(params: CatalogSearchParams): Promise<PaginatedResponse<ApiCatalogItem>> {
    const { page = 1, limit = 20 } = params;
    const { items, total } = await this.repo.search(params);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getById(id: string): Promise<ApiCatalogItem | null> {
    return this.repo.findById(id);
  }

  async getCategories(): Promise<Category[]> {
    return this.repo.getCategories();
  }

  async getByIds(ids: string[]): Promise<ApiCatalogItem[]> {
    return this.repo.findByIds(ids);
  }
}
