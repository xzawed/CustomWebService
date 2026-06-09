import { describe, it, expect, vi, beforeEach } from 'vitest';

// pg/drizzle cold-import 차단 (형제 api 테스트 패턴)
vi.mock('@/lib/config/providers', () => ({
  getDbProvider: vi.fn().mockReturnValue('supabase'),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/services/factory', () => ({
  createCatalogService: vi.fn(),
}));

function makeCatalogService(overrides: Record<string, unknown> = {}) {
  return {
    search: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    getById: vi.fn().mockResolvedValue(null),
    getCategories: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('GET /api/v1/catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('200과 검색 결과를 반환하고 Cache-Control 헤더를 설정한다', async () => {
    const svc = makeCatalogService({
      search: vi.fn().mockResolvedValue({ items: [{ id: 'a' }], total: 1, page: 1, limit: 20 }),
    });
    const { createCatalogService } = await import('@/services/factory');
    vi.mocked(createCatalogService).mockReturnValue(svc as never);

    const { GET } = await import('@/app/api/v1/catalog/route');
    const res = await GET(new Request('http://localhost/api/v1/catalog'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600');
  });

  it('page/limit 쿼리를 파싱하고 limit는 100으로 클램프된다', async () => {
    const svc = makeCatalogService();
    const { createCatalogService } = await import('@/services/factory');
    vi.mocked(createCatalogService).mockReturnValue(svc as never);

    const { GET } = await import('@/app/api/v1/catalog/route');
    await GET(new Request('http://localhost/api/v1/catalog?page=3&limit=500&category=ai'));

    expect(svc.search).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3, limit: 100, category: 'ai' }),
    );
  });

  it('잘못된 page/limit은 안전한 기본값으로 폴백된다', async () => {
    const svc = makeCatalogService();
    const { createCatalogService } = await import('@/services/factory');
    vi.mocked(createCatalogService).mockReturnValue(svc as never);

    const { GET } = await import('@/app/api/v1/catalog/route');
    await GET(new Request('http://localhost/api/v1/catalog?page=abc&limit=-5'));

    expect(svc.search).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 1 }),
    );
  });

  it('search 파라미터가 있으면 캐시 maxAge를 단축한다', async () => {
    const svc = makeCatalogService();
    const { createCatalogService } = await import('@/services/factory');
    vi.mocked(createCatalogService).mockReturnValue(svc as never);

    const { GET } = await import('@/app/api/v1/catalog/route');
    const res = await GET(new Request('http://localhost/api/v1/catalog?search=weather'));

    expect(res.headers.get('Cache-Control')).toContain('s-maxage=60');
    expect(svc.search).toHaveBeenCalledWith(expect.objectContaining({ search: 'weather' }));
  });

  it('서비스가 throw하면 500으로 graceful 처리한다', async () => {
    const svc = makeCatalogService({ search: vi.fn().mockRejectedValue(new Error('DB down')) });
    const { createCatalogService } = await import('@/services/factory');
    vi.mocked(createCatalogService).mockReturnValue(svc as never);

    const { GET } = await import('@/app/api/v1/catalog/route');
    const res = await GET(new Request('http://localhost/api/v1/catalog'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

describe('GET /api/v1/catalog/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('존재하는 API면 200과 항목을 반환한다', async () => {
    const svc = makeCatalogService({ getById: vi.fn().mockResolvedValue({ id: 'api-1', name: 'X' }) });
    const { createCatalogService } = await import('@/services/factory');
    vi.mocked(createCatalogService).mockReturnValue(svc as never);

    const { GET } = await import('@/app/api/v1/catalog/[id]/route');
    const res = await GET(new Request('http://localhost/api/v1/catalog/api-1'), {
      params: Promise.resolve({ id: 'api-1' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('api-1');
    expect(svc.getById).toHaveBeenCalledWith('api-1');
  });

  it('존재하지 않는 API면 404를 반환한다', async () => {
    const svc = makeCatalogService({ getById: vi.fn().mockResolvedValue(null) });
    const { createCatalogService } = await import('@/services/factory');
    vi.mocked(createCatalogService).mockReturnValue(svc as never);

    const { GET } = await import('@/app/api/v1/catalog/[id]/route');
    const res = await GET(new Request('http://localhost/api/v1/catalog/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/catalog/categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('200과 카테고리 목록을 반환하고 장기 캐시 헤더를 설정한다', async () => {
    const svc = makeCatalogService({
      getCategories: vi.fn().mockResolvedValue([{ id: 'ai', label: 'AI' }]),
    });
    const { createCatalogService } = await import('@/services/factory');
    vi.mocked(createCatalogService).mockReturnValue(svc as never);

    const { GET } = await import('@/app/api/v1/catalog/categories/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=86400');
  });
});
