import { describe, it, expect, vi, beforeEach } from 'vitest';

// 카탈로그 레포가 반환하는 도메인 항목(활성 1 + 비활성 1) — camelCase
const activeItem = {
  id: 'cat-active',
  name: 'Active API',
  category: 'data',
  authType: 'none',
  authConfig: { default_key: 'SHOULD_NOT_LEAK' },
  isActive: true,
  verificationStatus: 'verified',
  verifiedAt: '2026-06-25T00:00:00.000Z',
  deprecatedAt: null,
  successorId: null,
  requiresProxy: false,
  apiVersion: 'v1',
};
const inactiveItem = {
  id: 'cat-inactive',
  name: 'Inactive API',
  category: 'geo',
  authType: 'api_key',
  authConfig: { env_var: 'API_KEY_X', default_key: undefined },
  isActive: false,
  verificationStatus: 'broken',
  verifiedAt: null,
  deprecatedAt: '2026-06-21T00:00:00.000Z',
  successorId: 'cat-active',
  requiresProxy: true,
  apiVersion: null,
};

const findMany = vi.fn();

vi.mock('@/repositories/factory', () => ({ createCatalogRepository: vi.fn(() => ({ findMany })) }));

const VALID_ADMIN_KEY = 'test-admin-secret-key';

function makeReq(key: string | null = VALID_ADMIN_KEY): Request {
  const headers: Record<string, string> = { 'x-real-ip': '127.0.0.1' };
  if (key !== null) headers['Authorization'] = `Bearer ${key}`;
  return new Request('http://localhost/api/v1/admin/catalog-dump', { headers });
}

describe('GET /api/v1/admin/catalog-dump', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
    findMany.mockResolvedValue({ items: [activeItem, inactiveItem], total: 2 });
  });

  it('Authorization 헤더 없음 → 403', async () => {
    const { GET } = await import('@/app/api/v1/admin/catalog-dump/route');
    const res = await GET(makeReq(null));
    expect(res.status).toBe(403);
  });

  it('잘못된 키 → 403', async () => {
    const { GET } = await import('@/app/api/v1/admin/catalog-dump/route');
    const res = await GET(makeReq('wrong'));
    expect(res.status).toBe(403);
  });

  it('유효한 키 → 전체 행을 요약·투영해 반환(200)', async () => {
    const { GET } = await import('@/app/api/v1/admin/catalog-dump/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data.summary).toMatchObject({
      total: 2,
      active: 1,
      inactive: 1,
      byVerificationStatus: { verified: 1, broken: 1 },
    });
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0]).toMatchObject({
      id: 'cat-active',
      name: 'Active API',
      isActive: true,
      verificationStatus: 'verified',
    });
  });

  it('비활성·전체 행을 위해 빈 필터로 findMany를 호출한다', async () => {
    const { GET } = await import('@/app/api/v1/admin/catalog-dump/route');
    await GET(makeReq());
    expect(findMany).toHaveBeenCalledWith({}, expect.objectContaining({ limit: 500 }));
  });

  it('auth_config 등 민감 필드를 응답에 노출하지 않는다', async () => {
    const { GET } = await import('@/app/api/v1/admin/catalog-dump/route');
    const res = await GET(makeReq());
    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('SHOULD_NOT_LEAK');
    expect(serialized).not.toContain('authConfig');
    expect(serialized).not.toContain('env_var');
  });

  it('verificationStatus가 없는 행은 null로 투영하고 요약에 집계한다', async () => {
    const noStatusItem = { ...activeItem, id: 'cat-nostatus', verificationStatus: undefined, verifiedAt: undefined };
    findMany.mockResolvedValue({ items: [noStatusItem], total: 1 });
    const { GET } = await import('@/app/api/v1/admin/catalog-dump/route');
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.data.items[0].verificationStatus).toBeNull();
    expect(body.data.summary.byVerificationStatus).toMatchObject({ null: 1 });
  });

  it('레포 오류 시 handleApiError로 위임한다(인증 통과 후)', async () => {
    findMany.mockRejectedValue(new Error('db read fail'));
    const { GET } = await import('@/app/api/v1/admin/catalog-dump/route');
    const res = await GET(makeReq());
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it('OPTIONS 프리플라이트는 204 + CORS 헤더를 반환한다', async () => {
    const { OPTIONS } = await import('@/app/api/v1/admin/catalog-dump/route');
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});
