import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CatalogRepository } from './catalogRepository';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Chain for search() — resolves via .range() */
function makeSearchChain(result: { data: unknown[] | null; error: unknown; count: number | null }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

/** Chain for getCategories() — resolves via .is() */
function makeCategoryChain(result: { data: unknown[] | null; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

const baseRow = {
  id: 'api-1',
  name: 'Test API',
  description: 'A test API',
  category: 'weather',
  base_url: 'https://api.example.com',
  auth_type: 'none',
  auth_config: {},
  rate_limit: null,
  is_active: true,
  icon_url: null,
  docs_url: null,
  endpoints: [],
  tags: [],
  api_version: null,
  deprecated_at: null,
  successor_id: null,
  cors_supported: true,
  requires_proxy: false,
  credit_required: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  verification_status: 'unverified',
  verified_at: null,
  last_verification_note: null,
};

// ---------------------------------------------------------------------------
// search() tests
// ---------------------------------------------------------------------------

describe('CatalogRepository — search()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('기본 검색: is_active=true, deprecated_at=null 필터와 order/range를 호출한다', async () => {
    const chain = makeSearchChain({ data: [baseRow], error: null, count: 1 });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    const result = await repo.search({ page: 1, limit: 20 });

    expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('api_catalog');
    expect(chain.select).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(chain.eq).toHaveBeenCalledWith('is_active', true);
    expect(chain.is).toHaveBeenCalledWith('deprecated_at', null);
    expect(chain.order).toHaveBeenCalledWith('name', { ascending: true });
    expect(chain.range).toHaveBeenCalledWith(0, 19);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('카테고리 필터: category가 "all"이 아니면 eq(category)를 추가한다', async () => {
    const chain = makeSearchChain({ data: [baseRow], error: null, count: 1 });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await repo.search({ category: 'weather', page: 1, limit: 10 });

    expect(chain.eq).toHaveBeenCalledWith('category', 'weather');
  });

  it('카테고리가 "all"이면 category eq 필터를 추가하지 않는다', async () => {
    const chain = makeSearchChain({ data: [], error: null, count: 0 });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await repo.search({ category: 'all', page: 1, limit: 10 });

    // eq should only be called with 'is_active', not 'category'
    const eqCalls = chain.eq.mock.calls.map((c: unknown[]) => c[0]);
    expect(eqCalls).not.toContain('category');
  });

  it('검색어 필터: search가 있으면 or()를 호출한다', async () => {
    const chain = makeSearchChain({ data: [], error: null, count: 0 });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await repo.search({ search: 'weather', page: 1, limit: 10 });

    expect(chain.or).toHaveBeenCalledWith(
      expect.stringContaining('name.ilike.%weather%'),
    );
    expect(chain.or).toHaveBeenCalledWith(
      expect.stringContaining('description.ilike.%weather%'),
    );
  });

  it('% 특수문자 이스케이프: "50%" → or() 인수에 "\\\\%" 포함', async () => {
    const chain = makeSearchChain({ data: [], error: null, count: 0 });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await repo.search({ search: '50%', page: 1, limit: 10 });

    const orArg: string = chain.or.mock.calls[0][0] as string;
    // The escaped percent should appear in the sanitized search term
    expect(orArg).toContain('50\\%');
  });

  it('_ 특수문자 이스케이프: "foo_bar" → or() 인수에 "foo\\\\_bar" 포함', async () => {
    const chain = makeSearchChain({ data: [], error: null, count: 0 });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await repo.search({ search: 'foo_bar', page: 1, limit: 10 });

    const orArg: string = chain.or.mock.calls[0][0] as string;
    expect(orArg).toContain('\\_');
  });

  it('공백만 있는 search → trim 후 빈 문자열 → or() 호출 안 함', async () => {
    const chain = makeSearchChain({ data: [], error: null, count: 0 });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await repo.search({ search: '   ', page: 1, limit: 10 });

    expect(chain.or).not.toHaveBeenCalled();
  });

  it('search가 undefined → or() 호출 안 함', async () => {
    const chain = makeSearchChain({ data: [], error: null, count: 0 });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await repo.search({ page: 1, limit: 10 });

    expect(chain.or).not.toHaveBeenCalled();
  });

  it('page/limit 기본값: page 미지정 → 1로, limit 미지정 → 20으로 처리', async () => {
    const chain = makeSearchChain({ data: [], error: null, count: 0 });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await repo.search({});

    expect(chain.range).toHaveBeenCalledWith(0, 19);
  });

  it('limit 상한: limit=200 → 100으로 클램핑 (range 0~99)', async () => {
    const chain = makeSearchChain({ data: [], error: null, count: 0 });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await repo.search({ page: 1, limit: 200 });

    expect(chain.range).toHaveBeenCalledWith(0, 99);
  });

  it('page 하한: page=0 → 1로 클램핑 (offset 0)', async () => {
    const chain = makeSearchChain({ data: [], error: null, count: 0 });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await repo.search({ page: 0, limit: 10 });

    expect(chain.range).toHaveBeenCalledWith(0, 9);
  });

  it('page 2: offset이 올바르게 계산된다 (page=2, limit=10 → offset=10~19)', async () => {
    const chain = makeSearchChain({ data: [], error: null, count: 0 });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await repo.search({ page: 2, limit: 10 });

    expect(chain.range).toHaveBeenCalledWith(10, 19);
  });

  it('count가 null이면 total을 0으로 반환한다', async () => {
    const chain = makeSearchChain({ data: [], error: null, count: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    const result = await repo.search({ page: 1, limit: 10 });

    expect(result.total).toBe(0);
  });

  it('DB 에러 발생 시 throw한다', async () => {
    const dbError = { code: '42P01', message: 'table not found' };
    const chain = makeSearchChain({ data: null, error: dbError, count: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await expect(repo.search({ page: 1, limit: 10 })).rejects.toEqual(dbError);
  });
});

// ---------------------------------------------------------------------------
// getCategories() tests
// ---------------------------------------------------------------------------

describe('CatalogRepository — getCategories()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('카테고리별 카운트 맵을 Category[] 형태로 반환한다', async () => {
    const rows = [
      { category: 'weather' },
      { category: 'weather' },
      { category: 'news' },
    ];
    const chain = makeCategoryChain({ data: rows, error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    const result = await repo.getCategories();

    expect(result).toHaveLength(2);
    const weather = result.find((c) => c.key === 'weather');
    const news = result.find((c) => c.key === 'news');
    expect(weather?.count).toBe(2);
    expect(news?.count).toBe(1);
  });

  it('CATEGORY_LABELS로 label이 매핑된다 (weather → "날씨/환경")', async () => {
    const chain = makeCategoryChain({ data: [{ category: 'weather' }], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    const result = await repo.getCategories();

    const weather = result.find((c) => c.key === 'weather');
    expect(weather?.label).toBe('날씨/환경');
  });

  it('CATEGORY_ICONS로 icon이 매핑된다 (weather → "Cloud")', async () => {
    const chain = makeCategoryChain({ data: [{ category: 'weather' }], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    const result = await repo.getCategories();

    const weather = result.find((c) => c.key === 'weather');
    expect(weather?.icon).toBe('Cloud');
  });

  it('알 수 없는 카테고리 키는 label=key, icon="Box"로 폴백한다', async () => {
    const chain = makeCategoryChain({ data: [{ category: 'unknown_cat' }], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    const result = await repo.getCategories();

    expect(result[0].label).toBe('unknown_cat');
    expect(result[0].icon).toBe('Box');
  });

  it('데이터가 없으면 빈 배열을 반환한다', async () => {
    const chain = makeCategoryChain({ data: [], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    const result = await repo.getCategories();

    expect(result).toEqual([]);
  });

  it('data가 null이면 빈 배열을 반환한다', async () => {
    const chain = makeCategoryChain({ data: null, error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    const result = await repo.getCategories();

    expect(result).toEqual([]);
  });

  it('DB 에러 발생 시 throw한다', async () => {
    const dbError = { code: '42P01', message: 'table not found' };
    const chain = makeCategoryChain({ data: null, error: dbError });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await expect(repo.getCategories()).rejects.toEqual(dbError);
  });

  it('is_active=true 필터와 deprecated_at=null 필터를 호출한다', async () => {
    const chain = makeCategoryChain({ data: [], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new CatalogRepository(supabase);

    await repo.getCategories();

    expect(chain.select).toHaveBeenCalledWith('category');
    expect(chain.eq).toHaveBeenCalledWith('is_active', true);
    expect(chain.is).toHaveBeenCalledWith('deprecated_at', null);
  });
});
