import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * /api/auth/[...nextauth] 라우트 — 항상 local-auth-config 핸들러로 위임한다.
 *
 * SQLite + Auth.js(local) 단일 경로: provider 분기·404 없음.
 * local-auth-config는 module-load 시 NextAuth를 초기화하므로 mock한다.
 */
const localHandlers = { GET: vi.fn(), POST: vi.fn() };

vi.mock('@/lib/auth/local-auth-config', () => ({ handlers: localHandlers }));

describe('/api/auth/[...nextauth] dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET은 local-auth-config 핸들러로 위임한다', async () => {
    const sentinel = new Response('ok');
    localHandlers.GET.mockResolvedValue(sentinel);

    const { GET } = await import('@/app/api/auth/[...nextauth]/route');
    const req = new Request('http://localhost/api/auth/session');
    const res = await GET(req as never);

    expect(localHandlers.GET).toHaveBeenCalledWith(req);
    expect(res).toBe(sentinel);
  });

  it('POST(로그인)도 local-auth-config 핸들러로 위임한다', async () => {
    const sentinel = new Response('ok');
    localHandlers.POST.mockResolvedValue(sentinel);

    const { POST } = await import('@/app/api/auth/[...nextauth]/route');
    const req = new Request('http://localhost/api/auth/callback/credentials', { method: 'POST' });

    expect(await POST(req as never)).toBe(sentinel);
    expect(localHandlers.POST).toHaveBeenCalledWith(req);
  });
});
