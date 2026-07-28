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
  createProjectRepository: vi.fn(),
  createUserApiKeyRepository: vi.fn(),
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

    // IPv4-mapped IPv6는 IPv4 패턴에도 IPv6 패턴에도 걸리지 않아 그대로 통과했다(M-7).
    // dns.lookup이 매핑 형식을 돌려줄 수 있어 실제 도달 가능한 우회 경로다.
    it('IPv4-mapped IPv6 루프백 ::ffff:127.0.0.1 → 403', async () => {
      await expectSsrfBlocked('http://[::ffff:127.0.0.1]/internal');
    });

    it('IPv4-mapped IPv6 메타데이터 ::ffff:169.254.169.254 → 403', async () => {
      await expectSsrfBlocked('http://[::ffff:169.254.169.254]/latest/meta-data');
    });

    it('DNS가 IPv4-mapped IPv6로 해석되면 → 403', async () => {
      const { default: dnsDefault } = await import('dns/promises');
      vi.mocked(dnsDefault.lookup).mockResolvedValueOnce({
        address: '::ffff:169.254.169.254',
        family: 6,
      } as never);

      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);
      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({ ...mockPublicApi, baseUrl: 'https://legit.example.com' }),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));
      expect(res.status).toBe(403);
      expect(mockFetch).not.toHaveBeenCalled();
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

  describe('DNS 리바인딩 방어', () => {
    it('DNS가 RFC 1918 10.x.x.x로 해석되면 → 403', async () => {
      const { default: dnsDefault } = await import('dns/promises');
      vi.mocked(dnsDefault.lookup).mockResolvedValueOnce({ address: '10.0.0.1', family: 4 } as never);

      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);
      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({ ...mockPublicApi, baseUrl: 'https://legit.example.com' }),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));
      expect(res.status).toBe(403);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('DNS가 IPv6 루프백 ::1로 해석되면 → 403', async () => {
      const { default: dnsDefault } = await import('dns/promises');
      vi.mocked(dnsDefault.lookup).mockResolvedValueOnce({ address: '::1', family: 6 } as never);

      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);
      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({ ...mockPublicApi, baseUrl: 'https://legit.example.com' }),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));
      expect(res.status).toBe(403);
    });

    it('DNS lookup 실패(ENOTFOUND) → 안전 실패 403', async () => {
      const { default: dnsDefault } = await import('dns/promises');
      vi.mocked(dnsDefault.lookup).mockRejectedValueOnce(new Error('ENOTFOUND legit.example.com'));

      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);
      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({ ...mockPublicApi, baseUrl: 'https://legit.example.com' }),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));
      expect(res.status).toBe(403);
    });
  });

  it('POST 요청 — body를 upstream에 전달', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);
    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockPublicApi),
    } as never);

    const url = new URL('http://localhost/api/v1/proxy');
    url.searchParams.set('apiId', VALID_API_ID);
    url.searchParams.set('proxyPath', '/search');
    const req = new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: 'test' }),
    });

    const { POST } = await import('@/app/api/v1/proxy/route');
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.example.com'),
      expect.objectContaining({ method: 'POST' }),
    );
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

  // ─────────────────────────────────────────────────────────────────────────────
  describe('추가 보안 검증', () => {
    // IPv6 SSRF 방지 — URL 표준에서 IPv6는 http://[fe80::1]/ 형식(대괄호)으로 표현되며
    // new URL('http://[fe80::1]/').hostname은 '[fe80::1]'을 반환한다.
    // isPrivateHost()는 패턴 매칭 전에 대괄호를 제거하므로 [fe80::...] / [fc..::...] / [fd..::...] 형식이 차단된다.

    it('IPv6 link-local fe80:: → 403 차단', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({
          ...mockPublicApi,
          baseUrl: 'http://[fe80::1]/api',
        }),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('IPv6 ULA fc00:: → 403 차단', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({
          ...mockPublicApi,
          baseUrl: 'http://[fc00::1]/api',
        }),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('IPv6 ULA fd00:: → 403 차단', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({
          ...mockPublicApi,
          baseUrl: 'http://[fd00::1]/api',
        }),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('null user.id (인증은 통과했지만 id 없음) → 401 차단', async () => {
      // AuthUser.id는 string(non-nullable)이지만 런타임 인증 정보 손상 시 null이 들어올 수 있음.
      // route의 user.id 가드가 401을 반환하여 rate limit Map 오염·RLS 우회 차단.
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue({ ...mockUser, id: null as unknown as string });

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(mockPublicApi),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('AUTH_REQUIRED');
    });

    it('빈 문자열 user.id → 401 차단', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue({ ...mockUser, id: '' });

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(mockPublicApi),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));

      expect(res.status).toBe(401);
    });

    it('user.id가 string이 아닌 경우(예: number) → 401 차단', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue({ ...mockUser, id: 123 as unknown as string });

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(mockPublicApi),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));

      expect(res.status).toBe(401);
    });

    it('프로젝트 API 키 조회 실패 시 플랫폼 키 폴백', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const apiWithKey = {
        ...mockPublicApi,
        authType: 'api_key',
        authConfig: { param_name: 'key', param_in: 'query', env_var: 'PLATFORM_API_KEY' },
      };
      process.env.PLATFORM_API_KEY = 'platform-fallback-key';

      const { createCatalogRepository, createProjectRepository, createUserApiKeyRepository } =
        await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(apiWithKey),
      } as never);
      vi.mocked(createProjectRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({ id: 'p-1', userId: mockUser.id, status: 'draft' }),
        getProjectApiIds: vi.fn().mockResolvedValue([VALID_API_ID]),
      } as never);
      // 개인 키 조회 실패(레포 throw) → 플랫폼 키로 폴백.
      // 인가(프로젝트 조회)는 성공해야 한다 — 인가 조회 실패는 폴백이 아니라 차단이다.
      vi.mocked(createUserApiKeyRepository).mockReturnValue({
        findByUserAndApi: vi.fn().mockRejectedValue(new Error('DB 오류')),
      } as never);

      const url = new URL('http://localhost/api/v1/proxy');
      url.searchParams.set('apiId', VALID_API_ID);
      url.searchParams.set('proxyPath', '/data');
      // projectId 포함 → 프로젝트 키 조회 시도 후 실패
      url.searchParams.set('projectId', 'aaaabbbb-cccc-dddd-eeee-111111111111');
      const req = new Request(url.toString());

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(req);

      // 프로젝트 키 조회 실패 후 플랫폼 키로 폴백 → 프록시 성공(200) 또는 upstream 오류(502)
      // fetch는 호출되어야 함 (차단되지 않고 플랫폼 키가 사용됨)
      expect(mockFetch).toHaveBeenCalled();
      expect([200, 502]).toContain(res.status);

      delete process.env.PLATFORM_API_KEY;
    });

    it('복호화 실패 시 플랫폼 키 폴백', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const apiWithKey = {
        ...mockPublicApi,
        authType: 'api_key',
        authConfig: { param_name: 'key', param_in: 'query', env_var: 'PLATFORM_FALLBACK_KEY' },
      };
      process.env.PLATFORM_FALLBACK_KEY = 'platform-key-value';

      const { decryptApiKey } = await import('@/lib/encryption');
      vi.mocked(decryptApiKey).mockImplementationOnce(() => {
        throw new Error('복호화 실패');
      });

      const { createCatalogRepository, createProjectRepository, createUserApiKeyRepository } =
        await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(apiWithKey),
      } as never);
      vi.mocked(createProjectRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({ id: 'p-1', userId: mockUser.id, status: 'draft' }),
        getProjectApiIds: vi.fn().mockResolvedValue([VALID_API_ID]),
      } as never);
      vi.mocked(createUserApiKeyRepository).mockReturnValue({
        findByUserAndApi: vi.fn().mockResolvedValue({ encryptedKey: 'corrupted-cipher' }),
      } as never);

      const url = new URL('http://localhost/api/v1/proxy');
      url.searchParams.set('apiId', VALID_API_ID);
      url.searchParams.set('proxyPath', '/data');
      url.searchParams.set('projectId', 'aaaabbbb-cccc-dddd-eeee-111111111111');
      const req = new Request(url.toString());

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(req);

      // 복호화 실패 후 플랫폼 키 폴백 → fetch가 호출되어야 함
      expect(mockFetch).toHaveBeenCalled();
      expect([200, 502]).toContain(res.status);

      delete process.env.PLATFORM_FALLBACK_KEY;
    });

    it('프로젝트 오너 개인 키를 레포로 조회해 복호화에 사용한다(모든 provider)', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const apiWithKey = {
        ...mockPublicApi,
        authType: 'api_key',
        authConfig: { param_name: 'X-API-Key', param_in: 'header', env_var: 'UNUSED_PLATFORM_KEY' },
      };

      const { createCatalogRepository, createProjectRepository, createUserApiKeyRepository } =
        await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(apiWithKey),
      } as never);
      vi.mocked(createProjectRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({ id: 'p-1', userId: mockUser.id, status: 'draft' }),
        getProjectApiIds: vi.fn().mockResolvedValue([VALID_API_ID]),
      } as never);
      const findByUserAndApi = vi.fn().mockResolvedValue({ encryptedKey: 'enc-personal' });
      vi.mocked(createUserApiKeyRepository).mockReturnValue({ findByUserAndApi } as never);

      const { decryptApiKey } = await import('@/lib/encryption');
      vi.mocked(decryptApiKey).mockReturnValue('decrypted-personal-key');

      const url = new URL('http://localhost/api/v1/proxy');
      url.searchParams.set('apiId', VALID_API_ID);
      url.searchParams.set('proxyPath', '/data');
      url.searchParams.set('projectId', 'aaaabbbb-cccc-dddd-eeee-111111111111');
      const req = new Request(url.toString());

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(req);

      // 개인 키가 레포 경로로 조회되어(raw .from 아님) 복호화에 사용됨
      expect(findByUserAndApi).toHaveBeenCalledWith(mockUser.id, VALID_API_ID);
      expect(decryptApiKey).toHaveBeenCalledWith('enc-personal');
      expect(mockFetch).toHaveBeenCalled();
      expect([200, 502]).toContain(res.status);
    });

    it('매우 긴 userId(1000자) 시 rate limit 정상 동작', async () => {
      const longUserId = 'x'.repeat(1000);
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue({ ...mockUser, id: longUserId });

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(mockPublicApi),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));

      // 긴 userId도 정상적으로 rate limit 처리되어 200 반환
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('rate limit: 서로 다른 userId 각각 독립 카운팅', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(mockPublicApi),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');

      // user-A: 60회 요청 → 모두 200
      vi.mocked(getAuthUser).mockResolvedValue({ ...mockUser, id: 'user-rate-a' });
      for (let i = 0; i < 60; i++) {
        const res = await GET(makeRequest(VALID_API_ID, '/data'));
        expect(res.status).toBe(200);
      }

      // user-B: 첫 번째 요청 → 독립 카운터이므로 200 (user-A의 한도에 영향 없음)
      vi.mocked(getAuthUser).mockResolvedValue({ ...mockUser, id: 'user-rate-b' });
      const resB = await GET(makeRequest(VALID_API_ID, '/data'));
      expect(resB.status).toBe(200);

      // user-A: 61번째 → 429
      vi.mocked(getAuthUser).mockResolvedValue({ ...mockUser, id: 'user-rate-a' });
      const resA61 = await GET(makeRequest(VALID_API_ID, '/data'));
      expect(resA61.status).toBe(429);
      const body = await resA61.json();
      expect(body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('응답 캐시', () => {
    const mockWeatherApi = {
      id: VALID_API_ID,
      isActive: true,
      baseUrl: 'https://api.example.com',
      authType: 'none' as const,
      authConfig: {},
      cacheTtlSeconds: 10800,
    };

    it('cacheTtlSeconds 설정 API: 첫 요청 MISS → 두 번째 동일 요청 HIT (upstream 1회만 호출)', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(mockWeatherApi),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');

      const res1 = await GET(makeRequest(VALID_API_ID, '/getVilageFcst'));
      expect(res1.status).toBe(200);
      expect(res1.headers.get('X-Cache')).toBe('MISS');
      expect(res1.headers.get('Cache-Control')).toBe('public, max-age=10800');
      expect(mockFetch).toHaveBeenCalledOnce();

      const res2 = await GET(makeRequest(VALID_API_ID, '/getVilageFcst'));
      expect(res2.status).toBe(200);
      expect(res2.headers.get('X-Cache')).toBe('HIT');
      expect(mockFetch).toHaveBeenCalledOnce(); // upstream 추가 호출 없음
    });

    it('cacheTtlSeconds 없는 API → Cache-Control: no-store, X-Cache 헤더 없음', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({ ...mockPublicApi, cacheTtlSeconds: null }),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('X-Cache')).toBeNull();
    });

    it('파라미터 다른 요청 → 각각 별도 캐시 엔트리 (독립 upstream 호출)', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(mockWeatherApi),
      } as never);

      function makeWeatherRequest(nx: string) {
        const url = new URL('http://localhost/api/v1/proxy');
        url.searchParams.set('apiId', VALID_API_ID);
        url.searchParams.set('proxyPath', '/getVilageFcst');
        url.searchParams.set('nx', nx);
        return new Request(url.toString());
      }

      const { GET } = await import('@/app/api/v1/proxy/route');

      await GET(makeWeatherRequest('55')); // nx=55 → MISS
      await GET(makeWeatherRequest('66')); // nx=66 → 다른 키, MISS
      await GET(makeWeatherRequest('55')); // nx=55 → HIT

      expect(mockFetch).toHaveBeenCalledTimes(2); // 55, 66 각 1회
    });

    it('POST 요청 → cacheTtlSeconds 있어도 캐시 미적용 (Cache-Control: no-store)', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(mockWeatherApi),
      } as never);

      const url = new URL('http://localhost/api/v1/proxy');
      url.searchParams.set('apiId', VALID_API_ID);
      url.searchParams.set('proxyPath', '/data');
      const req = new Request(url.toString(), { method: 'POST', body: '{}' });

      const { POST } = await import('@/app/api/v1/proxy/route');
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('X-Cache')).toBeNull();
    });

    it('upstream 오류 응답(4xx) → 캐시 저장 안 됨, 재요청 시 upstream 재호출', async () => {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(mockWeatherApi),
      } as never);

      mockFetch.mockImplementation(() =>
        Promise.resolve(new Response('{"error":"bad request"}', { status: 400, headers: { 'Content-Type': 'application/json' } })),
      );

      const { GET } = await import('@/app/api/v1/proxy/route');
      await GET(makeRequest(VALID_API_ID, '/getVilageFcst'));
      await GET(makeRequest(VALID_API_ID, '/getVilageFcst'));

      // 400 응답은 캐시 안 됨 → upstream 2회 호출
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('API 키 prefix 적용 (auth_config.prefix/header_prefix)', () => {
    const PREFIX_ENV = 'TEST_PROXY_PREFIX_KEY';

    function makeKeyApi(authConfig: Record<string, unknown>) {
      return { ...mockPublicApi, authType: 'api_key', authConfig };
    }

    async function wireApi(authConfig: Record<string, unknown>) {
      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);
      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue(makeKeyApi(authConfig)),
      } as never);
    }

    afterEach(() => {
      delete process.env[PREFIX_ENV];
    });

    it('header_prefix 선언 시 raw env 키에 prefix를 붙여 헤더로 주입한다 (카카오 KakaoAK)', async () => {
      process.env[PREFIX_ENV] = 'rawkey123';
      await wireApi({
        param_name: 'Authorization',
        param_in: 'header',
        env_var: PREFIX_ENV,
        header_prefix: 'KakaoAK ',
      });

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/search'));

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'KakaoAK rawkey123' }),
        }),
      );
    });

    it('prefix 필드 선언 시에도 동일하게 적용한다 (Unsplash Client-ID)', async () => {
      process.env[PREFIX_ENV] = 'unsplashkey';
      await wireApi({
        param_name: 'Authorization',
        param_in: 'header',
        env_var: PREFIX_ENV,
        prefix: 'Client-ID ',
      });

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/photos'));

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Client-ID unsplashkey' }),
        }),
      );
    });

    it('env 값에 이미 prefix가 포함된 경우 이중 적용하지 않는다', async () => {
      process.env[PREFIX_ENV] = 'KakaoAK rawkey123';
      await wireApi({
        param_name: 'Authorization',
        param_in: 'header',
        env_var: PREFIX_ENV,
        header_prefix: 'KakaoAK ',
      });

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/search'));

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'KakaoAK rawkey123' }),
        }),
      );
    });

    it('prefix 미선언 API는 raw 키를 그대로 주입한다 (회귀 가드)', async () => {
      process.env[PREFIX_ENV] = 'plainkey';
      await wireApi({
        param_name: 'X-API-Key',
        param_in: 'header',
        env_var: PREFIX_ENV,
      });

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-API-Key': 'plainkey' }),
        }),
      );
    });
  });
});

describe('프록시 인가 — site/app 모드 (C-2·H-1)', () => {
  const ORIG_ENV = { ...process.env };
  const PROJECT = { id: 'proj-1', userId: 'owner-1', status: 'published', slug: 'weather' };
  const ATTACKER = { id: 'attacker', email: 'a@x.com', name: null, avatarUrl: null };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const { __resetSiteRateLimit } = await import('@/lib/proxy/siteRateLimit');
    __resetSiteRateLimit();
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'xzawed.xyz';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(makeSuccessResponse())));
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  function siteReq(host: string, extra = ''): Request {
    return new Request(
      `https://${host}/api/v1/proxy?apiId=${VALID_API_ID}&proxyPath=/data${extra}`,
      { headers: { host } },
    );
  }

  async function invokeProxy(opts: {
    request: Request;
    user?: typeof ATTACKER | null;
    projectBySlug?: Record<string, unknown> | null;
    projectById?: Record<string, unknown> | null;
    linkedApiIds?: string[];
    personalKey?: string;
    api?: Record<string, unknown>;
    times?: number;
  }): Promise<{ res: Response; userApiKeyRepo: { findByUserAndApi: ReturnType<typeof vi.fn> } }> {
    const { getAuthUser } = await import('@/lib/auth/index');
    const factory = await import('@/repositories/factory');
    const { decryptApiKey } = await import('@/lib/encryption');

    vi.mocked(getAuthUser).mockResolvedValue(opts.user ?? null);

    const userApiKeyRepo = {
      findByUserAndApi: vi
        .fn()
        .mockResolvedValue(opts.personalKey ? { encryptedKey: 'enc' } : null),
    };
    vi.mocked(factory.createUserApiKeyRepository).mockReturnValue(userApiKeyRepo as never);
    if (opts.personalKey) vi.mocked(decryptApiKey).mockReturnValue(opts.personalKey);

    vi.mocked(factory.createProjectRepository).mockReturnValue({
      findBySlug: vi.fn().mockResolvedValue(opts.projectBySlug ?? null),
      findById: vi.fn().mockResolvedValue(opts.projectById ?? null),
      getProjectApiIds: vi.fn().mockResolvedValue(opts.linkedApiIds ?? [VALID_API_ID]),
    } as never);

    vi.mocked(factory.createCatalogRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(opts.api ?? mockPublicApi),
    } as never);

    const { GET } = await import('@/app/api/v1/proxy/route');
    let res!: Response;
    for (let i = 0; i < (opts.times ?? 1); i++) {
      res = await GET(opts.request);
    }
    return { res, userApiKeyRepo };
  }

  it('published 서브도메인의 익명 요청을 허용한다 (C-2)', async () => {
    const { res } = await invokeProxy({
      request: siteReq('weather.xzawed.xyz'),
      user: null,
      projectBySlug: PROJECT,
    });
    expect(res.status).toBe(200);
  });

  it('미게시 프로젝트의 서브도메인 요청은 404 (존재 여부 미노출)', async () => {
    const { res } = await invokeProxy({
      request: siteReq('weather.xzawed.xyz'),
      user: null,
      projectBySlug: { ...PROJECT, status: 'draft' },
    });
    expect(res.status).toBe(404);
  });

  it('세션 사용자가 타인 projectId로 개인 키를 쓰려 하면 403 (H-1)', async () => {
    const { res } = await invokeProxy({
      request: siteReq('xzawed.xyz', '&projectId=proj-1'),
      user: ATTACKER,
      projectById: { ...PROJECT, userId: 'victim' },
    });
    expect(res.status).toBe(403);
  });

  it('타인 projectId 요청에서는 개인 키 조회 자체가 일어나지 않는다 (H-1)', async () => {
    const { userApiKeyRepo } = await invokeProxy({
      request: siteReq('xzawed.xyz', '&projectId=proj-1'),
      user: ATTACKER,
      projectById: { ...PROJECT, userId: 'victim' },
    });
    expect(userApiKeyRepo.findByUserAndApi).not.toHaveBeenCalled();
  });

  it('프로젝트에 연결되지 않은 apiId는 403', async () => {
    const { res } = await invokeProxy({
      request: siteReq('weather.xzawed.xyz'),
      user: null,
      projectBySlug: PROJECT,
      linkedApiIds: [],
    });
    expect(res.status).toBe(403);
  });

  it('site 모드 레이트리밋 초과 시 429 + Retry-After', async () => {
    const { res } = await invokeProxy({
      request: siteReq('weather.xzawed.xyz'),
      user: null,
      projectBySlug: PROJECT,
      times: 25,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('개인 키가 주입된 응답은 캐시하지 않는다 (M-4 가드레일)', async () => {
    const { res } = await invokeProxy({
      request: siteReq('weather.xzawed.xyz'),
      user: null,
      projectBySlug: PROJECT,
      personalKey: 'secret-key',
      api: {
        ...mockPublicApi,
        authType: 'api_key',
        cacheTtlSeconds: 300,
        authConfig: { param_name: 'X-API-Key', param_in: 'header' },
      },
    });
    expect(res.headers.get('X-Cache')).toBeNull();
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });
});
