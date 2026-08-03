import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 카탈로그 레포가 반환하는 도메인 항목(키 의존 1개) — camelCase
const keyedItem = {
  id: 'cat-1',
  name: '카카오 로컬 (지도·장소 검색)',
  baseUrl: 'https://dapi.kakao.com',
  authType: 'api_key',
  authConfig: { env_var: 'API_KEY_TEST', param_in: 'header', param_name: 'Authorization', prefix: 'KakaoAK ' },
  endpoints: [{ path: '/v2/local/search/keyword.json', method: 'GET', parameters: { query: 'string' } }],
  isActive: true,
};

/** includeInactive / activatable 시나리오용 비활성 키 의존 항목 */
const inactiveKeyedItem = {
  id: 'cat-inactive-valid',
  name: 'Inactive Valid API',
  baseUrl: 'https://api.example.test',
  authType: 'api_key',
  authConfig: { env_var: 'API_KEY_INACTIVE', param_in: 'query', param_name: 'key' },
  endpoints: [{ path: '/v1/ping', method: 'GET', parameters: {} }],
  isActive: false,
};

const inactiveMissingItem = {
  id: 'cat-inactive-missing',
  name: 'Inactive Missing API',
  baseUrl: 'https://api.example.test',
  authType: 'api_key',
  authConfig: { env_var: 'API_KEY_MISSING_FOR_ACTIVATABLE', param_in: 'query', param_name: 'key' },
  endpoints: [{ path: '/v1/ping', method: 'GET', parameters: {} }],
  isActive: false,
};

const findMany = vi.fn();

vi.mock('@/repositories/factory', () => ({ createCatalogRepository: vi.fn(() => ({ findMany })) }));

const VALID_ADMIN_KEY = 'test-admin-secret-key';

function makeReq(key: string | null = VALID_ADMIN_KEY, search = ''): Request {
  const headers: Record<string, string> = { 'x-forwarded-for': '127.0.0.1' };
  if (key !== null) headers['Authorization'] = `Bearer ${key}`;
  const url = `http://localhost/api/v1/admin/keys-verify${search}`;
  return new Request(url, { headers });
}

describe('GET /api/v1/admin/keys-verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
    delete process.env.API_KEY_TEST;
    delete process.env.API_KEY_INACTIVE;
    delete process.env.API_KEY_MISSING_FOR_ACTIVATABLE;
    findMany.mockResolvedValue({ items: [keyedItem], total: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Authorization 헤더 없음 → 403', async () => {
    const { GET } = await import('@/app/api/v1/admin/keys-verify/route');
    const res = await GET(makeReq(null));
    expect(res.status).toBe(403);
  });

  it('잘못된 키 → 403', async () => {
    const { GET } = await import('@/app/api/v1/admin/keys-verify/route');
    const res = await GET(makeReq('wrong'));
    expect(res.status).toBe(403);
  });

  it('키 env 미설정 → MISSING 보고 (200)', async () => {
    const { GET } = await import('@/app/api/v1/admin/keys-verify/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.summary.total).toBe(1);
    expect(body.data.summary.missing).toBe(1);
    expect(body.data.results[0].verdict).toBe('MISSING');
    // 키 값은 응답에 절대 노출되지 않음
    expect(JSON.stringify(body)).not.toContain('API_KEY_TEST=');
  });

  /** Response 본문은 1회 소비되므로 호출마다 새 인스턴스를 만들어야 한다. */
  function stubUpstreamOk(): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  }

  it('키 설정 + 업스트림 200 → VALID', async () => {
    process.env.API_KEY_TEST = 'KakaoAK realkey';
    const fetchSpy = stubUpstreamOk();
    const { GET } = await import('@/app/api/v1/admin/keys-verify/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.summary.valid).toBe(1);
    expect(body.data.results[0].verdict).toBe('VALID');
    fetchSpy.mockRestore();
  });

  it('기본 조회는 findMany에 isActive:true 필터를 넘긴다', async () => {
    const { GET } = await import('@/app/api/v1/admin/keys-verify/route');
    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { includeInactive: boolean } };
    expect(body.data.includeInactive).toBe(false);
    expect(findMany).toHaveBeenCalledWith(
      { isActive: true },
      expect.objectContaining({ limit: 200, orderBy: 'name', orderDirection: 'asc' }),
    );
  });

  it('includeInactive=true이면 빈 필터로 전체 API를 조회하고 결과에 apiId/isActive를 담는다', async () => {
    process.env.API_KEY_TEST = 'KakaoAK realkey';
    process.env.API_KEY_INACTIVE = 'inactive-live-key';
    findMany.mockResolvedValue({
      items: [keyedItem, inactiveKeyedItem],
      total: 2,
    });
    const fetchSpy = stubUpstreamOk();

    const { GET } = await import('@/app/api/v1/admin/keys-verify/route');
    const res = await GET(makeReq(VALID_ADMIN_KEY, '?includeInactive=true'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        includeInactive: boolean;
        results: Array<{ apiId: string; isActive: boolean; verdict: string }>;
      };
    };
    expect(body.data.includeInactive).toBe(true);
    expect(findMany).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ limit: 200, orderBy: 'name', orderDirection: 'asc' }),
    );
    expect(body.data.results).toHaveLength(2);
    for (const r of body.data.results) {
      expect(r).toEqual(
        expect.objectContaining({
          apiId: expect.any(String) as string,
          isActive: expect.any(Boolean) as boolean,
        }),
      );
    }
    expect(body.data.results.map((r) => r.apiId).sort()).toEqual(
      ['cat-1', 'cat-inactive-valid'].sort(),
    );
    fetchSpy.mockRestore();
  });

  it('summary.activatable은 비활성이면서 verdict=VALID인 id만 담는다', async () => {
    // 활성 VALID · 비활성 VALID · 비활성 MISSING → activatable은 비활성 VALID만
    process.env.API_KEY_TEST = 'KakaoAK realkey';
    process.env.API_KEY_INACTIVE = 'inactive-live-key';
    // API_KEY_MISSING_FOR_ACTIVATABLE 는 의도적으로 미설정 → MISSING
    findMany.mockResolvedValue({
      items: [keyedItem, inactiveKeyedItem, inactiveMissingItem],
      total: 3,
    });
    const fetchSpy = stubUpstreamOk();

    const { GET } = await import('@/app/api/v1/admin/keys-verify/route');
    const res = await GET(makeReq(VALID_ADMIN_KEY, '?includeInactive=true'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        summary: { activatable: string[]; valid: number; missing: number };
        results: Array<{ apiId: string; isActive: boolean; verdict: string }>;
      };
    };

    const byId = Object.fromEntries(body.data.results.map((r) => [r.apiId, r]));
    expect(byId['cat-1']).toMatchObject({ isActive: true, verdict: 'VALID' });
    expect(byId['cat-inactive-valid']).toMatchObject({ isActive: false, verdict: 'VALID' });
    expect(byId['cat-inactive-missing']).toMatchObject({ isActive: false, verdict: 'MISSING' });

    expect(body.data.summary.activatable).toEqual(['cat-inactive-valid']);
    expect(body.data.summary.activatable).not.toContain('cat-1');
    expect(body.data.summary.activatable).not.toContain('cat-inactive-missing');
    fetchSpy.mockRestore();
  });
});
