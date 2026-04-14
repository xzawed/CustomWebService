import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogRepository } from '@/repositories/catalogRepository';

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
};

function makeSupabase() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn(),
    delete: vi.fn().mockReturnThis(),
    in: vi.fn(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
  };
  return {
    chain,
    supabase: {
      from: vi.fn().mockReturnValue(chain),
    } as unknown as import('@supabase/supabase-js').SupabaseClient,
  };
}

describe('CatalogRepository — toDomain mapper (verification fields)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verificationStatus', () => {
    it('DB 컬럼이 null이면 "unverified"로 기본값 처리한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [{ ...baseRow, verification_status: null }],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.verificationStatus).toBe('unverified');
    });

    it('DB 컬럼이 "verified"이면 그대로 매핑한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [{ ...baseRow, verification_status: 'verified' }],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.verificationStatus).toBe('verified');
    });
  });

  describe('verifiedAt', () => {
    it('DB 컬럼이 null이면 null로 매핑한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [{ ...baseRow, verified_at: null }],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.verifiedAt).toBeNull();
    });

    it('DB 컬럼이 ISO 문자열이면 그대로 매핑한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [{ ...baseRow, verified_at: '2024-06-15T12:00:00Z' }],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.verifiedAt).toBe('2024-06-15T12:00:00Z');
    });
  });

  describe('parseEndpoints — exampleCall / responseDataPath / requestHeaders', () => {
    it('snake_case DB 컬럼(example_call)을 exampleCall로 매핑한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [
          {
            ...baseRow,
            endpoints: [
              {
                path: '/forecast',
                method: 'GET',
                description: '날씨 예보',
                params: [],
                responseExample: {},
                example_call: "fetch('https://api.example.com/forecast?city=Seoul')",
              },
            ],
          },
        ],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.endpoints[0].exampleCall).toBe("fetch('https://api.example.com/forecast?city=Seoul')");
    });

    it('camelCase(exampleCall) 형태도 매핑한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [
          {
            ...baseRow,
            endpoints: [
              {
                path: '/forecast',
                method: 'GET',
                description: '날씨 예보',
                params: [],
                responseExample: {},
                exampleCall: "fetch('https://api.example.com/forecast?city=Busan')",
              },
            ],
          },
        ],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.endpoints[0].exampleCall).toBe("fetch('https://api.example.com/forecast?city=Busan')");
    });

    it('exampleCall이 없으면 undefined로 남는다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [
          {
            ...baseRow,
            endpoints: [
              {
                path: '/forecast',
                method: 'GET',
                description: '날씨 예보',
                params: [],
                responseExample: {},
              },
            ],
          },
        ],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.endpoints[0].exampleCall).toBeUndefined();
    });

    it('response_data_path와 request_headers도 매핑한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [
          {
            ...baseRow,
            endpoints: [
              {
                path: '/data',
                method: 'GET',
                description: '데이터',
                params: [],
                responseExample: {},
                response_data_path: 'data.items',
                request_headers: { 'X-Custom-Header': 'value' },
              },
            ],
          },
        ],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.endpoints[0].responseDataPath).toBe('data.items');
      expect(item.endpoints[0].requestHeaders).toEqual({ 'X-Custom-Header': 'value' });
    });
  });

  describe('lastVerificationNote', () => {
    it('DB 컬럼이 null이면 null로 매핑한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [{ ...baseRow, last_verification_note: null }],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.lastVerificationNote).toBeNull();
    });

    it('DB 컬럼에 메모가 있으면 그대로 매핑한다', async () => {
      const { supabase, chain } = makeSupabase();
      chain.in.mockResolvedValueOnce({
        data: [{ ...baseRow, last_verification_note: 'API endpoint changed' }],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const [item] = await repo.findByIds(['api-1']);
      expect(item.lastVerificationNote).toBe('API endpoint changed');
    });
  });
});

// ---------------------------------------------------------------------------
// 신규 4개 메서드 — getApiUsageFromProjects / getActiveNameToIdMap / ping / getUsageCounts
// ---------------------------------------------------------------------------

function makeFlexibleSupabase() {
  const tableChains = new Map<string, Record<string, ReturnType<typeof vi.fn>>>();

  function getChain(table: string) {
    if (!tableChains.has(table)) {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
      };
      tableChains.set(table, chain);
    }
    return tableChains.get(table)!;
  }

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => getChain(table)),
  } as unknown as import('@supabase/supabase-js').SupabaseClient;

  return { supabase, getChain };
}

describe('CatalogRepository — 신규 메서드', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getApiUsageFromProjects', () => {
    it('project_apis를 쿼리하여 apiId + context 목록을 반환한다', async () => {
      const { supabase, getChain } = makeFlexibleSupabase();
      getChain('project_apis').in.mockResolvedValueOnce({
        data: [
          { api_id: 'api-1', projects: { context: '날씨 서비스' } },
          { api_id: 'api-2', projects: { context: '뉴스 서비스' } },
        ],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const result = await repo.getApiUsageFromProjects(['generated', 'published']);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ apiId: 'api-1', context: '날씨 서비스' });
      expect(result[1]).toEqual({ apiId: 'api-2', context: '뉴스 서비스' });
    });

    it('에러 시 빈 배열을 반환한다', async () => {
      const { supabase, getChain } = makeFlexibleSupabase();
      getChain('project_apis').in.mockResolvedValueOnce({ data: null, error: { message: 'DB 오류' } });

      const repo = new CatalogRepository(supabase);
      const result = await repo.getApiUsageFromProjects(['published']);
      expect(result).toEqual([]);
    });
  });

  describe('getActiveNameToIdMap', () => {
    it('활성 카탈로그의 이름→id 맵을 소문자 키로 반환한다', async () => {
      const { supabase, getChain } = makeFlexibleSupabase();
      getChain('api_catalog').eq.mockResolvedValueOnce({
        data: [
          { id: 'api-1', name: 'OpenWeatherMap' },
          { id: 'api-2', name: 'News API' },
        ],
        error: null,
      });

      const repo = new CatalogRepository(supabase);
      const map = await repo.getActiveNameToIdMap();

      expect(map.get('openweathermap')).toBe('api-1');
      expect(map.get('news api')).toBe('api-2');
      expect(map.size).toBe(2);
    });

    it('에러 시 빈 Map을 반환한다', async () => {
      const { supabase, getChain } = makeFlexibleSupabase();
      getChain('api_catalog').eq.mockResolvedValueOnce({ data: null, error: { message: 'DB 오류' } });

      const repo = new CatalogRepository(supabase);
      const map = await repo.getActiveNameToIdMap();
      expect(map.size).toBe(0);
    });
  });

  describe('ping', () => {
    it('DB가 정상이면 true를 반환한다', async () => {
      const { supabase, getChain } = makeFlexibleSupabase();
      getChain('api_catalog').select.mockResolvedValueOnce({ error: null });

      const repo = new CatalogRepository(supabase);
      expect(await repo.ping()).toBe(true);
    });

    it('DB 오류이면 false를 반환한다', async () => {
      const { supabase, getChain } = makeFlexibleSupabase();
      getChain('api_catalog').select.mockResolvedValueOnce({ error: { message: 'connection failed' } });

      const repo = new CatalogRepository(supabase);
      expect(await repo.ping()).toBe(false);
    });
  });

  describe('getUsageCounts', () => {
    it('오늘 생성 수 / 전체 프로젝트 / 전체 사용자를 반환한다', async () => {
      const { supabase, getChain } = makeFlexibleSupabase();

      // generated_codes → count 42
      getChain('generated_codes').gte.mockResolvedValueOnce({ count: 42, error: null });
      // projects → count 120
      getChain('projects').select.mockResolvedValueOnce({ count: 120, error: null });
      // users → count 55
      getChain('users').select.mockResolvedValueOnce({ count: 55, error: null });

      const repo = new CatalogRepository(supabase);
      const result = await repo.getUsageCounts(new Date('2024-01-01'));

      expect(result.todayGenerations).toBe(42);
      expect(result.totalProjects).toBe(120);
      expect(result.totalUsers).toBe(55);
    });
  });
});
