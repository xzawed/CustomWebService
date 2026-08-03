/**
 * POST /api/v1/admin/catalog/activate — 키 검증 통과 시에만 비활성 API 활성화.
 *
 * 핵심 안전 속성: 키가 유효하지 않으면 repo.update를 절대 호출하지 않는다.
 * dryRun이면 검증만 하고 쓰지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiCatalogItem } from '@/types/api';
import type { KeyCheckResult } from '@/lib/catalog/keyCheck';

const findMany = vi.fn();
const update = vi.fn();
const verifyApiKey = vi.fn();
const eventBusEmit = vi.fn();

vi.mock('@/repositories/factory', () => ({
  createCatalogRepository: vi.fn(() => ({ findMany, update })),
}));

vi.mock('@/lib/catalog/keyCheck', () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKey(...args) as ReturnType<typeof verifyApiKey>,
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

function makeValidKeyResult(name: string): KeyCheckResult {
  return {
    name,
    envVar: 'NASA_API_KEY',
    verdict: 'VALID',
    httpStatus: 200,
    detail: '인증 성공',
  };
}

function makeInvalidKeyResult(name: string): KeyCheckResult {
  return {
    name,
    envVar: 'NASA_API_KEY',
    verdict: 'INVALID',
    httpStatus: 401,
    detail: '키 거부(401)',
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
    verifyApiKey.mockResolvedValue(makeValidKeyResult('NASA APOD'));
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

  it('키 검증 VALID인 비활성 키 의존 API → 활성화하고 activated:true', async () => {
    const candidate = makeInactiveKeyedApi();
    findMany.mockResolvedValue({ items: [candidate], total: 1 });
    verifyApiKey.mockResolvedValue(makeValidKeyResult(candidate.name));

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
    expect(update).toHaveBeenCalledWith(candidate.id, {
      isActive: true,
      verificationStatus: 'verified',
    });
    expect(verifyApiKey).toHaveBeenCalledOnce();
  });

  it('키 검증이 VALID가 아니면 repo.update를 호출하지 않는다', async () => {
    const candidate = makeInactiveKeyedApi();
    findMany.mockResolvedValue({ items: [candidate], total: 1 });
    verifyApiKey.mockResolvedValue(makeInvalidKeyResult(candidate.name));

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
    expect(body.data.outcomes[0]?.reason).toMatch(/키 검증 실패/);
    expect(update).not.toHaveBeenCalled();
  });

  it('dryRun:true이면 검증은 하되 repo.update는 호출하지 않는다', async () => {
    const candidate = makeInactiveKeyedApi();
    findMany.mockResolvedValue({ items: [candidate], total: 1 });
    verifyApiKey.mockResolvedValue(makeValidKeyResult(candidate.name));

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
    expect(verifyApiKey).toHaveBeenCalledOnce();
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
    verifyApiKey.mockResolvedValue(makeValidKeyResult('A'));

    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, { apiIds: ['api-a'] }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { candidates: number; outcomes: Array<{ apiId: string }> };
    };
    expect(body.data.candidates).toBe(1);
    expect(body.data.outcomes).toHaveLength(1);
    expect(body.data.outcomes[0]?.apiId).toBe('api-a');
    expect(verifyApiKey).toHaveBeenCalledOnce();
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
    verifyApiKey.mockResolvedValue(makeValidKeyResult(candidate.name));

    const { POST } = await import('@/app/api/v1/admin/catalog/activate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, {}));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { candidates: number; outcomes: Array<{ apiId: string }> };
    };
    expect(body.data.candidates).toBe(1);
    expect(body.data.outcomes.map((o) => o.apiId)).toEqual(['api-real']);
    expect(verifyApiKey).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('api-real', {
      isActive: true,
      verificationStatus: 'verified',
    });
  });

  it('빈 요청 본문은 허용된다(전체 후보 의미)', async () => {
    const candidate = makeInactiveKeyedApi();
    findMany.mockResolvedValue({ items: [candidate], total: 1 });
    verifyApiKey.mockResolvedValue(makeValidKeyResult(candidate.name));

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
});
