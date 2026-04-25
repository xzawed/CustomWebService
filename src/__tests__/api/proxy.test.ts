import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------- Module mocks ----------
vi.mock('dns/promises', () => ({
  default: {
    lookup: vi.fn().mockResolvedValue({ address: '93.184.216.34', family: 4 }),
  },
}));

vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/repositories/factory', () => ({
  createCatalogRepository: vi.fn(),
}));

vi.mock('@/lib/config/providers', () => ({
  getDbProvider: vi.fn().mockReturnValue('supabase'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/encryption', () => ({
  decryptApiKey: vi.fn(),
}));

// ---------- Test data ----------
const mockUser = { id: 'user-1', email: 'test@test.com', name: null, avatarUrl: null };
const VALID_API_ID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';

const mockPublicApi = {
  id: VALID_API_ID,
  isActive: true,
  baseUrl: 'https://api.example.com',
  authType: 'none',
  authConfig: {},
};

function makeRequest(apiId: string | null, proxyPath: string | null, method = 'GET') {
  const url = new URL('http://localhost/api/v1/proxy');
  if (apiId) url.searchParams.set('apiId', apiId);
  if (proxyPath) url.searchParams.set('proxyPath', proxyPath);
  return new Request(url.toString(), { method });
}

function makeSuccessResponse() {
  return new Response('{"data":"ok"}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------- Tests ----------
describe('GET /api/v1/proxy', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockFetch = vi.fn().mockImplementation(() => Promise.resolve(makeSuccessResponse()));
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('인증 없는 요청 → 401', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { GET } = await import('@/app/api/v1/proxy/route');
    const res = await GET(makeRequest(VALID_API_ID, '/data'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  it('유효한 인증 + 정상 URL → 프록시 성공 (200)', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockPublicApi),
    } as never);

    const { GET } = await import('@/app/api/v1/proxy/route');
    const res = await GET(makeRequest(VALID_API_ID, '/data'));

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledOnce();
    // redirect: 'error' 옵션 확인 (SSRF open-redirect 방지)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.example.com'),
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  describe('SSRF 방지 — private IP 차단', () => {
    async function expectSsrfBlocked(baseUrl: string) {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({ ...mockPublicApi, baseUrl }),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
      expect(mockFetch).not.toHaveBeenCalled();
    }

    it('loopback 127.0.0.1 → 403', async () => {
      await expectSsrfBlocked('http://127.0.0.1/api');
    });

    it('loopback localhost → 403', async () => {
      await expectSsrfBlocked('http://localhost/api');
    });

    it('RFC 1918 — 10.x.x.x → 403', async () => {
      await expectSsrfBlocked('http://10.0.0.1/internal');
    });

    it('RFC 1918 — 172.16.x.x → 403', async () => {
      await expectSsrfBlocked('http://172.16.0.1/internal');
    });

    it('RFC 1918 — 192.168.x.x → 403', async () => {
      await expectSsrfBlocked('http://192.168.1.100/internal');
    });

    it('AWS/GCP 메타데이터 169.254.169.254 → 403', async () => {
      await expectSsrfBlocked('http://169.254.169.254/latest/meta-data');
    });
  });

  describe('입력 검증', () => {
    beforeEach(async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);
    });

    it('apiId 누락 → 400', async () => {
      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(null, '/data'));
      expect(res.status).toBe(400);
    });

    it('유효하지 않은 UUID 형식 apiId → 400', async () => {
      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest('not-a-uuid', '/data'));
      expect(res.status).toBe(400);
    });

    it('path traversal (..) → 400', async () => {
      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '../../../etc/passwd'));
      expect(res.status).toBe(400);
    });

    it('이중 슬래시 경로 → 400', async () => {
      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '//evil.com/steal'));
      expect(res.status).toBe(400);
    });
  });

  it('rate limit 초과 (분당 60회) → 429', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockPublicApi),
    } as never);

    const { GET } = await import('@/app/api/v1/proxy/route');

    // 60회는 성공
    for (let i = 0; i < 60; i++) {
      const res = await GET(makeRequest(VALID_API_ID, '/data'));
      expect(res.status).toBe(200);
    }

    // 61번째 → 429
    const res = await GET(makeRequest(VALID_API_ID, '/data'));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(mockFetch).toHaveBeenCalledTimes(60); // 61번째는 fetch 호출 전 차단
  });

  it('비활성 API → 404', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue({ ...mockPublicApi, isActive: false }),
    } as never);

    const { GET } = await import('@/app/api/v1/proxy/route');
    const res = await GET(makeRequest(VALID_API_ID, '/data'));
    expect(res.status).toBe(404);
  });

  it('upstream 타임아웃 → 502', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockPublicApi),
    } as never);

    // AbortError 시뮬레이션
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const { GET } = await import('@/app/api/v1/proxy/route');
    const res = await GET(makeRequest(VALID_API_ID, '/data'));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('UPSTREAM_ERROR');
  });
});
