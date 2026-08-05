/**
 * POST /api/v1/admin/catalog/activate — 연속 키 검증 통과 시에만 비활성 API 활성화.
 *
 * 핵심 안전 속성: 키가 유효하지 않거나 N회 연속 VALID 가 아니면 repo.update를 절대 호출하지 않는다.
 * dryRun이면 연속 검증은 수행하고 쓰지 않는다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ApiCatalogItem } from '@/types/api';
import type { ConsistencyResult } from '@/lib/catalog/keyCheck';

const findMany = vi.fn();
const update = vi.fn();
const verifyApiKeyForActivation = vi.fn();
const eventBusEmit = vi.fn();

vi.mock('@/repositories/factory', () => ({
  createCatalogRepository: vi.fn(() => ({ findMany, update })),
}));

vi.mock('@/lib/catalog/keyCheck', () => ({
  verifyApiKeyForActivation: (...args: unknown[]) =>
    verifyApiKeyForActivation(...args) as ReturnType<typeof verifyApiKeyForActivation>,
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: (...args: unknown[]) => eventBusEmit(...args) },
}));

const VALID_ADMIN_KEY = 'test-admin-secret-key';

/** 비활성 + 플랫폼 키 의존 후보(활성화 대상). */
function makeInactiveKeyedApi(overrides: Partial<ApiCatalogItem> = {}): ApiCatalogItem {
  return {
    id: 'api-inactive-keyed',
    name: 'NASA APOD',
    description: 'test',
    category: 'science',
    baseUrl: 'https://api.nasa.gov',
    authType: 'api_key',
    authConfig: { env_var: 'NASA_API_KEY', param_in: 'query', param_name: 'api_key' },
    rateLimit: null,
    isActive: false,
    iconUrl: null,
    docsUrl: null,
    endpoints: [
      {
        path: '/planetary/apod',
        method: 'GET',
        description: 'APOD',
        params: [],
        responseExample: {},
      },
    ],
    tags: [],
    apiVersion: null,
    deprecatedAt: null,
    successorId: null,
    corsSupported: true,
    requiresProxy: true,
    creditRequired: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    verificationStatus: 'unverified',
    ...overrides,
  };
}

function makeValidConsistency(name: string, samples = 3): ConsistencyResult {
  return {
    name,
    envVar: 'NASA_API_KEY',
    verdict: 'VALID',
    httpStatus: 200,
    detail: `연속 ${samples}회 인증 성공`,
    samples,
    successes: samples,
    attempts: samples,
    attemptResults: Array.from({ length: samples }, () => ({
      verdict: 'VALID' as const,
      httpStatus: 200,
      detail: '인증 성공',
    })),
  };
}

function makeInvalidConsistency(name: string): ConsistencyResult {
  return {
    name,
    envVar: 'NASA_API_KEY',
    verdict: 'INVALID',
    httpStatus: 401,
    detail: '키 거부(401)',
    samples: 3,
    successes: 0,
    attempts: 1,
    attemptResults: [{ verdict: 'INVALID', httpStatus: 401, detail: '키 거부(401)' }],
  };
}

/** VALID×2 후 ERROR — 3회 중 2회 성공 (에어코리아형 간헐 실패) */
function makePartialErrorConsistency(name: string): ConsistencyResult {
  return {
    name,
    envVar: 'NASA_API_KEY',
    verdict: 'ERROR',
    httpStatus: 504,
    detail: '예상치 못한 504',
    samples: 3,
    successes: 2,
    attempts: 3,
    attemptResults: [
      { verdict: 'VALID', httpStatus: 200, detail: '인증 성공' },
      { verdict: 'VALID', httpStatus: 200, detail: '인증 성공' },
      { verdict: 'ERROR', httpStatus: 504, detail: '예상치 못한 504' },
    ],
  };
}

function makeReq(
  key: string | null = VALID_ADMIN_KEY,
  body?: unknown,
  ip = '10.0.1.20',
): Request {
  const headers: Record<string, string> = {
    'x-forwarded-for': ip,
  };
  if (key !== null) headers['Authorization'] = `Bearer ${key}`;

  if (body === undefined) {
    return new Request('http://localhost/api/v1/admin/catalog/activate', {
      method: 'POST',
      headers,
    });
  }

  headers['Content-Type'] = 'application/json';
  return new Request('http://localhost/api/v1/admin/catalog/activate', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/v1/admin/catalog/activate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
    process.env.NASA_API_KEY = 'test-nasa-key';
    findMany.mockResolvedValue({ items: [], total: 0 });
    update.mockResolvedValue(undefined);
    verifyApiKeyForActivation.mockResolvedValue(makeValidConsistency('NASA APOD'));
  });

  it('Authorization 헤더 없음 → 403', async () => {
    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    const res = await POST(makeReq(null, {}));
    expect(res.status).toBe(403);
  });

  it('잘못된 관리자 키 → 403', async () => {
    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    const res = await POST(makeReq('wrong-key', {}));
    expect(res.status).toBe(403);
  });

  it('연속 검증 3/3 VALID → 활성화하고 reason 에 3/3 포함', async () => {
    const candidate = makeInactiveKeyedApi();
    findMany.mockResolvedValue({ items: [candidate], total: 1 });
    verifyApiKeyForActivation.mockResolvedValue(makeValidConsistency(candidate.name));

    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, {}));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        activated: number;
        candidates: number;
        outcomes: Array<{ apiId: string; activated: boolean; reason: string }>;
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.candidates).toBe(1);
    expect(body.data.activated).toBe(1);
    expect(body.data.outcomes[0]).toMatchObject({
      apiId: candidate.id,
      activated: true,
    });
    expect(body.data.outcomes[0]?.reason).toMatch(/3\/3/);
    expect(update).toHaveBeenCalledWith(candidate.id, {
      isActive: true,
      verificationStatus: 'verified',
    });
    expect(verifyApiKeyForActivation).toHaveBeenCalledOnce();
  });

  it('3회 중 2회 성공(ERROR) → activated:false, reason 에 부분 성공 카운트', async () => {
    const candidate = makeInactiveKeyedApi();
    findMany.mockResolvedValue({ items: [candidate], total: 1 });
    verifyApiKeyForActivation.mockResolvedValue(makePartialErrorConsistency(candidate.name));

    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, {}));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        activated: number;
        outcomes: Array<{ activated: boolean; reason: string }>;
      };
    };
    expect(body.data.activated).toBe(0);
    expect(body.data.outcomes[0]?.activated).toBe(false);
    expect(body.data.outcomes[0]?.reason).toMatch(/키 검증 실패\(ERROR\)/);
    expect(body.data.outcomes[0]?.reason).toMatch(/3회 중 2회 성공/);
    expect(body.data.outcomes[0]?.reason).toMatch(/504/);
    expect(update).not.toHaveBeenCalled();
  });

  it('키 검증이 INVALID면 repo.update를 호출하지 않는다 (기존 동작 유지)', async () => {
    const candidate = makeInactiveKeyedApi();
    findMany.mockResolvedValue({ items: [candidate], total: 1 });
    verifyApiKeyForActivation.mockResolvedValue(makeInvalidConsistency(candidate.name));

    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, {}));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        activated: number;
        outcomes: Array<{ activated: boolean; reason: string }>;
      };
    };
    expect(body.data.activated).toBe(0);
    expect(body.data.outcomes[0]?.activated).toBe(false);
    expect(body.data.outcomes[0]?.reason).toMatch(/키 검증 실패\(INVALID\)/);
    expect(update).not.toHaveBeenCalled();
  });

  it('dryRun:true + 3/3 → 연속 검증은 수행하되 repo.update 는 호출하지 않는다', async () => {
    const candidate = makeInactiveKeyedApi();
    findMany.mockResolvedValue({ items: [candidate], total: 1 });
    verifyApiKeyForActivation.mockResolvedValue(makeValidConsistency(candidate.name));

    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, { dryRun: true }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        dryRun: boolean;
        activated: number;
        outcomes: Array<{ activated: boolean; reason: string }>;
      };
    };
    expect(body.data.dryRun).toBe(true);
    expect(body.data.activated).toBe(0);
    expect(body.data.outcomes[0]?.activated).toBe(false);
    expect(body.data.outcomes[0]?.reason).toMatch(/dryRun/);
    expect(body.data.outcomes[0]?.reason).toMatch(/3\/3/);
    expect(verifyApiKeyForActivation).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });

  it('apiIds 필터가 있으면 해당 id만 대상으로 한다', async () => {
    const a = makeInactiveKeyedApi({ id: 'api-a', name: 'A' });
    const b = makeInactiveKeyedApi({
      id: 'api-b',
      name: 'B',
      authConfig: { env_var: 'OTHER_KEY', param_in: 'query', param_name: 'key' },
    });
    findMany.mockResolvedValue({ items: [a, b], total: 2 });
    verifyApiKeyForActivation.mockResolvedValue(makeValidConsistency('A'));

    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, { apiIds: ['api-a'] }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { candidates: number; outcomes: Array<{ apiId: string }> };
    };
    expect(body.data.candidates).toBe(1);
    expect(body.data.outcomes).toHaveLength(1);
    expect(body.data.outcomes[0]?.apiId).toBe('api-a');
    expect(verifyApiKeyForActivation).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith('api-a', {
      isActive: true,
      verificationStatus: 'verified',
    });
  });

  it('이미 활성인 API와 키리스 API는 대상에 포함하지 않는다', async () => {
    const alreadyActive = makeInactiveKeyedApi({
      id: 'api-active',
      name: 'Already Active',
      isActive: true,
    });
    const keyless = makeInactiveKeyedApi({
      id: 'api-keyless',
      name: 'Keyless',
      authType: 'none',
      authConfig: {},
      isActive: false,
    });
    const withDefaultKey = makeInactiveKeyedApi({
      id: 'api-default-key',
      name: 'Default Key',
      authConfig: {
        env_var: 'SOME_KEY',
        default_key: 'public-demo',
        param_in: 'query',
        param_name: 'key',
      },
    });
    // 유일한 진짜 후보
    const candidate = makeInactiveKeyedApi({ id: 'api-real', name: 'Real Candidate' });

    findMany.mockResolvedValue({
      items: [alreadyActive, keyless, withDefaultKey, candidate],
      total: 4,
    });
    verifyApiKeyForActivation.mockResolvedValue(makeValidConsistency(candidate.name));

    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, {}));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { candidates: number; outcomes: Array<{ apiId: string }> };
    };
    expect(body.data.candidates).toBe(1);
    expect(body.data.outcomes.map((o) => o.apiId)).toEqual(['api-real']);
    expect(verifyApiKeyForActivation).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('api-real', {
      isActive: true,
      verificationStatus: 'verified',
    });
  });

  it('빈 요청 본문은 허용된다(전체 후보 의미)', async () => {
    const candidate = makeInactiveKeyedApi();
    findMany.mockResolvedValue({ items: [candidate], total: 1 });
    verifyApiKeyForActivation.mockResolvedValue(makeValidConsistency(candidate.name));

    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    // body 없음 (undefined) → 라우트가 {}로 처리
    const res = await POST(makeReq(VALID_ADMIN_KEY, undefined, '10.0.1.99'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { candidates: number; activated: number };
    };
    expect(body.success).toBe(true);
    expect(body.data.candidates).toBe(1);
    expect(body.data.activated).toBe(1);
  });

  it('OPTIONS 프리플라이트는 204 + 관리자 CORS 헤더를 반환한다', async () => {
    const { OPTIONS } = await import('@/app/api/v1/admin/catalog/activate/route');
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('잘못된 JSON 본문은 검증 오류(4xx)를 반환하고 500이 아니다', async () => {
    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    // 파싱 불가 문자열 — JSON.parse가 던져 ValidationError로 변환돼야 한다
    const res = await POST(makeReq(VALID_ADMIN_KEY, '{', '10.0.1.77'));

    expect(res.status).not.toBe(500);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(findMany).not.toHaveBeenCalled();
    expect(verifyApiKeyForActivation).not.toHaveBeenCalled();
  });
});

/**
 * realFetch(라우트 내부 KeyFetch) 커버리지.
 *
 * 위 describe는 keyCheck 모듈을 모킹해 연속 검증 분기만 본다.
 * 여기선 keyCheck를 실제 모듈로 두고 global fetch만 스텁해 realFetch 성공/네트워크 실패 경로를 탄다.
 * MSW를 우회하므로 setup.ts의 unhandled-request 단언에 걸리지 않는다.
 *
 * 연속 검증(3회)이므로 성공 경로에서 fetch 는 3회 호출된다.
 */
describe('POST /api/v1/admin/catalog/activate — realFetch 경로', () => {
  const REAL_FETCH_ENV = 'TEST_ACTIVATE_REAL_FETCH_KEY';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doUnmock('@/lib/catalog/keyCheck');
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
    vi.stubEnv(REAL_FETCH_ENV, 'live-key-value');
    findMany.mockResolvedValue({ items: [], total: 0 });
    update.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    // 이후 파일/스위트가 다시 모킹된 keyCheck를 쓰도록 복구
    vi.doMock('@/lib/catalog/keyCheck', () => ({
      verifyApiKeyForActivation: (...args: unknown[]) =>
        verifyApiKeyForActivation(...args) as ReturnType<typeof verifyApiKeyForActivation>,
    }));
  });

  function makeRealFetchCandidate(): ApiCatalogItem {
    return makeInactiveKeyedApi({
      id: 'api-real-fetch',
      name: 'Real Fetch API',
      baseUrl: 'https://example.test',
      authConfig: {
        env_var: REAL_FETCH_ENV,
        param_in: 'query',
        param_name: 'api_key',
      },
      endpoints: [
        {
          path: '/v1/ping',
          method: 'GET',
          description: 'ping',
          params: [],
          responseExample: {},
        },
      ],
    });
  }

  it('fetch 성공 시 연속 검증 통과로 활성화된다 (fetch 3회)', async () => {
    const candidate = makeRealFetchCandidate();
    findMany.mockResolvedValue({ items: [candidate], total: 1 });

    const fetchStub = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => '{"ok":true}',
    });
    vi.stubGlobal('fetch', fetchStub);

    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, {}, '10.0.2.10'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        activated: number;
        outcomes: Array<{ apiId: string; activated: boolean; reason: string }>;
      };
    };
    expect(body.data.activated).toBe(1);
    expect(body.data.outcomes[0]).toMatchObject({
      apiId: candidate.id,
      activated: true,
    });
    expect(body.data.outcomes[0]?.reason).toMatch(/3\/3/);
    expect(fetchStub).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledWith(candidate.id, {
      isActive: true,
      verificationStatus: 'verified',
    });
  }, 15_000);

  it('fetch 거부 시 첫 시도 ERROR 로 조기 종료·활성화하지 않는다', async () => {
    const candidate = makeRealFetchCandidate();
    findMany.mockResolvedValue({ items: [candidate], total: 1 });

    const fetchStub = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchStub);

    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, {}, '10.0.2.11'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        activated: number;
        outcomes: Array<{ activated: boolean; reason: string }>;
      };
    };
    expect(body.data.activated).toBe(0);
    expect(body.data.outcomes[0]?.activated).toBe(false);
    expect(body.data.outcomes[0]?.reason).toMatch(/키 검증 실패/);
    // 조기 종료: 첫 non-VALID 에서 멈춤 → fetch 1회
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });
});
