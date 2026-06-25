import { describe, it, expect, vi, beforeEach } from 'vitest';

// 카탈로그 레포가 반환하는 활성 항목(키리스 1개) — camelCase
const activeItem = {
  id: 'cat-1',
  name: 'JSONPlaceholder',
  baseUrl: 'https://jsonplaceholder.typicode.com',
  authType: 'none',
  verificationStatus: 'unverified',
  endpoints: [{ path: '/todos/1', method: 'GET' }],
  isActive: true,
};

const findMany = vi.fn();
const update = vi.fn();

vi.mock('@/repositories/factory', () => ({
  createCatalogRepository: vi.fn(() => ({ findMany, update })),
}));

const VALID_ADMIN_KEY = 'test-admin-secret-key';

function makeReq(key: string | null = VALID_ADMIN_KEY): Request {
  const headers: Record<string, string> = { 'x-real-ip': '127.0.0.1' };
  if (key !== null) headers['Authorization'] = `Bearer ${key}`;
  return new Request('http://localhost/api/v1/admin/verify-catalog', { method: 'POST', headers });
}

describe('POST /api/v1/admin/verify-catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
    findMany.mockResolvedValue({ items: [activeItem], total: 1 });
    update.mockResolvedValue(undefined);
  });

  it('Authorization 헤더 없음 → 403', async () => {
    const { POST } = await import('@/app/api/v1/admin/verify-catalog/route');
    const res = await POST(makeReq(null));
    expect(res.status).toBe(403);
  });

  it('잘못된 키 → 403', async () => {
    const { POST } = await import('@/app/api/v1/admin/verify-catalog/route');
    const res = await POST(makeReq('wrong'));
    expect(res.status).toBe(403);
  });

  it('업스트림 200 → unverified를 verified로 갱신 (update 호출)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"id":1}', { status: 200, headers: { 'content-type': 'application/json' } })
    );

    const { POST } = await import('@/app/api/v1/admin/verify-catalog/route');
    const res = await POST(makeReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.summary.checked).toBe(1);
    expect(body.data.summary.updated).toBe(1);
    expect(update).toHaveBeenCalledWith('cat-1', { verificationStatus: 'verified' });
    fetchSpy.mockRestore();
  });

  it('업스트림 500 → broken으로 갱신', async () => {
    findMany.mockResolvedValue({
      items: [{ ...activeItem, verificationStatus: 'verified' }],
      total: 1,
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('err', { status: 500, headers: { 'content-type': 'text/plain' } })
    );

    const { POST } = await import('@/app/api/v1/admin/verify-catalog/route');
    const res = await POST(makeReq());

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith('cat-1', { verificationStatus: 'broken' });
    fetchSpy.mockRestore();
  });

  it('이미 verified인데 200 → 변경 없음(update 미호출)', async () => {
    findMany.mockResolvedValue({
      items: [{ ...activeItem, verificationStatus: 'verified' }],
      total: 1,
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"id":1}', { status: 200, headers: { 'content-type': 'application/json' } })
    );

    const { POST } = await import('@/app/api/v1/admin/verify-catalog/route');
    const res = await POST(makeReq());

    const body = await res.json();
    expect(body.data.summary.unchanged).toBe(1);
    expect(body.data.summary.updated).toBe(0);
    expect(update).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
