/**
 * E4: GET /api/v1/popular-services 라우트 테스트 백필
 *
 * createCatalogRepository만 모킹하고 popularServices 순수 헬퍼는 실제 구현을 탄다.
 * (픽스처 shape가 pickTopIds / computePopularServices / resolveCuratedServices와 일치해야 한다)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PopularService } from '@/lib/services/popularServices';

// ---------- Module mocks ----------
vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

vi.mock('@/repositories/factory', () => ({
  createCatalogRepository: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------- Shared data ----------
const mockUser = { id: 'user-1', email: 'test@test.com', name: null, avatarUrl: null };

/** usage 집계용 행 — getApiUsageFromProjects / pickTopIds 가 기대하는 shape */
function usageRow(apiId: string, context = '테스트 컨텍스트'): { apiId: string; context: string } {
  return { apiId, context };
}

/** findByIds 가 돌려줄 카탈로그 상세 — computePopularServices 가 기대하는 shape */
function apiDetail(
  id: string,
  name: string,
): { id: string; name: string; description: string; category: string } {
  return { id, name, description: `${name} 설명`, category: 'test' };
}

function makeCatalogRepo(opts: {
  usageRows?: Array<{ apiId: string; context: string }>;
  details?: Array<{ id: string; name: string; description?: string | null; category?: string | null }>;
  nameToIdMap?: Map<string, string>;
}): {
  getApiUsageFromProjects: ReturnType<typeof vi.fn>;
  findByIds: ReturnType<typeof vi.fn>;
  getActiveNameToIdMap: ReturnType<typeof vi.fn>;
} {
  return {
    getApiUsageFromProjects: vi.fn().mockResolvedValue(opts.usageRows ?? []),
    findByIds: vi.fn().mockResolvedValue(opts.details ?? []),
    getActiveNameToIdMap: vi.fn().mockResolvedValue(opts.nameToIdMap ?? new Map()),
  };
}

async function setupAuth(user: typeof mockUser | null): Promise<void> {
  const { getAuthUser } = await import('@/lib/auth/index');
  vi.mocked(getAuthUser).mockResolvedValue(user);
}

async function setupRepo(
  repo: ReturnType<typeof makeCatalogRepo>,
): Promise<void> {
  const { createCatalogRepository } = await import('@/repositories/factory');
  vi.mocked(createCatalogRepository).mockReturnValue(repo as never);
}

// ---------- Tests ----------
describe('GET /api/v1/popular-services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('비로그인 시 401과 AUTH_REQUIRED를 반환한다', async () => {
    await setupAuth(null);

    const { GET } = await import('@/app/api/v1/popular-services/route');
    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json() as {
      success: boolean;
      error: { code: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTH_REQUIRED');
  });

  it('사용 통계가 5개 이상이면 source=usage 이고 서비스는 정확히 5개다', async () => {
    await setupAuth(mockUser);

    const ids = ['api-1', 'api-2', 'api-3', 'api-4', 'api-5', 'api-6'];
    // 빈도: api-1 이 가장 높고 나머지는 1회 — pickTopIds 가 상위 5개를 고른다
    const usageRows = [
      usageRow('api-1'),
      usageRow('api-1'),
      usageRow('api-1'),
      usageRow('api-2'),
      usageRow('api-3'),
      usageRow('api-4'),
      usageRow('api-5'),
      usageRow('api-6'),
    ];
    const details = ids.map((id, i) => apiDetail(id, `API ${i + 1}`));
    const repo = makeCatalogRepo({ usageRows, details });
    await setupRepo(repo);

    const { GET } = await import('@/app/api/v1/popular-services/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json() as {
      success: boolean;
      data: { services: PopularService[]; source: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.source).toBe('usage');
    expect(body.data.services).toHaveLength(5);
    // computePopularServices 가 붙이는 popular- 접두사
    expect(body.data.services.every((s) => s.id.startsWith('popular-'))).toBe(true);
    // 5개 이상이면 curated 경로(getActiveNameToIdMap)는 타지 않는다
    expect(repo.getActiveNameToIdMap).not.toHaveBeenCalled();
    expect(repo.findByIds).toHaveBeenCalled();
  });

  it('사용 통계가 5개 미만이면 curated 를 병합하고 source=mixed 이며 최대 5개다', async () => {
    await setupAuth(mockUser);

    const usageRows = [usageRow('api-a', '날씨 앱'), usageRow('api-b', '뉴스 앱')];
    const details = [apiDetail('api-a', 'Weather API'), apiDetail('api-b', 'News API')];
    const repo = makeCatalogRepo({ usageRows, details, nameToIdMap: new Map() });
    await setupRepo(repo);

    const { GET } = await import('@/app/api/v1/popular-services/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json() as {
      success: boolean;
      data: { services: PopularService[]; source: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.source).toBe('mixed');
    expect(body.data.services).toHaveLength(5);

    // 앞 2개는 usage 기반(popular-), 나머지는 curated 로 채워짐
    expect(body.data.services[0].id).toBe('popular-api-a');
    expect(body.data.services[1].id).toBe('popular-api-b');
    expect(body.data.services.slice(2).every((s) => s.id.startsWith('curated-'))).toBe(true);
    expect(repo.getActiveNameToIdMap).toHaveBeenCalled();
  });

  it('사용 통계가 빈 배열이면 usage 분기를 건너뛰고 curated 폴백(source=mixed)한다', async () => {
    await setupAuth(mockUser);

    const repo = makeCatalogRepo({ usageRows: [], nameToIdMap: new Map() });
    await setupRepo(repo);

    const { GET } = await import('@/app/api/v1/popular-services/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json() as {
      success: boolean;
      data: { services: PopularService[]; source: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.source).toBe('mixed');
    // CURATED_SERVICES 가 5개이므로 전부 채워진다
    expect(body.data.services).toHaveLength(5);
    expect(body.data.services.every((s) => s.id.startsWith('curated-'))).toBe(true);

    // usageRows.length === 0 이면 pickTopIds/findByIds 를 호출하지 않는다
    expect(repo.findByIds).not.toHaveBeenCalled();
    expect(repo.getActiveNameToIdMap).toHaveBeenCalled();
  });

  it('usage 결과에 이미 있는 id 는 curated 병합 시 중복 추가되지 않는다', async () => {
    await setupAuth(mockUser);

    // computePopularServices 는 항상 popular-${apiId} 를 쓰므로 curated id 와 절대 충돌하지 않는다.
    // 라우트의 existingIds 가드(중복 스킵)를 검증하려면 usage 쪽 id 를 curated 와 같게 강제해야 한다.
    const popularMod = await import('@/lib/services/popularServices');
    const curatedId = popularMod.CURATED_SERVICES[0].id;
    vi.spyOn(popularMod, 'computePopularServices').mockReturnValue([
      {
        id: curatedId,
        title: '사용 통계에서 온 동일 id 서비스',
        description: 'dedup 검증용',
        context: 'usage ctx',
        apiNames: ['Weather API'],
        apiIds: ['api-dup'],
        category: 'weather',
        usageCount: 4,
      },
    ]);

    const usageRows = [usageRow('api-dup'), usageRow('api-dup')];
    const details = [apiDetail('api-dup', 'Weather API')];
    const repo = makeCatalogRepo({ usageRows, details, nameToIdMap: new Map() });
    await setupRepo(repo);

    const { GET } = await import('@/app/api/v1/popular-services/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json() as {
      success: boolean;
      data: { services: PopularService[]; source: string };
    };
    expect(body.data.source).toBe('mixed');
    expect(body.data.services).toHaveLength(5);

    const matching = body.data.services.filter((s) => s.id === curatedId);
    expect(matching).toHaveLength(1);
    // usage 쪽이 먼저 들어가고 curated 는 스킵된다
    expect(matching[0].title).toBe('사용 통계에서 온 동일 id 서비스');
    expect(matching[0].usageCount).toBe(4);
  });

  it('usage 행이 있어도 pickTopIds 가 빈 배열이면 findByIds 를 호출하지 않고 curated 로 폴백한다', async () => {
    await setupAuth(mockUser);

    // pickTopIds(rows, 5) 는 비어 있지 않은 rows 에서 절대 [] 를 반환하지 않는다.
    // 라우트의 topIds.length === 0 분기를 검증하기 위해 해당 헬퍼만 spy 한다.
    const popularMod = await import('@/lib/services/popularServices');
    vi.spyOn(popularMod, 'pickTopIds').mockReturnValue([]);

    const usageRows = [usageRow('api-ghost'), usageRow('api-ghost')];
    const repo = makeCatalogRepo({
      usageRows,
      details: [apiDetail('api-ghost', 'Ghost API')],
      nameToIdMap: new Map(),
    });
    await setupRepo(repo);

    const { GET } = await import('@/app/api/v1/popular-services/route');
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json() as {
      success: boolean;
      data: { services: PopularService[]; source: string };
    };
    expect(body.data.source).toBe('mixed');
    expect(body.data.services).toHaveLength(5);
    expect(body.data.services.every((s) => s.id.startsWith('curated-'))).toBe(true);

    expect(repo.getApiUsageFromProjects).toHaveBeenCalledWith(['generated', 'published']);
    expect(repo.findByIds).not.toHaveBeenCalled();
    expect(repo.getActiveNameToIdMap).toHaveBeenCalled();
  });
});
