/**
 * POST /api/v1/admin/catalog/deactivate — 라이브 키 검증 없이 활성 API 비활성화.
 *
 * 핵심 안전 속성:
 * - apiIds 필수·비어 있으면 400
 * - verifyApiKey를 절대 호출하지 않는다 (env 키 부재·업스트림 다운이어도 끌 수 있어야 함)
 * - isActive만 false로, verificationStatus는 건드리지 않는다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApiCatalogItem } from '@/types/api';

const findMany = vi.fn();
const update = vi.fn();
const verifyApiKey = vi.fn();
const eventBusEmit = vi.fn();

vi.mock('@/repositories/factory', () => ({
  createCatalogRepository: vi.fn(() => ({ findMany, update })),
}));

// activate와 달리 deactivate는 keyCheck를 import하지 않는다.
// 그래도 실수로 배선되면 실패하도록 모킹 스파이로 고정한다.
vi.mock('@/lib/catalog/keyCheck', () => ({
  verifyApiKey: (...args: unknown[]) => verifyApiKey(...args) as never,
}));

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: (...args: unknown[]) => eventBusEmit(...args) },
}));

const VALID_ADMIN_KEY = 'test-admin-secret-key';

/** 활성 카탈로그 행 픽스처. */
function makeActiveApi(overrides: Partial<ApiCatalogItem> = {}): ApiCatalogItem {
  return {
    id: 'api-active-keyed',
    name: 'NASA APOD',
    description: 'test',
    category: 'science',
    baseUrl: 'https://api.nasa.gov',
    authType: 'api_key',
    authConfig: { env_var: 'NASA_API_KEY', param_in: 'query', param_name: 'api_key' },
    rateLimit: null,
    isActive: true,
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
    verificationStatus: 'broken',
    ...overrides,
  };
}

function makeReq(
  key: string | null = VALID_ADMIN_KEY,
  body?: unknown,
  ip = '10.0.3.20',
): Request {
  const headers: Record<string, string> = {
    'x-forwarded-for': ip,
  };
  if (key !== null) headers['Authorization'] = `Bearer ${key}`;

  if (body === undefined) {
    return new Request('http://localhost/api/v1/admin/catalog/deactivate', {
      method: 'POST',
      headers,
    });
  }

  headers['Content-Type'] = 'application/json';
  return new Request('http://localhost/api/v1/admin/catalog/deactivate', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/v1/admin/catalog/deactivate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
    // env 키 없음 — 비활성화는 키와 무관해야 한다
    delete process.env.NASA_API_KEY;
    findMany.mockResolvedValue({ items: [], total: 0 });
    update.mockResolvedValue(undefined);
  });

  it('Authorization 헤더 없음 → 403', async () => {
    const { POST } = await import('@/app/api/v1/admin/catalog/deactivate/route');
    const res = await POST(makeReq(null, { apiIds: ['api-x'] }));
    expect(res.status).toBe(403);
  });

  it('잘못된 관리자 키 → 403', async () => {
    const { POST } = await import('@/app/api/v1/admin/catalog/deactivate/route');
    const res = await POST(makeReq('wrong-key', { apiIds: ['api-x'] }));
    expect(res.status).toBe(403);
  });

  it('활성 API → isActive:false만 기록하고 verificationStatus는 건드리지 않는다', async () => {
    const candidate = makeActiveApi({ verificationStatus: 'broken' });
    findMany.mockResolvedValue({ items: [candidate], total: 1 });

    const { POST } = await import('@/app/api/v1/admin/catalog/deactivate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, { apiIds: [candidate.id] }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        deactivated: number;
        requested: number;
        outcomes: Array<{ apiId: string; deactivated: boolean; reason: string }>;
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.requested).toBe(1);
    expect(body.data.deactivated).toBe(1);
    expect(body.data.outcomes[0]).toMatchObject({
      apiId: candidate.id,
      deactivated: true,
    });
    // isActive만 — verificationStatus 키 자체가 없어야 한다
    expect(update).toHaveBeenCalledWith(candidate.id, { isActive: false });
    expect(update.mock.calls[0]?.[1]).not.toHaveProperty('verificationStatus');
    expect(eventBusEmit).toHaveBeenCalledWith({
      type: 'CATALOG_API_DEACTIVATED',
      payload: {
        apiId: candidate.id,
        apiName: candidate.name,
        envVar: 'NASA_API_KEY',
      },
    });
  });

  it('env 키가 없어도 verifyApiKey를 호출하지 않는다', async () => {
    const candidate = makeActiveApi();
    findMany.mockResolvedValue({ items: [candidate], total: 1 });
    expect(process.env.NASA_API_KEY).toBeUndefined();

    const { POST } = await import('@/app/api/v1/admin/catalog/deactivate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, { apiIds: [candidate.id] }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { deactivated: number } };
    expect(body.data.deactivated).toBe(1);
    expect(verifyApiKey).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  it('dryRun:true이면 repo.update·이벤트를 호출하지 않는다', async () => {
    const candidate = makeActiveApi();
    findMany.mockResolvedValue({ items: [candidate], total: 1 });

    const { POST } = await import('@/app/api/v1/admin/catalog/deactivate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, { apiIds: [candidate.id], dryRun: true }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        dryRun: boolean;
        deactivated: number;
        outcomes: Array<{ deactivated: boolean; reason: string }>;
      };
    };
    expect(body.data.dryRun).toBe(true);
    expect(body.data.deactivated).toBe(0);
    expect(body.data.outcomes[0]?.deactivated).toBe(false);
    expect(body.data.outcomes[0]?.reason).toMatch(/dryRun/);
    expect(update).not.toHaveBeenCalled();
    expect(eventBusEmit).not.toHaveBeenCalled();
    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it('존재하지 않는 apiId는 예외 없이 outcome 행으로 보고한다', async () => {
    findMany.mockResolvedValue({ items: [], total: 0 });

    const { POST } = await import('@/app/api/v1/admin/catalog/deactivate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, { apiIds: ['no-such-id'] }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        deactivated: number;
        outcomes: Array<{ apiId: string; deactivated: boolean; reason: string }>;
      };
    };
    expect(body.data.deactivated).toBe(0);
    expect(body.data.outcomes[0]).toMatchObject({
      apiId: 'no-such-id',
      deactivated: false,
    });
    expect(body.data.outcomes[0]?.reason).toMatch(/존재하지 않/);
    expect(update).not.toHaveBeenCalled();
  });

  it('이미 비활성인 API는 쓰기 없이 outcome만 반환한다', async () => {
    const inactive = makeActiveApi({ id: 'api-inactive', isActive: false });
    findMany.mockResolvedValue({ items: [inactive], total: 1 });

    const { POST } = await import('@/app/api/v1/admin/catalog/deactivate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, { apiIds: [inactive.id] }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        deactivated: number;
        outcomes: Array<{ deactivated: boolean; reason: string }>;
      };
    };
    expect(body.data.deactivated).toBe(0);
    expect(body.data.outcomes[0]?.deactivated).toBe(false);
    expect(body.data.outcomes[0]?.reason).toMatch(/이미 비활성/);
    expect(update).not.toHaveBeenCalled();
  });

  it('키리스 활성 API도 비활성화 대상이다', async () => {
    const keyless = makeActiveApi({
      id: 'api-keyless',
      name: 'Keyless API',
      authType: 'none',
      authConfig: {},
      verificationStatus: 'verified',
    });
    findMany.mockResolvedValue({ items: [keyless], total: 1 });

    const { POST } = await import('@/app/api/v1/admin/catalog/deactivate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, { apiIds: [keyless.id] }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { deactivated: number; outcomes: Array<{ apiId: string; deactivated: boolean }> };
    };
    expect(body.data.deactivated).toBe(1);
    expect(body.data.outcomes[0]?.apiId).toBe(keyless.id);
    expect(update).toHaveBeenCalledWith(keyless.id, { isActive: false });
  });

  it('apiIds 생략·빈 배열은 400 ValidationError', async () => {
    const { POST } = await import('@/app/api/v1/admin/catalog/deactivate/route');

    const missing = await POST(makeReq(VALID_ADMIN_KEY, {}));
    expect(missing.status).toBe(400);
    const missingBody = (await missing.json()) as { success: boolean; error: { code: string } };
    expect(missingBody.success).toBe(false);
    expect(missingBody.error.code).toBe('INVALID_INPUT');

    const empty = await POST(makeReq(VALID_ADMIN_KEY, { apiIds: [] }, '10.0.3.21'));
    expect(empty.status).toBe(400);
    const emptyBody = (await empty.json()) as { error: { code: string } };
    expect(emptyBody.error.code).toBe('INVALID_INPUT');

    expect(findMany).not.toHaveBeenCalled();
    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it('OPTIONS 프리플라이트는 204 + 관리자 CORS 헤더를 반환한다', async () => {
    const { OPTIONS } = await import('@/app/api/v1/admin/catalog/deactivate/route');
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('잘못된 JSON 본문은 검증 오류(4xx)를 반환하고 500이 아니다', async () => {
    const { POST } = await import('@/app/api/v1/admin/catalog/deactivate/route');
    const res = await POST(makeReq(VALID_ADMIN_KEY, '{', '10.0.3.77'));

    expect(res.status).not.toBe(500);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(findMany).not.toHaveBeenCalled();
    expect(verifyApiKey).not.toHaveBeenCalled();
  });
});
