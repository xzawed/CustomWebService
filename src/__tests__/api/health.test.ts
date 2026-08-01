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
    // adminAuth의 rateLimitMap은 모듈 레벨 LRUMap이라 테스트 간 카운터가 누적된다.
    // resetModules로 매 테스트마다 새 모듈 인스턴스를 받아 순서 의존성을 제거한다.
    vi.resetModules();
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

  it('detailed=true + 잘못된 관리자 키는 403이 아니라 공개 응답으로 폴백한다', async () => {
    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET(
      new Request('http://localhost/api/v1/health?detailed=true', {
        headers: { Authorization: 'Bearer wrong-key', 'x-forwarded-for': '203.0.113.50' },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks).toBeUndefined();
    expect(body.usage).toBeUndefined();
  });

  it('detailed=true + Authorization 헤더 없으면 공개 응답으로 폴백한다', async () => {
    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET(new Request('http://localhost/api/v1/health?detailed=true'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks).toBeUndefined();
  });

  it('공개 health 요청은 관리자 레이트리밋 버킷을 소모하지 않는다', async () => {
    // 공개 요청을 한도(RATE_LIMIT_PER_MIN 기본 60) 이상 반복해도,
    // 이후 정상 관리자 요청이 상세 응답을 받아야 한다.
    // (checkAdminAuth가 detailed 요청에서만 호출되기 때문)
    const { GET } = await import('@/app/api/v1/health/route');
    const publicIp = { 'x-forwarded-for': '203.0.113.77' };
    for (let i = 0; i < 120; i++) {
      await GET(new Request('http://localhost/api/v1/health', { headers: publicIp }));
    }

    const response = await GET(
      new Request('http://localhost/api/v1/health?detailed=true', {
        headers: { Authorization: `Bearer ${TEST_ADMIN_KEY}`, ...publicIp },
      })
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.checks).toBeDefined();
  });

  it('레이트리밋에 걸린 정상 관리자는 429를 받는다 (공개 ok로 은폐하지 않음)', async () => {
    // 올바른 키로 한도를 초과하면, 조용히 status:'ok'를 돌려주어 실제 unhealthy를
    // 은폐하는 대신 명시적으로 429를 반환해야 한다.
    const { GET } = await import('@/app/api/v1/health/route');
    const ip = { 'x-forwarded-for': '203.0.113.90' };
    const detailed = (): Request =>
      new Request('http://localhost/api/v1/health?detailed=true', {
        headers: { Authorization: `Bearer ${TEST_ADMIN_KEY}`, ...ip },
      });

    let rateLimited: Response | null = null;
    for (let i = 0; i < 70; i++) {
      const res = await GET(detailed());
      if (res.status === 429) {
        rateLimited = res;
        break;
      }
    }

    expect(rateLimited).not.toBeNull();
    expect(rateLimited!.headers.get('Retry-After')).toBe('60');
    const body = await rateLimited!.json();
    expect(body.status).toBe('rate_limited');
    // 은폐 금지: 'ok'로 위장하지 않는다.
    expect(body.status).not.toBe('ok');
  });

  it('레이트리밋에 걸린 잘못된 키는 여전히 공개 응답으로 폴백하지 않고 429를 받는다', async () => {
    // 한도 검사가 키 검증보다 먼저 수행되므로, 익명 스팸도 429를 받는다(브루트포스 억제).
    const { GET } = await import('@/app/api/v1/health/route');
    const ip = { 'x-forwarded-for': '203.0.113.91' };
    let last: Response | null = null;
    for (let i = 0; i < 70; i++) {
      last = await GET(
        new Request('http://localhost/api/v1/health?detailed=true', {
          headers: { Authorization: 'Bearer wrong-key', ...ip },
        })
      );
      if (last.status === 429) break;
    }
    expect(last!.status).toBe(429);
  });

  it('DB 연결 정상 시 healthy 또는 degraded 상태를 반환한다', async () => {
    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue(makeCatalogRepo(true));

    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET(makeDetailedRequest());
    const body = await response.json();

    // DB ok이면 healthy 또는 degraded (AI env 설정 여부에 따라 다름)
    expect(['healthy', 'degraded']).toContain(body.status);
    expect(body.checks.database).toBe('ok');
    expect(body.checks.ai).toBeDefined();
    expect(body.checks.aiProvider).toBeDefined();
    expect(body.checks.deploy).toBeUndefined();
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
