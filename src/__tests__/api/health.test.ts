import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ICatalogRepository } from '@/repositories/interfaces';

// 리포지토리 팩토리는 zero-arg(createCatalogRepository())로 SQLite 레포를 생성한다.
// route는 createCatalogRepository()로 받은 repo의 ping()/getUsageCounts()만 사용하므로
// 팩토리만 모킹하면 충분하다. (과거 pg/drizzle cold-import 차단용 providers/failover
// mock은 SQLite 컷오버로 모듈이 제거되어 더 이상 필요 없다.)
vi.mock('@/repositories/factory', () => ({
  createCatalogRepository: vi.fn(),
}));

/**
 * catalog 리포지토리 mock. route는 `repo.ping()`과 `repo.getUsageCounts(today)`만 사용한다.
 * @param ping - ping() 반환값 (DB 연결 정상 여부)
 */
function makeCatalogRepo(ping = true): ICatalogRepository {
  return {
    ping: vi.fn().mockResolvedValue(ping),
    getUsageCounts: vi.fn().mockResolvedValue({
      todayGenerations: 5,
      totalProjects: 10,
      totalUsers: 3,
    }),
  } as unknown as ICatalogRepository;
}

/** ping()이 reject되는 catalog 리포지토리 mock (DB 예외 시뮬레이션). */
function makeFailingCatalogRepo(error: Error): ICatalogRepository {
  return {
    ping: vi.fn().mockRejectedValue(error),
    getUsageCounts: vi.fn(),
  } as unknown as ICatalogRepository;
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
    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue(makeCatalogRepo(true));

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
    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue(makeCatalogRepo(false));

    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET(makeDetailedRequest());
    const body = await response.json();

    expect(body.status).toBe('unhealthy');
    expect(body.checks.database).toBe('error');
  });

  it('DB 예외 발생 시 unhealthy 상태를 반환한다', async () => {
    // repo.ping()이 throw → route의 외부 try/catch가 잡아 database=error 처리.
    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue(
      makeFailingCatalogRepo(new Error('cannot connect')),
    );

    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET(makeDetailedRequest());
    const body = await response.json();

    expect(body.status).toBe('unhealthy');
    expect(body.checks.database).toBe('error');
  });

  it('응답에 usage 필드가 포함된다', async () => {
    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue(makeCatalogRepo(true));

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
