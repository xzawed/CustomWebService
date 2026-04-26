import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogService } from './catalogService';
import type { ICatalogRepository } from '@/repositories/interfaces';
import type { ApiCatalogItem, Category } from '@/types/api';

function makeCatalogRepo(): ICatalogRepository {
  return {
    findById: vi.fn(),
    findByIds: vi.fn(),
    search: vi.fn(),
    getCategories: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  } as unknown as ICatalogRepository;
}

function makeItem(overrides: Partial<ApiCatalogItem> = {}): ApiCatalogItem {
  return {
    id: 'api-1',
    name: 'Test API',
    description: 'A test API',
    category: 'utility',
    tags: [],
    documentationUrl: null,
    exampleCall: null,
    responseFormat: null,
    authRequired: false,
    rateLimitInfo: null,
    ...overrides,
  } as ApiCatalogItem;
}

describe('CatalogService.search()', () => {
  let service: CatalogService;
  let repo: ICatalogRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = makeCatalogRepo();
    service = new CatalogService(repo);
  });

  it('검색 결과와 페이지 정보를 반환한다', async () => {
    const items = [makeItem(), makeItem({ id: 'api-2', name: 'Second API' })];
    (repo.search as ReturnType<typeof vi.fn>).mockResolvedValue({ items, total: 2 });

    const result = await service.search({ page: 1, limit: 20 });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('totalPages를 올바르게 계산한다', async () => {
    const items = Array(20).fill(makeItem());
    (repo.search as ReturnType<typeof vi.fn>).mockResolvedValue({ items, total: 45 });

    const result = await service.search({ page: 2, limit: 20 });

    expect(result.totalPages).toBe(3); // ceil(45/20)
    expect(result.page).toBe(2);
  });

  it('page/limit 기본값을 사용한다', async () => {
    (repo.search as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });

    const result = await service.search({});

    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(0);
  });

  it('결과가 없으면 빈 배열을 반환한다', async () => {
    (repo.search as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });

    const result = await service.search({ search: '없는검색어' });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('CatalogService.getById()', () => {
  let service: CatalogService;
  let repo: ICatalogRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = makeCatalogRepo();
    service = new CatalogService(repo);
  });

  it('ID로 API를 조회한다', async () => {
    const item = makeItem();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(item);

    const result = await service.getById('api-1');

    expect(result).toEqual(item);
    expect(repo.findById).toHaveBeenCalledWith('api-1');
  });

  it('존재하지 않으면 null을 반환한다', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await service.getById('missing');

    expect(result).toBeNull();
  });
});

describe('CatalogService.getCategories()', () => {
  let service: CatalogService;
  let repo: ICatalogRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = makeCatalogRepo();
    service = new CatalogService(repo);
  });

  it('카테고리 목록을 반환한다', async () => {
    const categories: Category[] = [
      { key: 'utility', label: 'Utility', icon: '🔧', count: 5 },
      { key: 'data', label: 'Data', icon: '📊', count: 3 },
    ];
    (repo.getCategories as ReturnType<typeof vi.fn>).mockResolvedValue(categories);

    const result = await service.getCategories();

    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('utility');
  });

  it('카테고리가 없으면 빈 배열을 반환한다', async () => {
    (repo.getCategories as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await service.getCategories();

    expect(result).toEqual([]);
  });
});

describe('CatalogService.getByIds()', () => {
  let service: CatalogService;
  let repo: ICatalogRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = makeCatalogRepo();
    service = new CatalogService(repo);
  });

  it('여러 ID로 API 목록을 조회한다', async () => {
    const items = [makeItem(), makeItem({ id: 'api-2' })];
    (repo.findByIds as ReturnType<typeof vi.fn>).mockResolvedValue(items);

    const result = await service.getByIds(['api-1', 'api-2']);

    expect(result).toHaveLength(2);
    expect(repo.findByIds).toHaveBeenCalledWith(['api-1', 'api-2']);
  });

  it('빈 배열을 전달하면 빈 배열을 반환한다', async () => {
    (repo.findByIds as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await service.getByIds([]);

    expect(result).toEqual([]);
  });
});
