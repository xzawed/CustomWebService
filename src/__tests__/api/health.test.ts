import { describe, it, expect, vi, beforeEach } from 'vitest';

// Supabase 서버 클라이언트 mock
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

/** DB 쿼리 체인 전체를 지원하는 mock 팩토리 */
function makeDbMock(dbError: Error | null = null) {
  const queryChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ error: dbError, count: 5 }),
  };
  // count 쿼리도 지원
  Object.assign(queryChain.select.mockReturnValue(queryChain), {});
  queryChain.select.mockReturnValue({ ...queryChain, error: dbError, count: 5 });

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ error: dbError, count: 5 }),
    }),
  };
}

const TEST_ADMIN_KEY = 'test-admin-key-12345';

function makePublicRequest(): Request {
  return new Request('http://localhost/api/v1/health');
}

function makeDetailedRequest(): Request {
  return new Request('http://localhost/api/v1/health?detailed=true', {
    headers: { Authorization: `Bearer ${TEST_ADMIN_KEY}` },
  });
}

describe('GET /api/v1/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
  });

  it('미인증 요청은 최소 상태만 반환한다 (정보 노출 차단)', async () => {
    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET(makePublicRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    // 상세 정보는 노출되지 않아야 함
    expect(body.checks).toBeUndefined();
    expect(body.usage).toBeUndefined();
  });

  it('DB 연결 정상 시 healthy 또는 degraded 상태를 반환한다', async () => {
    const { createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createServiceClient).mockResolvedValue(makeDbMock() as never);

    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET(makeDetailedRequest());
    const body = await response.json();

    // DB ok이면 healthy 또는 degraded (AI/Deploy env vars 설정 여부에 따라 다름)
    expect(['healthy', 'degraded']).toContain(body.status);
    expect(body.checks.database).toBe('ok');
    expect(body.checks.ai).toBeDefined();
    expect(body.checks.aiProvider).toBeDefined();
    expect(body.checks.deploy).toBeDefined();
    expect(body.timestamp).toBeDefined();
    expect(body.usage).toBeDefined();
  });

  it('DB 연결 실패 시 unhealthy 상태를 반환한다', async () => {
    const { createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createServiceClient).mockResolvedValue(makeDbMock(new Error('connection failed')) as never);

    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET(makeDetailedRequest());
    const body = await response.json();

    expect(body.status).toBe('unhealthy');
    expect(body.checks.database).toBe('error');
  });

  it('DB 예외 발생 시 unhealthy 상태를 반환한다', async () => {
    const { createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createServiceClient).mockRejectedValue(new Error('cannot connect'));

    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET(makeDetailedRequest());
    const body = await response.json();

    expect(body.status).toBe('unhealthy');
    expect(body.checks.database).toBe('error');
  });

  it('응답에 usage 필드가 포함된다', async () => {
    const { createServiceClient } = await import('@/lib/supabase/server');
    vi.mocked(createServiceClient).mockResolvedValue(makeDbMock() as never);

    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET(makeDetailedRequest());
    const body = await response.json();

    // usage 필드가 있어야 함 (stats 조회 실패 시 error 필드)
    expect(body.usage).toBeDefined();
    if (!body.usage.error) {
      expect(body.usage.limits).toBeDefined();
      expect(typeof body.usage.limits.maxDailyGenerationsPerUser).toBe('number');
    }
  });
});
