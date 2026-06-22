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

  /** 활성(is_active=true·미폐기) API 개수만 조회한다 (랜딩/카탈로그 마케팅 카피용 단일 진실원천). */
  async countActive(): Promise<number> {
    const { total } = await this.repo.search({ limit: 1 });
    return total;
  }

  async getCategories(): Promise<Category[]> {
    return this.repo.getCategories();
  }

  async getByIds(ids: string[]): Promise<ApiCatalogItem[]> {
    return this.repo.findByIds(ids);
  }
}
