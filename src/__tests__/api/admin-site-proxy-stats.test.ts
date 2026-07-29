import { describe, it, expect, vi, beforeEach } from 'vitest';

const VALID_ADMIN_KEY = 'test-admin-secret-key';

function makeReq(key: string | null = VALID_ADMIN_KEY, query = ''): Request {
  const headers: Record<string, string> = { 'x-forwarded-for': '127.0.0.1' };
  if (key !== null) headers['Authorization'] = `Bearer ${key}`;
  return new Request(`http://localhost/api/v1/admin/site-proxy-stats${query}`, { headers });
}

describe('GET /api/v1/admin/site-proxy-stats', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ADMIN_API_KEY = VALID_ADMIN_KEY;
    const { __resetSiteRateLimit } = await import('@/lib/proxy/siteRateLimit');
    __resetSiteRateLimit();
  });

  it('Authorization 헤더 없음 → 403', async () => {
    const { GET } = await import('@/app/api/v1/admin/site-proxy-stats/route');
    expect((await GET(makeReq(null))).status).toBe(403);
  });

  it('잘못된 키 → 403', async () => {
    const { GET } = await import('@/app/api/v1/admin/site-proxy-stats/route');
    expect((await GET(makeReq('wrong-key'))).status).toBe(403);
  });

  it('유효한 키 → 프로젝트별 사용량과 현재 한도를 반환한다', async () => {
    const { checkSiteRateLimit } = await import('@/lib/proxy/siteRateLimit');
    checkSiteRateLimit('1.1.1.1', 'proj-a');
    checkSiteRateLimit('1.1.1.1', 'proj-a');
    checkSiteRateLimit('2.2.2.2', 'proj-b');

    const { GET } = await import('@/app/api/v1/admin/site-proxy-stats/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.limits).toMatchObject({ perIpPerMin: 20, perProjectPerMin: 120 });
    expect(body.data.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ projectId: 'proj-a', allowed: 2 }),
        expect.objectContaining({ projectId: 'proj-b', allowed: 1 }),
      ]),
    );
  });

  it('호출량이 많은 프로젝트가 먼저 온다 — 오남용 후보를 위에서 본다', async () => {
    const { checkSiteRateLimit } = await import('@/lib/proxy/siteRateLimit');
    checkSiteRateLimit('1.1.1.1', 'quiet');
    for (let i = 0; i < 5; i++) checkSiteRateLimit('1.1.1.1', 'busy');

    const { GET } = await import('@/app/api/v1/admin/site-proxy-stats/route');
    const body = await (await GET(makeReq())).json();
    expect(body.data.projects[0].projectId).toBe('busy');
  });

  it('limit 파라미터로 상위 N개만 받되, 전체 개수는 그대로 보고한다', async () => {
    const { checkSiteRateLimit } = await import('@/lib/proxy/siteRateLimit');
    for (let i = 0; i < 5; i++) checkSiteRateLimit('1.1.1.1', `p${i}`);

    const { GET } = await import('@/app/api/v1/admin/site-proxy-stats/route');
    const body = await (await GET(makeReq(VALID_ADMIN_KEY, '?limit=2'))).json();

    expect(body.data.projects).toHaveLength(2);
    // 잘라낸 사실이 드러나야 한다 — 2개만 보고 "전부"로 오독하면 안 된다.
    expect(body.data.trackedProjects).toBe(5);
    expect(body.data.returnedProjects).toBe(2);
  });

  it('잘못된 limit은 기본값으로 폴백한다', async () => {
    const { checkSiteRateLimit } = await import('@/lib/proxy/siteRateLimit');
    checkSiteRateLimit('1.1.1.1', 'p1');

    const { GET } = await import('@/app/api/v1/admin/site-proxy-stats/route');
    for (const q of ['?limit=0', '?limit=-1', '?limit=abc']) {
      const body = await (await GET(makeReq(VALID_ADMIN_KEY, q))).json();
      expect(body.data.projects).toHaveLength(1);
    }
  });

  it('호출이 없으면 빈 목록을 반환한다 (500이 아니라)', async () => {
    const { GET } = await import('@/app/api/v1/admin/site-proxy-stats/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.projects).toEqual([]);
    expect(body.data.trackedProjects).toBe(0);
  });

  it('인메모리 집계임을 응답에 명시한다 — 재시작 시 초기화되는 수치임을 오독하면 안 된다', async () => {
    const { GET } = await import('@/app/api/v1/admin/site-proxy-stats/route');
    const body = await (await GET(makeReq())).json();
    expect(body.data.since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data.note).toContain('재시작');
  });

  it('OPTIONS preflight → 204', async () => {
    const { OPTIONS } = await import('@/app/api/v1/admin/site-proxy-stats/route');
    expect([200, 204]).toContain((await OPTIONS()).status);
  });
});
