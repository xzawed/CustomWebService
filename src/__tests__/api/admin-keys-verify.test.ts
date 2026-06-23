import { describe, it, expect, vi, beforeEach } from 'vitest';

// 카탈로그 레포가 반환하는 도메인 항목(키 의존 1개) — camelCase
const keyedItem = {
  id: 'cat-1',
  name: '카카오 로컬 (지도·장소 검색)',
  baseUrl: 'https://dapi.kakao.com',
  authType: 'api_key',
  authConfig: { env_var: 'API_KEY_TEST', param_in: 'header', param_name: 'Authorization', prefix: 'KakaoAK ' },
  endpoints: [{ path: '/v2/local/search/keyword.json', method: 'GET', parameters: { query: 'string' } }],
  isActive: true,
};

const findMany = vi.fn();

vi.mock('@/lib/config/providers', () => ({ getDbProvider: vi.fn(() => 'supabase') }));
vi.mock('@/repositories/factory', () => ({ createCatalogRepository: vi.fn(() => ({ findMany })) }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn().mockResolvedValue({}) }));

const VALID_ADMIN_KEY = 'test-admin-secret-key';

function makeReq(key: string | null = VALID_ADMIN_KEY): Request {
  const headers: Record<string, string> = { 'x-real-ip': '127.0.0.1' };
  if (key !== null) headers['Authorization'] = `Bearer ${key}`;
  return new Request('http://localhost/api/v1/admin/keys-verify', { headers });
}

describe('GET /api/v1/admin/keys-verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
    delete process.env.API_KEY_TEST;
    findMany.mockResolvedValue({ items: [keyedItem], total: 1 });
  });

  it('Authorization 헤더 없음 → 403', async () => {
    const { GET } = await import('@/app/api/v1/admin/keys-verify/route');
    const res = await GET(makeReq(null));
    expect(res.status).toBe(403);
  });

  it('잘못된 키 → 403', async () => {
    const { GET } = await import('@/app/api/v1/admin/keys-verify/route');
    const res = await GET(makeReq('wrong'));
    expect(res.status).toBe(403);
  });

  it('키 env 미설정 → MISSING 보고 (200)', async () => {
    const { GET } = await import('@/app/api/v1/admin/keys-verify/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.summary.total).toBe(1);
    expect(body.data.summary.missing).toBe(1);
    expect(body.data.results[0].verdict).toBe('MISSING');
    // 키 값은 응답에 절대 노출되지 않음
    expect(JSON.stringify(body)).not.toContain('API_KEY_TEST=');
  });

  it('키 설정 + 업스트림 200 → VALID', async () => {
    process.env.API_KEY_TEST = 'KakaoAK realkey';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"documents":[]}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const { GET } = await import('@/app/api/v1/admin/keys-verify/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.summary.valid).toBe(1);
    expect(body.data.results[0].verdict).toBe('VALID');
    fetchSpy.mockRestore();
  });
});
